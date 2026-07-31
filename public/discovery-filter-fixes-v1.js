(()=>{
  'use strict';

  const originalRender=window.renderServers;
  if(typeof originalRender!=='function'||originalRender.__discoveryFilterFixed)return;

  const serverMeta=new Map();
  const NEW_WINDOW_MS=7*24*60*60*1000;

  const parseServerDate=value=>{
    if(!value)return NaN;
    const raw=String(value).trim();
    let timestamp=Date.parse(raw);
    if(Number.isFinite(timestamp))return timestamp;
    const normalized=raw.includes('T')?raw:raw.replace(' ','T');
    timestamp=Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized)?normalized:`${normalized}Z`);
    return timestamp;
  };

  const isNewServer=server=>{
    const timestamp=parseServerDate(server?.opened_at||server?.created_at);
    if(!Number.isFinite(timestamp))return false;
    const age=Date.now()-timestamp;
    return age>=0&&age<NEW_WINDOW_MS;
  };

  const updateNewQueryParam=enabled=>{
    const url=new URL(location.href);
    if(enabled)url.searchParams.set('new','1');
    else url.searchParams.delete('new');
    history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);
  };

  const syncFilterLabels=()=>{
    const search=document.getElementById('searchInput');
    if(search)search.placeholder='Sunucu adı ara…';
    const popular=document.querySelector('#tagFilter option[value="popular"]');
    if(popular&&popular.textContent!=='Popüler (5+ değerlendirme)')popular.textContent='Popüler (5+ değerlendirme)';
  };

  const applyPostFilters=()=>{
    syncFilterLabels();
    const grid=document.getElementById('serverGrid');
    if(!grid)return;

    const query=(document.getElementById('searchInput')?.value||'').toLocaleLowerCase('tr-TR').trim();
    const tokens=query.split(/\s+/).filter(Boolean);
    const newOnly=Boolean(document.getElementById('newOnly')?.checked);
    const cards=[...grid.querySelectorAll('.server-card:not(.server-card-skeleton)')];
    let visible=0;

    cards.forEach(card=>{
      const id=Number(card.dataset.server);
      const name=(card.querySelector('h2')?.textContent||'').toLocaleLowerCase('tr-TR');
      const meta=serverMeta.get(id);
      const fresh=meta?isNewServer(meta):Boolean(card.querySelector('.server-badges .fresh'));
      const badges=card.querySelector('.server-badges');
      const existingFresh=badges?.querySelector('.fresh');

      if(badges&&fresh&&!existingFresh){
        const badge=document.createElement('span');
        badge.className='fresh';
        badge.textContent='Yeni';
        badges.append(badge);
      }else if(existingFresh&&!fresh){
        existingFresh.remove();
      }

      const matchesName=!tokens.length||tokens.every(token=>name.includes(token));
      const matchesNew=!newOnly||fresh;
      const hidden=!(matchesName&&matchesNew);
      card.hidden=hidden;
      if(hidden)card.style.setProperty('display','none','important');
      else{card.style.removeProperty('display');visible+=1}
    });

    grid.querySelector('[data-filter-fix-empty]')?.remove();
    if(cards.length&&visible===0){
      const empty=document.createElement('div');
      empty.className='panel empty-results';
      empty.dataset.filterFixEmpty='1';
      empty.innerHTML='<h3>Sonuç bulunamadı</h3><p>Sunucu adı veya yeni sunucu filtresiyle eşleşen sonuç yok.</p><button class="outline" type="button" data-filter-fix-clear>Filtreleri Temizle</button>';
      grid.append(empty);
      empty.querySelector('[data-filter-fix-clear]').onclick=()=>document.getElementById('clearFilters')?.click();
    }
  };

  const patchedRender=function(...args){
    const newOnly=document.getElementById('newOnly');
    const keepNew=Boolean(newOnly?.checked);
    if(newOnly&&keepNew)newOnly.checked=false;
    const result=originalRender.apply(this,args);
    if(newOnly)newOnly.checked=keepNew;
    if(keepNew)updateNewQueryParam(true);
    requestAnimationFrame(applyPostFilters);
    return result;
  };
  patchedRender.__discoveryFilterFixed=true;
  window.renderServers=patchedRender;

  const loadServerMeta=async()=>{
    try{
      const response=await fetch('/api/servers',{headers:{accept:'application/json'},cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      (data.servers||[]).forEach(server=>serverMeta.set(Number(server.id),server));
      applyPostFilters();
    }catch{}
  };

  document.addEventListener('input',event=>{
    if(event.target?.id==='searchInput')requestAnimationFrame(applyPostFilters);
  },true);
  document.addEventListener('change',event=>{
    if(event.target?.id==='newOnly')setTimeout(applyPostFilters,0);
  },true);

  const filters=document.querySelector('.filters');
  if(filters)new MutationObserver(syncFilterLabels).observe(filters,{childList:true,subtree:true});
  syncFilterLabels();
  loadServerMeta();
})();
