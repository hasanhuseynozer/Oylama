(()=>{
  'use strict';

  const rankClasses=['rank-gold','rank-silver','rank-bronze'];

  const ensureHomepageFont=()=>{
    if(document.getElementById('patrickHandHomepageFont'))return;
    const link=document.createElement('link');
    link.id='patrickHandHomepageFont';
    link.rel='stylesheet';
    link.href='/home-font-patrick.css?v=20260730-2016';
    document.head.append(link);
  };

  const getStableTopThree=()=>{
    const servers=typeof state!=='undefined'&&Array.isArray(state.servers)?state.servers:[];
    if(!servers.length)return [];
    const maxVotes=Math.max(1,...servers.map(server=>Math.max(0,Number(server.vote_count)||0)));
    const score=server=>{
      const rating=Math.max(0,Math.min(5,Number(server.average_rating)||0))/5;
      const votes=Math.max(0,Number(server.vote_count)||0);
      const engagement=Math.log1p(votes)/Math.log1p(maxVotes);
      return rating*.75+engagement*.25;
    };
    return [...servers]
      .sort((a,b)=>score(b)-score(a)||Number(b.average_rating||0)-Number(a.average_rating||0)||Number(b.vote_count||0)-Number(a.vote_count||0)||Number(a.id)-Number(b.id))
      .slice(0,3)
      .map(server=>Number(server.id));
  };

  const decorateCard=(card,rank)=>{
    rankClasses.forEach(className=>card.classList.remove(className));
    card.querySelectorAll(':scope > .rank-ribbon,:scope > .electric-card-frame').forEach(element=>element.remove());
    card.removeAttribute('data-global-rank');
    if(rank<1||rank>3)return;

    card.classList.add(rankClasses[rank-1]);
    card.dataset.globalRank=String(rank);

    const ribbon=document.createElement('span');
    ribbon.className='rank-ribbon stable-rank-ribbon';
    ribbon.setAttribute('aria-label',`${rank}. sıra`);
    ribbon.textContent=`#${rank}`;
    card.prepend(ribbon);

    const frame=document.createElement('span');
    frame.className='electric-card-frame';
    frame.setAttribute('aria-hidden','true');
    frame.innerHTML='<i class="electric-border-glow"></i><i class="electric-border-line"></i><i class="electric-border-sparks"></i>';
    card.append(frame);
  };

  const applyStableRanks=()=>{
    ensureHomepageFont();
    const topThree=getStableTopThree();
    document.querySelectorAll('#serverGrid .server-card:not(.server-card-skeleton)').forEach(card=>{
      const rank=topThree.indexOf(Number(card.dataset.server))+1;
      decorateCard(card,rank);
    });
  };

  const setServersEffectState=active=>{
    const body=document.body;
    body.classList.toggle('servers-electric-active',active);
    body.classList.remove('servers-electric-replay');
    if(!active)return;
    void body.offsetWidth;
    body.classList.add('servers-electric-replay');
  };

  const syncViewState=()=>{
    const serverView=document.getElementById('serverView');
    setServersEffectState(Boolean(serverView&&!serverView.classList.contains('hidden')));
  };

  const start=()=>{
    applyStableRanks();
    syncViewState();

    const grid=document.getElementById('serverGrid');
    if(grid)new MutationObserver(()=>requestAnimationFrame(applyStableRanks)).observe(grid,{childList:true,subtree:false});

    const serverView=document.getElementById('serverView');
    if(serverView)new MutationObserver(syncViewState).observe(serverView,{attributes:true,attributeFilter:['class']});

    document.querySelectorAll('[data-home-view]').forEach(link=>link.addEventListener('click',()=>requestAnimationFrame(syncViewState)));
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();