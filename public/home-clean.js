(()=>{
  'use strict';

  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=window.matchMedia('(hover: hover) and (pointer: fine)');
  const hero=document.getElementById('banner');
  const pageLanguage=document.getElementById('pageLanguage');
  const accountActions=document.getElementById('accountActions');

  const languageNames={
    tr:'Türkçe',en:'English',ar:'العربية',ru:'Русский',de:'Deutsch',fr:'Français',es:'Español',
    pt:'Português',it:'Italiano',vi:'Tiếng Việt',pl:'Polski',fa:'فارسی','zh-CN':'简体中文',
    'zh-TW':'繁體中文',ja:'日本語',ko:'한국어'
  };

  const normalizeOptions=select=>{
    if(!select)return;
    [...select.options].forEach(option=>{
      if(languageNames[option.value])option.textContent=languageNames[option.value];
    });
  };

  const syncLanguage=source=>{
    const value=source?.value||localStorage.getItem('sro_locale')||'tr';
    localStorage.setItem('sro_locale',value);
    document.documentElement.lang=value;
    if(pageLanguage&&pageLanguage.value!==value)pageLanguage.value=value;
    const internal=accountActions?.querySelector('.account-language select');
    if(internal&&internal.value!==value)internal.value=value;
  };

  if(pageLanguage){
    normalizeOptions(pageLanguage);
    const saved=localStorage.getItem('sro_locale')||'tr';
    if([...pageLanguage.options].some(option=>option.value===saved))pageLanguage.value=saved;
    pageLanguage.addEventListener('change',()=>syncLanguage(pageLanguage));
  }

  if(accountActions&&window.MutationObserver){
    const bindInternalLanguage=()=>{
      const internal=accountActions.querySelector('.account-language select');
      if(!internal||internal.dataset.homeCleanBound)return;
      internal.dataset.homeCleanBound='1';
      normalizeOptions(internal);
      const saved=localStorage.getItem('sro_locale')||'tr';
      if([...internal.options].some(option=>option.value===saved))internal.value=saved;
      internal.addEventListener('change',()=>syncLanguage(internal));
    };
    bindInternalLanguage();
    new MutationObserver(bindInternalLanguage).observe(accountActions,{childList:true,subtree:true});
  }
  syncLanguage(pageLanguage);

  if(hero){
    const reset=()=>{
      hero.style.setProperty('--hero-x','50%');
      hero.style.setProperty('--hero-y','50%');
      hero.style.setProperty('--hero-rx','0deg');
      hero.style.setProperty('--hero-ry','0deg');
    };
    hero.addEventListener('pointermove',event=>{
      if(reducedMotion.matches||!finePointer.matches)return;
      const box=hero.getBoundingClientRect();
      const x=(event.clientX-box.left)/box.width;
      const y=(event.clientY-box.top)/box.height;
      hero.style.setProperty('--hero-x',`${x*100}%`);
      hero.style.setProperty('--hero-y',`${y*100}%`);
      hero.style.setProperty('--hero-rx',`${(0.5-y)*3.2}deg`);
      hero.style.setProperty('--hero-ry',`${(x-0.5)*4.2}deg`);
    });
    hero.addEventListener('pointerleave',reset);
  }

  if(!reducedMotion.matches){
    const canvas=document.createElement('canvas');
    canvas.className='home-particles';
    canvas.setAttribute('aria-hidden','true');
    document.body.prepend(canvas);
    const context=canvas.getContext('2d',{alpha:true});
    let width=0,height=0,dpr=1,particles=[],frame=0,visible=true;

    const resetCanvas=()=>{
      dpr=Math.min(window.devicePixelRatio||1,1.75);
      width=window.innerWidth;
      height=window.innerHeight;
      canvas.width=Math.max(1,Math.floor(width*dpr));
      canvas.height=Math.max(1,Math.floor(height*dpr));
      canvas.style.width=`${width}px`;
      canvas.style.height=`${height}px`;
      context.setTransform(dpr,0,0,dpr,0,0);
      const count=Math.max(28,Math.min(78,Math.floor(width/24)));
      particles=Array.from({length:count},()=>({
        x:Math.random()*width,
        y:Math.random()*height,
        r:.45+Math.random()*1.35,
        vx:(Math.random()-.5)*.10,
        vy:-.06-Math.random()*.17,
        a:.12+Math.random()*.42,
        gold:Math.random()>.76
      }));
    };

    const draw=()=>{
      frame=0;
      if(!visible)return;
      context.clearRect(0,0,width,height);
      for(const particle of particles){
        particle.x+=particle.vx;
        particle.y+=particle.vy;
        if(particle.y<-8){particle.y=height+8;particle.x=Math.random()*width}
        if(particle.x<-8)particle.x=width+8;
        if(particle.x>width+8)particle.x=-8;
        context.beginPath();
        context.arc(particle.x,particle.y,particle.r,0,Math.PI*2);
        context.fillStyle=particle.gold?`rgba(228,185,79,${particle.a})`:`rgba(116,210,198,${particle.a})`;
        context.fill();
      }
      frame=requestAnimationFrame(draw);
    };

    const start=()=>{if(!frame&&visible)frame=requestAnimationFrame(draw)};
    const stop=()=>{if(frame){cancelAnimationFrame(frame);frame=0}};
    document.addEventListener('visibilitychange',()=>{
      visible=!document.hidden;
      if(visible)start();else stop();
    });
    window.addEventListener('resize',resetCanvas,{passive:true});
    resetCanvas();
    start();
  }
})();
