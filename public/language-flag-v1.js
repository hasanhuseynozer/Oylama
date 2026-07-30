(()=>{
  'use strict';

  const styleHref='/language-flag-colors-v1.css?v=20260731-0202';
  const flags={
    tr:'🇹🇷',en:'🇬🇧',ar:'🇸🇦',ru:'🇷🇺',de:'🇩🇪',fr:'🇫🇷',es:'🇪🇸',pt:'🇵🇹',
    it:'🇮🇹',vi:'🇻🇳',pl:'🇵🇱',fa:'🇮🇷','zh-CN':'🇨🇳','zh-TW':'🇹🇼',ja:'🇯🇵',ko:'🇰🇷'
  };
  const names={
    tr:'Türkçe',en:'English',ar:'العربية',ru:'Русский',de:'Deutsch',fr:'Français',es:'Español',
    pt:'Português',it:'Italiano',vi:'Tiếng Việt',pl:'Polski',fa:'فارسی','zh-CN':'简体中文',
    'zh-TW':'繁體中文',ja:'日本語',ko:'한국어'
  };

  const ensureStyle=()=>{
    let link=document.querySelector('link[data-language-flag-colors]');
    if(link){
      if(link.getAttribute('href')!==styleHref)link.href=styleHref;
      return;
    }
    link=document.createElement('link');
    link.rel='stylesheet';
    link.href=styleHref;
    link.dataset.languageFlagColors='true';
    document.head?.append(link);
  };

  const normalise=locale=>flags[locale]?locale:'tr';

  const setFlag=locale=>{
    const value=normalise(locale);
    const trigger=document.getElementById('languageTrigger');
    const root=document.getElementById('headerLanguage');
    const icon=trigger?.querySelector('.language-flag')||trigger?.querySelector('span:first-child');

    if(icon){
      icon.textContent=flags[value];
      icon.classList.add('language-flag');
    }
    if(trigger){
      trigger.dataset.locale=value;
      trigger.setAttribute('aria-label',`Dil seçimi: ${names[value]}`);
    }
    if(root)root.dataset.locale=value;
  };

  const init=()=>{
    ensureStyle();
    setFlag(localStorage.getItem('sro_locale')||'tr');
    document.getElementById('languageMenu')?.addEventListener('click',event=>{
      const option=event.target.closest('[data-locale]');
      if(option)setFlag(option.dataset.locale);
    });
    addEventListener('storage',event=>{
      if(event.key==='sro_locale')setFlag(event.newValue||'tr');
    });
  };

  ensureStyle();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
