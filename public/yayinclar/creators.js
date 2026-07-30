const $=selector=>document.querySelector(selector);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
let creators=[];
fetch("/api/auth/me").then(r=>r.json()).then(({user})=>document.querySelector("#creatorPanelLink")?.classList.toggle("hidden",user?.role!=="creator")).catch(()=>{});

async function api(url,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"İşlem tamamlanamadı.");
    return data;
  }catch(error){
    if(error.name==="AbortError")throw new Error("Bağlantı zaman aşımına uğradı.");
    throw error;
  }finally{clearTimeout(timer)}
}

function emptyState(title,text,action="Tekrar dene"){
  return `<div class="network-empty"><span>✦</span><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="outline" id="networkRetry">${esc(action)}</button></div>`;
}

function render(){
  const query=$("#creatorSearch").value.toLocaleLowerCase("tr-TR"),sort=$("#creatorSort").value;
  const list=creators.filter(item=>`${item.display_name} ${item.headline} ${item.biography}`.toLocaleLowerCase("tr-TR").includes(query));
  list.sort((a,b)=>sort==="name"?a.display_name.localeCompare(b.display_name,"tr"):Number(b.average_rating)-Number(a.average_rating));
  $("#creatorCount").textContent=`${list.length} yayıncı`;
  $("#creatorGrid").innerHTML=list.length?list.map((item,index)=>`
    <article class="creator-card network-card" data-creator-id="${item.user_id}" tabindex="0">
      <div class="creator-cover" ${item.cover_url?`style="background-image:url('${esc(item.cover_url)}')"`:""}>
        <span class="creator-availability ${item.collaboration_status}"><i></i>${item.collaboration_status==="open"?"İş birliğine açık":"Şu an kapalı"}</span>
        <b>${String(index+1).padStart(2,"0")}</b>
      </div>
      <div class="creator-card-body">
        <div class="creator-avatar">${item.avatar_url?`<img src="${esc(item.avatar_url)}" alt="">`:"✦"}</div>
        <p class="eyebrow">${esc(item.language||"TR")} · ONAYLI YAYINCI</p>
        <h2>${esc(item.display_name)}</h2>
        <p>${esc(item.headline||"Silkroad topluluğu için içerik üretiyor.")}</p>
        <div class="creator-score"><strong>${Number(item.average_rating).toFixed(1)}</strong><span>★★★★★</span><small>${item.rating_count} iş birliği puanı</small></div>
        <button class="card-open">Profili incele <b>→</b></button>
      </div>
    </article>`).join(""):emptyState(query?"Sonuç bulunamadı":"Yayıncı ağı hazırlanıyor",query?"Arama ölçütünü değiştirerek tekrar deneyin.":"Onaylanan yayıncı profilleri burada yayınlanacak.",query?"Aramayı temizle":"Yenile");
  document.querySelectorAll("[data-creator-id]").forEach(card=>{
    card.onclick=()=>openCreator(card.dataset.creatorId);
    card.onkeydown=event=>{if(event.key==="Enter")openCreator(card.dataset.creatorId)};
  });
  $("#networkRetry")?.addEventListener("click",()=>{if(query){$("#creatorSearch").value="";render()}else loadCreators()});
}

async function openCreator(id){
  const dialog=$("#creatorDialog");
  $("#creatorDetail").innerHTML='<div class="network-loading"><i></i><span>Profil hazırlanıyor</span></div>';
  dialog.showModal();
  try{
    const {creator,ratings}=await api(`/api/creators/${id}`);
    const links=[["Twitch",creator.twitch_url],["Kick",creator.kick_url],["YouTube",creator.youtube_url]].filter(item=>item[1]);
    $("#creatorDetail").innerHTML=`
      <section class="creator-detail-head">
        <div class="creator-detail-avatar">${creator.avatar_url?`<img src="${esc(creator.avatar_url)}" alt="">`:"✦"}</div>
        <div><p class="eyebrow">DOĞRULANMIŞ YAYINCI</p><h2>${esc(creator.display_name)}</h2><p>${esc(creator.headline)}</p></div>
        <div class="creator-detail-score"><strong>${Number(creator.average_rating).toFixed(1)}</strong><span>★★★★★</span><small>${creator.rating_count} değerlendirme</small></div>
      </section>
      <div class="creator-detail-grid">
        <section><h3>Yayıncı hakkında</h3><p class="creator-biography">${esc(creator.biography||"Yayıncı henüz profil açıklaması eklemedi.")}</p>
          <div class="creator-links">${links.length?links.map(item=>`<a href="${esc(item[1])}" target="_blank" rel="noopener">${item[0]} <span>↗</span></a>`).join(""):"<small>Yayın bağlantısı eklenmemiş.</small>"}</div>
          ${creator.discord||creator.contact_email?`<div class="creator-contact"><span>İş birliği iletişimi</span><b>${esc(creator.discord||creator.contact_email)}</b></div>`:""}
        </section>
        <section><div class="detail-section-title"><h3>Sunucu sahibi değerlendirmeleri</h3><span>${ratings.length}</span></div>
          <div class="creator-review-list">${ratings.length?ratings.map(r=>`<article class="creator-review"><header><b>${esc(r.owner_name)}</b><span>${((r.communication+r.professionalism+r.engagement+r.promotion_quality)/4).toFixed(1)} ★</span></header><p>${esc(r.comment||"Yorum eklenmedi.")}</p><small>Doğrulanmış sunucu sahibi</small></article>`).join(""):'<div class="network-mini-empty">Henüz doğrulanmış değerlendirme yok.</div>'}</div>
        </section>
      </div>`;
  }catch(error){$("#creatorDetail").innerHTML=emptyState("Profil açılamadı",error.message)}
}

async function loadCreators(){
  $("#creatorGrid").innerHTML='<div class="network-loading"><i></i><span>Yayıncı ağı hazırlanıyor</span></div>';
  try{creators=(await api("/api/creators")).creators||[];render()}
  catch(error){$("#creatorCount").textContent="Bağlantı hatası";$("#creatorGrid").innerHTML=emptyState("Yayıncılar yüklenemedi",error.message);$("#networkRetry")?.addEventListener("click",loadCreators)}
}

$("#creatorSearch").oninput=render;
$("#creatorSort").onchange=render;
$("#closeCreator").onclick=()=>$("#creatorDialog").close();
$("#creatorDialog").onclick=event=>{if(event.target===$("#creatorDialog"))event.target.close()};
loadCreators();

