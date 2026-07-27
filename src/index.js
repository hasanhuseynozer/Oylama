const encoder = new TextEncoder();
const USER_COOKIE = "sro_user";
const ADMIN_COOKIE = "sro_admin";
const USER_SESSION_SECONDS = 60 * 60 * 24 * 30;
const ADMIN_SESSION_SECONDS = 60 * 60 * 12;
const PBKDF2_ITERATIONS = 50000;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
        return new Response("Sayfa bulunamadı.", { status: 404 });
      }

      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      const response = await env.ASSETS.fetch(request);
      return secureResponse(response);
    } catch (error) {
      console.error(error);
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return json({ error: "Beklenmeyen bir hata oluştu." }, 500);
    }
  }
};

async function handleApi(request, env, url) {
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (method === "GET" && path === "/api/config") {
    const settings = await getSettings(env.DB);
    return json({
      siteName: "SRO RATING",
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
      settings
    });
  }

  if (method === "GET" && path === "/api/servers") {
    const result = await env.DB.prepare(`
      SELECT s.id, s.name, s.description, s.cap, s.rates, s.server_type, s.opened_at, s.is_verified, COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='server_image_'||s.id),'') image_url, s.created_at,
        COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
        COUNT(r.id) AS vote_count,
        ROUND(((COALESCE(AVG(r.rating),3.5)*COUNT(r.id)+17.5)/(COUNT(r.id)+5))+(s.is_verified*0.35),2) AS trust_score
      FROM servers s
      LEFT JOIN reviews r ON r.server_id = s.id
      WHERE s.is_active = 1
      GROUP BY s.id
      ORDER BY trust_score DESC, vote_count DESC, s.created_at DESC
    `).all();
    return json({ servers: result.results || [] });
  }

  const serverMatch = path.match(/^\/api\/servers\/(\d+)$/);
  if (method === "GET" && serverMatch) {
    const id = Number(serverMatch[1]);
    const server = await env.DB.prepare(`
      SELECT s.id, s.name, s.description, s.cap, s.rates, s.server_type, s.opened_at, s.is_verified, COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='server_image_'||s.id),'') image_url, s.created_at,
        COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
        COUNT(r.id) AS vote_count
      FROM servers s LEFT JOIN reviews r ON r.server_id = s.id
      WHERE s.id = ? AND s.is_active = 1 GROUP BY s.id
    `).bind(id).first();
    if (!server) return json({ error: "Sunucu bulunamadı." }, 404);

    const reviews = await env.DB.prepare(`
      SELECT r.id, r.rating, r.comment, r.created_at,
        COALESCE(u.display_name, 'Eski kullanıcı') AS display_name,
        rr.reply AS owner_reply, rr.updated_at AS owner_reply_at
      FROM reviews r LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN review_replies rr ON rr.review_id=r.id
      WHERE r.server_id = ?
      ORDER BY datetime(r.created_at) DESC LIMIT 200
    `).bind(id).all();
    return json({ server, reviews: reviews.results || [] });
  }

  // User registration
  if (method === "POST" && path === "/api/auth/register") {
    requireJson(request);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const displayName = cleanText(body.displayName);
    const password = String(body.password || "");

    if (!isValidEmail(email)) return json({ error: "Geçerli bir e-posta adresi yazın." }, 400);
    if (displayName.length < 2 || displayName.length > 40) return json({ error: "Kullanıcı adı 2–40 karakter olmalıdır." }, 400);
    if (!isValidPassword(password)) return json({ error: "Şifre en az 8 karakter olmalı ve harf ile rakam içermelidir." }, 400);

    const nameExists = await env.DB.prepare("SELECT id FROM users WHERE lower(display_name)=lower(?)").bind(displayName).first();
    if (nameExists) return json({ error: "Bu kullanıcı adı zaten kullanılıyor." }, 409);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const allowed = await rateLimit(env.DB, "register", await keyedHash(env, ip), 5, 60 * 60);
    if (!allowed) return json({ error: "Çok fazla kayıt denemesi yapıldı. Daha sonra tekrar deneyin." }, 429);

    if (env.TURNSTILE_SECRET_KEY) {
      const valid = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
      if (!valid) return json({ error: "Güvenlik doğrulaması başarısız oldu." }, 400);
    }

    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);
    try {
      const result = await env.DB.prepare(`
        INSERT INTO users(email, email_normalized, password_hash, password_salt, display_name)
        VALUES (?, ?, ?, ?, ?)
      `).bind(email, email, passwordHash, salt, displayName).run();
      const userId = Number(result.meta.last_row_id);
      const token = await createUserSession(env.DB, userId);
      return json({ message: "Kayıt tamamlandı.", user: { id: userId, email, displayName } }, 201, {
        "Set-Cookie": userCookie(token, request)
      });
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) return json({ error: "E-posta adresi veya kullanıcı adı zaten kayıtlı." }, 409);
      throw error;
    }
  }

  if (method === "POST" && path === "/api/auth/login") {
    requireJson(request);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const allowed = await rateLimit(env.DB, "user-login", await keyedHash(env, ip), 10, 15 * 60);
    if (!allowed) return json({ error: "Çok fazla giriş denemesi yapıldı." }, 429);

    const user = await env.DB.prepare(`
      SELECT id, email, display_name, password_hash, password_salt, role, status
      FROM users WHERE email_normalized = ?
    `).bind(email).first();
    if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
      return json({ error: "E-posta veya şifre yanlış." }, 401);
    }
    if (user.status !== "active") return json({ error: "Hesabınız engellenmiş." }, 403);

    const token = await createUserSession(env.DB, user.id);
    return json({ message: "Giriş başarılı.", user: publicUser(user) }, 200, {
      "Set-Cookie": userCookie(token, request)
    });
  }

  if (method === "POST" && path === "/api/auth/logout") {
    const sessionToken = getCookie(request, USER_COOKIE);
    if (sessionToken) await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(await sha256(sessionToken)).run();
    return json({ message: "Çıkış yapıldı." }, 200, {
      "Set-Cookie": clearCookie(USER_COOKIE)
    });
  }

  if (method === "GET" && path === "/api/auth/me") {
    const user = await getCurrentUser(request, env.DB);
    return json({ user: user ? publicUser(user) : null });
  }

  if (method === "PUT" && path === "/api/profile") {
    verifyOrigin(request);
    requireJson(request);
    const user = await requireUser(request, env.DB);
    const body = await readJson(request);
    const displayName = cleanText(body.displayName);
    if (displayName.length < 2 || displayName.length > 40) return json({ error: "Kullanıcı adı 2–40 karakter olmalıdır." }, 400);
    const nameExists = await env.DB.prepare("SELECT id FROM users WHERE lower(display_name)=lower(?) AND id<>?").bind(displayName,user.id).first();
    if (nameExists) return json({ error: "Bu kullanıcı adı zaten kullanılıyor." }, 409);
    await env.DB.prepare("UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(displayName, user.id).run();
    return json({ message: "Profil güncellendi." });
  }

  if (method === "PUT" && path === "/api/profile/password") {
    verifyOrigin(request);
    requireJson(request);
    const user = await requireUser(request, env.DB);
    const body = await readJson(request);
    const oldPassword = String(body.oldPassword || "");
    const newPassword = String(body.newPassword || "");
    const dbUser = await env.DB.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").bind(user.id).first();
    if (!(await verifyPassword(oldPassword, dbUser.password_salt, dbUser.password_hash))) return json({ error: "Mevcut şifre yanlış." }, 401);
    if (!isValidPassword(newPassword)) return json({ error: "Yeni şifre en az 8 karakter olmalı ve harf ile rakam içermelidir." }, 400);
    const salt = randomHex(16);
    const hash = await hashPassword(newPassword, salt);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(hash, salt, user.id),
      env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(user.id)
    ]);
    return json({ message: "Şifre değiştirildi. Yeniden giriş yapın." }, 200, {
      "Set-Cookie": clearCookie(USER_COOKIE)
    });
  }

  if (method === "GET" && path === "/api/profile/reviews") {
    const user = await requireUser(request, env.DB);
    const result = await env.DB.prepare(`
      SELECT r.id, r.rating, r.comment, r.created_at, s.name AS server_name
      FROM reviews r JOIN servers s ON s.id = r.server_id
      WHERE r.user_id = ? ORDER BY datetime(r.created_at) DESC
    `).bind(user.id).all();
    return json({ reviews: result.results || [] });
  }

  if (method === "GET" && path === "/api/profile/community") {
    const user = await requireUser(request, env.DB);
    const requests = await env.DB.prepare("SELECT id,server_name,description,website_url,cap,rates,server_type,opened_at,status,admin_note,created_at FROM server_requests WHERE user_id=? ORDER BY datetime(created_at) DESC").bind(user.id).all();
    const suggestions = await env.DB.prepare("SELECT id,subject,message,status,created_at FROM suggestions WHERE user_id=? ORDER BY datetime(created_at) DESC").bind(user.id).all();
    const owned = await env.DB.prepare("SELECT s.id,s.name FROM server_owners o JOIN servers s ON s.id=o.server_id WHERE o.user_id=? ORDER BY s.name").bind(user.id).all();
    return json({ requests: requests.results || [], suggestions: suggestions.results || [], ownedServers: owned.results || [] });
  }

  if (method === "POST" && path === "/api/profile/server-requests") {
    verifyOrigin(request); requireJson(request);
    const user = await requireUser(request, env.DB), body = await readJson(request);
    const name=cleanText(body.serverName), description=cleanText(body.description), website=cleanUrl(body.websiteUrl), cap=validCap(body.cap), rates=validRates(body.rates), serverType=validServerType(body.serverType), openedAt=validDate(body.openedAt);
    if(name.length<2||name.length>80||description.length<20||description.length>800) return json({error:"Sunucu adı 2–80, açıklama 20–800 karakter olmalıdır."},400);
    await env.DB.prepare("INSERT INTO server_requests(user_id,server_name,description,website_url,cap,rates,server_type,opened_at) VALUES(?,?,?,?,?,?,?,?)").bind(user.id,name,description,website,cap,rates,serverType,openedAt).run();
    return json({message:"Sunucu ekleme isteğiniz yöneticiye gönderildi."},201);
  }

  if (method === "POST" && path === "/api/profile/suggestions") {
    verifyOrigin(request); requireJson(request);
    const user = await requireUser(request, env.DB), body = await readJson(request);
    const subject=cleanText(body.subject), message=cleanText(body.message);
    if(subject.length<3||subject.length>100||message.length<10||message.length>1000) return json({error:"Öneri bilgileri geçersiz."},400);
    await env.DB.prepare("INSERT INTO suggestions(user_id,subject,message) VALUES(?,?,?)").bind(user.id,subject,message).run();
    return json({message:"Öneriniz alındı. Teşekkürler!"},201);
  }

  if (method === "GET" && path === "/api/owner/dashboard") {
    const user = await requireUser(request, env.DB);
    const servers = await env.DB.prepare("SELECT s.id,s.name,s.description FROM server_owners o JOIN servers s ON s.id=o.server_id WHERE o.user_id=?").bind(user.id).all();
    const reviews = await env.DB.prepare(`SELECT r.id,r.server_id,r.rating,r.comment,r.created_at,s.name server_name,
      COALESCE(u.display_name,'Eski kullanıcı') display_name,rr.reply,rr.updated_at reply_updated_at
      FROM reviews r JOIN server_owners o ON o.server_id=r.server_id AND o.user_id=?
      JOIN servers s ON s.id=r.server_id LEFT JOIN users u ON u.id=r.user_id
      LEFT JOIN review_replies rr ON rr.review_id=r.id ORDER BY datetime(r.created_at) DESC LIMIT 300`).bind(user.id).all();
    return json({servers:servers.results||[],reviews:reviews.results||[]});
  }

  const ownerReply = path.match(/^\/api\/owner\/reviews\/(\d+)\/reply$/);
  if (method === "PUT" && ownerReply) {
    verifyOrigin(request); requireJson(request);
    const user=await requireUser(request,env.DB), reviewId=Number(ownerReply[1]), body=await readJson(request), reply=cleanText(body.reply);
    if(reply.length<2||reply.length>500)return json({error:"Cevap 2–500 karakter arasında olmalıdır."},400);
    const review=await env.DB.prepare("SELECT r.server_id FROM reviews r JOIN server_owners o ON o.server_id=r.server_id WHERE r.id=? AND o.user_id=?").bind(reviewId,user.id).first();
    if(!review)return json({error:"Bu yoruma cevap verme yetkiniz yok."},403);
    await env.DB.prepare(`INSERT INTO review_replies(review_id,server_id,user_id,reply,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(review_id) DO UPDATE SET reply=excluded.reply,user_id=excluded.user_id,updated_at=CURRENT_TIMESTAMP`).bind(reviewId,review.server_id,user.id,reply).run();
    return json({message:"Sunucu sahibi cevabı yayınlandı."});
  }

  const reviewMatch = path.match(/^\/api\/servers\/(\d+)\/reviews$/);
  if (method === "POST" && reviewMatch) {
    verifyOrigin(request);
    requireJson(request);
    const user = await requireUser(request, env.DB);
    const serverId = Number(reviewMatch[1]);
    const server = await env.DB.prepare("SELECT id FROM servers WHERE id = ? AND is_active = 1").bind(serverId).first();
    if (!server) return json({ error: "Sunucu bulunamadı." }, 404);

    const body = await readJson(request);
    const rating = Number(body.rating);
    const comment = cleanText(body.comment);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "1–5 arasında puan seçin." }, 400);
    if (comment.length < 3 || comment.length > 500) return json({ error: "Yorum 3–500 karakter arasında olmalıdır." }, 400);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const allowed = await rateLimit(env.DB, "review", await keyedHash(env, ip), 8, 10 * 60);
    if (!allowed) return json({ error: "Çok hızlı gönderim yaptınız." }, 429);

    if (env.TURNSTILE_SECRET_KEY) {
      const valid = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
      if (!valid) return json({ error: "Güvenlik doğrulaması başarısız oldu." }, 400);
    }

    const emailHash = await keyedHash(env, user.email_normalized);
    try {
      await env.DB.prepare(`
        INSERT INTO reviews(server_id, email_hash, email_masked, rating, comment, ip_hash, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(serverId, emailHash, maskEmail(user.email), rating, comment, await keyedHash(env, ip), user.id).run();
      return json({ message: "Puanınız ve yorumunuz yayımlandı." }, 201);
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) return json({ error: "Bu sunucuya daha önce oy verdiniz." }, 409);
      throw error;
    }
  }

  // Admin login
  if (method === "POST" && path === "/api/admin/login") {
    requireJson(request);
    const body = await readJson(request);
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "Yönetici secret'ları eksik." }, 503);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const allowed = await rateLimit(env.DB, "admin-login", await keyedHash(env, ip), 8, 15 * 60);
    if (!allowed) return json({ error: "Çok fazla giriş denemesi yapıldı." }, 429);
    if (!constantTimeEqual(String(body.password || ""), env.ADMIN_PASSWORD)) return json({ error: "Şifre yanlış." }, 401);
    const token = await createSignedToken(env.SESSION_SECRET, ADMIN_SESSION_SECONDS);
    return json({ message: "Giriş başarılı." }, 200, { "Set-Cookie": adminCookie(token, request) });
  }

  if (method === "POST" && path === "/api/admin/logout") {
    return json({ message: "Çıkış yapıldı." }, 200, { "Set-Cookie": clearCookie(ADMIN_COOKIE) });
  }

  if (path.startsWith("/api/admin/")) {
    if (!env.SESSION_SECRET || !(await verifySignedToken(getCookie(request, ADMIN_COOKIE), env.SESSION_SECRET))) {
      return json({ error: "Yönetici girişi gerekli." }, 401);
    }
    verifyOrigin(request);

    if (method === "GET" && path === "/api/admin/dashboard") {
      const servers = await env.DB.prepare(`
        SELECT s.id,s.name,s.description,s.cap,s.rates,s.server_type,s.opened_at,s.is_verified,COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='server_image_'||s.id),'') image_url,s.is_active,s.created_at,
          COALESCE(ROUND(AVG(r.rating),1),0) average_rating,COUNT(r.id) vote_count
        FROM servers s LEFT JOIN reviews r ON r.server_id=s.id GROUP BY s.id ORDER BY s.created_at DESC
      `).all();
      const reviews = await env.DB.prepare(`
        SELECT r.id,r.rating,r.comment,r.created_at,r.email_masked,s.name server_name,
          COALESCE(u.display_name,'Eski kullanıcı') display_name
        FROM reviews r JOIN servers s ON s.id=r.server_id LEFT JOIN users u ON u.id=r.user_id
        ORDER BY datetime(r.created_at) DESC LIMIT 500
      `).all();
      const users = await env.DB.prepare(`
        SELECT id,email,display_name,role,status,created_at FROM users ORDER BY datetime(created_at) DESC LIMIT 500
      `).all();
      const requests = await env.DB.prepare(`SELECT q.*,u.display_name,u.email FROM server_requests q JOIN users u ON u.id=q.user_id ORDER BY CASE q.status WHEN 'pending' THEN 0 ELSE 1 END,datetime(q.created_at) DESC`).all();
      const suggestions = await env.DB.prepare(`SELECT g.*,u.display_name,u.email FROM suggestions g JOIN users u ON u.id=g.user_id ORDER BY CASE g.status WHEN 'new' THEN 0 ELSE 1 END,datetime(g.created_at) DESC`).all();
      return json({ servers: servers.results || [], reviews: reviews.results || [], users: users.results || [], requests:requests.results||[], suggestions:suggestions.results||[], settings: await getSettings(env.DB) });
    }

    const requestAction=path.match(/^\/api\/admin\/server-requests\/(\d+)$/);
    if(requestAction&&method==="PUT"){
      requireJson(request);const body=await readJson(request),id=Number(requestAction[1]),status=["approved","rejected"].includes(body.status)?body.status:"rejected";
      const item=await env.DB.prepare("SELECT * FROM server_requests WHERE id=?").bind(id).first();
      if(!item)return json({error:"İstek bulunamadı."},404);
      if(status==="approved"&&item.status!=="approved"){
        const created=await env.DB.prepare("INSERT INTO servers(name,description,cap,rates,server_type,opened_at,is_active) VALUES(?,?,?,?,?,?,1)").bind(item.server_name,item.description,item.cap,item.rates,item.server_type,item.opened_at).run();
        await env.DB.prepare("INSERT OR IGNORE INTO server_owners(server_id,user_id) VALUES(?,?)").bind(Number(created.meta.last_row_id),item.user_id).run();
      }
      await env.DB.prepare("UPDATE server_requests SET status=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,cleanText(body.note),id).run();
      return json({message:status==="approved"?"Sunucu onaylandı ve sahip paneli açıldı.":"İstek reddedildi."});
    }

    const suggestionAction=path.match(/^\/api\/admin\/suggestions\/(\d+)$/);
    if(suggestionAction&&method==="PUT"){
      requireJson(request);const body=await readJson(request),status=["reviewed","closed"].includes(body.status)?body.status:"reviewed";
      await env.DB.prepare("UPDATE suggestions SET status=? WHERE id=?").bind(status,Number(suggestionAction[1])).run();
      return json({message:"Öneri durumu güncellendi."});
    }

    if (method === "POST" && path === "/api/admin/servers") {
      requireJson(request); const body = await readJson(request);
      const name = cleanText(body.name), description = cleanText(body.description), cap=validCap(body.cap), rates=validRates(body.rates), serverType=validServerType(body.server_type), openedAt=validDate(body.opened_at);
      if (name.length < 2 || name.length > 80 || description.length < 3 || description.length > 600) return json({ error: "Sunucu bilgileri geçersiz." }, 400);
      const result = await env.DB.prepare("INSERT INTO servers(name,description,cap,rates,server_type,opened_at,is_verified,is_active) VALUES(?,?,?,?,?,?,?,?)").bind(name,description,cap,rates,serverType,openedAt,body.is_verified?1:0,body.is_active ? 1 : 0).run();
      await saveSetting(env.DB, `server_image_${Number(result.meta.last_row_id)}`, safeImage(body.image_url));
      return json({ message: "Sunucu eklendi." }, 201);
    }

    const adminServer = path.match(/^\/api\/admin\/servers\/(\d+)$/);
    if (adminServer && method === "PUT") {
      requireJson(request); const body = await readJson(request);
      const serverId=Number(adminServer[1]);
      await env.DB.prepare("UPDATE servers SET name=?,description=?,cap=?,rates=?,server_type=?,opened_at=?,is_verified=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(cleanText(body.name),cleanText(body.description),validCap(body.cap),validRates(body.rates),validServerType(body.server_type),validDate(body.opened_at),body.is_verified?1:0,body.is_active ? 1 : 0,serverId).run();
      await saveSetting(env.DB, `server_image_${serverId}`, safeImage(body.image_url));
      return json({ message: "Sunucu güncellendi." });
    }
    if (adminServer && method === "DELETE") {
      await env.DB.prepare("DELETE FROM servers WHERE id=?").bind(Number(adminServer[1])).run();
      return json({ message: "Sunucu silindi." });
    }

    const reset = path.match(/^\/api\/admin\/servers\/(\d+)\/reset$/);
    if (reset && method === "POST") {
      await env.DB.prepare("DELETE FROM reviews WHERE server_id=?").bind(Number(reset[1])).run();
      return json({ message: "Oylar ve yorumlar sıfırlandı." });
    }

    const deleteReview = path.match(/^\/api\/admin\/reviews\/(\d+)$/);
    if (deleteReview && method === "DELETE") {
      await env.DB.prepare("DELETE FROM reviews WHERE id=?").bind(Number(deleteReview[1])).run();
      return json({ message: "Yorum silindi." });
    }

    const userStatus = path.match(/^\/api\/admin\/users\/(\d+)\/status$/);
    if (userStatus && method === "PUT") {
      requireJson(request); const body = await readJson(request);
      const status = body.status === "blocked" ? "blocked" : "active";
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,Number(userStatus[1])),
        env.DB.prepare("DELETE FROM user_sessions WHERE user_id=?").bind(Number(userStatus[1]))
      ]);
      return json({ message: status === "blocked" ? "Kullanıcı engellendi." : "Kullanıcı açıldı." });
    }

    const deleteUser = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (deleteUser && method === "DELETE") {
      await env.DB.prepare("DELETE FROM users WHERE id=?").bind(Number(deleteUser[1])).run();
      return json({ message: "Kullanıcı silindi." });
    }

    if (method === "PUT" && path === "/api/admin/settings") {
      requireJson(request); const body = await readJson(request);
      const allowed = ["logo_image","banner_text","banner_url","banner_image","left_ad_text","left_ad_url","left_ad_image","right_ad_text","right_ad_url","right_ad_image","contact_text","disclaimer_text","footer_tagline","twitch_url","kick_url","youtube_url"];
      const statements = allowed.map(key => env.DB.prepare(`
        INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP
      `).bind(key, key.endsWith("_image") ? safeImage(body[key]) : cleanText(body[key] || "")));
      await env.DB.batch(statements);
      return json({ message: "Site ayarları kaydedildi." });
    }
  }

  return json({ error: "İstenen adres bulunamadı." }, 404);
}

async function saveSetting(db,key,value){
  await db.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(key,value).run();
}
function safeImage(value){
  const image=String(value||"");
  if(!image)return "";
  if(!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>420000)throw new HttpError("Görsel PNG, JPG, WebP veya GIF olmalı ve 300 KB sınırını aşmamalıdır.",400);
  return image;
}

async function getSettings(db) {
  const rows = await db.prepare("SELECT setting_key,setting_value FROM site_settings").all();
  return Object.fromEntries((rows.results || []).map(row => [row.setting_key, row.setting_value]));
}

async function getCurrentUser(request, db) {
  const token = getCookie(request, USER_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const user = await db.prepare(`
    SELECT u.id,u.email,u.email_normalized,u.display_name,u.role,u.status
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'
  `).bind(tokenHash, now).first();
  return user || null;
}

async function requireUser(request, db) {
  const user = await getCurrentUser(request, db);
  if (!user) throw new HttpError("Bu işlem için giriş yapmalısınız.", 401);
  return user;
}

async function createUserSession(db, userId) {
  const token = randomHex(32);
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").bind(now),
    db.prepare("INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
      .bind(await sha256(token), userId, now + USER_SESSION_SECONDS, now)
  ]);
  return token;
}

function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.display_name, role: user.role };
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", salt: hexBytes(saltHex), iterations: PBKDF2_ITERATIONS
  }, key, 256);
  return bytesHex(new Uint8Array(bits));
}
async function verifyPassword(password, salt, expected) {
  return constantTimeEqual(await hashPassword(password, salt), expected);
}
function isValidPassword(password) {
  return password.length >= 8 && password.length <= 72 && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) && /\d/.test(password);
}

async function keyedHash(env, value) {
  return sha256(`${env.SESSION_SECRET || "sro-rating"}:${value}`);
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesHex(new Uint8Array(digest));
}
function randomHex(bytes) {
  const array = new Uint8Array(bytes); crypto.getRandomValues(array); return bytesHex(array);
}
function bytesHex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, "0")).join(""); }
function hexBytes(hex) { return new Uint8Array(hex.match(/.{1,2}/g).map(x => parseInt(x, 16))); }

async function createSignedToken(secret, seconds) {
  const payload = toBase64Url(JSON.stringify({ exp: Math.floor(Date.now()/1000)+seconds, nonce: crypto.randomUUID() }));
  return `${payload}.${await hmac(payload, secret)}`;
}
async function verifySignedToken(token, secret) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  if (!constantTimeEqual(signature, await hmac(payload, secret))) return false;
  try { const data = JSON.parse(fromBase64Url(payload)); return data.exp > Math.floor(Date.now()/1000); } catch { return false; }
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name:"HMAC",hash:"SHA-256" }, false, ["sign"]);
  return bytesHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}
function toBase64Url(value) { return btoa(value).replaceAll("+","-").replaceAll("/","_").replaceAll("=",""); }
function fromBase64Url(value) {
  let x=value.replaceAll("-","+").replaceAll("_","/"); x+="=".repeat((4-x.length%4)%4); return atob(x);
}

async function rateLimit(db, action, identity, max, windowSeconds) {
  const now=Math.floor(Date.now()/1000), cutoff=now-windowSeconds;
  await db.prepare("DELETE FROM rate_limits WHERE created_at<?").bind(now-86400).run();
  const row=await db.prepare("SELECT COUNT(*) count FROM rate_limits WHERE action=? AND identity_hash=? AND created_at>=?")
    .bind(action,identity,cutoff).first();
  if (Number(row?.count || 0) >= max) return false;
  await db.prepare("INSERT INTO rate_limits(action,identity_hash,created_at) VALUES(?,?,?)").bind(action,identity,now).run();
  return true;
}

async function verifyTurnstile(token, ip, secret) {
  if (!token) return false;
  const form=new FormData(); form.append("secret",secret); form.append("response",token); form.append("remoteip",ip);
  const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
  return (await response.json()).success === true;
}

function userCookie(token, request) { return cookie(USER_COOKIE, token, USER_SESSION_SECONDS, request); }
function adminCookie(token, request) { return cookie(ADMIN_COOKIE, token, ADMIN_SESSION_SECONDS, request); }
function cookie(name, value, maxAge, request) {
  const secure=new URL(request.url).protocol==="https:" ? " Secure;" : "";
  return `${name}=${value}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${maxAge}`;
}
function clearCookie(name) { return `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
function getCookie(request, name) {
  const match=(request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] || "";
}

function verifyOrigin(request) {
  if (["GET","HEAD","OPTIONS"].includes(request.method)) return;
  const origin=request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new HttpError("Güvenlik kontrolü başarısız.",403);
}
function requireJson(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new HttpError("İstek JSON olmalıdır.",415);
}
async function readJson(request) { try { return await request.json(); } catch { throw new HttpError("Geçersiz veri.",400); } }
function cleanText(value) { return String(value || "").replace(/<[^>]*>/g,"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim(); }
function validCap(value) { const cap=Number(value); return Number.isInteger(cap)&&cap>=1&&cap<=200 ? cap : 110; }
function validRates(value) { const rates=cleanText(value).slice(0,30); return rates || "1x"; }
function validServerType(value) { return String(value).toUpperCase()==="CH" ? "CH" : "EU/CH"; }
function validDate(value) { const date=String(value||""); return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ""; }
function cleanUrl(value) {
  const raw=String(value||"").trim(); if(!raw)return "";
  try { const url=new URL(raw); return ["http:","https:"].includes(url.protocol)?url.toString():""; } catch { throw new HttpError("Geçerli bir web adresi yazın.",400); }
}
function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function isValidEmail(email) { return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email); }
function maskEmail(email) { const [local,domain]=email.split("@"); return `${local.slice(0,1)}${"*".repeat(Math.max(3,Math.min(8,local.length-1)))}@${domain}`; }
function constantTimeEqual(a,b) {
  const aa=encoder.encode(String(a)),bb=encoder.encode(String(b)); let diff=aa.length^bb.length;
  for(let i=0;i<Math.max(aa.length,bb.length);i++) diff|=(aa[i]||0)^(bb[i]||0);
  return diff===0;
}
function json(data,status=200,extra={}) {
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...extra}});
}
function secureResponse(response) {
  const headers=new Headers(response.headers);
  headers.set("X-Content-Type-Options","nosniff"); headers.set("X-Frame-Options","DENY");
  headers.set("Referrer-Policy","strict-origin-when-cross-origin");
  headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
class HttpError extends Error { constructor(message,status){super(message);this.status=status;} }
