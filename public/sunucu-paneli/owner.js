const $=selector=>document.querySelector(selector);
let pendingReportId=0;

async function api(url,options={}){
  const response=await fetch(url,options),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"İşlem başarısız.");
  return data;
}

async function load(){
  const data=await api("/api/owner/dashboard");
  if(!data.servers.length){
    $("#ownedServers").innerHTML='<div class="empty-state"><strong>Hesabınıza bağlı sunucu bulunmuyor.</strong><p>Yönetici panelinden kullanıcıya belirli bir sunucu atanmalıdır.</p></div>';
    $("#ownerReviews").innerHTML='';
    return;
  }
  $("#ownedServers").innerHTML=data.servers.map(server=>serverForm(server)).join("");
  $("#ownerReviews").innerHTML=data.reviews.length?data.reviews.map(review=>reviewCard(review)).join(""):'<div class="empty-state">Henüz yorum yok.</div>';
  bind();
}

function serverForm(server){
  return `<form class="owner-server owner-edit" data-server-change="${server.id}">
    <header class="owner-server-header"><div><span class="server-status ${server.operational_status}"><i></i>${statusName(server.operational_status)}</span>${server.change_status?`<span class="status ${server.change_status}">${approval(server.change_status)}</span>`:""}</div><h3>${esc(server.name)}</h3><small>Sunucu vitrini ve yayın ayarları</small></header>
    <div class="owner-form-sections">
      <section><span class="section-number">01</span><h4>Genel Bilgiler</h4><label>Açıklama<textarea name="description" minlength="3" maxlength="300" required rows="5">${esc(server.description.slice(0,300))}</textarea></label></section>
      <section><span class="section-number">02</span><h4>Durum ve Takvim</h4><div class="form-grid"><label>Sunucu durumu<select name="operational_status"><option value="online" ${server.operational_status==="online"?"selected":""}>Çevrimiçi</option><option value="maintenance" ${server.operational_status==="maintenance"?"selected":""}>Bakımda</option><option value="offline" ${server.operational_status==="offline"?"selected":""}>Kapalı</option></select></label><label>Durum açıklaması<input name="status_note" maxlength="120" value="${esc(server.status_note||"")}" placeholder="Örn. Planlı bakım"></label><label>Beta tarihi ve saati<input name="beta_at" type="datetime-local" value="${esc(server.beta_at||"")}"></label><label>Açılış tarihi ve saati<input name="launch_at" type="datetime-local" value="${esc(server.launch_at||"")}"></label></div></section>
      <section><span class="section-number">03</span><h4>Bağlantılar</h4><div class="link-grid"><label>Web sitesi<input name="website_url" type="url" value="${esc(server.website_url||"")}" placeholder="https://"></label><label>Discord<input name="discord_url" type="url" value="${esc(server.discord_url||"")}" placeholder="https://discord.gg/"></label><label>Tanıtım<input name="promo_url" type="url" value="${esc(server.promo_url||"")}" placeholder="https://"></label></div></section>
      <section><span class="section-number">04</span><h4>Sunucu Görseli</h4><label class="upload-drop"><span>Görsel seç veya değiştir</span><small>PNG, JPG, WebP veya GIF · En fazla 300 KB</small><input name="image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><input name="image_url" type="hidden" value="${esc(server.image_url||"")}">${server.image_url?`<img class="media-preview" src="${esc(server.image_url)}" alt="Sunucu görseli">`:""}</label></section>
    </div><div class="owner-submit-bar"><span>Değişiklikler doğrudan canlı siteye uygulanır.</span><button class="primary">Değişiklikleri Yayınla</button></div></form>`;
}

function reviewCard(review){
  return `<article class="owner-review"><div class="owner-review-copy"><small>${esc(review.server_name)} · ${date(review.created_at)}</small><h3>${esc(review.display_name)}</h3><span class="stars" aria-label="${review.rating} puan">${"★".repeat(review.rating)}${"☆".repeat(5-review.rating)}</span><p>${esc(review.comment)}</p><button class="tiny report-button" type="button" data-report="${review.id}"><span>⚑</span> İçeriği Bildir</button></div><form data-reply="${review.id}"><label>Resmî sunucu sahibi cevabı<textarea maxlength="500" required rows="3" placeholder="Topluluğa profesyonel ve yapıcı bir cevap yazın…">${esc(review.reply||"")}</textarea></label><button class="primary">${review.reply?"Cevabı Güncelle":"Cevapla"}</button></form></article>`;
}

function bind(){
  document.querySelectorAll("[name=image_file]").forEach(input=>input.onchange=async()=>{
    const file=input.files[0];if(!file)return;
    if(file.size>307200)return show("Görsel 300 KB sınırını aşıyor.","bad");
    input.form.elements.image_url.value=await fileData(file);
    const old=input.closest("label").querySelector("img");if(old)old.src=input.form.elements.image_url.value;
  });
  document.querySelectorAll("[data-server-change]").forEach(form=>form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector("button[type=submit],button.primary");button.disabled=true;
    try{const x=form.elements,p={description:x.description.value,image_url:x.image_url.value,website_url:x.website_url.value,discord_url:x.discord_url.value,promo_url:x.promo_url.value,beta_at:x.beta_at.value,launch_at:x.launch_at.value,operational_status:x.operational_status.value,status_note:x.status_note.value};await api(`/api/owner/servers/${form.dataset.serverChange}/change-request`,jsonPost(p));show("Sunucu bilgileri yayınlandı.","good");await load()}catch(error){show(error.message,"bad")}finally{button.disabled=false}
  });
  document.querySelectorAll("[data-reply]").forEach(form=>form.onsubmit=async event=>{
    event.preventDefault();try{await api(`/api/owner/reviews/${form.dataset.reply}/reply`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({reply:form.querySelector("textarea").value})});show("Resmî cevap yayınlandı.","good");await load()}catch(error){show(error.message,"bad")}
  });
  document.querySelectorAll("[data-report]").forEach(button=>button.onclick=()=>openReport(Number(button.dataset.report)));
}

function openReport(id){pendingReportId=id;$("#reportDialog").showModal()}
function closeReport(){pendingReportId=0;$("#reportDialog").close()}
document.querySelectorAll("[data-report-cancel]").forEach(button=>button.onclick=closeReport);
$("#reportDialog").onclick=event=>{if(event.target===$("#reportDialog"))closeReport()};
$("[data-report-confirm]").onclick=async event=>{
  if(!pendingReportId)return;event.currentTarget.disabled=true;
  try{await api(`/api/owner/reviews/${pendingReportId}/report`,jsonPost({reason:"Küfür / hakaret bildirimi"}));closeReport();show("Bildirim yönetici incelemesine gönderildi.","good")}catch(error){show(error.message,"bad")}finally{event.currentTarget.disabled=false}
};

function jsonPost(value){return{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)}}
function fileData(file){return new Promise((resolve,reject)=>{const reader=new FileReader;reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
function show(text,tone){const box=$("#ownerMessage");box.className=`message ${tone}`;box.textContent=text;box.scrollIntoView({behavior:"smooth",block:"center"})}
function approval(value){return({pending:"Onay bekliyor",approved:"Onaylandı",rejected:"Reddedildi"})[value]||value}
function statusName(value){return({online:"Çevrimiçi",maintenance:"Bakımda",offline:"Kapalı"})[value]||"Kapalı"}
function date(value){return new Date(`${value}Z`).toLocaleString("tr-TR")}
function esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]))}
load().catch(()=>location.href="/giris/");
