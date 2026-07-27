const $=selector=>document.querySelector(selector);
const messageBox=$("#profileMessage");
const state={
  user:null,
  reviews:[],
  community:{servers:[],suggestions:[],ownedServers:[],playingServers:[]},
  profile:null,
  played:new Map(),
  editingReview:null
};

async function api(url,options={}){
  const response=await fetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"İşlem başarısız.");
  return data;
}

async function init({preservePlayed=false}={}){
  const me=await api("/api/auth/me");
  if(!me.user){location.href="/giris/";return}
  state.user=me.user;
  const [reviews,community,profile]=await Promise.all([
    api("/api/profile/reviews"),
    api("/api/profile/community"),
    api(`/api/users/${me.user.id}/profile`)
  ]);
  state.reviews=reviews.reviews||[];
  state.community={
    servers:community.servers||[],
    suggestions:community.suggestions||[],
    ownedServers:community.ownedServers||[],
    playingServers:community.playingServers||[]
  };
  state.profile=profile;
  if(!preservePlayed){
    state.played=new Map(state.community.playingServers.map(item=>[
      Number(item.server_id),
      {selected:true,characterName:item.character_name||""}
    ]));
  }
  fillIdentity();
  renderServers($("#serverSearch").value||"");
  renderReviews();
  renderBadges();
  renderSuggestions();
  renderOwnerAccess();
}

function fillIdentity(){
  $("#displayName").value=state.user.displayName;
  $("#gameAlias").value=state.user.gameAlias||"";
  $("#bio").value=state.user.bio||"";
  $("#email").value=state.user.email;
  $("#profileGreeting").textContent=`Merhaba, ${state.user.displayName}`;
}

function renderOwnerAccess(){
  const isOwner=state.user.role==="owner"||state.community.ownedServers.length>0;
  $("#ownerPanelLink").classList.toggle("hidden",!isOwner);
}

function renderServers(query=""){
  const term=query.toLocaleLowerCase("tr-TR").trim();
  const matching=state.community.servers.filter(server=>server.name.toLocaleLowerCase("tr-TR").includes(term));
  $("#playingServers").innerHTML=matching.length?matching.map(server=>{
    const current=state.played.get(Number(server.id))||{selected:false,characterName:""};
    return `<article class="server-choice character-server" data-played-server="${server.id}">
      <label><input type="checkbox" value="${server.id}" ${current.selected?"checked":""}><span>${esc(server.name)}</span></label>
      <input class="character-name" maxlength="40" value="${esc(current.characterName)}" placeholder="Bu sunucudaki karakter adı" ${current.selected?"":"disabled"}>
    </article>`;
  }).join(""):'<div class="empty-state">Sunucu bulunamadı.</div>';

  document.querySelectorAll("[data-played-server]").forEach(row=>{
    const id=Number(row.dataset.playedServer);
    const checkbox=row.querySelector('input[type="checkbox"]');
    const character=row.querySelector(".character-name");
    checkbox.onchange=()=>{
      if(checkbox.checked&&selectedCount()>=20){
        checkbox.checked=false;
        show("En fazla 20 sunucu seçebilirsiniz.","bad");
        return;
      }
      character.disabled=!checkbox.checked;
      state.played.set(id,{selected:checkbox.checked,characterName:character.value});
      if(checkbox.checked)character.focus();
    };
    character.oninput=()=>state.played.set(id,{selected:checkbox.checked,characterName:character.value});
  });
}

function selectedCount(){
  return [...state.played.values()].filter(item=>item.selected).length;
}

function renderReviews(){
  $("#myReviews").innerHTML=state.reviews.length?`<div class="review-card-list">${state.reviews.map(review=>`
    <article>
      <div><small>${formatDate(review.created_at)}</small><h3>${esc(review.server_name)}</h3>
        <span class="stars" aria-label="${review.rating} puan">${"★".repeat(review.rating)}${"☆".repeat(5-review.rating)}</span>
        <p>${esc(review.comment)}</p>
      </div>
      <button class="outline" type="button" data-edit-review="${review.id}">Düzenle</button>
    </article>`).join("")}</div>`:'<div class="empty-state">Henüz oy veya yorum yok.</div>';
  document.querySelectorAll("[data-edit-review]").forEach(button=>button.onclick=()=>openEditor(Number(button.dataset.editReview)));
}

function openEditor(id){
  state.editingReview=state.reviews.find(review=>Number(review.id)===id);
  if(!state.editingReview)return;
  $("#editRating").value=state.editingReview.rating;
  $("#editComment").value=state.editingReview.comment;
  $("#editReviewMessage").textContent="";
  $("#editReviewDialog").showModal();
}

function renderBadges(){
  const badges=badgesFor(state.profile.stats,state.community.ownedServers.length);
  $("#profileBadges").innerHTML=badges.slice(0,4).map(badge=>`<span class="profile-badge">${badge.icon} ${badge.name}</span>`).join("");
  $("#badgeDetails").innerHTML=badges.map(badge=>`
    <article><span aria-hidden="true">${badge.icon}</span><div><strong>${badge.name}</strong><p>${badge.text}</p></div></article>`).join("");
}

function renderSuggestions(){
  $("#communityHistory").innerHTML=state.community.suggestions.length?state.community.suggestions.map(item=>`
    <article class="request-card">
      <span class="status ${esc(item.status)}">${statusText(item.status)}</span>
      <small>Öneri · ${formatDate(item.created_at)}</small>
      <h3>${esc(item.subject)}</h3><p>${esc(item.message)}</p>
    </article>`).join(""):'<div class="empty-state">Henüz öneriniz yok.</div>';
}

$("#profileForm").onsubmit=async event=>{
  event.preventDefault();
  try{
    syncVisiblePlayedRows();
    const playedServers=[...state.played.entries()].filter(([,item])=>item.selected).map(([serverId,item])=>({
      serverId,
      characterName:item.characterName.trim()
    }));
    await api("/api/profile",jsonPut({
      displayName:$("#displayName").value,
      gameAlias:$("#gameAlias").value,
      bio:$("#bio").value,
      playedServers
    }));
    show("Profil güncellendi.","good");
    await init();
  }catch(error){
    show(error.message,"bad");
  }
};

function syncVisiblePlayedRows(){
  document.querySelectorAll("[data-played-server]").forEach(row=>{
    const checkbox=row.querySelector('input[type="checkbox"]');
    state.played.set(Number(row.dataset.playedServer),{
      selected:checkbox.checked,
      characterName:row.querySelector(".character-name").value
    });
  });
}

$("#editReviewForm").onsubmit=async event=>{
  event.preventDefault();
  if(!state.editingReview)return;
  try{
    await api(`/api/reviews/${state.editingReview.id}`,jsonPut({
      rating:Number($("#editRating").value),
      comment:$("#editComment").value
    }));
    $("#editReviewDialog").close();
    show("Puan ve yorum güncellendi.","good");
    await init({preservePlayed:true});
  }catch(error){
    $("#editReviewMessage").textContent=error.message;
  }
};

$("#passwordForm").onsubmit=async event=>{
  event.preventDefault();
  try{
    await api("/api/profile/password",jsonPut({
      oldPassword:$("#oldPassword").value,
      newPassword:$("#newPassword").value
    }));
    location.href="/giris/";
  }catch(error){
    show(error.message,"bad");
  }
};

$("#suggestionForm").onsubmit=async event=>{
  event.preventDefault();
  try{
    await api("/api/profile/suggestions",jsonPost({
      subject:$("#suggestionSubject").value,
      message:$("#suggestionMessage").value
    }));
    event.target.reset();
    show("Öneriniz alındı.","good");
    await init({preservePlayed:true});
  }catch(error){
    show(error.message,"bad");
  }
};

$("#serverSearch").oninput=event=>{
  syncVisiblePlayedRows();
  renderServers(event.target.value);
};
$("#closeEditReview").onclick=()=>$("#editReviewDialog").close();
$("#editReviewDialog").onclick=event=>{if(event.target===$("#editReviewDialog"))event.target.close()};
$("#logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.href="/"};

function badgesFor(stats,ownedCount){
  const badges=[{icon:"✦",name:"Topluluk Üyesi",text:"SRO RATING topluluğunun bir üyesi."}];
  if(Number(stats.reviews)>=1)badges.push({icon:"★",name:"İlk Değerlendirme",text:"İlk sunucu değerlendirmesini yayımladı."});
  if(Number(stats.reviews)>=5)badges.push({icon:"🏆",name:"Deneyimli Yorumcu",text:"En az 5 sunucuyu değerlendirdi."});
  if(Number(stats.likes)>=10)badges.push({icon:"♥",name:"Topluluk Desteği",text:"Yorumları topluluktan en az 10 beğeni aldı."});
  if(ownedCount)badges.push({icon:"♛",name:"Sunucu Sahibi",text:"Yönetici tarafından atanmış sunucu sahibi."});
  return badges;
}

function installNotificationButton(){
  if(document.querySelector("[data-notification-toggle]"))return;
  const button=document.createElement("button");
  button.type="button";
  button.className="outline notification-link";
  button.dataset.notificationToggle="";
  button.innerHTML="🔔 Bildirimler <b></b>";
  document.querySelector(".topbar nav").prepend(button);
}

function jsonPut(value){return{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(value)}}
function jsonPost(value){return{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)}}
function statusText(value){return({new:"Yeni",reviewed:"İncelendi",closed:"Kapandı"})[value]||value}
function formatDate(value){return new Date(`${value}Z`).toLocaleString("tr-TR")}
function show(text,className){
  messageBox.className=`message ${className}`;
  messageBox.textContent=text;
  scrollTo({top:0,behavior:"smooth"});
}
function esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]))}

installNotificationButton();
init().catch(()=>{location.href="/giris/"});
