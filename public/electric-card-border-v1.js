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

  const ensureFilter=()=>{
    if(document.getElementById('sroElectricFilterDefs'))return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id='sroElectricFilterDefs';
    svg.classList.add('electric-filter-defs');
    svg.setAttribute('aria-hidden','true');
    svg.setAttribute('focusable','false');
    svg.innerHTML=`<defs>
      <filter id="sro-electric-card-displace" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.055" numOctaves="3" seed="9" result="electricNoise">
          <animate attributeName="baseFrequency" values="0.012 0.055;0.022 0.085;0.014 0.062;0.012 0.055" dur="5.2s" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="electricNoise" scale="7" xChannelSelector="R" yChannelSelector="B" />
      </filter>
    </defs>`;
    document.body.prepend(svg);
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
    ensureFilter();
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