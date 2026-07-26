const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/sro-yonetim-9f4k2" || url.pathname === "/sro-yonetim-9f4k2/") {
        return env.ASSETS.fetch(new Request(new URL("/sro-yonetim-9f4k2/index.html", url), request));
      }

      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
        return new Response("Sayfa bulunamadı.", { status: 404 });
      }

      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      const assetResponse = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetResponse);
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
    return json({
      siteName: env.SITE_NAME || "SRO Sunucu Oylama",
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || ""
    });
  }

  if (method === "GET" && path === "/api/servers") {
    const sort = ["rating", "votes", "newest"].includes(url.searchParams.get("sort"))
      ? url.searchParams.get("sort")
      : "rating";

    const orderBy = {
      rating: "average_rating DESC, vote_count DESC, s.created_at DESC",
      votes: "vote_count DESC, average_rating DESC, s.created_at DESC",
      newest: "s.created_at DESC"
    }[sort];

    const result = await env.DB.prepare(`
      SELECT
        s.id, s.name, s.description, s.created_at,
        COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
        COUNT(r.id) AS vote_count
      FROM servers s
      LEFT JOIN reviews r ON r.server_id = s.id
      WHERE s.is_active = 1
      GROUP BY s.id
      ORDER BY ${orderBy}
    `).all();

    return json({ servers: result.results || [] });
  }

  const publicServerMatch = path.match(/^\/api\/servers\/(\d+)$/);
  if (method === "GET" && publicServerMatch) {
    const id = Number(publicServerMatch[1]);
    const server = await getServer(env.DB, id, false);
    if (!server) return json({ error: "Sunucu bulunamadı." }, 404);

    const reviews = await env.DB.prepare(`
      SELECT id, rating, comment, created_at
      FROM reviews
      WHERE server_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 200
    `).bind(id).all();

    return json({ server, reviews: reviews.results || [] });
  }

  const reviewMatch = path.match(/^\/api\/servers\/(\d+)\/reviews$/);
  if (method === "POST" && reviewMatch) {
    requireJson(request);
    const serverId = Number(reviewMatch[1]);
    const server = await getServer(env.DB, serverId, false);
    if (!server) return json({ error: "Sunucu bulunamadı veya yayında değil." }, 404);

    const body = await safeJson(request);
    const email = normalizeEmail(body.email);
    const rating = Number(body.rating);
    const comment = cleanText(body.comment);

    if (!isValidEmail(email)) return json({ error: "Geçerli bir e-posta adresi yazın." }, 400);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json({ error: "1 ile 5 arasında bir puan seçin." }, 400);
    }
    if (comment.length < 3 || comment.length > 500) {
      return json({ error: "Yorum 3–500 karakter arasında olmalıdır." }, 400);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const identityHash = await sha256(`${env.SESSION_SECRET || "fallback"}:${ip}`);
    const allowed = await rateLimit(env.DB, "review", identityHash, 5, 10 * 60);
    if (!allowed) return json({ error: "Çok hızlı gönderim yaptınız. Birkaç dakika sonra tekrar deneyin." }, 429);

    if (env.TURNSTILE_SECRET_KEY) {
      const valid = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
      if (!valid) return json({ error: "Güvenlik doğrulaması başarısız oldu. Sayfayı yenileyip tekrar deneyin." }, 400);
    }

    const emailHash = await sha256(`${env.SESSION_SECRET || "fallback"}:${email}`);
    const emailMasked = maskEmail(email);
    const ipHash = await sha256(`${env.SESSION_SECRET || "fallback"}:${ip}`);

    try {
      await env.DB.prepare(`
        INSERT INTO reviews (server_id, email_hash, email_masked, rating, comment, ip_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(serverId, emailHash, emailMasked, rating, comment, ipHash).run();
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) {
        return json({ error: "Bu e-posta adresi bu sunucuya daha önce oy vermiş." }, 409);
      }
      throw error;
    }

    return json({ message: "Puanınız ve yorumunuz yayımlandı." }, 201);
  }

  if (method === "POST" && path === "/api/admin/login") {
    requireJson(request);
    const body = await safeJson(request);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const identityHash = await sha256(`${env.SESSION_SECRET || "fallback"}:${ip}`);
    const allowed = await rateLimit(env.DB, "admin-login", identityHash, 8, 15 * 60);
    if (!allowed) return json({ error: "Çok fazla giriş denemesi yapıldı. Daha sonra tekrar deneyin." }, 429);

    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      return json({ error: "Yönetici şifresi henüz Cloudflare ayarlarına eklenmemiş." }, 503);
    }

    if (!constantTimeEqual(String(body.password || ""), env.ADMIN_PASSWORD)) {
      return json({ error: "Şifre yanlış." }, 401);
    }

    const token = await createSession(env.SESSION_SECRET);
    return json(
      { message: "Giriş başarılı." },
      200,
      { "Set-Cookie": sessionCookie(token, request) }
    );
  }

  if (method === "POST" && path === "/api/admin/logout") {
    return json(
      { message: "Çıkış yapıldı." },
      200,
      { "Set-Cookie": `sro_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` }
    );
  }

  if (path.startsWith("/api/admin/")) {
    const session = getCookie(request, "sro_admin");
    if (!env.SESSION_SECRET || !(await verifySession(session, env.SESSION_SECRET))) {
      return json({ error: "Yönetici girişi gerekli." }, 401);
    }

    verifyOrigin(request);

    if (method === "GET" && path === "/api/admin/servers") {
      const servers = await env.DB.prepare(`
        SELECT
          s.id, s.name, s.description, s.is_active, s.created_at, s.updated_at,
          COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
          COUNT(r.id) AS vote_count
        FROM servers s
        LEFT JOIN reviews r ON r.server_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `).all();

      const reviews = await env.DB.prepare(`
        SELECT r.id, r.server_id, r.email_masked, r.rating, r.comment, r.created_at, s.name AS server_name
        FROM reviews r
        JOIN servers s ON s.id = r.server_id
        ORDER BY datetime(r.created_at) DESC
        LIMIT 500
      `).all();

      return json({ servers: servers.results || [], reviews: reviews.results || [] });
    }

    if (method === "POST" && path === "/api/admin/servers") {
      requireJson(request);
      const body = await safeJson(request);
      const name = cleanText(body.name);
      const description = cleanText(body.description);
      if (name.length < 2 || name.length > 80) return json({ error: "Sunucu adı 2–80 karakter olmalıdır." }, 400);
      if (description.length < 3 || description.length > 600) return json({ error: "Açıklama 3–600 karakter olmalıdır." }, 400);

      const result = await env.DB.prepare(`
        INSERT INTO servers (name, description) VALUES (?, ?)
      `).bind(name, description).run();
      return json({ message: "Sunucu eklendi.", id: result.meta?.last_row_id }, 201);
    }

    const adminServerMatch = path.match(/^\/api\/admin\/servers\/(\d+)$/);
    if (adminServerMatch && method === "PUT") {
      requireJson(request);
      const id = Number(adminServerMatch[1]);
      const body = await safeJson(request);
      const name = cleanText(body.name);
      const description = cleanText(body.description);
      const isActive = body.is_active ? 1 : 0;

      if (name.length < 2 || name.length > 80) return json({ error: "Sunucu adı 2–80 karakter olmalıdır." }, 400);
      if (description.length < 3 || description.length > 600) return json({ error: "Açıklama 3–600 karakter olmalıdır." }, 400);

      await env.DB.prepare(`
        UPDATE servers SET name = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(name, description, isActive, id).run();
      return json({ message: "Sunucu güncellendi." });
    }

    if (adminServerMatch && method === "DELETE") {
      const id = Number(adminServerMatch[1]);
      await env.DB.prepare("DELETE FROM servers WHERE id = ?").bind(id).run();
      return json({ message: "Sunucu ve bağlı yorumlar silindi." });
    }

    const resetMatch = path.match(/^\/api\/admin\/servers\/(\d+)\/reset$/);
    if (resetMatch && method === "POST") {
      const id = Number(resetMatch[1]);
      await env.DB.prepare("DELETE FROM reviews WHERE server_id = ?").bind(id).run();
      return json({ message: "Sunucunun bütün oy ve yorumları sıfırlandı." });
    }

    const reviewDeleteMatch = path.match(/^\/api\/admin\/reviews\/(\d+)$/);
    if (reviewDeleteMatch && method === "DELETE") {
      const id = Number(reviewDeleteMatch[1]);
      await env.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
      return json({ message: "Yorum silindi." });
    }
  }

  return json({ error: "İstenen adres bulunamadı." }, 404);
}

async function getServer(db, id, includeHidden) {
  const where = includeHidden ? "s.id = ?" : "s.id = ? AND s.is_active = 1";
  return await db.prepare(`
    SELECT
      s.id, s.name, s.description, s.is_active, s.created_at,
      COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
      COUNT(r.id) AS vote_count
    FROM servers s
    LEFT JOIN reviews r ON r.server_id = s.id
    WHERE ${where}
    GROUP BY s.id
  `).bind(id).first();
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders
    }
  });
}

function requireJson(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new HttpError("İstek JSON biçiminde olmalıdır.", 415);
  }
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError("Geçersiz veri gönderildi.", 400);
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function maskEmail(email) {
  const [local, domain] = email.split("@");
  const shown = local.slice(0, 1);
  return `${shown}${"*".repeat(Math.max(3, Math.min(8, local.length - 1)))}@${domain}`;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function rateLimit(db, action, identityHash, maxCount, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - windowSeconds;
  await db.prepare("DELETE FROM rate_limits WHERE created_at < ?").bind(now - 86400).run();
  const row = await db.prepare(`
    SELECT COUNT(*) AS count FROM rate_limits
    WHERE action = ? AND identity_hash = ? AND created_at >= ?
  `).bind(action, identityHash, cutoff).first();

  if (Number(row?.count || 0) >= maxCount) return false;
  await db.prepare(`
    INSERT INTO rate_limits (action, identity_hash, created_at) VALUES (?, ?, ?)
  `).bind(action, identityHash, now).run();
  return true;
}

async function verifyTurnstile(token, ip, secret) {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  form.append("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const result = await response.json();
  return result.success === true;
}

function constantTimeEqual(a, b) {
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = aa.length ^ bb.length;
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i++) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

async function createSession(secret) {
  const payload = btoa(JSON.stringify({
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    nonce: crypto.randomUUID()
  })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

async function verifySession(token, secret) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = await sign(payload, secret);
  if (!constantTimeEqual(signature, expected)) return false;
  try {
    let normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    normalized += "=".repeat((4 - normalized.length % 4) % 4);
    const data = JSON.parse(atob(normalized));
    return data.role === "admin" && Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  return `sro_admin=${token}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=43200`;
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] || "";
}

function verifyOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new HttpError("Güvenlik kontrolü başarısız oldu.", 403);
  }
}


function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
