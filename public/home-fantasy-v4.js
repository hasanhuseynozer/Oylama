(()=>{
  'use strict';

  const body=document.body;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const languageNames={tr:'Türkçe',en:'English',ar:'العربية',ru:'Русский',de:'Deutsch',fr:'Français',es:'Español',pt:'Português',it:'Italiano',vi:'Tiếng Việt',pl:'Polski',fa:'فارسی','zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語',ko:'한국어'};

  body.classList.add('performance-optimized');
  document.querySelectorAll('.fx-particle-canvas,.fx-cursor-aura').forEach(element=>element.remove());

  const bindRafPointer=(element,handler)=>{
    let frame=0;
    let latestEvent=null;
    element.addEventListener('pointermove',event=>{
      latestEvent=event;
      if(frame)return;
      frame=requestAnimationFrame(()=>{
        frame=0;
        if(document.hidden||!latestEvent)return;
        handler(latestEvent);
      });
    },{passive:true});
  };

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
    bindRafPointer(hero,event=>{
      if(reducedMotion.matches||!finePointer.matches)return;
      const rect=hero.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const x=(event.clientX-rect.left)/rect.width;
      const y=(event.clientY-rect.top)/rect.height;
      hero.style.setProperty('--hero-x',`${x*100}%`);
      hero.style.setProperty('--hero-y',`${y*100}%`);
      hero.style.setProperty('--hero-rx',`${(0.5-y)*3}deg`);
      hero.style.setProperty('--hero-ry',`${(x-0.5)*4}deg`);
    });
    hero.addEventListener('pointerleave',reset,{passive:true});
  };

  const decorateToolbar=()=>{
    const toolbar=document.querySelector('.toolbar');
    if(!toolbar||toolbar.dataset.fxBound)return;
    toolbar.dataset.fxBound='1';
    bindRafPointer(toolbar,event=>{
      if(!finePointer.matches)return;
      const rect=toolbar.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      toolbar.style.setProperty('--filter-x',`${((event.clientX-rect.left)/rect.width)*100}%`);
      toolbar.style.setProperty('--filter-y',`${((event.clientY-rect.top)/rect.height)*100}%`);
    });
  };

  const enhanceCard=(card,index)=>{
    if(card.dataset.fxCardBound)return;
    card.dataset.fxCardBound='1';
    card.style.setProperty('--fx-delay',`${Math.min(index,12)*42}ms`);
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
    bindRafPointer(card,event=>{
      if(reducedMotion.matches||!finePointer.matches||innerWidth<=1600)return;
      const rect=card.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const x=(event.clientX-rect.left)/rect.width;
      const y=(event.clientY-rect.top)/rect.height;
      card.style.setProperty('--rx',`${(0.5-y)*5.5}deg`);
      card.style.setProperty('--ry',`${(x-0.5)*7}deg`);
      card.style.setProperty('--mx',`${x*100}%`);
      card.style.setProperty('--my',`${y*100}%`);
    });
    card.addEventListener('pointerleave',reset,{passive:true});
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

  const setupTransitions=()=>{
    document.querySelectorAll('[data-home-view]').forEach(link=>{
      if(link.dataset.fxTransitionBound)return;
      link.dataset.fxTransitionBound='1';
      link.addEventListener('click',()=>{
        body.classList.remove('fx-view-transition');
        requestAnimationFrame(()=>body.classList.add('fx-view-transition'));
        setTimeout(()=>body.classList.remove('fx-view-transition'),520);
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
  },4500);
})();
