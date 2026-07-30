(()=>{
  const root=document.documentElement;
  const pageLanguage=document.getElementById('pageLanguage');
  const accountActions=document.getElementById('accountActions');
  const hero=document.getElementById('banner');
  const serverGrid=document.getElementById('serverGrid');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');

  const languageLabels={
    tr:'Türkçe',en:'English',ar:'العربية',ru:'Русский',de:'Deutsch',fr:'Français',es:'Español',
    pt:'Português',it:'Italiano',vi:'Tiếng Việt',pl:'Polski',fa:'فارسی','zh-CN':'简体中文',
    'zh-TW':'繁體中文',ja:'日本語',ko:'한국어'
  };

  const normalizeLanguageOptions=select=>{
    if(!select)return;
    [...select.options].forEach(option=>{
      if(languageLabels[option.value])option.textContent=languageLabels[option.value];
    });
  };

  const syncLanguage=()=>{
    if(!pageLanguage)return;
    normalizeLanguageOptions(pageLanguage);
    const saved=localStorage.getItem('sro_locale')||'tr';
    if([...pageLanguage.options].some(option=>option.value===saved))pageLanguage.value=saved;
    root.lang=saved;
    const internal=accountActions?.querySelector('.account-language select');
    if(internal){
      normalizeLanguageOptions(internal);
      internal.value=saved;
      if(!internal.dataset.v3Bound){
        internal.dataset.v3Bound='1';
        internal.addEventListener('change',()=>{
          localStorage.setItem('sro_locale',internal.value);
          root.lang=internal.value;
          pageLanguage.value=internal.value;
        });
      }
    }
  };

  if(pageLanguage){
    syncLanguage();
    pageLanguage.addEventListener('change',()=>{
      localStorage.setItem('sro_locale',pageLanguage.value);
      root.lang=pageLanguage.value;
      const internal=accountActions?.querySelector('.account-language select');
      if(internal)internal.value=pageLanguage.value;
    });
  }

  if(accountActions&&window.MutationObserver){
    new MutationObserver(syncLanguage).observe(accountActions,{childList:true,subtree:true});
  }

  if(hero){
    hero.innerHTML=`<span class="v3-hero-content"><i class="v3-hero-emblem" aria-hidden="true"></i><span class="v3-hero-copy"><small>Silkroad Online Topluluk Platformu</small><strong>SRO RATING</strong><span>Sunucuları keşfet, karşılaştır ve topluluk puanlarını incele.</span></span><i class="v3-hero-emblem" aria-hidden="true"></i></span>`;
    const resetHero=()=>{
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
      hero.style.setProperty('--hero-rx',`${(0.5-y)*2.6}deg`);
      hero.style.setProperty('--hero-ry',`${(x-0.5)*3.4}deg`);
    });
    hero.addEventListener('pointerleave',resetHero);
  }

  const enhanceCards=()=>{
    if(!serverGrid)return;
    [...serverGrid.querySelectorAll('.server-card')].forEach((card,index)=>{
      card.style.setProperty('--v3-delay',`${Math.min(index,11)*42}ms`);
      if(card.dataset.v3Bound)return;
      card.dataset.v3Bound='1';
      const reset=()=>{
        card.style.setProperty('--v3-rx','0deg');
        card.style.setProperty('--v3-ry','0deg');
        card.style.setProperty('--shine-x','50%');
        card.style.setProperty('--shine-y','20%');
      };
      card.addEventListener('pointermove',event=>{
        if(reducedMotion.matches||!finePointer.matches)return;
        const box=card.getBoundingClientRect();
        const x=(event.clientX-box.left)/box.width;
        const y=(event.clientY-box.top)/box.height;
        card.style.setProperty('--v3-rx',`${(0.5-y)*5.2}deg`);
        card.style.setProperty('--v3-ry',`${(x-0.5)*6.2}deg`);
        card.style.setProperty('--shine-x',`${x*100}%`);
        card.style.setProperty('--shine-y',`${y*100}%`);
      });
      card.addEventListener('pointerleave',reset);
      card.addEventListener('blur',reset,true);
    });
  };

  enhanceCards();
  if(serverGrid&&window.MutationObserver){
    new MutationObserver(enhanceCards).observe(serverGrid,{childList:true});
  }
})();
