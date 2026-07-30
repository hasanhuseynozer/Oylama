(()=>{
  const root=document.documentElement;
  const pageLanguage=document.getElementById('pageLanguage');
  const accountActions=document.getElementById('accountActions');
  const hero=document.getElementById('banner');

  const syncLanguage=()=>{
    if(!pageLanguage)return;
    const saved=localStorage.getItem('sro_locale')||'tr';
    if([...pageLanguage.options].some(option=>option.value===saved))pageLanguage.value=saved;
    root.lang=saved;
    const internal=accountActions?.querySelector('.account-language select');
    if(internal){
      internal.value=saved;
      internal.addEventListener('change',()=>{
        localStorage.setItem('sro_locale',internal.value);
        root.lang=internal.value;
        pageLanguage.value=internal.value;
      },{once:true});
    }
  };

  if(pageLanguage){
    syncLanguage();
    pageLanguage.addEventListener('change',()=>{
      localStorage.setItem('sro_locale',pageLanguage.value);
      root.lang=pageLanguage.value;
      const internal=accountActions?.querySelector('.account-language select');
      if(internal){
        internal.value=pageLanguage.value;
        internal.dispatchEvent(new Event('change',{bubbles:true}));
      }
    });
  }

  if(accountActions&&window.MutationObserver){
    new MutationObserver(syncLanguage).observe(accountActions,{childList:true,subtree:true});
  }

  if(hero){
    const reset=()=>{
      hero.style.setProperty('--hero-x','50%');
      hero.style.setProperty('--hero-y','50%');
    };
    hero.addEventListener('pointermove',event=>{
      const box=hero.getBoundingClientRect();
      hero.style.setProperty('--hero-x',`${((event.clientX-box.left)/box.width)*100}%`);
      hero.style.setProperty('--hero-y',`${((event.clientY-box.top)/box.height)*100}%`);
    });
    hero.addEventListener('pointerleave',reset);
  }
})();
