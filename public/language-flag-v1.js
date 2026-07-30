(()=>{
  'use strict';

  const flags={
    tr:'🇹🇷',en:'🇬🇧',ar:'🇸🇦',ru:'🇷🇺',de:'🇩🇪',fr:'🇫🇷',es:'🇪🇸',pt:'🇵🇹',
    it:'🇮🇹',vi:'🇻🇳',pl:'🇵🇱',fa:'🇮🇷','zh-CN':'🇨🇳','zh-TW':'🇹🇼',ja:'🇯🇵',ko:'🇰🇷'
  };

  const setFlag=locale=>{
    const icon=document.querySelector('#languageTrigger>span:first-child');
    if(!icon)return;
    icon.textContent=flags[locale]||flags.tr;
    icon.classList.add('language-flag');
  };

  const init=()=>{
    setFlag(localStorage.getItem('sro_locale')||'tr');
    document.getElementById('languageMenu')?.addEventListener('click',event=>{
      const option=event.target.closest('[data-locale]');
      if(option)setFlag(option.dataset.locale);
    });
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();