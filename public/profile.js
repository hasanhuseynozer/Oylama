const $=s=>document.querySelector(s),msg=$("#profileMessage");
async function api(u,o={}){const r=await fetch(u,o),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"İşlem başarısız.");return d}
async function init(){
  const me=await api("/api/auth/me");if(!me.user)return location.href="/giris/";
  $("#displayName").value=me.user.displayName;$("#email").value=me.user.email;$("#profileGreeting").textContent=`Merhaba, ${me.user.displayName}`;
  const [reviews,community]=await Promise.all([api("/api/profile/reviews"),api("/api/profile/community")]);
  $("#myReviews").innerHTML=reviews.reviews.length?`<table><thead><tr><th>Sunucu</th><th>Puan</th><th>Yorum</th><th>Tarih</th></tr></thead><tbody>${reviews.reviews.map(r=>`<tr><td>${esc(r.server_name)}</td><td>${"★".repeat(r.rating)}</td><td>${esc(r.comment)}</td><td>${date(r.created_at)}</td></tr>`).join("")}</tbody></table>`:"Henüz oy veya yorum yok.";
  $("#ownerPanelLink").classList.toggle("hidden",!community.ownedServers.length);
  const items=[...community.requests.map(x=>({title:x.server_name,text:x.description,status:x.status,date:x.created_at,type:"Sunucu isteği"})),...community.suggestions.map(x=>({title:x.subject,text:x.message,status:x.status,date:x.created_at,type:"Öneri"}))];
  $("#communityHistory").innerHTML=items.length?items.map(x=>`<article class="request-card"><span class="status ${x.status}">${status(x.status)}</span><small>${x.type} · ${date(x.date)}</small><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></article>`).join(""):"Henüz başvuru veya öneriniz yok.";
}
$("#profileForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/profile",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({displayName:$("#displayName").value})});show("Profil güncellendi.","good")}catch(e){show(e.message,"bad")}};
$("#passwordForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/profile/password",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({oldPassword:$("#oldPassword").value,newPassword:$("#newPassword").value})});alert("Şifre değiştirildi. Yeniden giriş yapın.");location.href="/giris/"}catch(e){show(e.message,"bad")}};
$("#serverRequestForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/profile/server-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({serverName:$("#requestServerName").value,websiteUrl:$("#requestWebsite").value,description:$("#requestDescription").value})});show("Sunucu isteğiniz yöneticiye gönderildi.","good");e.target.reset();await init()}catch(e){show(e.message,"bad")}};
$("#suggestionForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/profile/suggestions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subject:$("#suggestionSubject").value,message:$("#suggestionMessage").value})});show("Öneriniz alındı. Teşekkürler!","good");e.target.reset();await init()}catch(e){show(e.message,"bad")}};
$("#logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.href="/"};
function show(t,c){msg.className=`message ${c}`;msg.textContent=t;scrollTo({top:0,behavior:"smooth"})}
function status(v){return({pending:"Bekliyor",approved:"Onaylandı",rejected:"Reddedildi",new:"Yeni",reviewed:"İncelendi",closed:"Kapandı"})[v]||v}
function date(v){return new Date(v+"Z").toLocaleString("tr-TR")}function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
init().catch(()=>location.href="/giris/");
