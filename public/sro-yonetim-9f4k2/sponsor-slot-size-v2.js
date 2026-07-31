(()=>{
  'use strict';

  const style=document.createElement('style');
  style.textContent=`
    .sponsor-upload{grid-template-columns:225px minmax(0,1fr)!important}
    .sponsor-preview{width:225px!important;height:800px!important;max-width:225px!important;aspect-ratio:9/32!important}
    @media(max-width:1100px){
      .sponsor-upload{grid-template-columns:1fr!important}
      .sponsor-preview{width:100%!important;max-width:225px!important;height:auto!important;aspect-ratio:9/32!important}
    }
  `;
  document.head.append(style);

  document.querySelectorAll('.sponsor-slot-card').forEach(card=>{
    const size=card.querySelector('header span');
    const hint=card.querySelector('.sponsor-upload-actions small');
    if(size)size.textContent='225 × 800 px';
    if(hint)hint.textContent='PNG, JPG, WebP veya GIF. En fazla 2 MB. Görsel sitede 225 px genişlik ve 800 px yükseklikte gösterilir.';
  });
})();
