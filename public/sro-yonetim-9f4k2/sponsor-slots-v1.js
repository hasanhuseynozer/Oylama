(()=>{
  'use strict';

  const form=document.getElementById('settingsForm');
  const grid=form?.querySelector('.settings-grid');
  if(!form||!grid)return;

  const slotState={
    left1:{image:'',text:'',url:''},
    left2:{image:'',text:'',url:''},
    right1:{image:'',text:'',url:''},
    right2:{image:'',text:'',url:''}
  };
  let dirty=false;
  let hydrated=false;

  const style=document.createElement('style');
  style.textContent=`
    .sponsor-slot-editor{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:8px 0 18px}
    .sponsor-slot-card{display:grid;gap:10px;padding:16px;border:1px solid rgba(78,185,178,.38);border-radius:16px;background:linear-gradient(180deg,rgba(228,255,252,.72),rgba(174,231,226,.45));box-shadow:inset 0 1px rgba(255,255,255,.86),0 8px 18px rgba(4,68,72,.09)}
    .sponsor-slot-card header{display:flex;align-items:center;justify-content:space-between;gap:12px}.sponsor-slot-card header strong{font-size:18px}.sponsor-slot-card header span{font-size:12px;font-weight:800;opacity:.65}
    .sponsor-slot-card label{display:grid;gap:6px}.sponsor-slot-card input[type=text],.sponsor-slot-card input[type=url]{width:100%}
    .sponsor-upload{display:grid;grid-template-columns:350px minmax(0,1fr);gap:14px;align-items:start}
    .sponsor-preview{width:350px;height:250px;object-fit:cover;border:1px solid rgba(45,151,148,.45);border-radius:10px;background:transparent;box-shadow:none}
    .sponsor-preview.is-empty{object-fit:none;background:transparent}
    .sponsor-upload-actions{display:grid;gap:10px}.sponsor-upload-actions small{line-height:1.4;opacity:.72}.sponsor-upload-actions button{justify-self:start}
    @media(max-width:1100px){.sponsor-slot-editor{grid-template-columns:1fr}.sponsor-upload{grid-template-columns:1fr}.sponsor-preview{width:100%;max-width:350px;height:auto;aspect-ratio:7/5}}
  `;
  document.head.append(style);

  ['left_ad_text','left_ad_url','left_ad_image','right_ad_text','right_ad_url','right_ad_image'].forEach(id=>{
    document.getElementById(id)?.closest('label')?.classList.add('hidden');
  });

  const editor=document.createElement('section');
  editor.className='sponsor-slot-editor';
  editor.innerHTML=['left1','left2','right1','right2'].map(key=>{
    const label={left1:'Sol 1',left2:'Sol 2',right1:'Sağ 1',right2:'Sağ 2'}[key];
    return `<article class="sponsor-slot-card" data-sponsor-card="${key}">
      <header><strong>${label}</strong><span>350 × 250 px</span></header>
      <div class="sponsor-upload">
        <img class="sponsor-preview is-empty" data-sponsor-preview="${key}" alt="${label} reklam önizleme">
        <div class="sponsor-upload-actions">
          <label>Reklam görseli<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-sponsor-upload="${key}"></label>
          <small>PNG, JPG, WebP veya GIF. Görsel sitede 350×250 px olarak gösterilir.</small>
          <button class="outline tiny" type="button" data-sponsor-remove="${key}">Görseli kaldır</button>
        </div>
      </div>
      <label>Reklam yazısı<input type="text" maxlength="80" data-sponsor-text="${key}" placeholder="İsteğe bağlı"></label>
      <label>Reklam bağlantısı<input type="url" data-sponsor-url="${key}" placeholder="https://"></label>
    </article>`;
  }).join('');
  grid.prepend(editor);

  const normalise=value=>({image:String(value?.image||''),text:String(value?.text||''),url:String(value?.url||'')});
  const parseSide=(rawImage,text,url)=>{
    const raw=String(rawImage||'').trim();
    if(raw.startsWith('{')){
      try{
        const parsed=JSON.parse(raw);
        if(Array.isArray(parsed?.slots))return [normalise(parsed.slots[0]),normalise(parsed.slots[1])];
      }catch{}
    }
    return [normalise({image:raw,text,url}),normalise({})];
  };

  const renderSlot=key=>{
    const slot=slotState[key];
    const preview=document.querySelector(`[data-sponsor-preview="${key}"]`);
    const text=document.querySelector(`[data-sponsor-text="${key}"]`);
    const url=document.querySelector(`[data-sponsor-url="${key}"]`);
    if(preview){
      preview.classList.toggle('is-empty',!slot.image);
      if(slot.image)preview.src=slot.image;else preview.removeAttribute('src');
    }
    if(text)text.value=slot.text;
    if(url)url.value=slot.url;
  };

  const hydrate=()=>{
    if(dirty)return;
    const left=parseSide(document.getElementById('left_ad_image')?.value,document.getElementById('left_ad_text')?.value,document.getElementById('left_ad_url')?.value);
    const right=parseSide(document.getElementById('right_ad_image')?.value,document.getElementById('right_ad_text')?.value,document.getElementById('right_ad_url')?.value);
    slotState.left1=left[0];slotState.left2=left[1];slotState.right1=right[0];slotState.right2=right[1];
    Object.keys(slotState).forEach(renderSlot);
    hydrated=true;
  };

  const markDirty=()=>{dirty=true};
  editor.addEventListener('input',event=>{
    const textKey=event.target.dataset.sponsorText;
    const urlKey=event.target.dataset.sponsorUrl;
    if(textKey){slotState[textKey].text=event.target.value;markDirty()}
    if(urlKey){slotState[urlKey].url=event.target.value;markDirty()}
  });

  const readImage=file=>new Promise((resolve,reject)=>{
    if(!file?.type?.startsWith('image/'))return reject(new Error('Lütfen bir görsel dosyası seçin.'));
    if(file.size>600*1024)return reject(new Error('Reklam görseli en fazla 600 KB olabilir.'));
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(new Error('Görsel okunamadı.'));
    reader.readAsDataURL(file);
  });

  editor.addEventListener('change',async event=>{
    const key=event.target.dataset.sponsorUpload;
    if(!key||!event.target.files?.[0])return;
    try{
      slotState[key].image=await readImage(event.target.files[0]);
      markDirty();
      renderSlot(key);
    }catch(error){
      const message=document.getElementById('adminMessage');
      if(message)message.innerHTML=`<div class="message bad">${error.message}</div>`;
    }finally{
      event.target.value='';
    }
  });

  editor.addEventListener('click',event=>{
    const button=event.target.closest('[data-sponsor-remove]');
    if(!button)return;
    slotState[button.dataset.sponsorRemove].image='';
    markDirty();
    renderSlot(button.dataset.sponsorRemove);
  });

  const pack=(first,second)=>JSON.stringify({version:2,slots:[normalise(slotState[first]),normalise(slotState[second])]});
  const keys=['logo_image','banner_text','banner_url','banner_image','left_ad_text','left_ad_url','left_ad_image','right_ad_text','right_ad_url','right_ad_image','contact_text','disclaimer_text','footer_tagline','twitch_url','kick_url','youtube_url'];

  form.onsubmit=async event=>{
    event.preventDefault();
    if(!hydrated)hydrate();
    document.getElementById('left_ad_image').value=pack('left1','left2');
    document.getElementById('right_ad_image').value=pack('right1','right2');
    document.getElementById('left_ad_text').value=slotState.left1.text;
    document.getElementById('left_ad_url').value=slotState.left1.url;
    document.getElementById('right_ad_text').value=slotState.right1.text;
    document.getElementById('right_ad_url').value=slotState.right1.url;
    const payload=Object.fromEntries(keys.map(key=>[key,document.getElementById(key)?.value||'']));
    const submit=form.querySelector('button[type="submit"],button.primary');
    if(submit)submit.disabled=true;
    try{
      const response=await fetch('/api/admin/settings',{
        method:'PUT',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(payload)
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Ayarlar kaydedilemedi.');
      dirty=false;
      const message=document.getElementById('adminMessage');
      if(message)message.innerHTML='<div class="message good">Dört reklam alanı ayrı ayrı kaydedildi.</div>';
    }catch(error){
      const message=document.getElementById('adminMessage');
      if(message)message.innerHTML=`<div class="message bad">${error.message}</div>`;
    }finally{
      if(submit)submit.disabled=false;
    }
  };

  document.querySelector('[data-tab="settings"]')?.addEventListener('click',()=>setTimeout(hydrate,0));
  const dashboard=document.getElementById('dashboard');
  if(dashboard&&window.MutationObserver){
    new MutationObserver(()=>{
      if(!dashboard.classList.contains('hidden'))setTimeout(hydrate,0);
    }).observe(dashboard,{attributes:true,attributeFilter:['class']});
  }
  if(!dashboard?.classList.contains('hidden'))setTimeout(hydrate,0);
})();
