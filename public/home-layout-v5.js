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

  /* Keep both side ad boxes, but remove their configured background images. */
  const sideAds=[document.getElementById('leftSponsor'),document.getElementById('rightSponsor')].filter(Boolean);
  const clearSideAdImages=()=>{
    sideAds.forEach(ad=>{
      if(ad.style.backgroundImage)ad.style.removeProperty('background-image');
      if(ad.classList.contains('has-image'))ad.classList.remove('has-image');
      if(!ad.classList.contains('empty-sponsor'))ad.classList.add('empty-sponsor');
      if(ad.textContent.trim()!=='Reklam alanı')ad.textContent='Reklam alanı';
    });
  };
  clearSideAdImages();
  if(window.MutationObserver){
    const adObserver=new MutationObserver(clearSideAdImages);
    sideAds.forEach(ad=>adObserver.observe(ad,{attributes:true,attributeFilter:['class','style'],childList:true}));
  }

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
    frame.setAttribute('scrolling','no');
    frame.style.overflow='hidden';
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

    doc.documentElement.classList.add('embedded-view-root');
    doc.body.classList.add('embedded-view');

    let style=doc.getElementById('sro-parent-embed-fix');
    if(!style){
      style=doc.createElement('style');
      style.id='sro-parent-embed-fix';
      style.textContent=`
        html,body{height:auto!important;min-height:0!important;overflow:visible!important;overscroll-behavior:none!important}
        body{overflow-x:hidden!important;padding-bottom:0!important}
        body.embedded-view>.site-header,body.embedded-view>.site-footer{display:none!important}
        body.embedded-view main,body.embedded-view .page-shell,body.embedded-view .portal-shell,body.embedded-view .creator-shell{min-height:0!important}
      `;
      doc.head?.append(style);
    }

    let timer=0;
    const measure=()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        let innerDoc;
        try{innerDoc=frame.contentDocument}catch{return}
        if(!innerDoc?.body)return;
        const body=innerDoc.body;
        const html=innerDoc.documentElement;
        const childBottom=[...body.children].reduce((max,node)=>{
          const rect=node.getBoundingClientRect();
          return Math.max(max,rect.bottom+(innerDoc.defaultView?.scrollY||0));
        },0);
        const measured=Math.ceil(Math.max(body.scrollHeight,body.offsetHeight,html.scrollHeight,html.offsetHeight,childBottom));
        const next=Math.max(620,Math.min(14000,measured+4));
        const current=parseFloat(frame.style.height)||0;
        if(Math.abs(next-current)>3)frame.style.height=`${next}px`;
      },60);
    };

    const mutation=new MutationObserver(measure);
    mutation.observe(doc.body,{childList:true,subtree:true,characterData:true});
    const imageListeners=[];
    doc.querySelectorAll('img').forEach(image=>{
      if(image.complete)return;
      const listener=()=>measure();
      image.addEventListener('load',listener,{once:true});
      image.addEventListener('error',listener,{once:true});
      imageListeners.push([image,listener]);
    });
    const resizeListener=()=>measure();
    addEventListener('resize',resizeListener,{passive:true});
    [0,180,500,1000,1800].forEach(delay=>setTimeout(measure,delay));

    frameCleanup=()=>{
      clearTimeout(timer);
      mutation.disconnect();
      removeEventListener('resize',resizeListener);
      imageListeners.forEach(([image,listener])=>{
        image.removeEventListener('load',listener);
        image.removeEventListener('error',listener);
      });
    };
  };

  const stableSwitchHomeView=(view,url=routes[view],remember=false)=>{
    if(!routes[view])view='servers';
    setActiveView(view);
    const showServers=view==='servers';
    serversPanel?.classList.toggle('hidden',!showServers);
    portal?.classList.toggle('hidden',showServers);

    if(showServers){
      portal?.classList.remove('is-loading');
      frameCleanup();
      if(remember)history.pushState({homeView:'servers'},'',location.pathname);
      return;
    }

    if(!portal||!frame)return;
    portal.classList.add('is-loading');
    frame.style.height='760px';
    frame.onload=()=>{
      portal.classList.remove('is-loading');
      prepareEmbeddedDocument();
    };
    if(frame.dataset.view!==view){
      frame.dataset.view=view;
      frame.src=url||routes[view];
    }else{
      portal.classList.remove('is-loading');
      prepareEmbeddedDocument();
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

  /* Custom dark language picker avoids the native white option popup. */
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

  if(languageTrigger&&languageMenu){
    languageTrigger.addEventListener('click',event=>{
      event.stopPropagation();
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