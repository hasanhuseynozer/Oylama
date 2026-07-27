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
    const currentUser=await getCurrentUser(request,env.DB);
    const result = await env.DB.prepare(`
      SELECT s.id, s.name, s.description, s.cap, s.server_type, s.opened_at, s.beta_at, s.launch_at, s.operational_status, s.status_note, s.website_url, s.discord_url, s.promo_url, COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='server_image_'||s.id),'') image_url, s.created_at,
        COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
        COUNT(r.id) AS vote_count,
        EXISTS(SELECT 1 FROM user_favorite_servers f WHERE f.server_id=s.id AND f.user_id=?) AS is_favorite,
        ROUND(((COALESCE(AVG(r.rating),3.5)*COUNT(r.id)+17.5)/(COUNT(r.id)+5))+(s.is_verified*0.35),2) AS trust_score
      FROM servers s
      LEFT JOIN reviews r ON r.server_id = s.id
      WHERE s.is_active = 1
      GROUP BY s.id
      ORDER BY trust_score DESC, vote_count DESC, s.created_at DESC
    `).bind(currentUser?.id||0).all();
    return json({ servers: result.results || [] });
  }

  const favoriteMatch=path.match(/^\/api\/servers\/(\d+)\/favorite$/);
  if(favoriteMatch&&method==="POST"){
    verifyOrigin(request);const user=await requireUser(request,env.DB),serverId=Number(favoriteMatch[1]);
    const existing=await env.DB.prepare("SELECT 1 FROM user_favorite_servers WHERE user_id=? AND server_id=?").bind(user.id,serverId).first();
    if(existing)await env.DB.prepare("DELETE FROM user_favorite_servers WHERE user_id=? AND server_id=?").bind(user.id,serverId).run();
    else await env.DB.prepare("INSERT INTO user_favorite_servers(user_id,server_id) SELECT ?,id FROM servers WHERE id=? AND is_active=1").bind(user.id,serverId).run();
    return json({favorite:!existing,message:existing?"Favorilerden çıkarıldı.":"Favorilere eklendi."});
  }

  if(method==="GET"&&path==="/api/profile/favorites"){
    const user=await requireUser(request,env.DB);
    const result=await env.DB.prepare("SELECT s.id,s.name,s.operational_status FROM user_favorite_servers f JOIN servers s ON s.id=f.server_id WHERE f.user_id=? AND s.is_active=1 ORDER BY datetime(f.created_at) DESC").bind(user.id).all();
    return json({favorites:result.results||[]});
  }

  const serverMatch = path.match(/^\/api\/servers\/(\d+)$/);
  if (method === "GET" && serverMatch) {
    const id = Number(serverMatch[1]);
    const server = await env.DB.prepare(`
      SELECT s.id, s.name, s.description, s.cap, s.server_type, s.opened_at, s.beta_at, s.launch_at, s.operational_status, s.status_note, s.website_url, s.discord_url, s.promo_url, COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='server_image_'||s.id),'') image_url, s.created_at,
        COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
        COUNT(r.id) AS vote_count
      FROM servers s LEFT JOIN reviews r ON r.server_id = s.id
      WHERE s.id = ? AND s.is_active = 1 GROUP BY s.id
    `).bind(id).first();
    if (!server) return json({ error: "Sunucu bulunamadı." }, 404);

    const currentUser = await getCurrentUser(request,env.DB);
    const reviews = await env.DB.prepare(`
      SELECT r.id, r.user_id, r.rating, r.comment, r.created_at,
        COALESCE(u.display_name, 'Eski kullanıcı') AS display_name,
        rr.reply AS owner_reply, rr.updated_at AS owner_reply_at,
        (SELECT COUNT(*) FROM review_reactions x WHERE x.review_id=r.id AND x.reaction='like') AS like_count,
        (SELECT COUNT(*) FROM review_reactions x WHERE x.review_id=r.id AND x.reaction='dislike') AS dislike_count,
        COALESCE((SELECT reaction FROM review_reactions x WHERE x.review_id=r.id AND x.user_id=?),'') AS my_reaction
      FROM reviews r LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN review_replies rr ON rr.review_id=r.id
      WHERE r.server_id = ?
      ORDER BY datetime(r.created_at) DESC LIMIT 200
    `).bind(currentUser?.id||0,id).all();
    const reviewComments=await env.DB.prepare(`SELECT c.id,c.review_id,c.user_id,c.comment,c.created_at,COALESCE(u.display_name,'Eski kullanıcı') display_name
      FROM review_comments c LEFT JOIN users u ON u.id=c.user_id JOIN reviews r ON r.id=c.review_id
      WHERE r.server_id=? ORDER BY datetime(c.created_at) ASC LIMIT 500`).bind(id).all();
    return json({ server, reviews: reviews.results || [], reviewComments:reviewComments.results||[] });
  }

  // User registration
  if (method === "POST" && path === "/api/auth/register") {
    verifyOrigin(request);
    requireJson(request);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const displayName = cleanText(body.displayName);
    const password = String(body.password || "");

    if (!isValidEmail(email)) return json({ error: "Geçerli bir e-posta adresi yazın." }, 400);
    if (displayName.length < 2 || displayName.length > 40) return json({ error: "Kullanıcı adı 2–40 karakter olmalıdır." }, 400);
    if (hasProfanity(displayName)) return json({ error: "Kullanıcı adında yasaklı ifade kullanılamaz." }, 400);
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
        INSERT INTO users(email, email_normalized, password_hash, password_salt, password_iterations, display_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(email, email, passwordHash, salt, PBKDF2_ITERATIONS, displayName).run();
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
    verifyOrigin(request);
    requireJson(request);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const allowed = await rateLimit(env.DB, "user-login", await keyedHash(env, ip), 10, 15 * 60);
    if (!allowed) return json({ error: "Çok fazla giriş denemesi yapıldı." }, 429);

    const user = await env.DB.prepare(`
      SELECT id, email, display_name, password_hash, password_salt, password_iterations, role, status
      FROM users WHERE email_normalized = ?
    `).bind(email).first();
    if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash, Number(user.password_iterations || 50000)))) {
      return json({ error: "E-posta veya şifre yanlış." }, 401);
    }
    if (user.status !== "active") return json({ error: "Hesabınız engellenmiş." }, 403);

    if (Number(user.password_iterations || 50000) < PBKDF2_ITERATIONS) {
      const upgradedSalt = randomHex(16);
      const upgradedHash = await hashPassword(password, upgradedSalt, PBKDF2_ITERATIONS);
      await env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(upgradedHash, upgradedSalt, PBKDF2_ITERATIONS, user.id).run();
    }
    const token = await createUserSession(env.DB, user.id);
    return json({ message: "Giriş başarılı.", user: publicUser(user) }, 200, {
      "Set-Cookie": userCookie(token, request)
    });
  }

  if (method === "POST" && path === "/api/auth/logout") {
    verifyOrigin(request);
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
    if (hasProfanity(displayName)) return json({ error: "Kullanıcı adında yasaklı ifade kullanılamaz." }, 400);
    const nameExists = await env.DB.prepare("SELECT id FROM users WHERE lower(display_name)=lower(?) AND id<>?").bind(displayName,user.id).first();
    if (nameExists) return json({ error: "Bu kullanıcı adı zaten kullanılıyor." }, 409);
    const gameAlias=cleanText(body.gameAlias).slice(0,40),bio=cleanText(body.bio).slice(0,240);
    if(hasProfanity(gameAlias)||hasProfanity(bio))return json({error:"Profil bilgileri yasaklı ifade içeriyor."},400);
    await env.DB.prepare("UPDATE users SET display_name=?,game_alias=?,bio=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(displayName,gameAlias,bio,user.id).run();
    const playedServers=Array.isArray(body.playedServers)
      ? body.playedServers.slice(0,50).map(x=>({serverId:Number(x.serverId),characterName:cleanText(x.characterName).slice(0,40)})).filter(x=>Number.isInteger(x.serverId))
      : (Array.isArray(body.serverIds)?body.serverIds:[]).slice(0,50).map(serverId=>({serverId:Number(serverId),characterName:""})).filter(x=>Number.isInteger(x.serverId));
    if(playedServers.some(x=>hasProfanity(x.characterName)))return json({error:"Karakter adında yasaklı ifade kullanılamaz."},400);
    await env.DB.prepare("DELETE FROM user_playing_servers WHERE user_id=?").bind(user.id).run();
    if(playedServers.length)await env.DB.batch(playedServers.map(x=>env.DB.prepare("INSERT OR IGNORE INTO user_playing_servers(user_id,server_id,character_name) SELECT ?,id,? FROM servers WHERE id=? AND is_active=1").bind(user.id,x.characterName,x.serverId)));
    return json({ message: "Profil güncellendi." });
  }

  const publicProfile=path.match(/^\/api\/users\/(\d+)\/profile$/);
  if(method==="GET"&&publicProfile){
    const userId=Number(publicProfile[1]),profile=await env.DB.prepare("SELECT id,display_name,account_role,game_alias,bio,created_at FROM users WHERE id=? AND status='active'").bind(userId).first();
    if(!profile)return json({error:"Kullanıcı bulunamadı."},404);
    const servers=await env.DB.prepare("SELECT s.id,s.name,p.character_name FROM user_playing_servers p JOIN servers s ON s.id=p.server_id WHERE p.user_id=? AND s.is_active=1 ORDER BY s.name").bind(userId).all();
    const stats=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM reviews WHERE user_id=?) reviews,
      0 replies,
      (SELECT COUNT(*) FROM review_reactions WHERE user_id=? AND reaction='like') likes`).bind(userId,userId).first();
    return json({profile,servers:servers.results||[],stats});
  }

  if (method === "PUT" && path === "/api/profile/password") {
    verifyOrigin(request);
    requireJson(request);
    const user = await requireUser(request, env.DB);
    const body = await readJson(request);
    const oldPassword = String(body.oldPassword || "");
    const newPassword = String(body.newPassword || "");
    const dbUser = await env.DB.prepare("SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?").bind(user.id).first();
    if (!(await verifyPassword(oldPassword, dbUser.password_salt, dbUser.password_hash, Number(dbUser.password_iterations || 50000)))) return json({ error: "Mevcut şifre yanlış." }, 401);
    if (!isValidPassword(newPassword)) return json({ error: "Yeni şifre en az 8 karakter olmalı ve harf ile rakam içermelidir." }, 400);
    const salt = randomHex(16);
    const hash = await hashPassword(newPassword, salt);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations=?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(hash, salt, PBKDF2_ITERATIONS, user.id),
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
    const servers=await env.DB.prepare("SELECT id,name FROM servers WHERE is_active=1 ORDER BY name").all();
    const playing=await env.DB.prepare("SELECT server_id,character_name FROM user_playing_servers WHERE user_id=?").bind(user.id).all();
    return json({ requests: [], suggestions: suggestions.results || [], ownedServers: owned.results || [], servers:servers.results||[], playingServers:playing.results||[], playingServerIds:(playing.results||[]).map(x=>x.server_id) });
  }

  if(method==="GET"&&path==="/api/notifications"){
    const user=await requireUser(request,env.DB);
    const result=await env.DB.prepare("SELECT id,type,title,message,target_url,is_read,created_at FROM notifications WHERE user_id=? ORDER BY datetime(created_at) DESC LIMIT 100").bind(user.id).all();
    const unread=await env.DB.prepare("SELECT COUNT(*) count FROM notifications WHERE user_id=? AND is_read=0").bind(user.id).first();
    return json({notifications:result.results||[],unread:Number(unread.count||0)});
  }

  if(method==="DELETE"&&path==="/api/notifications"){
    verifyOrigin(request);const user=await requireUser(request,env.DB);
    await env.DB.prepare("DELETE FROM notifications WHERE user_id=?").bind(user.id).run();
    return json({message:"Bildirimler temizlendi."});
  }

  const notificationRead=path.match(/^\/api\/notifications\/(\d+)\/read$/);
  if(method==="PUT"&&notificationRead){
    verifyOrigin(request);const user=await requireUser(request,env.DB);
    await env.DB.prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?").bind(Number(notificationRead[1]),user.id).run();
    return json({message:"Bildirim okundu."});
  }

  if (method === "POST" && path === "/api/profile/server-requests") {
    return json({error:"Sunucu başvuruları kapalıdır. Sunucu sahipliği için yöneticiyle iletişime geçin."},403);
  }

  if (method === "POST" && path === "/api/profile/suggestions") {
    verifyOrigin(request); requireJson(request);
    const user = await requireUser(request, env.DB), body = await readJson(request);
    const subject=cleanText(body.subject), message=cleanText(body.message);
    if(subject.length<3||subject.length>100||message.length<10||message.length>1000) return json({error:"Öneri bilgileri geçersiz."},400);
    if(hasProfanity(subject)||hasProfanity(message))return json({error:"Öneri yasaklı ifade içeriyor."},400);
    await env.DB.prepare("INSERT INTO suggestions(user_id,subject,message) VALUES(?,?,?)").bind(user.id,subject,message).run();
    return json({message:"Öneriniz alındı. Teşekkürler!"},201);
  }

  if (method === "GET" && path === "/api/owner/dashboard") {
    const user = await requireUser(request, env.DB);
    const servers = await env.DB.prepare(`SELECT s.id,s.name,s.description,s.website_url,s.discord_url,s.promo_url,s.beta_at,s.launch_at,s.operational_status,s.status_note,
      COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='server_image_'||s.id),'') image_url,
      (SELECT status FROM server_change_requests c WHERE c.server_id=s.id ORDER BY c.id DESC LIMIT 1) change_status
      FROM server_owners o JOIN servers s ON s.id=o.server_id WHERE o.user_id=?`).bind(user.id).all();
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
    if(hasProfanity(reply))return json({error:"Küfür, hakaret ve aşağılayıcı ifadeler yasaktır."},400);
    const review=await env.DB.prepare("SELECT r.server_id FROM reviews r JOIN server_owners o ON o.server_id=r.server_id WHERE r.id=? AND o.user_id=?").bind(reviewId,user.id).first();
    if(!review)return json({error:"Bu yoruma cevap verme yetkiniz yok."},403);
    await env.DB.prepare(`INSERT INTO review_replies(review_id,server_id,user_id,reply,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(review_id) DO UPDATE SET reply=excluded.reply,user_id=excluded.user_id,updated_at=CURRENT_TIMESTAMP`).bind(reviewId,review.server_id,user.id,reply).run();
    const recipient=await env.DB.prepare("SELECT user_id FROM reviews WHERE id=?").bind(reviewId).first();
    if(recipient?.user_id&&Number(recipient.user_id)!==Number(user.id))await addNotification(env.DB,recipient.user_id,user.id,"owner_reply","Sunucu sahibi yanıtladı","Yorumunuza sunucu sahibinden cevap geldi.",`/?server=${review.server_id}&review=${reviewId}`);
    return json({message:"Sunucu sahibi cevabı yayınlandı."});
  }

  const ownerChange=path.match(/^\/api\/owner\/servers\/(\d+)\/change-request$/);
  if(method==="POST"&&ownerChange){
    verifyOrigin(request);requireJson(request);
    const user=await requireUser(request,env.DB),serverId=Number(ownerChange[1]),body=await readJson(request);
    const owned=await env.DB.prepare("SELECT 1 FROM server_owners WHERE server_id=? AND user_id=?").bind(serverId,user.id).first();
    if(!owned)return json({error:"Bu sunucuyu düzenleme yetkiniz yok."},403);
    const description=cleanText(body.description),image=safeImage(body.image_url),website=cleanUrl(body.website_url),discord=cleanUrl(body.discord_url),promo=cleanUrl(body.promo_url);
    if(description.length<3||description.length>300||hasProfanity(description))return json({error:"Açıklama 3–300 karakter olmalı ve yasaklı ifade içermemelidir."},400);
    await env.DB.prepare("UPDATE servers SET description=?,website_url=?,discord_url=?,promo_url=?,beta_at=?,launch_at=?,operational_status=?,status_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(description,website,discord,promo,validDateTime(body.beta_at),validDateTime(body.launch_at),validOperationalStatus(body.operational_status),cleanText(body.status_note).slice(0,120),serverId).run();
    if(hasProfanity(cleanText(body.status_note)))return json({error:"Durum açıklaması yasaklı ifade içeriyor."},400);
    if(image)await saveSetting(env.DB,`server_image_${serverId}`,image);
    await addAuditEvent(env.DB, request, "owner", user.id, "server.update", "server", serverId, { fields:["description","links","schedule","status",image?"image":null].filter(Boolean) });
    return json({message:"Sunucu bilgileriniz yayımlandı."});
  }

  const ownerReport=path.match(/^\/api\/owner\/reviews\/(\d+)\/report$/);
  if(method==="POST"&&ownerReport){
    verifyOrigin(request);requireJson(request);
    const user=await requireUser(request,env.DB),reviewId=Number(ownerReport[1]),body=await readJson(request),reason=cleanText(body.reason)||"Küfür / hakaret";
    const review=await env.DB.prepare("SELECT r.server_id FROM reviews r JOIN server_owners o ON o.server_id=r.server_id WHERE r.id=? AND o.user_id=?").bind(reviewId,user.id).first();
    if(!review)return json({error:"Bildirim yetkiniz yok."},403);
    await env.DB.prepare("INSERT OR IGNORE INTO content_reports(review_id,server_id,reporter_user_id,reason) VALUES(?,?,?,?)").bind(reviewId,review.server_id,user.id,reason).run();
    return json({message:"Bildirim yönetici incelemesine gönderildi."},201);
  }

  const reactionMatch=path.match(/^\/api\/reviews\/(\d+)\/reaction$/);
  if(method==="POST"&&reactionMatch){
    verifyOrigin(request);requireJson(request);
    const user=await requireUser(request,env.DB),reviewId=Number(reactionMatch[1]),body=await readJson(request),reaction=["like","dislike"].includes(body.reaction)?body.reaction:"";
    if(!reaction)return json({error:"Tepki geçersiz."},400);
    const old=await env.DB.prepare("SELECT reaction FROM review_reactions WHERE review_id=? AND user_id=?").bind(reviewId,user.id).first();
    const reviewOwner=await env.DB.prepare("SELECT user_id,server_id FROM reviews WHERE id=?").bind(reviewId).first();
    if(old?.reaction===reaction)await env.DB.prepare("DELETE FROM review_reactions WHERE review_id=? AND user_id=?").bind(reviewId,user.id).run();
    else await env.DB.prepare(`INSERT INTO review_reactions(review_id,user_id,reaction,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(review_id,user_id) DO UPDATE SET reaction=excluded.reaction,updated_at=CURRENT_TIMESTAMP`).bind(reviewId,user.id,reaction).run();
    if(!reviewOwner)return json({error:"Yorum bulunamadı."},404);
    if(Number(reviewOwner.user_id)===Number(user.id))return json({error:"Kendi yorumunuza tepki veremezsiniz."},409);
    if(reviewOwner?.user_id&&old?.reaction!==reaction)await addNotification(env.DB,reviewOwner.user_id,user.id,reaction,reaction==="like"?"Yorumun beğenildi":"Yorumuna beğenmeme geldi",reaction==="like"?"Bir kullanıcı yorumunu beğendi.":"Bir kullanıcı yorumunu beğenmedi.",`/?server=${reviewOwner.server_id}&review=${reviewId}`);
    return json({message:"Tepki güncellendi."});
  }

  const likeMatch=path.match(/^\/api\/reviews\/(\d+)\/like$/);
  if(method==="POST"&&likeMatch){
    verifyOrigin(request);const user=await requireUser(request,env.DB),reviewId=Number(likeMatch[1]);
    const exists=await env.DB.prepare("SELECT 1 FROM review_likes WHERE review_id=? AND user_id=?").bind(reviewId,user.id).first();
    if(exists)await env.DB.prepare("DELETE FROM review_likes WHERE review_id=? AND user_id=?").bind(reviewId,user.id).run();
    else await env.DB.prepare("INSERT INTO review_likes(review_id,user_id) VALUES(?,?)").bind(reviewId,user.id).run();
    const count=await env.DB.prepare("SELECT COUNT(*) count FROM review_likes WHERE review_id=?").bind(reviewId).first();
    return json({liked:!exists,count:Number(count.count)});
  }

  const commentMatch=path.match(/^\/api\/reviews\/(\d+)\/comments$/);
  if(method==="POST"&&commentMatch){
    return json({error:"Kullanıcı yanıtları kapalıdır. Yalnızca atanmış sunucu sahibi resmi cevap verebilir."},403);
  }

  const reviewUpdate=path.match(/^\/api\/reviews\/(\d+)$/);
  if(method==="PUT"&&reviewUpdate){
    verifyOrigin(request);requireJson(request);
    const user=await requireUser(request,env.DB),reviewId=Number(reviewUpdate[1]),body=await readJson(request),rating=Number(body.rating),comment=cleanText(body.comment);
    if(!Number.isInteger(rating)||rating<1||rating>5||comment.length<3||comment.length>500||hasProfanity(comment))return json({error:"Puan veya yorum geçersiz."},400);
    const old=await env.DB.prepare("SELECT rating,comment FROM reviews WHERE id=? AND user_id=?").bind(reviewId,user.id).first();
    if(!old)return json({error:"Bu yorumu düzenleme yetkiniz yok."},403);
    await env.DB.prepare("UPDATE reviews SET rating=?,comment=? WHERE id=?").bind(rating,comment,reviewId).run();
    console.log(`REVIEW_EDIT user=${user.id} review=${reviewId} old_rating=${old.rating} new_rating=${rating} old=${JSON.stringify(old.comment)} new=${JSON.stringify(comment)}`);
    return json({message:"Puanınız ve yorumunuz güncellendi."});
  }

  const reviewMatch = path.match(/^\/api\/servers\/(\d+)\/reviews$/);
  if (method === "POST" && reviewMatch) {
    verifyOrigin(request);
    requireJson(request);
    const user = await requireUser(request, env.DB);
    const serverId = Number(reviewMatch[1]);
    const server = await env.DB.prepare("SELECT id FROM servers WHERE id = ? AND is_active = 1").bind(serverId).first();
    if (!server) return json({ error: "Sunucu bulunamadı." }, 404);
    const ownsServer = await env.DB.prepare("SELECT 1 FROM server_owners WHERE server_id=? AND user_id=?").bind(serverId,user.id).first();
    if (ownsServer) return json({ error:"Sunucu sahipleri kendi sunucularına puan veremez." }, 409);

    const body = await readJson(request);
    const rating = Number(body.rating);
    const comment = cleanText(body.comment);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "1–5 arasında puan seçin." }, 400);
    if (comment.length < 3 || comment.length > 500) return json({ error: "Yorum 3–500 karakter arasında olmalıdır." }, 400);
    if (hasProfanity(comment)) return json({ error: "Küfür, hakaret ve aşağılayıcı ifadeler yasaktır." }, 400);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const allowed = await rateLimit(env.DB, "review", await keyedHash(env, ip), 8, 10 * 60);
    if (!allowed) return json({ error: "Çok hızlı gönderim yaptınız." }, 429);
    const userAllowed = await rateLimit(env.DB, `review-user:${serverId}`, String(user.id), 2, 60 * 60);
    if (!userAllowed) return json({ error:"Bu sunucu için çok sık işlem yaptınız. Daha sonra tekrar deneyin." }, 429);

    if (env.TURNSTILE_SECRET_KEY) {
      const valid = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
      if (!valid) return json({ error: "Güvenlik doğrulaması başarısız oldu." }, 400);
    }

    const emailHash = await keyedHash(env, user.email_normalized);
    try {
      const createdReview=await env.DB.prepare(`
        INSERT INTO reviews(server_id, email_hash, email_masked, rating, comment, ip_hash, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(serverId, emailHash, maskEmail(user.email), rating, comment, await keyedHash(env, ip), user.id).run();
      const recentFromIp=await env.DB.prepare("SELECT COUNT(*) count FROM reviews WHERE ip_hash=? AND datetime(created_at)>=datetime('now','-1 hour')").bind(await keyedHash(env,ip)).first();
      const recentAccount=await env.DB.prepare("SELECT COUNT(*) count FROM reviews WHERE user_id=? AND datetime(created_at)>=datetime('now','-24 hours')").bind(user.id).first();
      const reasons=[],ipCount=Number(recentFromIp?.count||0),accountCount=Number(recentAccount?.count||0);
      if(ipCount>=4)reasons.push("Aynı ağdan yoğun oy");if(accountCount>=6)reasons.push("Hesaptan yoğun oy");if(comment.length<12)reasons.push("Çok kısa yorum");
      const riskScore=Math.min(100,(ipCount>=4?45:0)+(accountCount>=6?35:0)+(comment.length<12?15:0));
      await env.DB.prepare("INSERT INTO vote_security_events(review_id,user_id,server_id,ip_hash,user_agent_hash,risk_score,risk_reasons) VALUES(?,?,?,?,?,?,?)")
        .bind(Number(createdReview.meta.last_row_id),user.id,serverId,await keyedHash(env,ip),await keyedHash(env,request.headers.get("user-agent")||"unknown"),riskScore,reasons.join(", ")).run();
      await addAuditEvent(env.DB,request,"user",user.id,"review.create","review",Number(createdReview.meta.last_row_id),{serverId,rating,riskScore});
      return json({ message: "Puanınız ve yorumunuz yayımlandı." }, 201);
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) return json({ error: "Bu sunucuya daha önce oy verdiniz." }, 409);
      throw error;
    }
  }

  // Admin login
  if (method === "POST" && path === "/api/admin/login") {
    verifyOrigin(request);
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
    verifyOrigin(request);
    return json({ message: "Çıkış yapıldı." }, 200, { "Set-Cookie": clearCookie(ADMIN_COOKIE) });
  }

  if (path.startsWith("/api/admin/")) {
    if (!env.SESSION_SECRET || !(await verifySignedToken(getCookie(request, ADMIN_COOKIE), env.SESSION_SECRET))) {
      return json({ error: "Yönetici girişi gerekli." }, 401);
    }
    verifyOrigin(request);

    if (method === "GET" && path === "/api/admin/dashboard") {
      const servers = await env.DB.prepare(`
        SELECT s.id,s.name,s.description,s.cap,s.rates,s.server_type,s.opened_at,s.beta_at,s.launch_at,s.operational_status,s.status_note,s.website_url,s.discord_url,s.promo_url,(SELECT user_id FROM server_owners WHERE server_id=s.id LIMIT 1) owner_user_id,COALESCE((SELECT setting_value FROM site_settings WHERE setting_key='server_image_'||s.id),'') image_url,s.is_active,s.created_at,
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
        SELECT id,email,display_name,account_role,status,created_at FROM users ORDER BY datetime(created_at) DESC LIMIT 500
      `).all();
      const requests = await env.DB.prepare(`SELECT q.*,u.display_name,u.email FROM server_requests q JOIN users u ON u.id=q.user_id ORDER BY CASE q.status WHEN 'pending' THEN 0 ELSE 1 END,datetime(q.created_at) DESC`).all();
      const suggestions = await env.DB.prepare(`SELECT g.*,u.display_name,u.email FROM suggestions g JOIN users u ON u.id=g.user_id ORDER BY CASE g.status WHEN 'new' THEN 0 ELSE 1 END,datetime(g.created_at) DESC`).all();
      const changes=await env.DB.prepare(`SELECT c.*,s.name server_name,u.display_name FROM server_change_requests c JOIN servers s ON s.id=c.server_id JOIN users u ON u.id=c.user_id ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END,c.id DESC`).all();
      const reports=await env.DB.prepare(`SELECT p.*,s.name server_name,r.comment,u.display_name reporter_name FROM content_reports p JOIN servers s ON s.id=p.server_id JOIN reviews r ON r.id=p.review_id JOIN users u ON u.id=p.reporter_user_id ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END,p.id DESC`).all();
      return json({ servers: servers.results || [], reviews: reviews.results || [], users: users.results || [], requests:requests.results||[], suggestions:suggestions.results||[], changes:changes.results||[], reports:reports.results||[], settings: await getSettings(env.DB) });
    }

    const changeAction=path.match(/^\/api\/admin\/server-changes\/(\d+)$/);
    if(changeAction&&method==="PUT"){
      requireJson(request);const body=await readJson(request),id=Number(changeAction[1]),status=body.status==="approved"?"approved":"rejected";
      const item=await env.DB.prepare("SELECT * FROM server_change_requests WHERE id=?").bind(id).first();
      if(!item)return json({error:"Değişiklik isteği bulunamadı."},404);
      if(status==="approved"&&item.status==="pending"){
        await env.DB.prepare("UPDATE servers SET description=?,website_url=?,discord_url=?,promo_url=?,beta_at=?,launch_at=?,operational_status=?,status_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(item.description,item.website_url,item.discord_url,item.promo_url,item.beta_at,item.launch_at,item.operational_status,item.status_note,item.server_id).run();
        if(item.image_url)await saveSetting(env.DB,`server_image_${item.server_id}`,safeImage(item.image_url));
      }
      await env.DB.prepare("UPDATE server_change_requests SET status=?,admin_note=?,resolved_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,cleanText(body.note),id).run();
      return json({message:status==="approved"?"Değişiklikler yayına alındı.":"Değişiklik isteği reddedildi."});
    }

    const reportAction=path.match(/^\/api\/admin\/reports\/(\d+)$/);
    if(reportAction&&method==="PUT"){
      requireJson(request);const body=await readJson(request),id=Number(reportAction[1]),status=body.status==="approved"?"approved":"rejected";
      const item=await env.DB.prepare("SELECT review_id FROM content_reports WHERE id=?").bind(id).first();
      if(!item)return json({error:"Bildirim bulunamadı."},404);
      if(status==="approved")await env.DB.prepare("DELETE FROM reviews WHERE id=?").bind(item.review_id).run();
      else await env.DB.prepare("UPDATE content_reports SET status='rejected',resolved_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
      return json({message:status==="approved"?"Yorum ve puan silindi.":"Bildirim reddedildi."});
    }

    const requestAction=path.match(/^\/api\/admin\/server-requests\/(\d+)$/);
    if(requestAction&&method==="PUT"){
      requireJson(request);const body=await readJson(request),id=Number(requestAction[1]),status=["approved","rejected"].includes(body.status)?body.status:"rejected";
      const item=await env.DB.prepare("SELECT * FROM server_requests WHERE id=?").bind(id).first();
      if(!item)return json({error:"İstek bulunamadı."},404);
      if(status==="approved"&&item.status!=="approved"){
        const created=await env.DB.prepare("INSERT INTO servers(name,description,cap,rates,server_type,opened_at,is_active) VALUES(?,?,?,?,?,?,1)").bind(item.server_name,item.description,item.cap,item.rates,item.server_type,item.opened_at).run();
      }
      await env.DB.prepare("UPDATE server_requests SET status=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,cleanText(body.note),id).run();
      return json({message:status==="approved"?"Sunucu yayınlandı. Sahiplik ayrıca yönetici tarafından atanmalıdır.":"İstek reddedildi."});
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
      if (name.length < 2 || name.length > 80 || description.length < 3 || description.length > 300) return json({ error: "Sunucu adı veya açıklaması geçersiz. Açıklama en fazla 300 karakter olabilir." }, 400);
      const result = await env.DB.prepare("INSERT INTO servers(name,description,cap,rates,server_type,opened_at,beta_at,launch_at,operational_status,status_note,is_verified,is_active,website_url,discord_url,promo_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(name,description,cap,rates,serverType,openedAt,validDateTime(body.beta_at),validDateTime(body.launch_at),validOperationalStatus(body.operational_status),cleanText(body.status_note).slice(0,120),0,body.is_active ? 1 : 0,cleanUrl(body.website_url),cleanUrl(body.discord_url),cleanUrl(body.promo_url)).run();
      const ownerId=Number(body.owner_user_id||0);
      if(ownerId){await env.DB.prepare("INSERT OR IGNORE INTO server_owners(server_id,user_id) VALUES(?,?)").bind(Number(result.meta.last_row_id),ownerId).run();await reconcileOwnerRoles(env.DB,[ownerId])}
      await saveSetting(env.DB, `server_image_${Number(result.meta.last_row_id)}`, safeImage(body.image_url));
      await addAuditEvent(env.DB,request,"admin",null,"server.create","server",Number(result.meta.last_row_id),{name,ownerId:ownerId||null});
      return json({ message: "Sunucu eklendi." }, 201);
    }

    const adminServer = path.match(/^\/api\/admin\/servers\/(\d+)$/);
    if (adminServer && method === "PUT") {
      requireJson(request); const body = await readJson(request);
      const serverId=Number(adminServer[1]);
      await env.DB.prepare("UPDATE servers SET name=?,description=?,cap=?,rates=?,server_type=?,opened_at=?,beta_at=?,launch_at=?,operational_status=?,status_note=?,is_verified=0,is_active=?,website_url=?,discord_url=?,promo_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(cleanText(body.name),cleanText(body.description),validCap(body.cap),validRates(body.rates),validServerType(body.server_type),validDate(body.opened_at),validDateTime(body.beta_at),validDateTime(body.launch_at),validOperationalStatus(body.operational_status),cleanText(body.status_note).slice(0,120),body.is_active ? 1 : 0,cleanUrl(body.website_url),cleanUrl(body.discord_url),cleanUrl(body.promo_url),serverId).run();
      await saveSetting(env.DB, `server_image_${serverId}`, safeImage(body.image_url));
      const previousOwners=await env.DB.prepare("SELECT user_id FROM server_owners WHERE server_id=?").bind(serverId).all();
      await env.DB.prepare("DELETE FROM server_owners WHERE server_id=?").bind(serverId).run();
      const ownerId=Number(body.owner_user_id||0);
      if(ownerId)await env.DB.prepare("INSERT INTO server_owners(server_id,user_id) VALUES(?,?)").bind(serverId,ownerId).run();
      await reconcileOwnerRoles(env.DB,[...(previousOwners.results||[]).map(x=>Number(x.user_id)),ownerId].filter(Boolean));
      await addAuditEvent(env.DB,request,"admin",null,"server.update","server",serverId,{ownerId:ownerId||null});
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

    const userRole=path.match(/^\/api\/admin\/users\/(\d+)\/role$/);
    if(userRole&&method==="PUT"){
      requireJson(request);const body=await readJson(request),userId=Number(userRole[1]),role=body.role==="owner"?"owner":"user";
      await env.DB.prepare("UPDATE users SET account_role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(role,userId).run();
      if(role==="user")await env.DB.prepare("DELETE FROM server_owners WHERE user_id=?").bind(userId).run();
      await reconcileOwnerRoles(env.DB,[userId]);
      return json({message:role==="owner"?"Kullanıcı sunucu sahibi rolüne geçirildi. Sunucu atamasını Sunucular bölümünden yapın.":"Kullanıcı normal role geçirildi."});
    }

    const assignOwner=path.match(/^\/api\/admin\/users\/(\d+)\/assign-server$/);
    if(assignOwner&&method==="POST"){
      requireJson(request);const body=await readJson(request),userId=Number(assignOwner[1]),serverId=Number(body.serverId);
      const server=await env.DB.prepare("SELECT id,name FROM servers WHERE id=?").bind(serverId).first();
      const userRow=await env.DB.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(userId).first();
      if(!server||!userRow)return json({error:"Kullanıcı veya sunucu bulunamadı."},404);
      const previous=await env.DB.prepare("SELECT user_id FROM server_owners WHERE server_id=?").bind(serverId).all();
      await env.DB.batch([
        env.DB.prepare("DELETE FROM server_owners WHERE server_id=?").bind(serverId),
        env.DB.prepare("INSERT INTO server_owners(server_id,user_id) VALUES(?,?)").bind(serverId,userId),
      ]);
      await reconcileOwnerRoles(env.DB,[...(previous.results||[]).map(x=>Number(x.user_id)),userId]);
      await addNotification(env.DB,userId,null,"ownership","Sunucu sahipliği atandı",`${server.name} sunucusunun yönetimi hesabınıza bağlandı.`,"/sunucu-paneli/");
      await addAuditEvent(env.DB,request,"admin",null,"ownership.assign","server",serverId,{userId});
      return json({message:`${server.name} sunucusu kullanıcıya atandı.`});
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
async function reconcileOwnerRoles(db,userIds){
  const ids=[...new Set(userIds.map(Number).filter(Number.isInteger))];
  if(!ids.length)return;
  await db.batch(ids.map(userId=>db.prepare(`UPDATE users
    SET account_role=CASE WHEN EXISTS(SELECT 1 FROM server_owners WHERE user_id=?) THEN 'owner' ELSE 'user' END,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).bind(userId,userId)));
}
async function addAuditEvent(db,request,actorType,actorId,action,entityType="",entityId=null,metadata={}){
  const ip=request.headers.get("CF-Connecting-IP")||"unknown";
  await db.prepare(`INSERT INTO audit_events(actor_type,actor_id,action,entity_type,entity_id,metadata,ip_hash)
    VALUES(?,?,?,?,?,?,?)`).bind(
      actorType,actorId?Number(actorId):null,String(action).slice(0,80),String(entityType).slice(0,40),
      entityId===null?null:Number(entityId),JSON.stringify(metadata).slice(0,1000),await sha256(ip)
    ).run();
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
    SELECT u.id,u.email,u.email_normalized,u.display_name,u.role,u.account_role,u.game_alias,u.bio,u.status
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
  return { id:user.id,email:user.email,displayName:user.display_name,role:user.account_role||user.role||"user",gameAlias:user.game_alias||"",bio:user.bio||"" };
}

async function hashPassword(password, saltHex, iterations=PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", salt: hexBytes(saltHex), iterations
  }, key, 256);
  return bytesHex(new Uint8Array(bits));
}
async function verifyPassword(password, salt, expected, iterations=PBKDF2_ITERATIONS) {
  return constantTimeEqual(await hashPassword(password, salt, iterations), expected);
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
function hasProfanity(value){
  const raw=String(value||"").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[0@4]/g,"a").replace(/[1!|]/g,"i").replace(/[3]/g,"e").replace(/[5$]/g,"s").replace(/[7]/g,"t");
  const compact=raw.replace(/[^a-zçğıöşü]/g,""),tokens=raw.split(/[^a-zçğıöşü]+/).filter(Boolean);
  const blockedRoots=["amk","amina","aminakoy","siktir","orospu","yarrak","gotveren","pezevenk","puşt","pust"];
  return blockedRoots.some(word=>compact.includes(word))||["aq","sik","pic","ibne","kahpe","gerizekali","salak","aptal","mal"].some(word=>tokens.includes(word));
}

async function addNotification(db,userId,actorUserId,type,title,message,targetUrl){
  const safeTarget=safeInternalTarget(targetUrl);
  await db.prepare("INSERT INTO notifications(user_id,actor_user_id,type,title,message,target_url) VALUES(?,?,?,?,?,?)")
    .bind(Number(userId),actorUserId?Number(actorUserId):null,String(type),cleanText(title).slice(0,100),cleanText(message).slice(0,240),safeTarget).run();
}
function safeInternalTarget(value){
  const target=String(value||"/").slice(0,300);
  return target.startsWith("/")&&!target.startsWith("//")?target:"/";
}
function validCap(value) { const cap=Number(value); return Number.isInteger(cap)&&cap>=1&&cap<=200 ? cap : 110; }
function validRates(value) { const rates=cleanText(value).slice(0,30); return rates || "1x"; }
function validServerType(value) { return String(value).toUpperCase()==="CH" ? "CH" : "EU/CH"; }
function validDate(value) { const date=String(value||""); return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ""; }
function validDateTime(value){const date=String(value||"");return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date)?date:"";}
function validOperationalStatus(value){return ["online","maintenance","offline"].includes(value)?value:"offline";}
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
  headers.set("Content-Security-Policy","default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests");
  headers.set("Cross-Origin-Opener-Policy","same-origin-allow-popups");
  headers.set("Cross-Origin-Resource-Policy","same-origin");
  headers.set("Strict-Transport-Security","max-age=31536000; includeSubDomains");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
class HttpError extends Error { constructor(message,status){super(message);this.status=status;} }
