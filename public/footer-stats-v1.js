(()=>{
  'use strict';

  const number=value=>new Intl.NumberFormat('tr-TR').format(Number(value||0));
  const tagline=document.getElementById('footerTagline');
  if(!tagline)return;

  const render=stats=>{
    const items=[
      ['Günlük Ziyaret',stats.dailyVisits==null?'—':number(stats.dailyVisits)],
      ['Toplam Oy',number(stats.totalVotes)],
      ['Sunucu',number(stats.totalServers)],
      ['Çevrimiçi',number(stats.onlineServers)]
    ];
    const root=document.createElement('div');
    root.className='footer-stats';
    root.setAttribute('aria-label','Site istatistikleri');
    root.innerHTML=items.map(([label,value])=>`<div class="footer-stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
    tagline.replaceWith(root);
  };

  const fallback=async()=>{
    const response=await fetch('/api/servers',{headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('Sunucu istatistikleri alınamadı.');
    const data=await response.json();
    const servers=Array.isArray(data.servers)?data.servers:[];
    return {
      dailyVisits:null,
      totalVotes:servers.reduce((sum,server)=>sum+Number(server.vote_count||0),0),
      totalServers:servers.length,
      onlineServers:servers.filter(server=>server.operational_status==='online').length
    };
  };

  (async()=>{
    try{
      const response=await fetch('/api/site-stats',{headers:{accept:'application/json'}});
      if(!response.ok)throw new Error('Site istatistik servisi hazır değil.');
      const data=await response.json();
      render({
        dailyVisits:data.dailyVisits,
        totalVotes:data.totalVotes,
        totalServers:data.totalServers,
        onlineServers:data.onlineServers
      });
    }catch{
      try{render(await fallback())}catch{render({dailyVisits:null,totalVotes:0,totalServers:0,onlineServers:0})}
    }
  })();
})();
