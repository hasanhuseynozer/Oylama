(()=>{
  'use strict';

  const slots={
    left1:document.getElementById('leftSponsor'),
    left2:document.getElementById('leftSponsor2'),
    right1:document.getElementById('rightSponsor'),
    right2:document.getElementById('rightSponsor2')
  };

  const emptySlot=()=>({image:'',text:'',url:''});
  const normaliseSlot=value=>({
    image:String(value?.image||''),
    text:String(value?.text||''),
    url:String(value?.url||'')
  });

  const parseSide=(rawImage,legacyText,legacyUrl)=>{
    const raw=String(rawImage||'').trim();
    if(raw.startsWith('{')){
      try{
        const parsed=JSON.parse(raw);
        if(Array.isArray(parsed?.slots)){
          return [normaliseSlot(parsed.slots[0]),normaliseSlot(parsed.slots[1])];
        }
      }catch{}
    }
    return [normaliseSlot({image:raw,text:legacyText,url:legacyUrl}),emptySlot()];
  };

  const applySlot=(element,slot,label)=>{
    if(!element)return;
    const image=String(slot.image||'').trim();
    const text=String(slot.text||'').trim();
    const url=String(slot.url||'').trim();
    element.dataset.slotLabel=label;
    element.classList.toggle('has-image',Boolean(image));
    element.classList.toggle('empty-sponsor',!image);
    element.style.backgroundImage=image?`url("${image.replaceAll('"','%22')}")`:'';
    element.textContent=image?'':(text||'');
    if(url){
      element.href=url;
      element.target='_blank';
      element.rel='noopener nofollow';
    }else{
      element.removeAttribute('href');
      element.removeAttribute('target');
      element.rel='nofollow';
    }
  };

  const paint=settings=>{
    const left=parseSide(settings.left_ad_image,settings.left_ad_text,settings.left_ad_url);
    const right=parseSide(settings.right_ad_image,settings.right_ad_text,settings.right_ad_url);
    applySlot(slots.left1,left[0],'Sol 1');
    applySlot(slots.left2,left[1],'Sol 2');
    applySlot(slots.right1,right[0],'Sağ 1');
    applySlot(slots.right2,right[1],'Sağ 2');
  };

  const start=async()=>{
    if(!Object.values(slots).some(Boolean))return;
    try{
      const response=await fetch('/api/config',{headers:{accept:'application/json'}});
      const payload=await response.json();
      const settings=payload.settings||{};
      paint(settings);
      const body=document.body;
      if(body?.classList.contains('app-loading')&&window.MutationObserver){
        const observer=new MutationObserver(()=>{
          if(body.classList.contains('app-loading'))return;
          observer.disconnect();
          paint(settings);
        });
        observer.observe(body,{attributes:true,attributeFilter:['class']});
      }else{
        requestAnimationFrame(()=>paint(settings));
      }
      setTimeout(()=>paint(settings),900);
    }catch{
      applySlot(slots.left1,emptySlot(),'Sol 1');
      applySlot(slots.left2,emptySlot(),'Sol 2');
      applySlot(slots.right1,emptySlot(),'Sağ 1');
      applySlot(slots.right2,emptySlot(),'Sağ 2');
    }
  };

  start();
})();
