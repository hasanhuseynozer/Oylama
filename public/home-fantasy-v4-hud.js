(()=>{
  'use strict';
  const grid=document.getElementById('serverGrid');
  const hud=document.getElementById('fxLiveHud');

  const updateHud=()=>{
    if(!grid||!hud)return;
    const cards=[...grid.querySelectorAll('.server-card:not(.server-card-skeleton)')];
    const online=cards.filter(card=>card.querySelector('.status-online')).length;
    const ratings=cards.map(card=>Number(card.querySelector('.score')?.textContent||0)).filter(Number.isFinite);
    const top=ratings.length?Math.max(...ratings):0;
    cards.forEach(card=>card.classList.toggle('fx-online-card',Boolean(card.querySelector('.status-online'))));
    const ratio=cards.length?Math.max(.04,online/cards.length):.04;
    hud.innerHTML=`
      <span class="fx-hud-chip"><i class="fx-hud-orb" style="--hud-progress:${Math.min(1,cards.length/20)}"></i><span class="fx-hud-copy"><strong>${cards.length}</strong><small>Sunucu</small></span></span>
      <span class="fx-hud-chip green"><i class="fx-hud-orb" style="--hud-progress:${ratio}"></i><span class="fx-hud-copy"><strong>${online}</strong><small>Çevrimiçi</small></span></span>
      <span class="fx-hud-chip gold"><i class="fx-hud-orb" style="--hud-progress:${Math.max(.04,top/5)}"></i><span class="fx-hud-copy"><strong>${top.toFixed(1)}</strong><small>En yüksek</small></span></span>`;
  };

  const reveal=()=>{
    const targets=document.querySelectorAll('.sponsor-stack,.toolbar,.site-footer');
    if(!('IntersectionObserver' in window)){
      targets.forEach(target=>target.classList.add('fx-visible'));
      return;
    }
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){entry.target.classList.add('fx-visible');observer.unobserve(entry.target)}
      });
    },{threshold:.08});
    targets.forEach(target=>{target.classList.add('fx-reveal');observer.observe(target)});
  };

  if(grid)new MutationObserver(()=>requestAnimationFrame(updateHud)).observe(grid,{childList:true});
  updateHud();
  reveal();
})();
