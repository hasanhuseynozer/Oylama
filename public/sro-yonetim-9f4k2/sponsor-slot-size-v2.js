(()=>{
  'use strict';

  const style=document.createElement('style');
  style.textContent=`
    .sponsor-upload{grid-template-columns:250px minmax(0,1fr)!important}
    .sponsor-preview{width:250px!important;height:350px!important;max-width:250px!important;aspect-ratio:5/7!important}
    @media(max-width:1100px){
      .sponsor-upload{grid-template-columns:1fr!important}
      .sponsor-preview{width:100%!important;max-width:250px!important;height:auto!important;aspect-ratio:5/7!important}
    }
  `;
  document.head.append(style);

  document.querySelectorAll('.sponsor-slot-card').forEach(card=>{
    const size=card.querySelector('header span');
    const hint=card.querySelector('.sponsor-upload-actions small');
    if(size)size.textContent='250 × 350 px';
    if(hint)hint.textContent='PNG, JPG, WebP veya GIF. Görsel sitede 250 px genişlik ve 350 px yükseklikte gösterilir.';
  });
})();
