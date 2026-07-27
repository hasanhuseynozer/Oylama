const $=s=>document.querySelector(s);
async function api(url,options={}){
  const response=await fetch(url,options),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"İşlem başarısız.");
  return data;
}
function esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]))}
function formatDate(value){return new Date(`${value}Z`).toLocaleString("tr-TR")}
async function load(){
  const me=await api("/api/auth/me");if(!me.user)return location.href="/giris/";
  const data=await api("/api/notifications"),box=$("#notificationList");
  box.innerHTML=data.notifications.length?data.notifications.map(item=>`<a class="notification-item ${item.is_read?"":"unread"}" href="${esc(item.target_url)}" data-id="${item.id}"><span class="notification-icon">${item.type==="like"?"👍":item.type==="dislike"?"👎":item.type==="ownership"?"♛":"💬"}</span><span><strong>${esc(item.title)}</strong><p>${esc(item.message)}</p><small>${formatDate(item.created_at)}</small></span><i>→</i></a>`).join(""):'<div class="empty-state">Yeni bildiriminiz yok.</div>';
  box.querySelectorAll("[data-id]").forEach(link=>link.onclick=async event=>{event.preventDefault();await api(`/api/notifications/${link.dataset.id}/read`,{method:"PUT"});location.href=link.href});
}
$("#clearNotifications").onclick=async()=>{if(!confirm("Tüm bildirimler silinsin mi?"))return;await api("/api/notifications",{method:"DELETE"});await load()};
load().catch(error=>$("#notificationList").textContent=error.message);
