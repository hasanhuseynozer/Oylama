const $=selector=>document.querySelector(selector);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
let giveaways=[],filter="active";

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

function effectiveStatus(giveaway){
  if(giveaway.status==="completed")return"completed";
  return Date.parse(`${giveaway.ends_at}Z`)<=Date.now()?"ended":"active";
}
function remaining(giveaway){
  const seconds=Math.max(0,Math.floor((Date.parse(`${giveaway.ends_at}Z`)-Date.now())/1000));
  if(!seconds)return"Katılım sona erdi";
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600);
  return days?`${days} gün ${hours} saat kaldı`:`${hours} saat ${Math.floor(seconds%3600/60)} dk kaldı`;
}
function emptyState(title,text){return`<div class="network-empty"><span>✦</span><h2>${esc(title)}</h2><p>${esc(text)}</p><button id="giveawayRetry" class="outline">Tekrar dene</button></div>`}

function render(){
  const active=giveaways.filter(item=>effectiveStatus(item)==="active"),completed=giveaways.filter(item=>effectiveStatus(item)!=="active");
  $("#activeCount").textContent=active.length;$("#completedCount").textContent=completed.length;
  const list=filter==="active"?active:completed;
  $("#giveawayGrid").innerHTML=list.length?list.map((item,index)=>{
    const status=effectiveStatus(item),live=status==="active";
    return `<article class="giveaway-card network-card" data-giveaway-id="${item.id}" tabindex="0">
      <div class="giveaway-card-art" ${item.cover_url?`style="background-image:url('${esc(item.cover_url)}')"`:""}>
        <span class="giveaway-live ${status}"><i></i>${live?"CANLI":status==="ended"?"SONUÇ BEKLENİYOR":"SONUÇLANDI"}</span>
        <div class="reward-mark">✦</div><b>${String(index+1).padStart(2,"0")}</b>
      </div>
      <div class="giveaway-card-body">
        <p class="eyebrow">${item.organizer_type==="creator"?"YAYINCI":"SUNUCU"} ÇEKİLİŞİ · ${esc(item.organizer_name)}</p>
        <h2>${esc(item.title)}</h2><p class="giveaway-prize">${esc(item.prize_text)}</p>
        <div class="giveaway-quick-rules"><span>♟ Karakter</span>${item.require_review?'<span>✎ Yorum</span>':""}${item.min_rating?`<span>★ ${item.min_rating}+</span>`:""}</div>
        <div class="giveaway-card-meta"><span><strong>${item.participant_count}</strong> katılımcı</span><time>${live?remaining(item):new Date(`${item.ends_at}Z`).toLocaleDateString("tr-TR")}</time></div>
        <button class="card-open">${live?"Şartları gör ve katıl":"Sonuçları incele"} <b>→</b></button>
      </div>
    </article>`}).join(""):emptyState(filter==="active"?"Aktif çekiliş yok":"Henüz sonuç yok",filter==="active"?"Yeni bir topluluk çekilişi başladığında burada görünecek.":"Tamamlanan çekilişlerin kazananları burada yayınlanacak.");
  document.querySelectorAll("[data-giveaway-id]").forEach(card=>{
    card.onclick=()=>openGiveaway(card.dataset.giveawayId);
    card.onkeydown=event=>{if(event.key==="Enter")openGiveaway(card.dataset.giveawayId)};
  });
  $("#giveawayRetry")?.addEventListener("click",loadGiveaways);
}

async function openGiveaway(id){
  const dialog=$("#giveawayDialog");
  $("#giveawayDetail").innerHTML='<div class="network-loading"><i></i><span>Çekiliş hazırlanıyor</span></div>';
  dialog.showModal();
  try{
    const {giveaway:g,winners}=await api(`/api/giveaways/${id}`),status=effectiveStatus(g),active=status==="active";
    $("#giveawayDetail").innerHTML=`
      <section class="giveaway-detail-head">
        <div><p class="eyebrow">${g.organizer_type==="creator"?"YAYINCI":"SUNUCU"} ÇEKİLİŞİ · ${esc(g.organizer_name)}</p><h2>${esc(g.title)}</h2><p>${esc(g.description||"Topluluk ödül etkinliği")}</p></div>
        <div class="giveaway-detail-prize"><span>ÖDÜL</span><strong>${esc(g.prize_text)}</strong></div>
      </section>
      <div class="giveaway-detail-grid">
        <section><h3>Katılım koşulları</h3><div class="eligibility-list"><div><b>01</b><span><strong>Karakter doğrulaması</strong><small>${esc(g.server_name)} sunucusu profilinde seçilmiş olmalı.</small></span></div>${g.require_review?'<div><b>02</b><span><strong>Yorum şartı</strong><small>Sunucu değerlendirmende bir yorum bulunmalı.</small></span></div>':""}${g.min_rating?`<div><b>03</b><span><strong>En az ${g.min_rating} yıldız</strong><small>Mevcut sunucu puanın bu seviyede olmalı.</small></span></div>`:""}</div>
          <div class="giveaway-summary"><span><b>${g.participant_count}</b> katılımcı</span><span><b>${g.winner_count}</b> kazanan</span><span><b>${g.reserve_count}</b> yedek</span></div>
          ${active?`<button id="enterGiveaway" class="primary giveaway-enter">Koşulları doğrula ve katıl</button>`:`<div class="giveaway-ended">${status==="ended"?"Katılım sona erdi · Sonuçlar organizatör tarafından açıklanacak.":"Çekiliş tamamlandı."}</div>`}
          <div id="giveawayMessage"></div>
        </section>
        <section><div class="detail-section-title"><h3>Kazananlar</h3><span>${winners.length}</span></div><div class="winner-podium">${winners.length?winners.map(w=>`<article class="${w.winner_type}"><b>${w.position}</b><div><strong>${esc(w.display_name)}</strong><small>${esc(w.character_name)} · ${w.winner_type==="winner"?"Kazanan":"Yedek"}</small></div></article>`).join(""):'<div class="network-mini-empty">Sonuçlar henüz açıklanmadı.</div>'}</div></section>
      </div>`;
    const enter=$("#enterGiveaway");
    if(enter)enter.onclick=async()=>{
      enter.disabled=true;enter.textContent="Koşullar doğrulanıyor…";
      try{const result=await api(`/api/giveaways/${id}/enter`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});$("#giveawayMessage").className="message good";$("#giveawayMessage").textContent=result.message;enter.textContent="Katılım tamamlandı"}
      catch(error){$("#giveawayMessage").className="message bad";$("#giveawayMessage").textContent=error.message;enter.disabled=false;enter.textContent="Koşulları doğrula ve katıl"}
    };
  }catch(error){$("#giveawayDetail").innerHTML=emptyState("Çekiliş açılamadı",error.message)}
}

async function loadGiveaways(){
  $("#giveawayGrid").innerHTML='<div class="network-loading"><i></i><span>Çekilişler hazırlanıyor</span></div>';
  try{giveaways=(await api("/api/giveaways")).giveaways||[];render()}
  catch(error){$("#giveawayGrid").innerHTML=emptyState("Çekilişler yüklenemedi",error.message);$("#giveawayRetry")?.addEventListener("click",loadGiveaways)}
}
document.querySelectorAll("[data-filter]").forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll("[data-filter]").forEach(item=>item.classList.toggle("active",item===button));render()});
$("#closeGiveaway").onclick=()=>$("#giveawayDialog").close();
$("#giveawayDialog").onclick=event=>{if(event.target===$("#giveawayDialog"))event.target.close()};
loadGiveaways();

