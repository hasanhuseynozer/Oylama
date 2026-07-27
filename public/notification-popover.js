function setupNotificationPopover(){
  const button=document.querySelector("[data-notification-toggle]");
  if(!button||button.dataset.notificationReady)return false;
  button.dataset.notificationReady="1";
  const panel=document.createElement("aside");
  panel.className="notification-popover hidden";
  panel.innerHTML='<header><strong>Bildirimler</strong><button type="button" data-clear-notifications>Tümünü Sil</button></header><div class="notification-popover-list">Yükleniyor…</div>';
  document.body.append(panel);
  const place=()=>{
    const box=button.getBoundingClientRect(),gap=10,width=Math.min(390,innerWidth-24);
    panel.style.width=`${width}px`;
    panel.style.left=`${Math.max(12,Math.min(innerWidth-width-12,box.right-width))}px`;
    panel.style.top=`${Math.min(innerHeight-90,box.bottom+gap)}px`;
  };
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  async function request(url,options={}){const response=await fetch(url,options),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"İşlem başarısız.");return data}
  async function load(){
    const data=await request("/api/notifications"),list=panel.querySelector(".notification-popover-list"),badge=button.querySelector("b");
    if(badge){badge.textContent=data.unread>99?"99+":data.unread||"";badge.classList.toggle("visible",data.unread>0)}
    list.innerHTML=data.notifications.length?data.notifications.map(item=>`<button type="button" class="notification-popover-item ${item.is_read?"":"unread"}" data-notification-id="${item.id}" data-target="${esc(item.target_url)}"><span>${item.type==="like"?"👍":item.type==="dislike"?"👎":item.type==="ownership"?"♛":"💬"}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.message)}</small></span></button>`).join(""):'<div class="empty-state">Yeni bildiriminiz yok.</div>';
    list.querySelectorAll("[data-notification-id]").forEach(item=>item.onclick=async()=>{await request(`/api/notifications/${item.dataset.notificationId}/read`,{method:"PUT"});location.href=item.dataset.target||"/"});
  }
  button.addEventListener("click",async event=>{event.preventDefault();panel.classList.toggle("hidden");if(!panel.classList.contains("hidden")){place();await load()}});
  panel.querySelector("[data-clear-notifications]").onclick=async()=>{await request("/api/notifications",{method:"DELETE"});await load()};
  document.addEventListener("click",event=>{if(!panel.contains(event.target)&&!button.contains(event.target))panel.classList.add("hidden")});
  addEventListener("resize",()=>{if(!panel.classList.contains("hidden"))place()});
  addEventListener("scroll",()=>{if(!panel.classList.contains("hidden"))place()},{passive:true});
  load().catch(()=>{});
  return true;
}
if(!setupNotificationPopover()){
  const notificationObserver=new MutationObserver(()=>{if(setupNotificationPopover())notificationObserver.disconnect()});
  notificationObserver.observe(document.documentElement,{childList:true,subtree:true});
}
