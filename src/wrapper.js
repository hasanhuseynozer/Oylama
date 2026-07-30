import app from './index.js';

const json=data=>new Response(JSON.stringify(data),{
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  }
});

async function ensureVisitTable(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_daily_visits(
    day TEXT NOT NULL,
    visitor_hash TEXT NOT NULL,
    visits INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(day,visitor_hash)
  )`).run();
}

async function sha256(value){
  const bytes=new TextEncoder().encode(String(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function recordDailyVisit(request,env){
  try{
    await ensureVisitTable(env.DB);
    const day=new Date().toISOString().slice(0,10);
    const ip=request.headers.get('cf-connecting-ip')||'unknown';
    const agent=(request.headers.get('user-agent')||'unknown').slice(0,180);
    const visitorHash=await sha256(`${day}|${ip}|${agent}`);
    await env.DB.prepare(`INSERT INTO site_daily_visits(day,visitor_hash,visits,updated_at)
      VALUES(?,?,1,CURRENT_TIMESTAMP)
      ON CONFLICT(day,visitor_hash) DO UPDATE SET
        visits=site_daily_visits.visits+1,
        updated_at=CURRENT_TIMESTAMP`)
      .bind(day,visitorHash).run();
  }catch(error){
    console.error('Daily visit tracking failed',error);
  }
}

async function siteStats(db){
  await ensureVisitTable(db);
  const stats=await db.prepare(`SELECT
    (SELECT COUNT(*) FROM site_daily_visits WHERE day=date('now')) daily_visits,
    (SELECT COUNT(*) FROM reviews r WHERE NOT EXISTS(SELECT 1 FROM hidden_reviews h WHERE h.review_id=r.id)) total_votes,
    (SELECT COUNT(*) FROM servers WHERE is_active=1) total_servers,
    (SELECT COUNT(*) FROM servers WHERE is_active=1 AND operational_status='online') online_servers,
    (SELECT COUNT(*) FROM users WHERE status='active') total_users`).first();
  return {
    dailyVisits:Number(stats?.daily_visits||0),
    totalVotes:Number(stats?.total_votes||0),
    totalServers:Number(stats?.total_servers||0),
    onlineServers:Number(stats?.online_servers||0),
    totalUsers:Number(stats?.total_users||0)
  };
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/site-stats'){
      try{return json(await siteStats(env.DB))}
      catch(error){
        console.error('Site statistics failed',error);
        return json({dailyVisits:0,totalVotes:0,totalServers:0,onlineServers:0,totalUsers:0});
      }
    }
    if(request.method==='GET'&&url.pathname==='/')await recordDailyVisit(request,env);
    return app.fetch(request,env,ctx);
  }
};
