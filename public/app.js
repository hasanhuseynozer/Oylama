const state={
  servers:[],user:null,settings:{},turnstileKey:"",widget:null,query:"",
  favoriteOnly:false,page:1,openServerId:null
};
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];

async function api(url,options={}){
  const response=await fetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"İşlem başarısız.");
  return data;
}

async function init(){
  const query=new URLSearchParams(location.search);
  const requestedServer=Number(query.get("server")||0);
  const requestedReview=Number(query.get("review")||0);
  const [config,me]=await Promise.all([api("/api/config"),api("/api/auth/me")]);
  state.settings=config.settings||{};
  state.turnstileKey=config.turnstileSiteKey||"";
  state.user=me.user;
  applySettings();
  renderAccount();
  setupCalendar();
  setupDiscovery();
  await loadServers();
  document.body.classList.remove("app-loading");
  if(requestedServer&&state.servers.some(server=>Number(server.id)===requestedServer)){
    history.replaceState(null,"",location.pathname);
    await openServer(requestedServer,false,requestedReview);
  }
}

function applySettings(){
  const settings=state.settings;
  const logo=settings.logo_image||"/sro-rating-header.png";
  $("#siteLogo").src=logo;
  setVisual($("#banner"),settings.banner_image||"/sro-rating-banner.gif");
  setVisual($("#leftSponsor"),settings.left_ad_image);
  setVisual($("#rightSponsor"),settings.right_ad_image);
  configureSponsor($("#leftSponsor"),settings.left_ad_image,settings.left_ad_text,settings.left_ad_url);
  configureSponsor($("#rightSponsor"),settings.right_ad_image,settings.right_ad_text,settings.right_ad_url);
  setLink($("#banner"),settings.banner_url);
  $("#banner").textContent="";
  $("#footerTagline").textContent=settings.footer_tagline||"Silkroad topluluğunun buluşma noktası.";
  $("#footerYear").textContent=new Date().getFullYear();
  $("#contactText").textContent=settings.contact_text||"";
  $("#disclaimerText").textContent=settings.disclaimer_text||"";
  const socials=[["Twitch",settings.twitch_url],["Kick",settings.kick_url],["YouTube",settings.youtube_url]].filter(([,url])=>url);
  $("#socials").innerHTML=socials.length?socials.map(([name,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener">${name}</a>`).join(""):"Bağlantı eklenmedi.";
  const footerBrand=document.querySelector(".footer-brand .brand");
  if(footerBrand)footerBrand.innerHTML=`<img class="footer-logo" src="${esc(logo)}" alt="SRO RATING">`;
}

function setVisual(element,url){
  element.classList.toggle("has-image",Boolean(url));
  element.style.backgroundImage=url?`url("${String(url).replaceAll('"',"%22")}")`:"";
}

function configureSponsor(element,image,text,url){
  element.classList.toggle("empty-sponsor",!image);
  element.textContent=image?"":(text||"Reklam alanı");
  setLink(element,url);
}

function setLink(element,url){
  if(url){element.href=url;element.target="_blank";element.rel="noopener nofollow"}
  else element.removeAttribute("href");
}

function renderAccount(){
  const box=$("#accountActions");
  if(!state.user)return;
  const badge=state.user.role==="owner"?"♛ Sunucu Sahibi":"✦ Üye";
  box.innerHTML=`<div class="account-menu">
    <button class="account-menu-trigger" type="button" aria-expanded="false" aria-haspopup="menu">
      <img src="/sro-rating-logo.png" alt=""><span><strong>${esc(state.user.displayName)}</strong><small>${badge}</small></span><i>⌄</i>
    </button>
    <div class="account-menu-panel hidden" role="menu">
      <a class="account-menu-item" href="/profil/" role="menuitem"><span>👤</span><span>Profilim</span></a>
      <button class="account-menu-item notification-menu-item" type="button" data-notification-toggle role="menuitem"><span>🔔</span><span>Bildirimler</span><b></b></button>
      <button id="logoutBtn" class="account-menu-item account-menu-logout" type="button" role="menuitem"><span>↪</span><span>Çıkış Yap</span></button>
    </div>
  </div>`;
  const trigger=box.querySelector(".account-menu-trigger");
  const panel=box.querySelector(".account-menu-panel");
  const closeMenu=()=>{panel.classList.add("hidden");trigger.setAttribute("aria-expanded","false")};
  trigger.onclick=()=>{const open=panel.classList.toggle("hidden")===false;trigger.setAttribute("aria-expanded",String(open))};
  box.querySelector("[data-notification-toggle]").onclick=closeMenu;
  document.addEventListener("click",event=>{if(!box.contains(event.target))closeMenu()});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeMenu()});
  $("#logoutBtn").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.reload()};
}

function setupCalendar(){
  if(!state.user)return;
  const panel=$(".account-menu-panel");
  if(!panel)return;
  const button=document.createElement("button");
  button.className="account-menu-item calendar-button";
  button.type="button";
  button.innerHTML="<span>📅</span><span>Sunucu Takvimi</span>";
  panel.prepend(button);
  const dialog=document.createElement("dialog");
  dialog.className="calendar-dialog";
  dialog.innerHTML='<button class="close" type="button" aria-label="Kapat">×</button><p class="eyebrow">SUNUCU TAKVİMİ</p><h2>Beta ve Açılış Takvimi</h2><p class="panel-lead">Tarihler yerel saatinize göre gösterilir.</p><div class="calendar-events"></div>';
  document.body.append(dialog);
  button.onclick=()=>{
    panel.classList.add("hidden");
    const events=state.servers.flatMap(server=>[["Beta",server.beta_at],["Açılış",server.launch_at]]
      .filter(([,date])=>date).map(([type,date])=>({server:server.name,type,date})))
      .sort((a,b)=>new Date(a.date)-new Date(b.date));
    dialog.querySelector(".calendar-events").innerHTML=events.length?events.map(event=>`<article><time>${new Date(event.date).toLocaleString("tr-TR")}</time><div><strong>${esc(event.server)}</strong><span>${event.type} · ${formatCountdown(event.date)}</span></div></article>`).join(""):'<div class="empty-state">Takvime eklenmiş etkinlik yok.</div>';
    dialog.showModal();
  };
  dialog.querySelector(".close").onclick=()=>dialog.close();
  dialog.onclick=event=>{if(event.target===dialog)dialog.close()};
  setInterval(updateCountdowns,60000);
}

async function loadServers(){
  const data=await api("/api/servers");
  state.servers=data.servers||[];
  fillFilters();
  renderServers();
}

function fillFilters(){
  const select=$("#capFilter");
  const current=select.value;
  [...select.options].slice(1).forEach(option=>option.remove());
  [...new Set(state.servers.map(server=>Number(server.cap)).filter(Boolean))].sort((a,b)=>a-b)
    .forEach(cap=>select.add(new Option(`CAP ${cap}`,String(cap))));
  select.value=[...select.options].some(option=>option.value===current)?current:"";
}

function setupDiscovery(){
  const filters=$(".filters");
  const status=document.createElement("select");
  status.id="statusFilter";status.setAttribute("aria-label","Sunucu durumu");
  status.innerHTML='<option value="">Tüm durumlar</option><option value="online">Çevrimiçi</option><option value="maintenance">Bakımda</option><option value="offline">Kapalı</option>';
  const rating=document.createElement("select");
  rating.id="ratingFilter";rating.setAttribute("aria-label","Minimum puan");
  rating.innerHTML='<option value="">Tüm puanlar</option><option value="4">4+ puan</option><option value="3">3+ puan</option><option value="1">Puanlanmış</option>';
  const tag=document.createElement("select");
  tag.id="tagFilter";tag.setAttribute("aria-label","Etiket");
  tag.innerHTML='<option value="">Tüm etiketler</option><option value="new">Yeni</option><option value="popular">Popüler</option><option value="high">Yüksek puan</option><option value="favorite">Favorilerim</option>';
  $("#typeFilter").after(status,rating,tag);
  if(state.user){
    const favorite=document.createElement("button");
    favorite.id="favoriteFilter";favorite.className="tiny favorite-filter";favorite.type="button";favorite.textContent="♥ Favorilerim";
    favorite.onclick=()=>{state.favoriteOnly=!state.favoriteOnly;favorite.classList.toggle("active",state.favoriteOnly);state.page=1;renderServers()};
    $("#clearFilters").before(favorite);
  }
  [...filters.querySelectorAll("select,input")].forEach(control=>control.addEventListener(control.type==="search"?"input":"change",()=>{
    state.query=$("#searchInput").value;
    state.page=1;
    renderServers();
  }));
  $("#clearFilters").onclick=()=>{
    state.page=1;state.query="";state.favoriteOnly=false;
    $("#searchInput").value="";$("#sortSelect").value="rating";
    ["#capFilter","#typeFilter","#statusFilter","#ratingFilter","#tagFilter"].forEach(selector=>$(selector).value="");
    $("#newOnly").checked=false;$("#favoriteFilter")?.classList.remove("active");renderServers();
  };
  const pagination=document.createElement("nav");
  pagination.id="serverPagination";pagination.className="server-pagination";pagination.setAttribute("aria-label","Sunucu sayfaları");
  $("#serverGrid").after(pagination);
}

function renderServers(){
  const query=state.query.toLocaleLowerCase("tr-TR").trim();
  const cap=$("#capFilter").value,type=$("#typeFilter").value,status=$("#statusFilter").value;
  const minRating=Number($("#ratingFilter").value||0),tag=$("#tagFilter").value;
  const newOnly=$("#newOnly").checked,cutoff=Date.now()-45*86400000;
  let servers=state.servers.filter(server=>{
    const tags=serverTags(server);
    const text=`${server.name} ${server.description} ${server.cap} ${server.server_type} ${tags.join(" ")}`.toLocaleLowerCase("tr-TR");
    return (!query||query.split(/\s+/).every(token=>text.includes(token)))&&
      (!cap||String(server.cap)===cap)&&(!type||server.server_type===type)&&
      (!status||server.operational_status===status)&&(!minRating||Number(server.average_rating)>=minRating)&&
      (!tag||tags.includes(tag))&&(!newOnly||new Date((server.opened_at||server.created_at)+"Z").getTime()>=cutoff)&&
      (!state.favoriteOnly||Boolean(server.is_favorite));
  });
  const sort=$("#sortSelect").value;
  servers.sort((a,b)=>sort==="comments"?Number(b.vote_count)-Number(a.vote_count):
    sort==="newest"?new Date(b.opened_at||b.created_at)-new Date(a.opened_at||a.created_at):
    Number(b.average_rating)-Number(a.average_rating)||Number(b.vote_count)-Number(a.vote_count));
  const pages=Math.max(1,Math.ceil(servers.length/8));
  state.page=Math.min(Math.max(1,state.page||1),pages);
  const visible=servers.slice((state.page-1)*8,state.page*8);
  $("#serverGrid").innerHTML=visible.length?visible.map(serverCard).join(""):'<div class="panel empty-results"><h3>Bu filtrelere uygun sunucu bulunamadı.</h3><p>Arama veya filtreleri değiştirin.</p></div>';
  $("#serverPagination").innerHTML=pages>1?Array.from({length:pages},(_,index)=>`<button type="button" data-page="${index+1}" class="${state.page===index+1?"active":""}">${index+1}</button>`).join(""):"";
  bindServerCards();
}

function serverCard(server){
  const rating=Number(server.average_rating||0);
  const fresh=Date.now()-new Date((server.opened_at||server.created_at)+"Z").getTime()<45*86400000;
  const [statusClass,statusText]=statusInfo(server);
  const event=nextEvent(server);
  const cover=server.image_url?`<div class="server-cover" style="background-image:url('${esc(server.image_url)}')"></div>`:'<div class="server-cover server-cover-placeholder"><span>SRO RATING</span></div>';
  return `<article class="server-card" data-server="${server.id}" tabindex="0" aria-label="${esc(server.name)} ayrıntılarını aç">
    <button class="favorite-button ${server.is_favorite?"active":""}" data-favorite="${server.id}" type="button" aria-pressed="${Boolean(server.is_favorite)}" aria-label="${server.is_favorite?"Favorilerden çıkar":"Favorilere ekle"}">♥</button>
    <div class="server-status ${statusClass}" title="${esc(server.status_note||statusText)}"><i></i>${statusText}</div>
    ${cover}<div class="server-card-body"><div class="server-badges"><span>${esc(server.server_type)}</span><span>CAP ${server.cap}</span>${fresh?'<span class="fresh">Yeni</span>':""}</div>
    <h2>${esc(server.name)}</h2>${event?`<div class="countdown" data-date="${esc(event[1])}"><strong>${event[0]}</strong><span>${formatCountdown(event[1])}</span></div>`:""}
    <p class="desc card-summary">${esc(compactDescription(server.description,110))}</p>
    <div class="score-row"><div><div class="score">${rating.toFixed(1)}</div><small>${server.vote_count} değerlendirme</small></div><div class="stars card-stars">${stars(rating)}</div></div>
    <div class="card-actions"><button class="outline" data-detail="${server.id}">Detaylar</button><button class="primary" data-review="${server.id}">Oy Ver</button></div></div>
  </article>`;
}

function bindServerCards(){
  $$("[data-server]").forEach(card=>{
    card.onclick=event=>{if(!event.target.closest("button"))openServer(Number(card.dataset.server))};
    card.onkeydown=event=>{if((event.key==="Enter"||event.key===" ")&&!event.target.closest("button")){event.preventDefault();openServer(Number(card.dataset.server))}};
  });
  $$("[data-detail]").forEach(button=>button.onclick=()=>openServer(Number(button.dataset.detail)));
  $$("[data-review]").forEach(button=>button.onclick=()=>openServer(Number(button.dataset.review),true));
  $$("[data-favorite]").forEach(button=>button.onclick=async()=>{
    if(!state.user){location.href="/giris/";return}
    const result=await api(`/api/servers/${button.dataset.favorite}/favorite`,{method:"POST"});
    const server=state.servers.find(item=>Number(item.id)===Number(button.dataset.favorite));
    server.is_favorite=result.favorite?1:0;renderServers();
  });
  $$("[data-page]").forEach(button=>button.onclick=()=>{state.page=Number(button.dataset.page);renderServers();$(".toolbar").scrollIntoView({behavior:"smooth",block:"start"})});
}

async function openServer(id,focusForm=false,focusReviewId=0){
  state.openServerId=id;
  const summary=state.servers.find(server=>Number(server.id)===id);
  if(!summary)return;
  const data=await api(`/api/servers/${id}`);
  const server=data.server;
  const rating=Number(server.average_rating||0);
  const [statusClass,statusText]=statusInfo(server);
  const mine=data.reviews.find(review=>Number(review.user_id)===Number(state.user?.id));
  $("#serverDetailName").textContent=server.name;
  $("#serverDetailDescription").textContent=compactDescription(server.description,300);
  $("#serverDetailHero").className=`server-detail-hero${server.image_url?"":" placeholder"}`;
  $("#serverDetailHero").style.backgroundImage=server.image_url?`url("${String(server.image_url).replaceAll('"',"%22")}")`:"";
  $("#serverDetailHero").innerHTML=server.image_url?"":'<div><strong>Sunucu görseli bekleniyor</strong></div>';
  $("#serverDetailBadges").innerHTML=`<span>${esc(server.server_type)}</span><span>CAP ${server.cap}</span><span class="server-status inline ${statusClass}" title="${esc(server.status_note||statusText)}"><i></i>${statusText}</span>`;
  const links=[["Web Sitesi",server.website_url],["Discord",server.discord_url],["Tanıtım",server.promo_url]].filter(([,url])=>url);
  $("#serverDetailLinks").innerHTML=links.map(([name,url])=>`<a class="outline" href="${esc(url)}" target="_blank" rel="noopener nofollow">${name} ↗</a>`).join("");
  $("#serverDetailScore").innerHTML=`<strong>${rating.toFixed(1)}</strong><span class="stars detail-stars">${stars(rating)}</span><small>${data.reviews.length} yorum</small>`;
  $("#serverDetailCount").innerHTML='<label class="comment-sort-label">Sırala <select id="commentSort"><option value="ratingDesc">Puan: yüksekten düşüğe</option><option value="ratingAsc">Puan: düşükten yükseğe</option><option value="likes">En çok beğenilen</option><option value="dislikes">En çok beğenilmeyen</option><option value="newest">En yeni</option></select></label>';
  renderReviewList(data.reviews,"ratingDesc");
  $("#commentSort").onchange=event=>renderReviewList(data.reviews,event.target.value);
  const actions=$(".detail-actions");
  if(!state.user)actions.innerHTML='<a class="primary" href="/giris/">Oy vermek için giriş yap</a>';
  else if(data.viewer?.isOwner)actions.innerHTML='<p class="message">Sunucu sahipleri kendi sunucularına puan veremez.</p>';
  else actions.innerHTML=detailReviewForm(mine);
  bindInlineReview(id,mine);
  const dialog=$("#serverDialog");
  if(!dialog.open)dialog.showModal();
  requestAnimationFrame(()=>{
    if(focusForm){
      actions.classList.add("review-target");
      actions.scrollIntoView({behavior:"smooth",block:"center"});
      actions.querySelector("textarea,button,a")?.focus({preventScroll:true});
      setTimeout(()=>actions.classList.remove("review-target"),1400);
    }else if(focusReviewId){
      const review=$(`[data-review-card="${focusReviewId}"]`);
      if(review){review.classList.add("review-target");review.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>review.classList.remove("review-target"),1800)}
    }
  });
}

function detailReviewForm(mine){
  return `<form id="inlineDetailReview" class="inline-detail-review">
    <div class="inline-rating" data-inline-rating aria-label="Puan">${[1,2,3,4,5].map(value=>`<button type="button" data-value="${value}" class="${Number(mine?.rating||0)>=value?"active":""}" aria-label="${value} puan">★</button>`).join("")}</div>
    <textarea minlength="3" maxlength="500" required placeholder="Bu sunucu hakkındaki deneyiminiz…">${esc(mine?.comment||"")}</textarea>
    <div><small><span data-review-count>${String(mine?.comment||"").length}</span>/500 karakter</small><button class="primary">${mine?"Puan ve Yorumu Güncelle":"Oy Ver ve Yorumla"}</button></div>
    <p class="inline-review-message" role="status"></p>
  </form>`;
}

function bindInlineReview(serverId,mine){
  const form=$("#inlineDetailReview");
  if(!form)return;
  let chosen=Number(mine?.rating||0);
  form.querySelectorAll("[data-value]").forEach(button=>button.onclick=()=>{
    chosen=Number(button.dataset.value);
    form.querySelectorAll("[data-value]").forEach(item=>item.classList.toggle("active",Number(item.dataset.value)<=chosen));
  });
  form.querySelector("textarea").oninput=event=>form.querySelector("[data-review-count]").textContent=event.target.value.length;
  form.onsubmit=async event=>{
    event.preventDefault();
    const message=form.querySelector(".inline-review-message");
    if(!chosen){message.textContent="Bir puan seçin.";return}
    const submit=form.querySelector("button[type=submit],button.primary");
    submit.disabled=true;message.textContent="Kaydediliyor…";
    try{
      await api(mine?`/api/reviews/${mine.id}`:`/api/servers/${serverId}/reviews`,{
        method:mine?"PUT":"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({rating:chosen,comment:form.querySelector("textarea").value})
      });
      await loadServers();await openServer(serverId,false,mine?.id||0);
    }catch(error){message.textContent=error.message;submit.disabled=false}
  };
}

function renderReviewList(reviews,mode){
  const list=[...reviews];
  list.sort((a,b)=>mode==="ratingAsc"?a.rating-b.rating:
    mode==="likes"?Number(b.like_count)-Number(a.like_count):
    mode==="dislikes"?Number(b.dislike_count)-Number(a.dislike_count):
    mode==="newest"?new Date(b.created_at)-new Date(a.created_at):
    b.rating-a.rating);
  $("#serverDetailComments").innerHTML=list.length?list.map(reviewBlock).join(""):'<div class="empty-comments"><strong>Henüz yorum yok</strong><p>İlk deneyimi paylaşan siz olun.</p></div>';
  $$("[data-reaction]").forEach(button=>button.onclick=async()=>{
    if(!state.user){location.href="/giris/";return}
    button.disabled=true;
    try{
      await api(`/api/reviews/${button.dataset.reviewId}/reaction`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reaction:button.dataset.reaction})});
      await openServer(state.openServerId,false,Number(button.dataset.reviewId));
    }catch(error){showActionToast(error.message,"bad");button.disabled=false}
  });
  $$("[data-profile]").forEach(button=>button.onclick=()=>openProfile(button.dataset.profile));
}

function reviewBlock(review){
  return `<article class="detail-comment" data-review-card="${review.id}">
    <header><button class="user-link" style="--commenter-color:${commenterTone(review.user_id||review.display_name)}" data-profile="${review.user_id||""}">${esc(review.display_name)}</button><span class="stars">${stars(review.rating)}</span></header>
    <p>${esc(review.comment)}</p>
    ${review.owner_reply?`<div class="owner-reply"><strong>✓ Sunucu sahibinin resmî cevabı</strong><p>${esc(review.owner_reply)}</p></div>`:""}
    <div class="review-actions"><button class="reaction-button ${review.my_reaction==="like"?"active":""}" data-reaction="like" data-review-id="${review.id}">👍 <strong>${review.like_count||0}</strong> Beğen</button><button class="reaction-button dislike ${review.my_reaction==="dislike"?"active":""}" data-reaction="dislike" data-review-id="${review.id}">👎 <strong>${review.dislike_count||0}</strong> Beğenme</button></div>
  </article>`;
}

function showActionToast(text,tone="good"){
  let toast=$("#actionToast");
  if(!toast){toast=document.createElement("div");toast.id="actionToast";toast.className="action-toast";document.body.append(toast)}
  toast.className=`action-toast visible ${tone}`;
  toast.textContent=text;
  clearTimeout(showActionToast.timer);
  showActionToast.timer=setTimeout(()=>toast.classList.remove("visible"),3200);
}

async function openProfile(id){
  if(!id)return;
  $("#serverDialog").close();
  const data=await api(`/api/users/${id}/profile`),profile=data.profile,stats=data.stats;
  const badges=["Topluluk Üyesi",Number(stats.reviews)>=1&&"İlk Değerlendirme",Number(stats.reviews)>=5&&"Deneyimli Yorumcu",profile.account_role==="owner"&&"Sunucu Sahibi"].filter(Boolean);
  $("#profilePreviewContent").innerHTML=`<div class="profile-preview-head"><img src="/sro-rating-logo.png" alt=""><div><p class="eyebrow">${profile.account_role==="owner"?"SUNUCU SAHİBİ":"TOPLULUK ÜYESİ"}</p><h2>${esc(profile.display_name)}</h2></div></div>
    ${profile.bio?`<p class="profile-bio">${esc(profile.bio)}</p>`:""}<div class="badge-wall">${badges.map(badge=>`<span class="profile-badge">✦ ${badge}</span>`).join("")}</div>
    <h3>Oynadığı Sunucular ve Karakterleri</h3><div class="public-server-list">${data.servers.length?data.servers.map(server=>`<article><span>${esc(server.name)}</span><strong>${esc(server.character_name||"Karakter adı paylaşılmadı")}</strong></article>`).join(""):"<p>Henüz sunucu seçmedi.</p>"}</div>
    <div class="profile-stats"><span><strong>${stats.reviews}</strong> Değerlendirme</span><span><strong>${stats.likes}</strong> Beğeni</span></div>`;
  $("#profilePreviewDialog").showModal();
}

function serverTags(server){
  const fresh=Date.now()-new Date((server.opened_at||server.created_at)+"Z").getTime()<45*86400000;
  return [server.server_type,`cap-${server.cap}`,server.operational_status,fresh&&"new",Number(server.vote_count)>=5&&"popular",Number(server.average_rating)>=4&&"high",server.is_favorite&&"favorite"].filter(Boolean).map(value=>String(value).toLocaleLowerCase("tr-TR"));
}
function statusInfo(server){return({online:["online","Çevrimiçi"],maintenance:["maintenance","Bakımda"],offline:["offline","Kapalı"]})[server.operational_status]||["offline","Kapalı"]}
function nextEvent(server){return [["Beta",server.beta_at],["Açılış",server.launch_at]].filter(([,date])=>date&&new Date(date).getTime()>Date.now()).sort((a,b)=>new Date(a[1])-new Date(b[1]))[0]||null}
function formatCountdown(value){const ms=new Date(value).getTime()-Date.now();if(ms<=0)return"Başladı";const days=Math.floor(ms/86400000),hours=Math.floor(ms%86400000/3600000),minutes=Math.floor(ms%3600000/60000);return`${days}g ${hours}s ${minutes}dk`}
function updateCountdowns(){$$(".countdown").forEach(element=>{const output=element.querySelector("span");if(output)output.textContent=formatCountdown(element.dataset.date)})}
function compactDescription(value,limit){const text=String(value||"").replace(/\s+/g," ").trim();return text.length>limit?`${text.slice(0,limit).trimEnd()}…`:text}
function stars(value){const rounded=Math.max(0,Math.min(5,Math.round(Number(value)||0)));return"★".repeat(rounded)+"☆".repeat(5-rounded)}
function commenterTone(value){const palette=["#79c8bd","#9da9e8","#d9a1cd","#e4ad73","#87c99a","#dd8f91"];const key=String(value||"0").split("").reduce((sum,char)=>sum+char.charCodeAt(0),0);return palette[key%palette.length]}
function esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]))}

["serverDialog","reviewDialog","profilePreviewDialog"].forEach(id=>{
  const dialog=document.getElementById(id);
  dialog?.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
});
$("#closeServerDialog").onclick=()=>$("#serverDialog").close();
$("#closeDialog").onclick=()=>$("#reviewDialog").close();
$("#closeProfilePreview").onclick=()=>$("#profilePreviewDialog").close();

init().catch(error=>{
  document.body.classList.remove("app-loading");
  $("#serverGrid").innerHTML=`<div class="panel bad"><h3>İçerik yüklenemedi</h3><p>${esc(error.message)}</p><button type="button" class="primary" data-retry>Tekrar Dene</button></div>`;
  $("#serverGrid [data-retry]").onclick=()=>location.reload();
});
