(()=>{
  'use strict';

  const ensureHomepageFont=()=>{
    if(document.getElementById('patrickHandHomepageFont'))return;
    const link=document.createElement('link');
    link.id='patrickHandHomepageFont';
    link.rel='stylesheet';
    link.href='/home-font-patrick.css?v=20260730-2016';
    document.head.append(link);
  };

  const decorateCard=card=>{
    if(card.querySelector(':scope > .electric-card-frame'))return;
    const frame=document.createElement('span');
    frame.className='electric-card-frame';
    frame.setAttribute('aria-hidden','true');
    frame.innerHTML='<i class="electric-border-glow"></i><i class="electric-border-line"></i><i class="electric-border-sparks"></i>';
    card.append(frame);
  };

  const decorateAll=()=>{
    ensureHomepageFont();
    document.querySelectorAll('#serverGrid .server-card:not(.server-card-skeleton)').forEach(decorateCard);
  };

  const start=()=>{
    decorateAll();
    const grid=document.getElementById('serverGrid');
    if(grid)new MutationObserver(()=>requestAnimationFrame(decorateAll)).observe(grid,{childList:true,subtree:false});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
