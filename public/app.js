const state = { servers: [], rating: 0, turnstileSiteKey: "", turnstileWidget: null };
const grid = document.querySelector("#serverGrid");
const dialog = document.querySelector("#reviewDialog");
const form = document.querySelector("#reviewForm");
const formMessage = document.querySelector("#formMessage");

document.querySelector("#sortSelect").addEventListener("change", loadServers);
document.querySelector("#closeDialog").addEventListener("click", () => dialog.close());
document.querySelector("#comment").addEventListener("input", e => {
  document.querySelector("#charCount").textContent = e.target.value.length;
});
document.querySelectorAll("#starsInput button").forEach(button => {
  button.addEventListener("click", () => selectRating(Number(button.dataset.rating)));
});

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "İşlem başarısız oldu.");
  return data;
}

async function init() {
  try {
    const config = await api("/api/config");
    state.turnstileSiteKey = config.turnstileSiteKey;
  } catch {}
  await loadServers();
}

async function loadServers() {
  grid.innerHTML = '<div class="loading-card">Sunucular yükleniyor…</div>';
  try {
    const sort = document.querySelector("#sortSelect").value;
    const data = await api(`/api/servers?sort=${encodeURIComponent(sort)}`);
    state.servers = data.servers;
    if (!state.servers.length) {
      grid.innerHTML = '<div class="loading-card">Henüz yayımlanmış bir sunucu yok.</div>';
      return;
    }
    grid.innerHTML = state.servers.map(serverCard).join("");
    document.querySelectorAll("[data-review]").forEach(btn => {
      btn.addEventListener("click", () => openReview(Number(btn.dataset.review)));
    });
    await Promise.all(state.servers.map(server => loadComments(Number(server.id))));
  } catch (error) {
    grid.innerHTML = `<div class="loading-card">${escapeHtml(error.message)}</div>`;
  }
}

function serverCard(s) {
  const rating = Number(s.average_rating || 0);
  return `
    <article class="server-card">
      <div class="card-top">
        <div>
          <p class="eyebrow">SILKROAD ONLINE</p>
          <h3>${escapeHtml(s.name)}</h3>
          <p class="description">${escapeHtml(s.description)}</p>
        </div>
        <div class="score"><strong>${rating.toFixed(1)}</strong><span>${Number(s.vote_count)} oy</span></div>
      </div>
      <div class="card-actions">
        <div class="stars" aria-label="${rating} puan">${stars(rating)}</div>
        <button class="outline-btn" data-review="${s.id}">Puanla ve yorumla</button>
      </div>
      <div class="comments" id="comments-${s.id}"><h4>Yorumlar</h4><p class="empty">Yükleniyor…</p></div>
    </article>`;
}

async function loadComments(id) {
  const area = document.querySelector(`#comments-${id}`);
  try {
    const data = await api(`/api/servers/${id}`);
    if (!data.reviews.length) {
      area.innerHTML = "<h4>Yorumlar</h4><p class='empty'>İlk yorumu siz yazın.</p>";
      return;
    }
    area.innerHTML = `<h4>Yorumlar</h4>${data.reviews.slice(0, 8).map(r => `
      <div class="comment">
        <div class="comment-head"><span>${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</span><time>${formatDate(r.created_at)}</time></div>
        <p>${escapeHtml(r.comment)}</p>
      </div>`).join("")}`;
  } catch {
    area.innerHTML = "<h4>Yorumlar</h4><p class='empty'>Yorumlar yüklenemedi.</p>";
  }
}

function openReview(id) {
  const server = state.servers.find(s => Number(s.id) === id);
  document.querySelector("#serverId").value = id;
  document.querySelector("#modalServerName").textContent = server?.name || "Sunucuyu değerlendir";
  form.reset();
  document.querySelector("#serverId").value = id;
  document.querySelector("#charCount").textContent = "0";
  formMessage.textContent = "";
  selectRating(0);
  renderTurnstile();
  dialog.showModal();
}

function selectRating(value) {
  state.rating = value;
  document.querySelector("#rating").value = value || "";
  document.querySelectorAll("#starsInput button").forEach(b => {
    b.classList.toggle("active", Number(b.dataset.rating) <= value);
  });
}

function renderTurnstile() {
  const area = document.querySelector("#turnstileArea");
  area.innerHTML = "";
  state.turnstileWidget = null;
  if (!state.turnstileSiteKey) return;
  const tryRender = () => {
    if (window.turnstile) {
      state.turnstileWidget = window.turnstile.render(area, {
        sitekey: state.turnstileSiteKey,
        theme: "dark"
      });
    } else setTimeout(tryRender, 250);
  };
  tryRender();
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  formMessage.textContent = "";
  if (!state.rating) {
    formMessage.textContent = "Lütfen yıldız puanı seçin.";
    return;
  }
  const button = document.querySelector("#submitReview");
  button.disabled = true;
  button.textContent = "Yayımlanıyor…";
  try {
    const token = state.turnstileWidget !== null && window.turnstile
      ? window.turnstile.getResponse(state.turnstileWidget)
      : "";
    await api(`/api/servers/${document.querySelector("#serverId").value}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: document.querySelector("#email").value,
        rating: state.rating,
        comment: document.querySelector("#comment").value,
        turnstileToken: token
      })
    });
    formMessage.style.color = "var(--ok)";
    formMessage.textContent = "Yorumunuz yayımlandı.";
    await loadServers();
    setTimeout(() => dialog.close(), 800);
  } catch (error) {
    formMessage.style.color = "var(--danger)";
    formMessage.textContent = error.message;
    if (state.turnstileWidget !== null && window.turnstile) window.turnstile.reset(state.turnstileWidget);
  } finally {
    button.disabled = false;
    button.textContent = "Yayımla";
  }
});

function stars(rating) {
  const rounded = Math.round(rating);
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}
function formatDate(value) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value + "Z"));
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}
init();
