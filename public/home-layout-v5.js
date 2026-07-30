(()=>{
  'use strict';

  const routes={
    servers:'/',
    creators:'/yayinclar/?embed=1',
    giveaways:'/cekilisler/?embed=1',
    application:'/yayinci-basvuru/?embed=1'
  };

  const content=document.querySelector('#serverView .content');
  const toolbar=content?.querySelector('.toolbar');
  const grid=document.getElementById('serverGrid');
  const portal=document.getElementById('portalView');
  const frame=document.getElementById('portalFrame');
  const requestedStyleHref='/requested-ui-fixes-v6.css?v=20260731-0138';
  const fixedFrameHeight='clamp(680px, calc(100vh - 230px), 900px)';

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
  if(content&&portal&&portal.parentElement!==content)content.append(portal);
  if(frame){
    frame.removeAttribute('style');
    frame.setAttribute('scrolling','yes');
    frame.style.overflow='auto';
    frame.style.height=fixedFrameHeight;
  }

  const setActiveView=view=>{
    document.querySelectorAll('[data-home-view]').forEach(link=>{
      const active=link.dataset.homeView===view;
      link.classList.toggle('active',active);
      if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
  };

  let frameCleanup=()=>{};
  const prepareEmbeddedDocument=()=>{
    frameCleanup();
    frameCleanup=()=>{};
    if(!frame)return;
    let doc;
    try{doc=frame.contentDocument}catch{return}
    if(!doc?.body||!doc.documentElement)return;

    ensureRequestedStyle(doc);
    doc.documentElement.classList.add('embedded-view-root');
    doc.body.classList.add('embedded-view');

    let style=doc.getElementById('sro-parent-embed-fix');
    if(!style){
      style=doc.createElement('style');
      style.id='sro-parent-embed-fix';
      style.textContent=`
        html{height:100%!important;min-height:100%!important;overflow:hidden!important;width:100%!important;max-width:100%!important;background:transparent!important}
        body{height:100%!important;min-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:contain!important;width:100%!important;max-width:100%!important;padding-bottom:0!important;background:transparent!important;scrollbar-width:none!important;-ms-overflow-style:none!important}
        html::-webkit-scrollbar,body::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}
        body.embedded-view>.site-header,body.embedded-view>.site-footer{display:none!important}
        body.embedded-view main,body.embedded-view .page-shell,body.embedded-view .portal-shell,body.embedded-view .creator-shell,body.embedded-view .network-shell,body.embedded-view .application-shell{min-height:0!important;height:auto!important;max-height:none!important;overflow:visible!important}
      `;
      doc.head?.append(style);
    }
    frame.style.height=fixedFrameHeight;
  };

  let viewRequest=0;
  const frameMatchesView=view=>{
    if(!frame||!routes[view])return false;
    try{
      const current=new URL(frame.contentWindow.location.href,location.href);
      const expected=new URL(routes[view],location.href);
      return current.pathname===expected.pathname;
    }catch{return false}
  };
  const finishFrameLoad=(requestId,view)=>{
    if(requestId!==viewRequest||frame?.dataset.view!==view||!frameMatchesView(view))return;
    prepareEmbeddedDocument();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(requestId!==viewRequest||frame?.dataset.view!==view||!frameMatchesView(view))return;
      portal?.classList.remove('is-loading');
      frame?.removeAttribute('aria-busy');
    }));
  };

  const stableSwitchHomeView=(view,url=routes[view],remember=false)=>{
    if(!routes[view])view='servers';
    setActiveView(view);
    const showServers=view==='servers';
    serversPanel?.classList.toggle('hidden',!showServers);
    portal?.classList.toggle('hidden',showServers);

    if(showServers){
      viewRequest+=1;
      portal?.classList.remove('is-loading');
      frame?.removeAttribute('aria-busy');
      frameCleanup();
      if(remember)history.pushState({homeView:'servers'},'',location.pathname);
      return;
    }

    if(!portal||!frame)return;
    const requestId=++viewRequest;
    portal.classList.add('is-loading');
    frame.setAttribute('aria-busy','true');
    frame.style.height=fixedFrameHeight;
    frame.onload=()=>finishFrameLoad(requestId,view);

    if(frame.dataset.view!==view||!frameMatchesView(view)){
      frame.dataset.view=view;
      frame.src=url||routes[view];
    }else{
      finishFrameLoad(requestId,view);
    }
    if(remember)history.pushState({homeView:view},'',location.pathname);
  };

  window.switchHomeView=stableSwitchHomeView;

  document.addEventListener('click',event=>{
    const link=event.target.closest('[data-home-view]');
    if(!link)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stableSwitchHomeView(link.dataset.homeView,routes[link.dataset.homeView],true);
  },true);

  addEventListener('popstate',event=>{
    const view=event.state?.homeView||'servers';
    stableSwitchHomeView(view,routes[view],false);
  });

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