(()=>{
  'use strict';

  const decorateStars=root=>{
    root.querySelectorAll?.('.stars').forEach(group=>{
      if(group.dataset.ratingStars==='split')return;
      const characters=[...group.textContent.trim()].filter(character=>character==='★'||character==='☆');
      if(!characters.length)return;
      group.innerHTML=characters.map(character=>`<i class="rating-star ${character==='★'?'is-filled':'is-empty'}" aria-hidden="true">${character}</i>`).join('');
      group.dataset.ratingStars='split';
    });
  };

  const start=()=>{
    decorateStars(document);
    if(!document.body||!window.MutationObserver)return;
    new MutationObserver(records=>{
      records.forEach(record=>record.addedNodes.forEach(node=>{
        if(node.nodeType!==1)return;
        if(node.matches?.('.stars'))decorateStars(node.parentElement||document);
        else decorateStars(node);
      }));
    }).observe(document.body,{childList:true,subtree:true});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
