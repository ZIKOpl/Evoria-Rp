'use strict';

// ── CONFIG API ────────────────────────────────────────────────────
// L'URL du bot/serveur. En prod, remplacez par votre URL publique.
const API = (typeof CONFIG !== 'undefined' && CONFIG.botServerURL)
  ? CONFIG.botServerURL.replace(/\/$/, '')
  : 'http://localhost:3000';

// ── HELPERS ───────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    return res;
  } catch (e) {
    console.error('[API error]', path, e);
    return null;
  }
}

// ── SESSION UTILISATEUR ───────────────────────────────────────────
// Clé unifiée partagée entre toutes les pages (admin + votes + whitelist)
const SHARED_USER_KEY = 'district_user';

const SESSION = {
  get user()   { return JSON.parse(localStorage.getItem('evr_user') || localStorage.getItem(SHARED_USER_KEY) || 'null'); },
  setUser(v)   { localStorage.setItem('evr_user', JSON.stringify(v)); localStorage.setItem(SHARED_USER_KEY, JSON.stringify(v)); },
  clearUser()  { localStorage.removeItem('evr_user'); localStorage.removeItem(SHARED_USER_KEY); },
  async isAdmin() {
    const u = this.user;
    if (!u || !u.id) return false;
    const res = await apiFetch(`/auth/check?id=${u.id}`);
    if (!res) return false;
    const d = await res.json();
    return d.isAdmin === true;
  }
};

// Utilitaire partagé : lire/écrire l'utilisateur connecté (toutes pages)
const SharedAuth = {
  get()    { try { return JSON.parse(localStorage.getItem(SHARED_USER_KEY) || 'null'); } catch { return null; } },
  set(v)   { localStorage.setItem(SHARED_USER_KEY, JSON.stringify(v)); },
  clear()  { localStorage.removeItem(SHARED_USER_KEY); },
};

// ── UI UTILITAIRES ────────────────────────────────────────────────
function toast(msg, type = '') {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toast-wrap'; wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  wrap.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('in')));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, 3800);
}
function openModal(id)  { const m = document.getElementById(id); if (!m) return; m.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { const m = document.getElementById(id); if (!m) return; m.classList.remove('open'); document.body.style.overflow = ''; }
function closeAllModals() { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); document.body.style.overflow = ''; }
function fmtDate(ts) { return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
function animNum(el, to, dur = 1400) {
  if (!el) return;
  const start = performance.now();
  const run = now => { const p = Math.min((now - start) / dur, 1), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(run); };
  requestAnimationFrame(run);
}

function applyConfig() {
  if (typeof CONFIG === 'undefined') return;
  const bg = document.getElementById('hero-bg');
  if (bg && CONFIG.heroBackground) bg.style.backgroundImage = `url('${CONFIG.heroBackground}')`;
  document.querySelectorAll('[data-discord]').forEach(a   => { a.href = CONFIG.discordInvite; });
  document.querySelectorAll('[data-boutique]').forEach(a  => { a.href = CONFIG.boutiqueURL; a.target = '_blank'; a.rel = 'noopener'; });
  document.querySelectorAll('[data-reglement]').forEach(a => { a.href = CONFIG.reglementURL; a.target = '_blank'; a.rel = 'noopener'; });
  document.querySelectorAll('[data-topserveur]').forEach(a=> { a.href = CONFIG.topServeurURL; a.target = '_blank'; a.rel = 'noopener'; });
}

function initNavbar() {
  const nb = document.querySelector('.navbar');
  if (!nb) return;
  window.addEventListener('scroll', () => nb.classList.toggle('solid', window.scrollY > 10), { passive: true });
}
function initMobileMenu() {
  const burger = document.getElementById('burger'), menu = document.getElementById('mobile-menu');
  if (!burger || !menu) return;
  burger.addEventListener('click', () => { const open = burger.classList.toggle('open'); menu.classList.toggle('open', open); document.body.style.overflow = open ? 'hidden' : ''; });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { burger.classList.remove('open'); menu.classList.remove('open'); document.body.style.overflow = ''; }));
}
function initParticles() {
  const c = document.querySelector('.particles');
  if (!c) return;
  const count = window.innerWidth < 768 ? 14 : 28;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div'); p.className = 'par';
    p.style.cssText = `left:${Math.random() * 100}%;--dur:${6 + Math.random() * 9}s;--del:${Math.random() * 10}s`;
    c.appendChild(p);
  }
}
function initAnim() {
  const obs = new IntersectionObserver(en => { en.forEach(e => { if (e.isIntersecting) e.target.classList.add('vis'); }); }, { threshold: .08, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.anim').forEach(el => obs.observe(el));
}
function initDropdown() {
  const drop = document.querySelector('.nav-drop');
  if (!drop) return;
  const btn = drop.querySelector('a');
  btn.addEventListener('click', e => { e.preventDefault(); drop.classList.toggle('open'); });
  document.addEventListener('click', e => { if (!drop.contains(e.target)) drop.classList.remove('open'); });
  drop.addEventListener('mouseenter', () => drop.classList.add('open'));
  drop.addEventListener('mouseleave', () => drop.classList.remove('open'));
}

// ── FIVEM ─────────────────────────────────────────────────────────
async function fetchFiveM() {
  const elBP = document.getElementById('badge-players'), elBS = document.getElementById('badge-slots');
  const elSO = document.getElementById('stat-online'),   elSS = document.getElementById('stat-slots');
  const elDot = document.querySelector('.dot-green'), elBadge = document.querySelector('.badge-status-txt');
  if (!elBP && !elSO) return;

  const setOffline = () => {
    if (elBP) elBP.textContent = '0'; if (elBS) elBS.textContent = '';
    if (elSO) elSO.textContent = '0'; if (elSS) elSS.textContent = '—';
    if (elDot) elDot.className = 'dot-red';
    if (elBadge) { elBadge.textContent = 'OFFLINE'; elBadge.style.color = 'var(--red)'; }
    document.querySelectorAll('.server-status-badge').forEach(b => { b.textContent = 'HORS LIGNE'; b.className = 'server-status-badge offline'; });
  };
  const setOnline = (players, maxP) => {
    if (elBP) animNum(elBP, players, 1200); if (elBS) elBS.textContent = `/ ${maxP}`;
    if (elSO) animNum(elSO, players, 1200); if (elSS) elSS.textContent = maxP;
    if (elDot) elDot.className = 'dot-green';
    if (elBadge) { elBadge.textContent = 'EN LIGNE'; elBadge.style.color = 'var(--green)'; }
    document.querySelectorAll('.server-status-badge').forEach(b => { b.textContent = 'EN LIGNE'; b.className = 'server-status-badge online'; });
  };

  // On passe par le proxy du bot → plus de CORS !
  const res = await apiFetch('/api/fivem');
  if (res && res.ok) {
    const d = await res.json();
    if (d.online) { setOnline(d.players, d.maxPlayers); return; }
  }
  setOffline();
}

// ── DISCORD ───────────────────────────────────────────────────────
async function fetchDiscordMembers() {
  const elSD = document.getElementById('stat-discord'), elBD = document.getElementById('badge-discord-online');
  if (!elSD && !elBD) return;
  try {
    // Utilise le bot proxy pour avoir le vrai nombre de membres total (pas seulement les en ligne)
    const res = await apiFetch('/api/discord/stats');
    if (res && res.ok) {
      const d = await res.json();
      const total = d.memberCount || 0;
      if (elSD) animNum(elSD, total, 1200);
      if (elBD) animNum(elBD, total, 1200);
      return;
    }
    throw new Error('fallback');
  } catch {
    // Fallback : widget Discord (donne presence_count = en ligne)
    try {
      if (typeof CONFIG === 'undefined' || !CONFIG.discordGuildID) throw new Error();
      const res2 = await fetch(`https://discord.com/api/v10/guilds/${CONFIG.discordGuildID}/widget.json`, { signal: AbortSignal.timeout(6000) });
      if (!res2.ok) throw new Error();
      const d2 = await res2.json();
      const count = d2.approximate_member_count ?? d2.presence_count ?? 0;
      if (elSD) animNum(elSD, count, 1200);
      if (elBD) animNum(elBD, count, 1200);
    } catch {
      if (elSD) elSD.textContent = '—';
      if (elBD) elBD.textContent = '—';
    }
  }
}

// ── NEWS ──────────────────────────────────────────────────────────
async function renderNews() {
  const grid = document.getElementById('news-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="news-empty">Chargement…</div>';

  const res = await apiFetch('/api/news');
  if (!res || !res.ok) { grid.innerHTML = '<div class="news-empty">Erreur de chargement des actualités.</div>'; return; }
  const news = await res.json();

  if (!news.length) { grid.innerHTML = '<div class="news-empty">Aucune actualité pour le moment.</div>'; return; }
  const sorted = [...news].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1;
    if (a.featured && !b.featured) return -1; if (!a.featured && b.featured) return 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });
  grid.innerHTML = sorted.map(n => `
    <div class="news-item anim ${n.pinned ? 'pinned' : ''} ${n.featured ? 'featured' : ''} ${!n.image ? 'no-img' : ''}" data-id="${n.id}">
      <div class="news-item-img">
        ${n.pinned ? '<div class="news-pin-badge">📌 Épinglé</div>' : ''}
        ${n.featured ? '<div class="news-feat-badge">★ À la une</div>' : ''}
        ${n.image ? `<img src="${n.image}" alt="${n.title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=news-item-no-img>📰</div>'">` : '<div class="news-item-no-img">📰</div>'}
      </div>
      <div class="news-item-body">
        <div class="news-item-meta">
          <span class="news-item-tag" style="${n.tagColor ? `color:${n.tagColor};background:${n.tagColor}22;border-color:${n.tagColor}55` : ''}">${n.tag || 'Actualité'}</span>
          <span class="news-item-date"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${fmtDate(n.ts)}</span>
        </div>
        <h3 class="news-item-title">${n.title}</h3>
        <p class="news-item-desc">${n.desc}</p>
      </div>
    </div>`).join('');
  initAnim();
}

// ── STREAMERS ─────────────────────────────────────────────────────
function twitchLogin(url) {
  if (!url) return null;
  try { const u = new URL(url); if (u.hostname.includes('twitch.tv')) return u.pathname.replace('/', '').split('/')[0].toLowerCase(); } catch {}
  const m = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/); return m ? m[1].toLowerCase() : null;
}
function twitchPreviewURL(login) { return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login.toLowerCase()}-1280x720.jpg`; }
async function checkTwitchLive(login) {
  if (!login) return false;
  try {
    if (typeof CONFIG !== 'undefined' && CONFIG.twitchClientID && !CONFIG.twitchClientID.includes('VOTRE')) {
      const d = await (await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`,
        { headers: { 'Client-ID': CONFIG.twitchClientID, 'Authorization': `Bearer ${CONFIG.twitchAccessToken}` }, signal: AbortSignal.timeout(5000) })).json();
      return Array.isArray(d?.data) && d.data.length > 0;
    }
    const res = await fetch(`https://decapi.me/twitch/uptime/${encodeURIComponent(login)}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) { const txt = await res.text(); return !txt.toLowerCase().includes('offline') && !txt.toLowerCase().includes('error') && txt.trim().length > 0; }
    return false;
  } catch { return false; }
}

async function renderStreamers() {
  const grid = document.getElementById('streamers-grid');
  if (!grid) return;
  const res = await apiFetch('/api/streamers');
  if (!res || !res.ok) { grid.innerHTML = '<div class="news-empty" style="grid-column:1/-1">Erreur de chargement des streamers.</div>'; return; }
  const strs = await res.json();

  if (!strs.length) { grid.innerHTML = '<div class="news-empty" style="grid-column:1/-1">Aucun streamer partenaire pour le moment.</div>'; return; }

  const liveMap = {};
  for (const s of strs) {
    const login = twitchLogin(s.url);
    liveMap[s.id] = login ? await checkTwitchLive(login) : false;
  }

  const sorted = [...strs].sort((a, b) => (liveMap[a.id] && !liveMap[b.id]) ? -1 : (!liveMap[a.id] && liveMap[b.id]) ? 1 : 0);

  grid.innerHTML = sorted.slice(0, 6).map(s => {
    const live = liveMap[s.id], login = twitchLogin(s.url);
    const prevSrc = login ? twitchPreviewURL(login) : '', chanUrl = s.url || (login ? `https://www.twitch.tv/${login}` : '#');
    return `<div class="sp-card anim ${live ? 'is-live' : ''}">
      <div class="sp-thumb">
        ${live && prevSrc
          ? `<img class="sp-thumb-img" src="${prevSrc}" alt="${s.name}" loading="lazy" onerror="this.style.display='none'">
             <div class="sp-thumb-gradient"></div><div class="sp-live-badge"><span class="sp-live-dot"></span>LIVE</div>`
          : `<div class="sp-offline">${s.avatar ? `<img class="sp-offline-avatar" src="${s.avatar}" alt="${s.name}" onerror="this.style.display='none'">` : ''}<div class="sp-offline-tag">HORS LIGNE</div></div>`}
      </div>
      <div class="sp-info">
        ${s.avatar ? `<img class="sp-avatar${live ? ' live-ring' : ''}" src="${s.avatar}" alt="${s.name}" loading="lazy" onerror="this.className='sp-avatar-ph'">` : `<div class="sp-avatar-ph">${s.name.charAt(0).toUpperCase()}</div>`}
        <div class="sp-name-block"><div class="sp-name">${s.name}</div><div class="sp-status ${live ? 'live' : 'off'}"><span class="s-dot"></span>${live ? 'EN LIVE' : 'Hors ligne'}</div></div>
      </div>
      <a href="${chanUrl}" target="_blank" rel="noopener" class="sp-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>
        ${live ? 'Regarder' : 'Voir la chaîne'}
      </a>
    </div>`;
  }).join('');
  initAnim();
}

// ── PANEL ADMIN ───────────────────────────────────────────────────
function initPanelTabs() {
  document.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ptab').forEach(t => t.classList.remove('on'));
      document.querySelectorAll('.psec').forEach(s => s.classList.remove('on'));
      tab.classList.add('on');
      document.getElementById(`psec-${tab.dataset.tab}`)?.classList.add('on');
    });
  });
}

// Admin News (panel gestion)
async function renderAdminNews() {
  const list = document.getElementById('admin-news-list');
  if (!list) return;
  const res = await apiFetch('/api/news');
  if (!res || !res.ok) { list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">Erreur chargement</p>'; return; }
  const sorted = (await res.json()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!sorted.length) { list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">Aucune actualité</p>'; return; }
  list.innerHTML = sorted.map(n => `
    <div class="an-item" draggable="true" data-id="${n.id}">
      <span class="an-drag">⠿</span>
      ${n.image ? `<img class="an-img" src="${n.image}" loading="lazy" onerror="this.style.display='none'">` : '<div class="an-img" style="background:var(--d4);display:flex;align-items:center;justify-content:center;color:var(--muted)">📰</div>'}
      <div class="an-info"><div class="an-title">${n.title}</div><div class="an-date">${fmtDate(n.ts)}</div></div>
      <div class="an-actions">
        <button class="btn-sm ${n.pinned ? 'pin-active' : ''}" onclick="togglePin(${n.id})" title="Épingler">Pin</button>
        <button class="btn-sm ${n.featured ? 'pin-active' : ''}" onclick="toggleFeatured(${n.id})" title="À la une">Une</button>
        <button class="btn-sm del" onclick="deleteNews(${n.id})" title="Supprimer">✕</button>
      </div>
    </div>`).join('');
  initDrag(list, 'news');
}

async function togglePin(id) {
  const res = await apiFetch('/api/news');
  if (!res || !res.ok) return;
  const news = await res.json();
  const item = news.find(n => n.id === id);
  if (!item) return;
  await apiFetch('/api/news', { method: 'PATCH', body: JSON.stringify({ id, pinned: !item.pinned }) });
  renderAdminNews(); renderNews();
}
async function toggleFeatured(id) {
  const res = await apiFetch('/api/news');
  if (!res || !res.ok) return;
  const news = await res.json();
  const item = news.find(n => n.id === id);
  if (!item) return;
  await apiFetch('/api/news', { method: 'PATCH', body: JSON.stringify({ id, featured: !item.featured }) });
  renderAdminNews(); renderNews();
}
async function deleteNews(id) {
  await apiFetch(`/api/news?id=${id}`, { method: 'DELETE' });
  renderAdminNews(); renderNews(); toast('Supprimé', '');
}

function updatePreview() {
  const title = document.getElementById('news-title')?.value || 'Titre';
  const desc  = document.getElementById('news-desc')?.value  || 'Description…';
  const img   = document.getElementById('news-image')?.value || '';
  const tag   = document.getElementById('news-tag')?.value   || 'Actualité';
  const tagColor = document.getElementById('news-tag-color')?.value || '#FF1A1A';
  const prev = document.getElementById('news-preview'); if (prev) prev.style.display = 'flex';
  const ph = document.getElementById('preview-img');
  if (ph) ph.innerHTML = img ? `<img src="${img}" onerror="this.parentElement.style.background='var(--d3)'">` : '<div style="width:100%;height:100%;background:var(--d3);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.15);font-size:2rem">📰</div>';
  const pt = document.getElementById('preview-title'); if (pt) pt.textContent = title;
  const pd = document.getElementById('preview-desc');  if (pd) pd.textContent = desc;
  const pT = document.getElementById('preview-tag');
  if (pT) { pT.textContent = tag; pT.style.color = tagColor; pT.style.background = tagColor + '22'; pT.style.borderColor = tagColor + '55'; }
}

async function submitAddNews(e) {
  e.preventDefault();
  const title    = document.getElementById('news-title').value.trim();
  const desc     = document.getElementById('news-desc').value.trim();
  const img      = document.getElementById('news-image').value.trim();
  const tag      = document.getElementById('news-tag').value.trim();
  const tagColor = document.getElementById('news-tag-color')?.value || '#FF1A1A';
  if (!title || !desc) { toast('Titre et description requis.', 'err'); return; }

  const res = await apiFetch('/api/news', {
    method: 'POST', body: JSON.stringify({ title, desc, image: img, tag: tag || 'Actualité', tagColor })
  });
  if (!res || !res.ok) { toast('Erreur lors de la publication.', 'err'); return; }
  e.target.reset();
  const prev = document.getElementById('news-preview'); if (prev) prev.style.display = 'none';
  renderAdminNews(); renderNews(); toast('Actualité publiée !', 'ok');
}

function initDrag(list, type) {
  let dragged = null;
  list.querySelectorAll('.an-item').forEach(item => {
    item.addEventListener('dragstart', () => { dragged = item; item.classList.add('dragging'); });
    item.addEventListener('dragend',   () => { item.classList.remove('dragging'); dragged = null; saveOrder(list, type); });
    item.addEventListener('dragover',  e => { e.preventDefault(); if (dragged && dragged !== item) { const r = item.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) list.insertBefore(dragged, item); else list.insertBefore(dragged, item.nextSibling); } });
  });
}
async function saveOrder(list, type) {
  if (type !== 'news') return;
  const orders = [];
  list.querySelectorAll('.an-item').forEach((el, i) => orders.push({ id: parseInt(el.dataset.id), order: i }));
  await apiFetch('/api/news', { method: 'PATCH', body: JSON.stringify({ orders }) });
  renderNews();
}

// Admin Streamers (panel gestion)
async function renderAdminStreamers() {
  const list = document.getElementById('admin-str-list');
  if (!list) return;
  const res = await apiFetch('/api/streamers');
  if (!res || !res.ok) { list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">Erreur chargement</p>'; return; }
  const strs = await res.json();
  if (!strs.length) { list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">Aucun streamer</p>'; return; }
  list.innerHTML = strs.map(s => {
    const login = twitchLogin(s.url);
    return `<div class="as-item">
      ${s.avatar ? `<img class="as-avatar" src="${s.avatar}" loading="lazy" onerror="this.style.display='none'">` : '<div class="as-avatar" style="background:var(--d4)"></div>'}
      <div class="as-info"><div class="as-name">${s.name}</div><div class="as-plat">${login ? 'twitch.tv/' + login : (s.url || '')}</div></div>
      <div class="as-actions"><button class="btn-sm del" onclick="deleteStreamer(${s.id})">✕</button></div>
    </div>`;
  }).join('');
}
async function deleteStreamer(id) {
  await apiFetch(`/api/streamers?id=${id}`, { method: 'DELETE' });
  renderAdminStreamers(); renderStreamers(); toast('Streamer supprimé', '');
}
async function submitAddStreamer(e) {
  e.preventDefault();
  const name   = document.getElementById('str-name').value.trim();
  const url    = document.getElementById('str-url').value.trim();
  const avatar = document.getElementById('str-avatar')?.value.trim() || '';
  if (!name || !url) { toast('Pseudo et lien Twitch requis.', 'err'); return; }
  if (!avatar) { toast('Photo de profil requise.', 'err'); return; }
  const res = await apiFetch('/api/streamers', { method: 'POST', body: JSON.stringify({ name, url, avatar }) });
  if (!res || !res.ok) { toast('Erreur lors de l\'ajout.', 'err'); return; }
  e.target.reset(); renderAdminStreamers(); renderStreamers(); toast('Streamer ajouté !', 'ok');
}

// Admin Users
async function renderAdminUsers() {
  const list = document.getElementById('admin-user-list');
  if (!list) return;
  list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">Chargement…</p>';
  const me = SESSION.user;
  const res = await apiFetch('/auth/admins');
  if (!res || !res.ok) { list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">Erreur chargement</p>'; return; }
  const admins = await res.json();
  if (!admins.length) { list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">Aucun admin configuré.</p>'; return; }
  list.innerHTML = admins.map(a => `
    <div class="glist-item">
      <div class="glist-info">
        <div class="glist-name">${a.pseudo || a.id}</div>
        <div class="glist-meta">${a.id}</div>
      </div>
      ${me && a.id !== me.id
        ? `<button class="gbtn gbtn-sm del" onclick="removeAdmin('${a.id}')">Retirer</button>`
        : '<span style="font-size:.7rem;color:var(--p3);font-weight:700">Vous</span>'}
    </div>`).join('');
}
async function removeAdmin(id) {
  if (!confirm('Retirer cet admin ?')) return;
  const res = await apiFetch('/auth/admins?id=' + id, { method: 'DELETE' });
  if (!res || !res.ok) { toast('Erreur lors de la suppression.', 'err'); return; }
  toast('Admin retiré.', 'ok');
  renderAdminUsers();
}
async function submitAddAdmin(e) {
  e.preventDefault();
  const id     = document.getElementById('new-admin-id')?.value.trim();
  const pseudo = document.getElementById('new-admin-pseudo')?.value.trim();
  if (!id || !pseudo) { toast('ID et pseudo requis.', 'err'); return; }
  const res = await apiFetch('/auth/admins', { method: 'POST', body: JSON.stringify({ id, pseudo }) });
  if (!res || !res.ok) { toast('Erreur lors de l\'ajout.', 'err'); return; }
  toast('Admin ajouté !', 'ok');
  e.target.reset();
  renderAdminUsers();
}

// ── AUTHENTIFICATION ──────────────────────────────────────────────
function loginWithDiscord() {
  if (typeof CONFIG === 'undefined' || !CONFIG.discordOAuthClientID) { toast('OAuth non configuré.', 'err'); return; }
  const params = new URLSearchParams({
    client_id: CONFIG.discordOAuthClientID,
    redirect_uri: CONFIG.discordOAuthRedirectURI,
    response_type: 'code', scope: 'identify',
  });
  window.location.href = `https://discord.com/oauth2/authorize?${params}`;
}

function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('discord_id') && !params.has('auth_error')) return;
  history.replaceState({}, '', window.location.pathname);
  if (params.get('auth_error')) { toast('Erreur de connexion Discord.', 'err'); return; }
  const discordId = params.get('discord_id'), globalName = params.get('global_name') || params.get('discord_pseudo');
  const discordAvatar = params.get('discord_avatar'), isAdmin = params.get('is_admin') === '1';
  const currentPath = window.location.pathname;
  const isOnWhitelistOrVotes = currentPath.includes('whitelist.html') || currentPath.includes('votes.html');

  // Toujours sauvegarder la session partagée (toutes les pages)
  if (discordId) {
    SharedAuth.set({ id: discordId, pseudo: globalName, avatar: discordAvatar });
  }

  if (!isAdmin) { return; } // Utilisateur normal : session sauvegardée, c'est tout

  // Admin : sauvegarder aussi la session admin
  SESSION.setUser({ id: discordId, pseudo: globalName, avatar: discordAvatar });
  renderNavUserProfile();

  // Si on est sur whitelist ou votes, ne pas rediriger vers gestion.html
  if (isOnWhitelistOrVotes) {
    toast(`Connecté en tant qu'admin, ${globalName} !`, 'ok');
    return;
  }
  toast(`Bienvenue, ${globalName} !`, 'ok');
  openAdminPanel();
}

async function renderNavUserProfile() {
  const u = SESSION.user;
  const navLinks = document.querySelector('.nav-links');
  document.getElementById('nav-user-profile')?.remove();
  document.getElementById('nav-gestion-site')?.remove();
  if (!u || !u.id) return;
  const isAdmin = await SESSION.isAdmin();
  if (!isAdmin) return;
  const gestionLi = document.createElement('li');
  gestionLi.id = 'nav-gestion-site';
  const href = protectedPageUrl('gestion.html');
  gestionLi.innerHTML = `<a href="${href}">Gestion site</a>`;
  const dropLi = navLinks?.querySelector('.nav-drop')?.closest('li') || navLinks?.querySelector('.nav-drop');
  if (dropLi && navLinks) navLinks.insertBefore(gestionLi, dropLi);
  else if (navLinks) navLinks.appendChild(gestionLi);
}


// Helper : construit l'URL d'une page protégée avec le discord_id en param
function protectedPageUrl(filename) {
  const base = window.location.pathname.includes('/pages/') ? filename : `pages/${filename}`;
  const discordId = SESSION.user?.id;
  if (!discordId) return base;
  return `${base}?discord_id=${encodeURIComponent(discordId)}`;
}

async function openAdminOrLogin() {
  // Si déjà un user en session, vérifier admin (mais ouvrir modal tout de suite si pas de réponse)
  const u = SESSION.user;
  if (u && u.id) {
    // Ouvrir le modal immédiatement, puis rediriger si admin confirmé
    openModal('modal-admin-login');
    const isAdmin = await SESSION.isAdmin();
    if (isAdmin) { closeAllModals(); openAdminPanel(); }
    return;
  }
  // Pas de session → ouvrir modal login directement
  openModal('modal-admin-login');
}
function openAdminPanel() {
  const currentPath = window.location.pathname;
  if (currentPath.includes('gestion.html')) { closeAllModals(); return; }
  window.location.href = protectedPageUrl('gestion.html');
}
function logoutAdmin() {
  SESSION.clearUser();
  closeAllModals();
  document.getElementById('nav-user-profile')?.remove();
  document.getElementById('nav-gestion-site')?.remove();
  toast('Déconnecté', '');
}

function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) closeAllModals(); }));
  document.querySelectorAll('.modal-x').forEach(btn => btn.addEventListener('click', closeAllModals));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });
  document.getElementById('btn-admin')?.addEventListener('click', e => { e.preventDefault(); openAdminOrLogin(); });
  document.getElementById('btn-aide')?.addEventListener('click',  e => { e.preventDefault(); openModal('modal-aide'); });
  document.getElementById('mm-admin')?.addEventListener('click', e => { e.preventDefault(); openAdminOrLogin(); });
  document.getElementById('mm-aide')?.addEventListener('click',  e => { e.preventDefault(); openModal('modal-aide'); });
}
function initForms() {
  document.getElementById('btn-discord-login')?.addEventListener('click', e => { e.preventDefault(); loginWithDiscord(); });
}

function initGlassTilt(selector) {
  document.querySelectorAll(selector).forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect(), cx = rect.width / 2, cy = rect.height / 2;
      card.style.transform = `perspective(900px) rotateX(${((e.clientY - rect.top - cy) / cy) * -8}deg) rotateY(${((e.clientX - rect.left - cx) / cx) * 8}deg) scale3d(1.025,1.025,1.025)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)'; });
  });
}

// ── INIT ──────────────────────────────────────────────────────────
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initPage);
else _initPage();

function _initPage() {
  if (window.location.pathname.includes('gestion.html')) return;
  applyConfig();
  initNavbar();
  initMobileMenu();
  initDropdown();
  initParticles();
  initAnim();
  initModals();
  initForms();
  renderNews();
  renderStreamers();
  renderNavUserProfile();
  fetchFiveM();
  fetchDiscordMembers();
  handleOAuthCallback();
  setInterval(() => { fetchFiveM(); fetchDiscordMembers(); renderStreamers(); }, 90_000);
}
