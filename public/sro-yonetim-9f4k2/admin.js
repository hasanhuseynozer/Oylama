const $=selector=>document.querySelector(selector);
let data={servers:[],reviews:[],users:[],settings:{},requests:[],changes:[],reports:[],suggestions:[]};
let lastServerSnapshot=null;

async function api(url,options={}){
  const response=await fetch(url,options);
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(payload.error||"İşlem başarısız.");
    error.status=response.status;
    throw error;
  }
  return payload;
}

function confirmAction(message,title="İşlemi onayla"){
  let dialog=$("#adminActionDialog");
  if(!dialog){dialog=document.createElement("dialog");dialog.id="adminActionDialog";dialog.className="action-dialog";dialog.innerHTML='<button class="close" type="button">×</button><div class="action-dialog-icon">!</div><h2></h2><p></p><div class="dialog-actions"><button class="outline" type="button" data-cancel>Vazgeç</button><button class="primary danger" type="button" data-accept>Onayla</button></div>';document.body.append(dialog)}
  dialog.querySelector("h2").textContent=title;dialog.querySelector("p").textContent=message;dialog.showModal();
  return new Promise(resolve=>{const finish=value=>{dialog.close();resolve(value)};dialog.querySelector("[data-accept]").onclick=()=>finish(true);dialog.querySelector("[data-cancel]").onclick=dialog.querySelector(".close").onclick=()=>finish(false);dialog.onclick=event=>{if(event.target===dialog)finish(false)}});
}

$("#adminLogin").onsubmit=async event=>{
  event.preventDefault();
  try{
    await api("/api/admin/login",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({password:$("#adminPassword").value})
    });
    $("#loginMessage").textContent="";
    await load();
  }catch(error){
    $("#loginMessage").textContent=error.message;
  }
};

$("#adminLogout").onclick=async()=>{
  await api("/api/admin/logout",{method:"POST"});
  location.reload();
};

document.querySelectorAll(".tab").forEach(button=>button.onclick=()=>{
  document.querySelectorAll(".tab").forEach(item=>item.classList.toggle("active",item===button));
  document.querySelectorAll(".tab-content").forEach(section=>section.classList.add("hidden"));
  $(`#tab-${button.dataset.tab}`).classList.remove("hidden");
});

async function load(){
  try{
    const dashboard=await api("/api/admin/dashboard");
    data={
      ...dashboard,
      servers:dashboard.servers||[],
      reviews:dashboard.reviews||[],
      users:dashboard.users||[],
      settings:dashboard.settings||{},
      requests:dashboard.requests||[],
      changes:dashboard.changes||[],
      reports:dashboard.reports||[],
      suggestions:dashboard.suggestions||[]
    };
    $("#loginView").classList.add("hidden");
    $("#dashboard").classList.remove("hidden");
    render();
  }catch(error){
    if(error.status!==401)show(error.message,"bad");
  }
}

function render(){
  renderStats();
  renderServers();
  renderReviews();
  renderUsers();
  renderRequests();
  renderChanges();
  renderReports();
  renderSuggestions();
  renderSettings();
}

function renderStats(){
  const votes=data.servers.reduce((total,server)=>total+Number(server.vote_count||0),0);
  const items=[
    [data.servers.length,"Sunucu"],
    [votes,"Oy"],
    [data.users.length,"Kullanıcı"],
    [data.changes.filter(item=>item.status==="pending").length,"Değişiklik Onayı"],
    [data.reports.filter(item=>item.status==="pending").length,"Bildirim"]
  ];
  $("#stats").innerHTML=items.map(([value,label])=>`<div class="stat"><strong>${value}</strong>${label}</div>`).join("");
}

function renderServers(){
  const picker=$("#adminServerPicker"),selected=picker?.value;
  if(picker){picker.innerHTML='<option value="">Düzenlenecek sunucuyu seçin…</option>'+data.servers.map(server=>`<option value="${server.id}">${esc(server.name)}</option>`).join("");picker.value=selected||""}
  const reviewPicker=$("#adminReviewServer"),reviewSelected=reviewPicker?.value;
  if(reviewPicker){reviewPicker.innerHTML='<option value="">Tüm sunucular</option>'+data.servers.map(server=>`<option value="${server.id}">${esc(server.name)}</option>`).join("");reviewPicker.value=reviewSelected||""}
  $("#serversTable").innerHTML=`<div class="admin-server-directory">${data.servers.map(server=>`<article class="admin-server-row">
    <div class="admin-server-identity"><span class="server-status-dot ${esc(server.operational_status||"offline")}"></span><div><b>${esc(server.name)}</b><small>${esc(server.server_type)} · CAP ${server.cap}</small></div></div>
    <div class="admin-server-metrics"><span><strong>${Number(server.average_rating||0).toFixed(1)}</strong> Puan</span><span><strong>${server.vote_count||0}</strong> Oy</span><span class="status ${server.is_active?"approved":"pending"}">${server.is_active?"Yayında":"Gizli"}</span></div>
    <div class="table-actions"><button class="tiny primary" data-action="edit-server" data-id="${server.id}">Yönet</button><button class="tiny danger" data-action="delete-server" data-id="${server.id}">Sil</button></div>
  </article>`).join("")}</div>`;
}

function renderReviews(){
  const query=String($("#adminReviewSearch")?.value||"").toLocaleLowerCase("tr-TR"),serverId=$("#adminReviewServer")?.value||"",rating=$("#adminReviewRating")?.value||"";
  const rows=data.reviews.filter(review=>(!query||`${review.display_name} ${review.comment}`.toLocaleLowerCase("tr-TR").includes(query))&&(!serverId||String(review.server_id)===serverId)&&(!rating||String(review.rating)===rating));
  $("#adminReviewCount").textContent=`${rows.length} sonuç`;
  $("#reviewsTable").innerHTML=rows.length?`<table><thead><tr><th>Sunucu</th><th>Kullanıcı</th><th>Puan</th><th>Yorum</th><th>İşlem</th></tr></thead><tbody>${rows.map(review=>`
    <tr><td>${esc(review.server_name)}</td><td>${esc(review.display_name)}</td><td class="stars">${"★".repeat(review.rating)}</td><td>${esc(review.comment)}</td>
    <td><button class="tiny danger" data-action="delete-review" data-id="${review.id}">Sil</button></td></tr>`).join("")}</tbody></table>`:"<div class=\"empty-state\">Henüz yorum yok.</div>";
}

function renderUsers(){
  const query=String($("#adminUserSearch")?.value||"").toLocaleLowerCase("tr-TR"),role=$("#adminUserRole")?.value||"",status=$("#adminUserStatus")?.value||"";
  const users=data.users.filter(user=>(!query||`${user.display_name} ${user.email}`.toLocaleLowerCase("tr-TR").includes(query))&&(!role||user.account_role===role)&&(!status||user.status===status));
  $("#adminUserCount").textContent=`${users.length} sonuç`;
  const serverOptions='<option value="">Sunucu seçin</option>'+data.servers.map(server=>`<option value="${server.id}">${esc(server.name)}</option>`).join("");
  $("#usersTable").innerHTML=`<table><thead><tr><th>Kullanıcı</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>Sunucu Sahipliği</th><th>Hesap</th></tr></thead><tbody>${users.map(user=>`
    <tr data-user-row="${user.id}">
      <td><b>${esc(user.display_name)}</b></td>
      <td>${esc(user.email)}</td>
      <td><span class="role-pill ${esc(user.account_role||"user")}">${user.account_role==="owner"?"Sunucu Sahibi":"Kullanıcı"}</span></td>
      <td>${user.status==="active"?"Aktif":"Engelli"}</td>
      <td><div class="owner-assign-control"><select data-owner-server>${serverOptions}</select><button class="tiny primary" data-action="assign-owner" data-id="${user.id}">Sahipliği Ata</button></div></td>
      <td><div class="user-actions">
        <button class="tiny" data-action="set-role" data-id="${user.id}" data-role="${user.account_role==="owner"?"user":"owner"}">${user.account_role==="owner"?"Normal Kullanıcı Yap":"Yalnızca Rol Ver"}</button>
        <button class="tiny" data-action="toggle-user" data-id="${user.id}" data-status="${user.status==="active"?"blocked":"active"}">${user.status==="active"?"Engelle":"Aç"}</button>
        <button class="tiny danger" data-action="delete-user" data-id="${user.id}">Sil</button>
      </div></td>
    </tr>`).join("")}</tbody></table>`;

  const ownerSelect=$("#serverOwner");
  const selected=ownerSelect.value;
  ownerSelect.innerHTML='<option value="">Atanmamış</option>'+data.users.filter(user=>user.status==="active").map(user=>`<option value="${user.id}">${esc(user.display_name)} · ${esc(user.email)}</option>`).join("");
  ownerSelect.value=selected;
}

function renderRequests(){
  $("#requestsTable").innerHTML=data.requests.length?data.requests.map(request=>`
    <article class="request-card"><span class="status ${esc(request.status)}">${esc(request.status)}</span>
      <small>${esc(request.display_name)} · ${esc(request.email)}</small><h3>${esc(request.server_name)}</h3><p>${esc(request.description)}</p>
      ${request.website_url?`<a href="${esc(request.website_url)}" target="_blank" rel="noopener">Web sitesi ↗</a>`:""}
      ${request.status==="pending"?`<div class="card-actions"><button class="primary" data-action="request" data-id="${request.id}" data-status="approved">Onayla</button><button class="outline danger" data-action="request" data-id="${request.id}" data-status="rejected">Reddet</button></div>`:""}
    </article>`).join(""):"<div class=\"empty-state\">Bekleyen başvuru yok.</div>";
}

function renderChanges(){
  $("#changesTable").innerHTML=data.changes.length?data.changes.map(change=>`
    <article class="request-card"><span class="status ${esc(change.status)}">${esc(change.status)}</span>
      <small>${esc(change.display_name)}</small><h3>${esc(change.server_name)}</h3><p>${esc(change.description)}</p>
      <div class="server-links">${externalLink("Web",change.website_url)}${externalLink("Discord",change.discord_url)}${externalLink("Tanıtım",change.promo_url)}</div>
      ${change.image_url?`<img class="media-preview" src="${esc(change.image_url)}" alt="Yeni görsel">`:""}
      ${change.status==="pending"?`<div class="card-actions"><button class="primary" data-action="change" data-id="${change.id}" data-status="approved">Onayla</button><button class="outline danger" data-action="change" data-id="${change.id}" data-status="rejected">Reddet</button></div>`:""}
    </article>`).join(""):"<div class=\"empty-state\">Değişiklik isteği yok.</div>";
}

function renderReports(){
  $("#reportsTable").innerHTML=data.reports.length?data.reports.map(report=>`
    <article class="request-card"><span class="status ${esc(report.status)}">${esc(report.status)}</span>
      <small>${esc(report.reporter_name)} · ${esc(report.server_name)}</small><h3>${esc(report.reason)}</h3><blockquote>${esc(report.comment)}</blockquote>
      ${report.status==="pending"?`<div class="card-actions"><button class="primary danger" data-action="report" data-id="${report.id}" data-status="approved">Yorumu ve Puanı Sil</button><button class="outline" data-action="report" data-id="${report.id}" data-status="rejected">Bildirimi Reddet</button></div>`:""}
    </article>`).join(""):"<div class=\"empty-state\">Bekleyen bildirim yok.</div>";
}

function renderSuggestions(){
  $("#suggestionsTable").innerHTML=data.suggestions.length?data.suggestions.map(suggestion=>`
    <article class="request-card"><span class="status ${esc(suggestion.status)}">${esc(suggestion.status)}</span>
      <small>${esc(suggestion.display_name)} · ${esc(suggestion.email)}</small><h3>${esc(suggestion.subject)}</h3><p>${esc(suggestion.message)}</p>
      ${suggestion.status==="new"?`<button class="primary" data-action="suggestion" data-id="${suggestion.id}" data-status="reviewed">İncelendi İşaretle</button>`:""}
    </article>`).join(""):"<div class=\"empty-state\">Henüz öneri yok.</div>";
}

function renderSettings(){
  Object.entries(data.settings).forEach(([key,value])=>{
    const element=document.getElementById(key);
    if(element)element.value=value||"";
    preview(key,value);
  });
}

document.addEventListener("click",async event=>{
  const button=event.target.closest("[data-action]");
  if(!button)return;
  const action=button.dataset.action,id=Number(button.dataset.id);
  try{
    button.disabled=true;
    if(action==="edit-server"){editServer(id);return}
    if(action==="delete-server"&&await confirmAction("Sunucu ve bağlı yorumlar kalıcı olarak silinecek."))await api(`/api/admin/servers/${id}`,{method:"DELETE"});
    else if(action==="reset-server"&&await confirmAction("Bu sunucunun oy ve yorumları sıfırlanacak."))await api(`/api/admin/servers/${id}/reset`,{method:"POST"});
    else if(action==="delete-review"&&await confirmAction("Seçili yorum kalıcı olarak silinecek."))await api(`/api/admin/reviews/${id}`,{method:"DELETE"});
    else if(action==="toggle-user")await api(`/api/admin/users/${id}/status`,jsonPut({status:button.dataset.status}));
    else if(action==="set-role")await api(`/api/admin/users/${id}/role`,jsonPut({role:button.dataset.role}));
    else if(action==="assign-owner"){
      const serverId=Number(button.closest("[data-user-row]").querySelector("[data-owner-server]").value);
      if(!serverId)throw new Error("Önce bir sunucu seçin.");
      await api(`/api/admin/users/${id}/assign-server`,jsonPost({serverId}));
    }else if(action==="delete-user"&&await confirmAction("Kullanıcı hesabı kalıcı olarak silinecek."))await api(`/api/admin/users/${id}`,{method:"DELETE"});
    else if(action==="request"){
      if(!await confirmAction(button.dataset.status==="approved"?"Sunucu başvurusu onaylanacak.":"Sunucu başvurusu reddedilecek."))return;
      await api(`/api/admin/server-requests/${id}`,jsonPut({status:button.dataset.status}));
    }else if(action==="change")await api(`/api/admin/server-changes/${id}`,jsonPut({status:button.dataset.status}));
    else if(action==="report"){
      if(button.dataset.status==="approved"&&!await confirmAction("Yorum ve verdiği puan kalıcı olarak silinecek."))return;
      await api(`/api/admin/reports/${id}`,jsonPut({status:button.dataset.status}));
    }else if(action==="suggestion")await api(`/api/admin/suggestions/${id}`,jsonPut({status:button.dataset.status}));
    else return;
    await load();
    show(action==="assign-owner"?"Sunucu sahipliği ve panel yetkisi birlikte atandı.":"İşlem tamamlandı.","good");
  }catch(error){
    show(error.message,"bad");
  }finally{
    button.disabled=false;
  }
});

function installAdminControls(){
  const serverTab=$("#tab-servers"),layout=serverTab.querySelector(".two-col"),form=$("#serverForm"),directory=$("#serversTable").closest(".panel");
  const toolbar=document.createElement("div");
  toolbar.className="admin-section-toolbar";
  toolbar.innerHTML='<div><p class="eyebrow">SUNUCU YÖNETİMİ</p><h2>Kayıt seçin veya yeni sunucu oluşturun</h2><p>Sunucu listesi ile düzenleme formu birbirinden ayrıldı.</p></div><div class="admin-server-picker"><select id="adminServerPicker"><option value="">Düzenlenecek sunucuyu seçin…</option></select><button id="adminNewServer" class="primary" type="button">+ Yeni Sunucu</button></div>';
  serverTab.prepend(toolbar);layout.classList.add("server-management-layout");form.classList.add("server-editor-panel");directory.classList.add("server-directory-panel");
  const editorHead=document.createElement("div");editorHead.className="editor-context";editorHead.innerHTML='<div><span id="adminEditorBadge">YENİ KAYIT</span><p>Kaydetmeden önce sunucu bilgilerini ve görsel önizlemesini kontrol edin.</p></div><button id="adminUndoServer" class="outline hidden" type="button">Son Değişikliği Geri Al</button>';form.prepend(editorHead);
  $("#adminServerPicker").onchange=event=>event.target.value?editServer(Number(event.target.value)):resetServerForm();
  $("#adminNewServer").onclick=()=>{resetServerForm();$("#serverName").focus()};
  $("#adminUndoServer").onclick=async()=>{if(!lastServerSnapshot)return;const snapshot=lastServerSnapshot;await api(`/api/admin/servers/${snapshot.id}`,jsonPut(serverPayload(snapshot)));lastServerSnapshot=null;$("#adminUndoServer").classList.add("hidden");await load();editServer(snapshot.id);show("Son sunucu değişikliği geri alındı.","good")};
  const addFilter=(container,html)=>{const bar=document.createElement("div");bar.className="admin-filter-bar";bar.innerHTML=html;container.querySelector("h2").after(bar)};
  addFilter($("#tab-reviews"),'<input id="adminReviewSearch" type="search" placeholder="Kullanıcı veya yorum ara…"><select id="adminReviewServer"><option value="">Tüm sunucular</option></select><select id="adminReviewRating"><option value="">Tüm puanlar</option><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select><span id="adminReviewCount"></span>');
  addFilter($("#tab-users"),'<input id="adminUserSearch" type="search" placeholder="Kullanıcı veya e-posta ara…"><select id="adminUserRole"><option value="">Tüm roller</option><option value="user">Kullanıcı</option><option value="owner">Sunucu Sahibi</option></select><select id="adminUserStatus"><option value="">Tüm durumlar</option><option value="active">Aktif</option><option value="blocked">Engelli</option></select><span id="adminUserCount"></span>');
  ["adminReviewSearch","adminReviewServer","adminReviewRating"].forEach(id=>document.getElementById(id).addEventListener(id.includes("Search")?"input":"change",renderReviews));
  ["adminUserSearch","adminUserRole","adminUserStatus"].forEach(id=>document.getElementById(id).addEventListener(id.includes("Search")?"input":"change",renderUsers));
  const guides={logo_image:["Logo","Önerilen 640 × 240 px · şeffaf PNG/WebP"],banner_image:["Banner / GIF","Önerilen 1400 × 180 px · merkezde güvenli alan"],left_ad_image:["Sol reklam","Önerilen 260 × 1200 px · dikey tasarım"],right_ad_image:["Sağ reklam","Önerilen 260 × 1200 px · dikey tasarım"]};
  Object.entries(guides).forEach(([key,[title,text]])=>{const label=document.querySelector(`[data-upload="${key}"]`)?.closest("label");if(label){label.classList.add("upload-spec-card");label.insertAdjacentHTML("afterbegin",`<span class="upload-spec-title">${title}</span><small>${text}</small>`)}});
}

installAdminControls();

const ownerLabel=document.createElement("label");
ownerLabel.innerHTML='Sunucu sahibi<select id="serverOwner"><option value="">Atanmamış</option></select>';
document.querySelector(".server-meta-form").append(ownerLabel);

const scheduleBox=document.createElement("div");
scheduleBox.className="admin-schedule-fields";
scheduleBox.innerHTML='<label>Beta tarih ve saati<input id="serverBetaAt" type="datetime-local"></label><label>Açılış tarih ve saati<input id="serverLaunchAt" type="datetime-local"></label><label>Sunucu durumu<select id="serverOperationalStatus"><option value="online">Çevrimiçi</option><option value="maintenance">Bakımda</option><option value="offline">Kapalı</option></select></label><label>Durum açıklaması<input id="serverStatusNote" maxlength="120" placeholder="Örn. Planlı bakım"></label>';
$("#serverDescription").parentElement.before(scheduleBox);

$("#serverForm").onsubmit=async event=>{
  event.preventDefault();
  const id=$("#serverId").value;
  const payload={
    name:$("#serverName").value,
    description:$("#serverDescription").value,
    cap:Number($("#serverCap").value),
    server_type:$("#serverType").value,
    opened_at:$("#serverOpenedAt").value,
    beta_at:$("#serverBetaAt").value,
    launch_at:$("#serverLaunchAt").value,
    operational_status:$("#serverOperationalStatus").value,
    status_note:$("#serverStatusNote").value,
    website_url:$("#serverWebsite").value,
    discord_url:$("#serverDiscord").value,
    promo_url:$("#serverPromo").value,
    image_url:$("#serverImage").value,
    is_active:$("#serverActive").checked,
    owner_user_id:$("#serverOwner").value?Number($("#serverOwner").value):null
  };
  try{
    if(id)lastServerSnapshot={...data.servers.find(item=>Number(item.id)===Number(id))};
    await api(id?`/api/admin/servers/${id}`:"/api/admin/servers",{
      method:id?"PUT":"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(payload)
    });
    resetServerForm();
    await load();
    if(lastServerSnapshot)$("#adminUndoServer").classList.remove("hidden");
    show("Sunucu, takvim ve sahiplik bilgileri kaydedildi.","good");
  }catch(error){
    show(error.message,"bad");
  }
};

$("#serverCancel").onclick=resetServerForm;

function editServer(id){
  const server=data.servers.find(item=>Number(item.id)===id);
  if(!server)return;
  $("#serverId").value=server.id;
  $("#serverName").value=server.name;
  $("#serverDescription").value=server.description;
  $("#serverCap").value=server.cap;
  $("#serverType").value=server.server_type;
  $("#serverOpenedAt").value=server.opened_at||"";
  $("#serverBetaAt").value=server.beta_at||"";
  $("#serverLaunchAt").value=server.launch_at||"";
  $("#serverOperationalStatus").value=server.operational_status||"offline";
  $("#serverStatusNote").value=server.status_note||"";
  $("#serverWebsite").value=server.website_url||"";
  $("#serverDiscord").value=server.discord_url||"";
  $("#serverPromo").value=server.promo_url||"";
  $("#serverImage").value=server.image_url||"";
  $("#serverOwner").value=server.owner_user_id||"";
  $("#serverActive").checked=Boolean(server.is_active);
  previewServer(server.image_url||"");
  $("#serverFormTitle").textContent="Sunucu Düzenle";
  $("#adminEditorBadge").textContent="DÜZENLEME MODU";
  $("#adminServerPicker").value=String(server.id);
  $("#serverCancel").classList.remove("hidden");
  $("#serverForm").scrollIntoView({behavior:"smooth",block:"start"});
}

function resetServerForm(){
  $("#serverForm").reset();
  $("#serverId").value="";
  $("#serverCap").value=110;
  $("#serverType").value="EU/CH";
  $("#serverOperationalStatus").value="offline";
  $("#serverActive").checked=true;
  $("#serverImage").value="";
  $("#serverOwner").value="";
  previewServer("");
  $("#serverFormTitle").textContent="Sunucu Ekle";
  $("#adminEditorBadge").textContent="YENİ KAYIT";
  $("#adminServerPicker").value="";
  $("#serverCancel").classList.add("hidden");
}

$("#settingsForm").onsubmit=async event=>{
  event.preventDefault();
  const keys=["logo_image","banner_text","banner_url","banner_image","left_ad_text","left_ad_url","left_ad_image","right_ad_text","right_ad_url","right_ad_image","contact_text","disclaimer_text","footer_tagline","twitch_url","kick_url","youtube_url"];
  const payload=Object.fromEntries(keys.map(key=>[key,document.getElementById(key).value]));
  try{
    await api("/api/admin/settings",jsonPut(payload));
    show("Site ayarları kaydedildi.","good");
    await load();
  }catch(error){
    show(error.message,"bad");
  }
};

document.querySelectorAll("[data-upload]").forEach(input=>input.onchange=async()=>{
  try{
    show("Görsel hazırlanıyor…","good");
    const url=await imageData(input.files[0]);
    document.getElementById(input.dataset.upload).value=url;
    preview(input.dataset.upload,url);
    $("#settingsForm").requestSubmit();
  }catch(error){
    show(error.message,"bad");
  }
});

$("#serverImageFile").onchange=async()=>{
  try{
    const url=await imageData($("#serverImageFile").files[0]);
    $("#serverImage").value=url;
    previewServer(url);
    show("Sunucu görseli hazır.","good");
  }catch(error){
    show(error.message,"bad");
  }
};

async function imageData(file){
  if(!file)return"";
  if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type))throw new Error("PNG, JPG, WebP veya GIF seçin.");
  const read=()=>new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
  if(file.type==="image/gif"){
    if(file.size>307200)throw new Error("Animasyonlu GIF en fazla 300 KB olabilir.");
    return read();
  }
  const source=await read();
  const image=await new Promise((resolve,reject)=>{
    const item=new Image();
    item.onload=()=>resolve(item);
    item.onerror=reject;
    item.src=source;
  });
  const scale=Math.min(1,1200/Math.max(image.width,image.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(image.width*scale);
  canvas.height=Math.round(image.height*scale);
  canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.82,.7,.58,.46]){
    const result=canvas.toDataURL("image/webp",quality);
    if(result.length<400000)return result;
  }
  throw new Error("Görsel küçültülemedi. Daha küçük bir dosya seçin.");
}

function preview(key,url){
  const image=document.querySelector(`[data-preview="${key}"]`);
  if(!image)return;
  image.src=url||"";
  image.classList.toggle("hidden",!url);
}
function previewServer(url){
  $("#serverImagePreview").src=url||"";
  $("#serverImagePreview").classList.toggle("hidden",!url);
}
function jsonPut(value){return{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(value)}}
function jsonPost(value){return{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)}}
function serverPayload(server){return{name:server.name,description:server.description,cap:Number(server.cap),server_type:server.server_type,opened_at:server.opened_at||"",beta_at:server.beta_at||"",launch_at:server.launch_at||"",operational_status:server.operational_status||"offline",status_note:server.status_note||"",website_url:server.website_url||"",discord_url:server.discord_url||"",promo_url:server.promo_url||"",image_url:server.image_url||"",is_active:Boolean(server.is_active),owner_user_id:server.owner_user_id?Number(server.owner_user_id):null}}
function externalLink(label,url){return url?`<a class="outline" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`:""}
function statusText(value){return({online:"Çevrimiçi",maintenance:"Bakımda",offline:"Kapalı"})[value]||"Kapalı"}
function show(text,className){$("#adminMessage").className=`message admin-toast ${className}`;$("#adminMessage").textContent=text}
function esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]))}

document.querySelectorAll(".brand").forEach(element=>element.innerHTML='<img class="admin-brand-logo" src="/sro-rating-header.png" alt="SRO RATING">');
load();
