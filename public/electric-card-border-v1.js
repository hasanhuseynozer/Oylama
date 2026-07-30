(()=>{
  'use strict';

  const rankClasses=['rank-gold','rank-silver','rank-bronze'];
  let topThree=[];
  let rankingReady=false;
  let replayTimer=0;

  const calculateTopThree=servers=>{
    const list=Array.isArray(servers)?servers:[];
    if(!list.length)return [];
    const maxVotes=Math.max(1,...list.map(server=>Math.max(0,Number(server.vote_count)||0)));
    const score=server=>{
      const rating=Math.max(0,Math.min(5,Number(server.average_rating)||0))/5;
      const votes=Math.max(0,Number(server.vote_count)||0);
      const engagement=Math.log1p(votes)/Math.log1p(maxVotes);
      return rating*.75+engagement*.25;
    };
    return [...list]
      .sort((a,b)=>score(b)-score(a)||Number(b.average_rating||0)-Number(a.average_rating||0)||Number(b.vote_count||0)-Number(a.vote_count||0)||Number(a.id)-Number(b.id))
      .slice(0,3)
      .map(server=>Number(server.id));
  };

  const loadRanking=async()=>{
    try{
      const response=await fetch('/api/servers',{headers:{accept:'application/json'},cache:'no-store'});
      if(!response.ok)throw new Error('ranking request failed');
      const data=await response.json();
      topThree=calculateTopThree(data.servers);
      rankingReady=true;
      decorateCards();
      restartAnimations();
    }catch{
      rankingReady=true;
      const cards=[...document.querySelectorAll('#serverGrid .server-card:not(.server-card-skeleton)')];
      topThree=cards.slice(0,3).map(card=>Number(card.dataset.server)).filter(Boolean);
      decorateCards();
      restartAnimations();
    }
  };

  const removeDecoration=card=>{
    rankClasses.forEach(className=>card.classList.remove(className));
    card.querySelectorAll(':scope > .rank-ribbon,:scope > .electric-card-frame').forEach(element=>element.remove());
    card.removeAttribute('data-global-rank');
  };

  const decorateCard=(card,rank)=>{
    removeDecoration(card);
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

  const decorateCards=()=>{
    if(!rankingReady)return;
    document.querySelectorAll('#serverGrid .server-card:not(.server-card-skeleton)').forEach(card=>{
      const rank=topThree.indexOf(Number(card.dataset.server))+1;
      decorateCard(card,rank);
    });
  };

  const serversAreVisible=()=>{
    const activeLink=document.querySelector('[data-home-view="servers"].active');
    const panel=document.getElementById('serversPanel');
    const serverView=document.getElementById('serverView');
    if(panel)return Boolean(activeLink&&!panel.classList.contains('hidden'));
    return Boolean(activeLink&&serverView&&!serverView.classList.contains('hidden'));
  };

  const restartAnimations=()=>{
    const body=document.body;
    const active=serversAreVisible();
    body.classList.toggle('servers-electric-active',active);
    body.classList.remove('servers-electric-replay');
    clearTimeout(replayTimer);
    if(!active)return;
    requestAnimationFrame(()=>{
      body.classList.add('servers-electric-replay');
      replayTimer=setTimeout(()=>body.classList.add('servers-electric-replay'),50);
    });
  };

  const start=()=>{
    const grid=document.getElementById('serverGrid');
    if(grid){
      new MutationObserver(()=>requestAnimationFrame(()=>{
        decorateCards();
        restartAnimations();
      })).observe(grid,{childList:true});
    }

    const panel=document.getElementById('serversPanel');
    const serverView=document.getElementById('serverView');
    [panel,serverView].filter(Boolean).forEach(element=>{
      new MutationObserver(restartAnimations).observe(element,{attributes:true,attributeFilter:['class']});
    });

    document.querySelectorAll('[data-home-view]').forEach(link=>{
      link.addEventListener('click',()=>setTimeout(restartAnimations,0),true);
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){
        document.body.classList.remove('servers-electric-replay');
      }else{
        restartAnimations();
      }
    });

    restartAnimations();
    loadRanking();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();