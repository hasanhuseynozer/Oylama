(()=>{
  'use strict';

  const body=document.body;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const languageNames={tr:'Türkçe',en:'English',ar:'العربية',ru:'Русский',de:'Deutsch',fr:'Français',es:'Español',pt:'Português',it:'Italiano',vi:'Tiếng Việt',pl:'Polski',fa:'فارسی','zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語',ko:'한국어'};

  const normalizeLanguage=select=>{
    if(!select)return;
    [...select.options].forEach(option=>{
      const next=languageNames[option.value];
      if(next&&option.textContent!==next)option.textContent=next;
    });
  };

  const syncLanguage=source=>{
    const value=source?.value||localStorage.getItem('sro_locale')||'tr';
    localStorage.setItem('sro_locale',value);
    document.documentElement.lang=value;
    const external=document.getElementById('pageLanguage');
    if(external&&external.value!==value)external.value=value;
    const internal=document.querySelector('#accountActions .account-language select');
    if(internal&&internal.value!==value)internal.value=value;
  };

  const bindLanguages=()=>{
    const external=document.getElementById('pageLanguage');
    normalizeLanguage(external);
    if(external&&!external.dataset.fxBound){
      external.dataset.fxBound='1';
      external.value=localStorage.getItem('sro_locale')||'tr';
      external.addEventListener('change',()=>syncLanguage(external));
    }
    const internal=document.querySelector('#accountActions .account-language select');
    normalizeLanguage(internal);
    if(internal&&!internal.dataset.fxBound){
      internal.dataset.fxBound='1';
      internal.value=localStorage.getItem('sro_locale')||'tr';
      internal.addEventListener('change',()=>syncLanguage(internal));
    }
  };

  const decorateHero=()=>{
    const hero=document.getElementById('banner');
    if(!hero)return;
    if(!hero.querySelector('.fx-hero-content')){
      hero.innerHTML='<span class="fx-hero-content"><i class="fx-hero-emblem" aria-hidden="true"></i><span class="fx-hero-copy"><small>Silkroad Online Topluluk Arenası</small><strong>SRO RATING</strong><span>Sunucuları keşfet · karşılaştır · toplulukla yüksel</span></span><i class="fx-hero-emblem" aria-hidden="true"></i></span>';
    }
    if(hero.dataset.fxDecorated)return;
    hero.dataset.fxDecorated='1';
    const reset=()=>{
      hero.style.setProperty('--hero-x','50%');
      hero.style.setProperty('--hero-y','50%');
      hero.style.setProperty('--hero-rx','0deg');
      hero.style.setProperty('--hero-ry','0deg');
    };
    hero.addEventListener('pointermove',event=>{
      if(reducedMotion.matches||!finePointer.matches)return;
      const rect=hero.getBoundingClientRect();
      const x=(event.clientX-rect.left)/rect.width;
      const y=(event.clientY-rect.top)/rect.height;
      hero.style.setProperty('--hero-x',`${x*100}%`);
      hero.style.setProperty('--hero-y',`${y*100}%`);
      hero.style.setProperty('--hero-rx',`${(0.5-y)*4.4}deg`);
      hero.style.setProperty('--hero-ry',`${(x-0.5)*5.8}deg`);
    });
    hero.addEventListener('pointerleave',reset);
  };

  const decorateToolbar=()=>{
    const toolbar=document.querySelector('.toolbar');
    if(!toolbar||toolbar.dataset.fxBound)return;
    toolbar.dataset.fxBound='1';
    toolbar.addEventListener('pointermove',event=>{
      if(!finePointer.matches)return;
      const rect=toolbar.getBoundingClientRect();
      toolbar.style.setProperty('--filter-x',`${((event.clientX-rect.left)/rect.width)*100}%`);
      toolbar.style.setProperty('--filter-y',`${((event.clientY-rect.top)/rect.height)*100}%`);
    });
  };

  const enhanceCard=(card,index)=>{
    if(card.dataset.fxCardBound)return;
    card.dataset.fxCardBound='1';
    card.style.setProperty('--fx-delay',`${Math.min(index,15)*55}ms`);
    if(!card.querySelector('.fx-card-rune')){
      const rune=document.createElement('span');
      rune.className='fx-card-rune';
      rune.setAttribute('aria-hidden','true');
      card.append(rune);
    }
    const reset=()=>{
      card.style.setProperty('--rx','0deg');
      card.style.setProperty('--ry','0deg');
      card.style.setProperty('--mx','50%');
      card.style.setProperty('--my','18%');
    };
    card.addEventListener('pointermove',event=>{
      if(reducedMotion.matches||!finePointer.matches)return;
      const rect=card.getBoundingClientRect();
      const x=(event.clientX-rect.left)/rect.width;
      const y=(event.clientY-rect.top)/rect.height;
      card.style.setProperty('--rx',`${(0.5-y)*9}deg`);
      card.style.setProperty('--ry',`${(x-0.5)*11}deg`);
      card.style.setProperty('--mx',`${x*100}%`);
      card.style.setProperty('--my',`${y*100}%`);
    });
    card.addEventListener('pointerleave',reset);
    card.addEventListener('blur',reset,true);
  };

  const enhanceCards=()=>{
    document.querySelectorAll('#serverGrid .server-card:not(.server-card-skeleton)').forEach(enhanceCard);
  };

  const repairCovers=()=>{
    document.querySelectorAll('.server-cover').forEach(cover=>{
      if(cover.dataset.fxCoverChecked)return;
      cover.dataset.fxCoverChecked='1';
      const background=cover.style.backgroundImage||'';
      const match=background.match(/url\(["']?(.*?)["']?\)/i);
      if(!match)return;
      const image=new Image();
      image.onload=()=>{
        if(image.naturalWidth<16||image.naturalHeight<16){
          cover.style.backgroundImage='';
          cover.classList.add('server-cover-placeholder');
        }
      };
      image.onerror=()=>{
        cover.style.backgroundImage='';
        cover.classList.add('server-cover-placeholder');
      };
      image.src=match[1];
    });
  };

  const createCursorAura=()=>{
    if(reducedMotion.matches||!finePointer.matches||document.querySelector('.fx-cursor-aura'))return;
    const aura=document.createElement('div');
    aura.className='fx-cursor-aura';
    aura.setAttribute('aria-hidden','true');
    body.append(aura);
    addEventListener('pointermove',event=>{
      body.style.setProperty('--cursor-px',`${event.clientX}px`);
      body.style.setProperty('--cursor-py',`${event.clientY}px`);
      body.style.setProperty('--cursor-x',`${(event.clientX/innerWidth)*100}%`);
      body.style.setProperty('--cursor-y',`${(event.clientY/innerHeight)*100}%`);
    },{passive:true});
  };

  const createParticles=()=>{
    if(reducedMotion.matches||document.querySelector('.fx-particle-canvas'))return;
    const canvas=document.createElement('canvas');
    canvas.className='fx-particle-canvas';
    canvas.setAttribute('aria-hidden','true');
    body.prepend(canvas);
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)return;
    let width=0,height=0,dpr=1,particles=[],wisps=[],frame=0,visible=true,last=0;
    const makeParticle=()=>({x:Math.random()*width,y:Math.random()*height,radius:.45+Math.random()*1.65,vx:(Math.random()-.5)*.16,vy:-.05-Math.random()*.19,alpha:.12+Math.random()*.5,pulse:Math.random()*Math.PI*2,gold:Math.random()>.72});
    const makeWisp=()=>({x:Math.random()*width,y:Math.random()*height,length:45+Math.random()*120,speed:.08+Math.random()*.16,alpha:.018+Math.random()*.04,angle:-.3+Math.random()*.6});
    const resize=()=>{
      dpr=Math.min(devicePixelRatio||1,1.65);
      width=innerWidth;height=innerHeight;
      canvas.width=Math.max(1,Math.floor(width*dpr));
      canvas.height=Math.max(1,Math.floor(height*dpr));
      canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      particles=Array.from({length:Math.max(38,Math.min(105,Math.floor(width/18)))},makeParticle);
      wisps=Array.from({length:Math.max(4,Math.floor(width/380))},makeWisp);
    };
    const draw=timestamp=>{
      frame=0;
      if(!visible)return;
      const delta=Math.min(2,(timestamp-last)/16.67||1);last=timestamp;
      ctx.clearRect(0,0,width,height);
      ctx.globalCompositeOperation='lighter';
      for(const wisp of wisps){
        wisp.x+=wisp.speed*delta;
        if(wisp.x>width+wisp.length){wisp.x=-wisp.length;wisp.y=Math.random()*height}
        const dx=Math.cos(wisp.angle)*wisp.length;
        const dy=Math.sin(wisp.angle)*wisp.length;
        const gradient=ctx.createLinearGradient(wisp.x,wisp.y,wisp.x+dx,wisp.y+dy);
        gradient.addColorStop(0,'rgba(90,220,205,0)');
        gradient.addColorStop(.5,`rgba(90,220,205,${wisp.alpha})`);
        gradient.addColorStop(1,'rgba(231,185,77,0)');
        ctx.strokeStyle=gradient;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(wisp.x,wisp.y);ctx.lineTo(wisp.x+dx,wisp.y+dy);ctx.stroke();
      }
      for(const particle of particles){
        particle.x+=particle.vx*delta;particle.y+=particle.vy*delta;particle.pulse+=.018*delta;
        if(particle.y<-10){particle.y=height+10;particle.x=Math.random()*width}
        if(particle.x<-10)particle.x=width+10;if(particle.x>width+10)particle.x=-10;
        const alpha=particle.alpha*(.72+.28*Math.sin(particle.pulse));
        const color=particle.gold?`rgba(239,194,86,${alpha})`:`rgba(105,226,212,${alpha})`;
        ctx.shadowBlur=particle.radius*7;ctx.shadowColor=color;ctx.fillStyle=color;
        ctx.beginPath();ctx.arc(particle.x,particle.y,particle.radius,0,Math.PI*2);ctx.fill();
      }
      ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
      frame=requestAnimationFrame(draw);
    };
    const start=()=>{if(!frame&&visible){last=performance.now();frame=requestAnimationFrame(draw)}};
    const stop=()=>{if(frame){cancelAnimationFrame(frame);frame=0}};
    addEventListener('resize',resize,{passive:true});
    document.addEventListener('visibilitychange',()=>{visible=!document.hidden;visible?start():stop()});
    resize();start();
  };

  const setupTransitions=()=>{
    document.querySelectorAll('[data-home-view]').forEach(link=>{
      if(link.dataset.fxTransitionBound)return;
      link.dataset.fxTransitionBound='1';
      link.addEventListener('click',()=>{
        body.classList.remove('fx-view-transition');
        void body.offsetWidth;
        body.classList.add('fx-view-transition');
        setTimeout(()=>body.classList.remove('fx-view-transition'),650);
      });
    });
  };

  const refresh=()=>{
    bindLanguages();
    decorateHero();
    decorateToolbar();
    enhanceCards();
    repairCovers();
    setupTransitions();
  };

  const grid=document.getElementById('serverGrid');
  if(grid)new MutationObserver(()=>requestAnimationFrame(()=>{enhanceCards();repairCovers()})).observe(grid,{childList:true});
  const account=document.getElementById('accountActions');
  if(account)new MutationObserver(()=>requestAnimationFrame(bindLanguages)).observe(account,{childList:true,subtree:true});

  bindLanguages();
  decorateToolbar();
  setupTransitions();
  createCursorAura();
  createParticles();

  const waitForApp=new MutationObserver(()=>{
    if(!body.classList.contains('app-loading')){
      refresh();
      waitForApp.disconnect();
    }
  });
  waitForApp.observe(body,{attributes:true,attributeFilter:['class']});

  setTimeout(()=>{
    body.classList.remove('app-loading');
    refresh();
  },6500);
})();
