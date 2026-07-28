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

      if (url.pathname.startsWith("/media/") && request.method === "GET") {
        return secureResponse(await handleMedia(env.DB,url.pathname));
      }

      if(request.method==="GET"&&url.pathname==="/robots.txt")return secureResponse(robotsResponse(request,env));
      if(request.method==="GET"&&url.pathname==="/sitemap.xml")return secureResponse(await sitemapResponse(request,env));
      if(request.method==="GET"&&url.pathname.startsWith("/sunucular/"))return secureResponse(await serverPageResponse(request,env,url));

      const response = await env.ASSETS.fetch(request);
      const secured=secureResponse(response);
      if(/^\/(giris|kayit|profil|bildirimler|sunucu-paneli|sro-yonetim-9f4k2)(\/|$)/.test(url.pathname))secured.headers.set("X-Robots-Tag","noindex, nofollow");
      return secured;
    } catch (error) {
      console.error(error);
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return json({ error: "Beklenmeyen bir hata oluştu." }, 500);
    }
  }
};

function publicOrigin(request,env){
  const configured=String(env.SITE_URL||"").trim().replace(/\/$/,"");
  return configured||new URL(request.url).origin;
}

function slugify(value){
  return String(value||"sunucu").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

function htmlEscape(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

function robotsResponse(request,env){
  const origin=publicOrigin(request,env);
  return new Response(`User-agent: *\nAllow: /\nDisallow: /profil/\nDisallow: /sunucu-sahibi/\nDisallow: /sro-yonetim-9f4k2/\nSitemap: ${origin}/sitemap.xml\n`,{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public, max-age=3600"}});
}

async function sitemapResponse(request,env){
  const origin=publicOrigin(request,env),rows=await env.DB.prepare("SELECT id,name,updated_at FROM servers WHERE is_active=1 ORDER BY id").all();
  const urls=(rows.results||[]).map(server=>`<url><loc>${htmlEscape(origin)}/sunucular/${slugify(server.name)}-${server.id}</loc><lastmod>${htmlEscape(String(server.updated_at||"").slice(0,10))}</lastmod></url>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${htmlEscape(origin)}/</loc></url>${urls}</urlset>`,{headers:{"content-type":"application/xml; charset=utf-8","cache-control":"public, max-age=900"}});
}

async function serverPageResponse(request,env,url){
  const match=url.pathname.match(/-(\d+)\/?$/),id=Number(match?.[1]||0);
  const server=id?await env.DB.prepare(`SELECT s.id,s.name,s.description,s.cap,s.server_type,s.opened_at,s.operational_status,s.status_note,s.website_url,s.discord_url,s.promo_url,s.updated_at,
    CASE WHEN EXISTS(SELECT 1 FROM site_settings WHERE setting_key='server_image_'||s.id AND setting_value!='') THEN '/media/server/'||s.id ELSE '' END image_url,
    COALESCE(ROUND(AVG(r.rating),1),0) average_rating,COUNT(r.id) vote_count
    FROM servers s LEFT JOIN reviews r ON r.server_id=s.id AND NOT EXISTS(SELECT 1 FROM hidden_reviews h WHERE h.review_id=r.id) WHERE s.id=? AND s.is_active=1 GROUP BY s.id`).bind(id).first():null;
  if(!server)return new Response("<!doctype html><html lang=\"tr\"><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>Sunucu bulunamadı — SRO RATING</title><body><main><h1>Sunucu bulunamadı</h1><a href=\"/\">Ana sayfaya dön</a></main></body></html>",{status:404,headers:{"content-type":"text/html; charset=utf-8"}});
  const canonicalPath=`/sunucular/${slugify(server.name)}-${server.id}`;
  if(url.pathname.replace(/\/$/,"")!==canonicalPath)return Response.redirect(`${publicOrigin(request,env)}${canonicalPath}`,301);
  const reviews=await env.DB.prepare("SELECT r.rating,r.comment,r.created_at,COALESCE(u.display_name,'Topluluk üyesi') display_name FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.server_id=? AND NOT EXISTS(SELECT 1 FROM hidden_reviews h WHERE h.review_id=r.id) ORDER BY datetime(r.created_at) DESC LIMIT 50").bind(id).all();
  const origin=publicOrigin(request,env),canonical=`${origin}${canonicalPath}`,title=`${server.name} — SRO RATING`,description=String(server.description||`${server.name} sunucu değerlendirmeleri`).slice(0,155),image=server.image_url?`${origin}${server.image_url}`:`${origin}/sro-rating-logo.png`;
  const links=[["Web sitesi",server.website_url],["Discord",server.discord_url],["Tanıtım",server.promo_url]].filter(([,href])=>href).map(([label,href])=>`<a href="${htmlEscape(href)}" rel="noopener nofollow" target="_blank">${label}</a>`).join("");
  const statusClass=server.operational_status==="online"?"online":server.operational_status==="maintenance"?"maintenance":"offline",statusLabel=statusClass==="online"?"Çevrimiçi":statusClass==="maintenance"?"Bakımda":"Kapalı";
  const comments=(reviews.results||[]).map(review=>`<article><header><strong>${htmlEscape(review.display_name)}</strong><span aria-label="${review.rating} yıldız">${"★".repeat(review.rating)}${"☆".repeat(5-review.rating)}</span></header><p>${htmlEscape(review.comment)}</p><time>${htmlEscape(String(review.created_at).slice(0,16))}</time></article>`).join("")||"<div class=\"empty\"><h2>Henüz yorum yok</h2><p>İlk değerlendirmeyi siz yapabilirsiniz.</p></div>";
  const schema=JSON.stringify({"@context":"https://schema.org","@type":"Product",name:server.name,description,aggregateRating:Number(server.vote_count)?{"@type":"AggregateRating",ratingValue:Number(server.average_rating),reviewCount:Number(server.vote_count),bestRating:5,worstRating:1}:undefined}).replace(/</g,"\\u003c");
  const html=`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)}</title><meta name="description" content="${htmlEscape(description)}"><link rel="canonical" href="${htmlEscape(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${htmlEscape(title)}"><meta property="og:description" content="${htmlEscape(description)}"><meta property="og:url" content="${htmlEscape(canonical)}"><meta property="og:image" content="${htmlEscape(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${htmlEscape(title)}"><meta name="twitter:description" content="${htmlEscape(description)}"><meta name="twitter:image" content="${htmlEscape(image)}"><link rel="icon" href="/sro-rating-logo.png"><link rel="stylesheet" href="/styles.css?v=20260728-6"><script type="application/ld+json">${schema}</script></head><body class="server-page-body"><header class="server-page-header"><a href="/"><img src="/sro-rating-header.png" alt="SRO RATING"></a><a class="outline" href="/">Tüm Sunucular</a></header><main class="server-page"><section class="server-page-summary"><img src="${htmlEscape(image)}" alt="${htmlEscape(server.name)} sunucu görseli"><div><div class="server-badges"><span>${htmlEscape(server.server_type)}</span><span>CAP ${Number(server.cap)||"—"}</span><span class="detail-status-indicator ${statusClass}" title="${htmlEscape(server.status_note||statusLabel)}" aria-label="Sunucu durumu: ${statusLabel}"><i></i><b class="sr-only">${statusLabel}</b></span></div><h1>${htmlEscape(server.name)}</h1><p>${htmlEscape(server.description)}</p><div class="server-page-score"><strong>${Number(server.average_rating||0).toFixed(1)}</strong><span>${"★".repeat(Math.round(Number(server.average_rating||0)))}${"☆".repeat(5-Math.round(Number(server.average_rating||0)))}</span><small>${Number(server.vote_count)} değerlendirme</small></div><nav>${links}</nav><a class="primary" href="/?server=${server.id}">Oy Ver ve Yorumla</a></div></section><section class="server-page-reviews"><header><div><small>TOPLULUK GÖRÜŞLERİ</small><h2>Yorumlar</h2></div><strong>${Number(server.vote_count)}</strong></header>${comments}</section></main><script src="/server-page.js?v=20260728-6" defer></script></body></html>`;
  return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=120, stale-while-revalidate=600"}});
}

async function handleApi(request, env, url) {
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (method === "GET" && path === "/api/config") {
    const settings = await getPublicSettings(env.DB);
    return json({
      siteName: "SRO RATING",
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
      settings
    });
  }

  if (method === "GET" && path === "/api/servers") {
    const currentUser=await getCurrentUser(request,env.DB);
    const result = await env.DB.prepare(`
      SELECT s.id, s.name, s.description, s.cap, s.server_type, s.opened_at, s.beta_at, s.launch_at, s.operational_status, s.status_note, s.website_url, s.discord_url, s.promo_url,
        CASE WHEN EXISTS(SELECT 1 FROM site_settings WHERE setting_key='server_image_'||s.id AND setting_value!='')
          THEN '/media/server/'||s.id||'?v='||COALESCE((SELECT strftime('%s',updated_at) FROM site_settings WHERE setting_key='server_image_'||s.id),'0') ELSE '' END image_url,
        s.created_at,
        COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
        COUNT(r.id) AS vote_count,
        EXISTS(SELECT 1 FROM user_favorite_servers f WHERE f.server_id=s.id AND f.user_id=?) AS is_favorite,
        ROUND(((COALESCE(AVG(r.rating),3.5)*COUNT(r.id)+17.5)/(COUNT(r.id)+5))+(s.is_verified*0.35),2) AS trust_score
      FROM servers s
      LEFT JOIN reviews r ON r.server_id = s.id AND NOT EXISTS(SELECT 1 FROM hidden_reviews h WHERE h.review_id=r.id)
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
      SELECT s.id, s.name, s.description, s.cap, s.server_type, s.opened_at, s.beta_at, s.launch_at, s.operational_status, s.status_note, s.website_url, s.discord_url, s.promo_url,
        CASE WHEN EXISTS(SELECT 1 FROM site_settings WHERE setting_key='server_image_'||s.id AND setting_value!='')
          THEN '/media/server/'||s.id||'?v='||COALESCE((SELECT strftime('%s',updated_at) FROM site_settings WHERE setting_key='server_image_'||s.id),'0') ELSE '' END image_url,
        s.created_at,
        COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
        COUNT(r.id) AS vote_count
      FROM servers s LEFT JOIN reviews r ON r.server_id = s.id AND NOT EXISTS(SELECT 1 FROM hidden_reviews h WHERE h.review_id=r.id)
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
      WHERE r.server_id = ? AND NOT EXISTS(SELECT 1 FROM hidden_reviews h WHERE h.review_id=r.id)
      ORDER BY datetime(r.created_at) DESC LIMIT 200
    `).bind(currentUser?.id||0,id).all();
    const reviewComments=await env.DB.prepare(`SELECT c.id,c.review_id,c.user_id,c.comment,c.created_at,COALESCE(u.display_name,'Eski kullanıcı') display_name
      FROM review_comments c LEFT JOIN users u ON u.id=c.user_id JOIN reviews r ON r.id=c.review_id
      WHERE r.server_id=? ORDER BY datetime(c.created_at) ASC LIMIT 500`).bind(id).all();
    const isOwner=currentUser?Boolean(await env.DB.prepare("SELECT 1 FROM server_owners WHERE server_id=? AND user_id=?").bind(id,currentUser.id).first()):false;
    return json({ server, reviews: reviews.results || [], reviewComments:reviewComments.results||[], viewer:{isOwner,canReview:Boolean(currentUser&&!isOwner)} });
  }

  // User registration
  if (method === "POST" && path === "/api/auth/register") {
    verifyOrigin(request);
    requireJson(request);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const displayName = cleanText(body.displayName);
    const password = String(body.password || "");
    const accountType = ["owner","creator"].includes(body.accountType) ? body.accountType : "user";
    const discord = cleanText(body.discord).slice(0,80);
    const introduction = cleanText(body.introduction).slice(0,500);

    if (!isValidEmail(email)) return json({ error: "Geçerli bir e-posta adresi yazın." }, 400);
    if (displayName.length < 2 || displayName.length > 40) return json({ error: "Kullanıcı adı 2–40 karakter olmalıdır." }, 400);
    if (hasProfanity(displayName)) return json({ error: "Kullanıcı adında yasaklı ifade kullanılamaz." }, 400);
    if (!isValidPassword(password)) return json({ error: "Şifre en az 8 karakter olmalı ve harf ile rakam içermelidir." }, 400);
    if(accountType!=="user"&&!discord&&!introduction)return json({error:"Başvuru için Discord veya kısa bir açıklama gereklidir."},400);

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
      if(accountType!=="user"){
        await env.DB.prepare("INSERT INTO role_applications(user_id,application_type,discord,contact_email,introduction) VALUES(?,?,?,?,?)")
          .bind(userId,accountType,discord,email,introduction).run();
        if(accountType==="creator")await env.DB.prepare("INSERT INTO creator_profiles(user_id,slug,headline,biography,discord,contact_email) VALUES(?,?,?,?,?,?)")
          .bind(userId,`yayin-${userId}`,"Yeni yayıncı",introduction,discord,email).run();
      }
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
    const user = await getCurrentUse…13708 tokens truncated…r bölümünden yapın.":"Kullanıcı normal role geçirildi."});
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
      const userId=Number(deleteUser[1]);
      await env.DB.prepare("DELETE FROM users WHERE id=?").bind(userId).run();
      await addAuditEvent(env.DB,request,"admin",null,"user.delete","user",userId);
      return json({ message: "Kullanıcı silindi." });
    }

    if (method === "PUT" && path === "/api/admin/settings") {
      requireJson(request); const body = await readJson(request);
      const allowed = ["logo_image","banner_text","banner_url","banner_image","left_ad_text","left_ad_url","left_ad_image","right_ad_text","right_ad_url","right_ad_image","contact_text","disclaimer_text","footer_tagline","twitch_url","kick_url","youtube_url"];
      const statements = allowed.map(key => env.DB.prepare(`
        INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP
      `).bind(key,sanitizeSetting(key,body[key])));
      await env.DB.batch(statements);
      await addAuditEvent(env.DB,request,"admin",null,"settings.update","settings",null,{keys:allowed});
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
  const [header,payload]=image.split(",",2),type=header.slice(11,header.indexOf(";"));
  let bytes;
  try{bytes=Uint8Array.from(atob(payload.slice(0,24)),character=>character.charCodeAt(0));}
  catch{throw new HttpError("Görsel verisi bozuk.",400);}
  const isPng=bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
  const isJpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const isGif=bytes[0]===0x47&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x38;
  const isWebp=bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50;
  if(!({png:isPng,jpeg:isJpeg,gif:isGif,webp:isWebp}[type]))throw new HttpError("Görsel türü ile dosya içeriği eşleşmiyor.",400);
  return image;
}
function sanitizeSetting(key,value){
  if(key.endsWith("_image"))return safeImage(value);
  if(key.endsWith("_url"))return cleanUrl(value);
  const limits={banner_text:100,left_ad_text:80,right_ad_text:80,contact_text:500,disclaimer_text:750,footer_tagline:140};
  const text=cleanText(value).slice(0,limits[key]||500);
  if(hasProfanity(text))throw new HttpError("Site metni yasaklı ifade içeriyor.",400);
  return text;
}

async function getSettings(db) {
  const rows = await db.prepare("SELECT setting_key,setting_value FROM site_settings").all();
  return Object.fromEntries((rows.results || []).map(row => [row.setting_key, row.setting_value]));
}

async function getPublicSettings(db){
  const publicKeys=new Set([
    "logo_image","banner_text","banner_url","banner_image",
    "left_ad_text","left_ad_url","left_ad_image",
    "right_ad_text","right_ad_url","right_ad_image",
    "contact_text","disclaimer_text","footer_tagline",
    "twitch_url","kick_url","youtube_url"
  ]);
  const mediaKeys=new Set(["logo_image","banner_image","left_ad_image","right_ad_image"]);
  const rows=await db.prepare("SELECT setting_key,setting_value,updated_at FROM site_settings").all();
  return Object.fromEntries((rows.results||[]).filter(row=>publicKeys.has(row.setting_key)).map(row=>{
    if(mediaKeys.has(row.setting_key)&&row.setting_value){
      return [row.setting_key,`/media/settings/${row.setting_key}?v=${encodeURIComponent(row.updated_at||"0")}`];
    }
    return [row.setting_key,row.setting_value];
  }));
}

async function handleMedia(db,path){
  let settingKey="";
  const server=path.match(/^\/media\/server\/(\d+)$/);
  const setting=path.match(/^\/media\/settings\/(logo_image|banner_image|left_ad_image|right_ad_image)$/);
  if(server)settingKey=`server_image_${Number(server[1])}`;
  else if(setting)settingKey=setting[1];
  else return new Response("Not found",{status:404});
  const row=await db.prepare("SELECT setting_value FROM site_settings WHERE setting_key=?").bind(settingKey).first();
  if(!row?.setting_value)return new Response("Not found",{status:404});
  const match=String(row.setting_value).match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
  if(!match)return new Response("Not found",{status:404});
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
  return new Response(bytes,{
    headers:{
      "content-type":`image/${match[1]}`,
      "cache-control":"public, max-age=300, stale-while-revalidate=86400",
      "x-content-type-options":"nosniff"
    }
  });
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
async function readJson(request) {
  const maxBytes=512*1024,declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>maxBytes)throw new HttpError("İstek boyutu sınırı aşıldı.",413);
  try{
    const text=await request.text();
    if(encoder.encode(text).byteLength>maxBytes)throw new HttpError("İstek boyutu sınırı aşıldı.",413);
    return JSON.parse(text);
  }catch(error){
    if(error instanceof HttpError)throw error;
    throw new HttpError("Geçersiz veri.",400);
  }
}
function cleanText(value) { return String(value || "").replace(/<[^>]*>/g,"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim(); }
function clampInt(value,min,max,fallback){const number=Math.round(Number(value));return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback}
function secureShuffle(items){
  for(let index=items.length-1;index>0;index--){
    const limit=Math.floor(0x100000000/(index+1))*(index+1);let value;
    do{const buffer=new Uint32Array(1);crypto.getRandomValues(buffer);value=buffer[0]}while(value>=limit);
    const target=value%(index+1);[items[index],items[target]]=[items[target],items[index]];
  }
  return items;
}
function csvCell(value){return `"${String(value??"").replace(/"/g,'""').replace(/[\r\n]+/g," ")}"`}
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
  await db.prepare(`DELETE FROM notifications WHERE user_id=? AND id NOT IN (
    SELECT id FROM notifications WHERE user_id=? ORDER BY datetime(created_at) DESC,id DESC LIMIT 100
  )`).bind(Number(userId),Number(userId)).run();
}
function safeInternalTarget(value){
  const target=String(value||"/").slice(0,300);
  return target.startsWith("/")&&!target.startsWith("//")?target:"/";
}
function validCap(value) { const cap=Number(value); return Number.isInteger(cap)&&cap>=1&&cap<=200 ? cap : 110; }
function validRates(value) { const rates=cleanText(value).slice(0,30); return rates || "1x"; }
function validServerType(value) { return String(value).toUpperCase()==="CH" ? "CH" : "EU/CH"; }
function validDate(value){
  const date=String(value||"");
  if(!date)return "";
  const match=date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)throw new HttpError("Tarih geçersiz.",400);
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),parsed=new Date(Date.UTC(year,month-1,day));
  if(year<2000||year>2100||parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)throw new HttpError("Tarih geçersiz.",400);
  return date;
}
function validDateTime(value){
  const date=String(value||"");
  if(!date)return "";
  const match=date.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if(!match||Number(match[2])>23||Number(match[3])>59)throw new HttpError("Tarih ve saat geçersiz.",400);
  validDate(match[1]);
  return date;
}
function validOperationalStatus(value){return ["online","maintenance","offline"].includes(value)?value:"offline";}
function cleanUrl(value) {
  const raw=String(value||"").trim(); if(!raw)return "";
  if(raw.length>500)throw new HttpError("Web adresi çok uzun.",400);
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

