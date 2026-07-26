const loginView = document.querySelector("#loginView");
const dashboard = document.querySelector("#dashboard");
let data = { servers: [], reviews: [] };

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "İşlem başarısız.");
    error.status = response.status;
    throw error;
  }
  return body;
}

document.querySelector("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = document.querySelector("#loginMessage");
  msg.textContent = "";
  try {
    await api("/api/admin/login", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({password:document.querySelector("#password").value})
    });
    await loadDashboard();
  } catch (error) { msg.textContent = error.message; }
});

document.querySelector("#logout").addEventListener("click", async () => {
  await api("/api/admin/logout", {method:"POST"});
  dashboard.classList.add("hidden"); loginView.classList.remove("hidden");
});

document.querySelector("#serverForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = document.querySelector("#editId").value;
  const payload = {
    name:document.querySelector("#serverName").value,
    description:document.querySelector("#serverDescription").value,
    is_active:document.querySelector("#serverActive").checked
  };
  try {
    await api(id ? `/api/admin/servers/${id}` : "/api/admin/servers", {
      method:id ? "PUT" : "POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload)
    });
    resetForm(); await loadDashboard(); showMessage(id ? "Sunucu güncellendi." : "Sunucu eklendi.");
  } catch (error) { showMessage(error.message, true); }
});
document.querySelector("#cancelEdit").addEventListener("click", resetForm);

async function loadDashboard() {
  try {
    data = await api("/api/admin/servers");
    loginView.classList.add("hidden"); dashboard.classList.remove("hidden");
    render();
  } catch (error) {
    if (error.status === 401) { dashboard.classList.add("hidden"); loginView.classList.remove("hidden"); }
    else document.querySelector("#loginMessage").textContent = error.message;
  }
}

function render() {
  const totalVotes = data.servers.reduce((a,s)=>a+Number(s.vote_count),0);
  document.querySelector("#stats").innerHTML = `
    <div class="stat"><strong>${data.servers.length}</strong>Toplam sunucu</div>
    <div class="stat"><strong>${totalVotes}</strong>Toplam oy</div>
    <div class="stat"><strong>${data.reviews.length}</strong>Görünen yorum</div>`;

  document.querySelector("#serverTable").innerHTML = `
    <table><thead><tr><th>Sunucu</th><th>Durum</th><th>Puan / Oy</th><th>İşlemler</th></tr></thead>
    <tbody>${data.servers.map(s=>`<tr>
      <td><strong>${esc(s.name)}</strong><br><small>${esc(s.description)}</small></td>
      <td><span class="badge ${s.is_active ? "active":""}">${s.is_active ? "Yayında":"Gizli"}</span></td>
      <td>${Number(s.average_rating).toFixed(1)} / ${s.vote_count}</td>
      <td>
        <button class="tiny-btn" onclick="editServer(${s.id})">Düzenle</button>
        <button class="tiny-btn" onclick="resetServer(${s.id})">Oyları sıfırla</button>
        <button class="tiny-btn danger" onclick="deleteServer(${s.id})">Sil</button>
      </td></tr>`).join("")}</tbody></table>`;

  document.querySelector("#reviewTable").innerHTML = data.reviews.length ? `
    <table><thead><tr><th>Sunucu</th><th>E-posta</th><th>Puan</th><th>Yorum</th><th>Tarih</th><th></th></tr></thead>
    <tbody>${data.reviews.map(r=>`<tr><td>${esc(r.server_name)}</td><td>${esc(r.email_masked)}</td><td>${"★".repeat(r.rating)}</td><td>${esc(r.comment)}</td><td>${date(r.created_at)}</td><td><button class="tiny-btn danger" onclick="deleteReview(${r.id})">Sil</button></td></tr>`).join("")}</tbody></table>` : "<p>Henüz yorum yok.</p>";
}

window.editServer = id => {
  const s=data.servers.find(x=>Number(x.id)===Number(id)); if(!s)return;
  document.querySelector("#editId").value=s.id;
  document.querySelector("#serverName").value=s.name;
  document.querySelector("#serverDescription").value=s.description;
  document.querySelector("#serverActive").checked=Boolean(s.is_active);
  document.querySelector("#formTitle").textContent="Sunucuyu düzenle";
  document.querySelector("#cancelEdit").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
};
window.deleteServer = async id => {
  if(!confirm("Bu sunucu ve bütün yorumları kalıcı olarak silinsin mi?"))return;
  try{await api(`/api/admin/servers/${id}`,{method:"DELETE"});await loadDashboard();}catch(e){showMessage(e.message,true)}
};
window.resetServer = async id => {
  if(!confirm("Bu sunucunun bütün oy ve yorumları sıfırlansın mı?"))return;
  try{await api(`/api/admin/servers/${id}/reset`,{method:"POST"});await loadDashboard();}catch(e){showMessage(e.message,true)}
};
window.deleteReview = async id => {
  if(!confirm("Bu yorum silinsin mi?"))return;
  try{await api(`/api/admin/reviews/${id}`,{method:"DELETE"});await loadDashboard();}catch(e){showMessage(e.message,true)}
};
function resetForm(){document.querySelector("#serverForm").reset();document.querySelector("#editId").value="";document.querySelector("#serverActive").checked=true;document.querySelector("#formTitle").textContent="Yeni sunucu ekle";document.querySelector("#cancelEdit").classList.add("hidden")}
function showMessage(text,bad=false){const el=document.querySelector("#adminMessage");el.textContent=text;el.style.color=bad?"var(--danger)":"var(--ok)";setTimeout(()=>el.textContent="",3000)}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function date(v){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"short",timeStyle:"short"}).format(new Date(v+"Z"))}
loadDashboard();
