(()=>{
  'use strict';

  const routes={
    servers:'/',
    creators:'/yayinclar/',
    giveaways:'/cekilisler/',
    application:'/yayinci-basvuru/'
  };

  const content=document.querySelector('#serverView .content');
  const toolbar=content?.querySelector('.toolbar');
  const grid=document.getElementById('serverGrid');
  const requestedStyleHref='/requested-ui-fixes-v6.css?v=20260731-0138';
  const menuCubeStyleHref='/header-menu-cube-v1.css?v=20260731-1008';

  const ensureRequestedStyle=doc=>{
    if(!doc?.head)return;
    let link=doc.querySelector('link[data-requested-ui-fixes]')||doc.querySelector('link[href*="requested-ui-fixes-v"]');
    if(link){
      link.dataset.requestedUiFixes='true';
      if(link.getAttribute('href')!==requestedStyleHref)link.href=requestedStyleHref;
      return;
    }
    link=doc.createElement('link');
    link.rel='stylesheet';
    link.href=requestedStyleHref;
    link.dataset.requestedUiFixes='true';
    doc.head.append(link);
  };
  ensureRequestedStyle(document);

  const ensureMenuCubeStyle=()=>{
    if(!document.head)return;
    let link=document.querySelector('link[data-header-menu-cube]');
    if(!link){
      link=document.createElement('link');
      link.rel='stylesheet';
      link.dataset.headerMenuCube='true';
      document.head.append(link);
    }
    if(link.getAttribute('href')!==menuCubeStyleHref)link.href=menuCubeStyleHref;
  };

  const prepareMenuCubes=()=>{
    ensureMenuCubeStyle();
    document.querySelectorAll('.main-navigation a').forEach(link=>{
      if(link.dataset.menuCubeReady==='true')return;
      const key=link.dataset.i18n||'';
      const label=link.textContent.trim();
      link.removeAttribute('data-i18n');
      link.classList.add('menu-cube-173');
      link.dataset.menuCubeReady='true';
      link.setAttribute('aria-label',label);
      link.textContent='';
      for(let index=0;index<4;index+=1){
        const face=document.createElement('span');
        face.className='menu-cube-face';
        face.textContent=label;
        face.setAttribute('aria-hidden','true');
        if(key)face.dataset.i18n=key;
        link.append(face);
      }
      const syncLabel=()=>{
        const text=link.querySelector('.menu-cube-face')?.textContent.trim();
        if(text)link.setAttribute('aria-label',text);
      };
      syncLabel();
      if(window.MutationObserver)new MutationObserver(syncLabel).observe(link,{subtree:true,childList:true,characterData:true});
    });
  };
  prepareMenuCubes();

  const normalisePath=value=>{
    const path=(value||'/').replace(/\/+$/,'');
    return path||'/';
  };
  const currentPath=normalisePath(location.pathname);
  document.querySelectorAll('.main-navigation a').forEach(link=>{
    const linkPath=normalisePath(new URL(link.href,location.href).pathname);
    const active=linkPath===currentPath;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });

  /* Main navigation always opens a real standalone page; never an iframe. */
  window.switchHomeView=view=>{
    location.assign(routes[view]||routes.servers);
  };
  document.getElementById('portalView')?.remove();

  /* Preserve configured ad images; only clean truly empty placeholders. */
  const sideAds=[document.getElementById('leftSponsor'),document.getElementById('rightSponsor')].filter(Boolean);
  sideAds.forEach(ad=>{
    if(ad.classList.contains('has-image'))return;
    ad.classList.add('empty-sponsor');
    ad.textContent='';
  });
  document.querySelectorAll('.sponsor-placeholder').forEach(ad=>{
    ad.classList.add('empty-sponsor');
    ad.textContent='';
  });

  let serversPanel=document.getElementById('serversPanel');
  if(content&&toolbar&&grid&&!serversPanel){
    serversPanel=document.createElement('section');
    serversPanel.id='serversPanel';
    serversPanel.append(toolbar,grid);
    content.prepend(serversPanel);
  }

  /* The profile menu contains profile actions only; language stays under the profile box. */
  const accountActions=document.getElementById('accountActions');
  const removeProfileLanguage=()=>{
    accountActions?.querySelectorAll('.account-language').forEach(node=>node.remove());
  };
  removeProfileLanguage();
  if(accountActions&&window.MutationObserver){
    new MutationObserver(removeProfileLanguage).observe(accountActions,{childList:true,subtree:true});
  }

  const languageRoot=document.getElementById('headerLanguage');
  const languageTrigger=document.getElementById('languageTrigger');
  const languageLabel=document.getElementById('languageLabel');
  const languageMenu=document.getElementById('languageMenu');
  const languageNames={
    tr:'Türkçe',en:'English',ar:'العربية',ru:'Русский',de:'Deutsch',fr:'Français',es:'Español',
    pt:'Português',it:'Italiano',vi:'Tiếng Việt',pl:'Polski',fa:'فارسی','zh-CN':'简体中文',
    'zh-TW':'繁體中文',ja:'日本語',ko:'한국어'
  };

  const closeLanguage=()=>{
    languageMenu?.classList.add('hidden');
    languageTrigger?.setAttribute('aria-expanded','false');
  };
  const closeProfileMenu=()=>{
    const panel=document.querySelector('.account-menu-panel');
    const trigger=document.querySelector('.account-menu-trigger');
    panel?.classList.add('hidden');
    trigger?.setAttribute('aria-expanded','false');
  };
  const applyLanguage=locale=>{
    const value=languageNames[locale]?locale:'tr';
    localStorage.setItem('sro_locale',value);
    document.documentElement.lang=value;
    document.documentElement.dir=['ar','fa'].includes(value)?'rtl':'ltr';
    if(languageLabel)languageLabel.textContent=languageNames[value];
    languageMenu?.querySelectorAll('[data-locale]').forEach(button=>{
      const active=button.dataset.locale===value;
      button.classList.toggle('active',active);
      button.setAttribute('aria-checked',String(active));
    });
    window.SROI18n?.apply?.(value);
  };

  accountActions?.addEventListener('click',event=>{
    if(event.target.closest('.account-menu-trigger'))closeLanguage();
  },true);

  if(languageTrigger&&languageMenu){
    languageTrigger.addEventListener('click',event=>{
      event.stopPropagation();
      closeProfileMenu();
      const opening=languageMenu.classList.contains('hidden');
      closeLanguage();
      if(opening){
        languageMenu.classList.remove('hidden');
        languageTrigger.setAttribute('aria-expanded','true');
      }
    });
    languageMenu.addEventListener('click',event=>{
      const button=event.target.closest('[data-locale]');
      if(!button)return;
      applyLanguage(button.dataset.locale);
      closeLanguage();
      languageTrigger.focus();
    });
    document.addEventListener('click',event=>{
      if(!languageRoot?.contains(event.target))closeLanguage();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')closeLanguage();
    });
    applyLanguage(localStorage.getItem('sro_locale')||'tr');
  }
})();