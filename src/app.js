// ---- Frontenden til Cirkulær Madbod

const MAP_CENTER     = [55.6173, 12.0784];
const HEAT_WINDOW_MS = 24 * 60 * 60 * 1000;      // seneste 24 timer
const LS_REPORTS     = 'gronkilde_reports';
const LS_DEVICE      = 'gronkilde_device';
const LS_LIKES       = 'gronkilde_likes';

// ---- Roller (persist via localStorage) ----
const LS_ROLE = 'gronkilde_role'; // 'guest' | 'volunteer' | 'organizer'

function getRole(){
  return localStorage.getItem(LS_ROLE) || 'guest'; // default
}
function setRole(role){
  localStorage.setItem(LS_ROLE, role);
  applyRoleUI();
}

// Vis /skjul UI baseret på rolle
function applyRoleUI(){
  const role     = getRole();
  const btnHeat  = document.getElementById('toggleHeat');
  const btnTrash = document.getElementById('reportTrash');
  const dashEl   = document.getElementById('dash');
  const exportBtn = document.getElementById('exportReports');  // <- NY

  const canSeeHeat = (role === 'volunteer');
  const canReport  = (role !== 'organizer');
  const canSeeDash = (role === 'organizer');

  if (btnHeat)  btnHeat.style.display  = '';
  if (btnTrash) btnTrash.style.display = '';
  if (exportBtn) exportBtn.style.display = '';                 // <- NY reset

  if (!canSeeHeat) {
    if (btnHeat) btnHeat.style.display = 'none';
    if (heatOn) { heatOn = false; renderHeat(); }
  }
  if (!canReport && btnTrash) btnTrash.style.display = 'none';

  // Skjul eksport-knap for ikke-arrangører
  if (exportBtn) exportBtn.style.display = (role === 'organizer') ? '' : 'none'; // <- NY

  if (dashEl) dashEl.classList.toggle('hidden', !canSeeDash);

  const sel = document.getElementById('roleSel');
  if (sel && sel.value !== role) sel.value = role;
}


// Wire dropdown
document.getElementById('roleSel')?.addEventListener('change', (e)=>{
  setRole(e.target.value);
  renderHeat();
  if (__DATA) renderDash(computeTotals());
});

let heatLayer    = null;
let heatOn       = false;
let armingReport = false;   // aktiveres af "Markér skrald"-knap
let undoTimer    = null;
let lastReportId = null;

let __DATA = null;

// ----------------------
// Init kort
// ----------------------
const map = L.map('map').setView(MAP_CENTER, 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

// =========================================================
// LocalStorage helpers
// =========================================================
// Reports
function loadReports() {
  try { return JSON.parse(localStorage.getItem(LS_REPORTS) || '[]'); }
  catch { return []; }
}
function saveReports(arr) { localStorage.setItem(LS_REPORTS, JSON.stringify(arr)); }
function getReportCount() { return loadReports().length; }

function addLocalReport(lat, lng, type = 'trash') {
  const id  = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const arr = loadReports();
  arr.push({ id, lat, lng, type, t: Date.now() });
  saveReports(arr);
  return id;
}
function removeReportById(id) {
  const arr = loadReports().filter(r => r.id !== id);
  saveReports(arr);
}

// Likes (1 pr. device pr. bod)
function getDeviceId() {
  let id = localStorage.getItem(LS_DEVICE);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2,10);
    localStorage.setItem(LS_DEVICE, id);
  }
  return id;
}
function loadLikes() {
  try { return JSON.parse(localStorage.getItem(LS_LIKES) || '{}'); }
  catch { return {}; }
}
function saveLikes(obj) { localStorage.setItem(LS_LIKES, JSON.stringify(obj)); }
function hasLiked(stallId) {
  const likes = loadLikes(); const uid = getDeviceId();
  return !!(likes[uid] && likes[uid][stallId]);
}
function setLiked(stallId) {
  const likes = loadLikes(); const uid = getDeviceId();
  likes[uid] = likes[uid] || {};
  likes[uid][stallId] = true;
  saveLikes(likes);
}

// =========================================================
// Heatmap
// =========================================================
function computeHeatPoints() {
  const now = Date.now();
  const pts = loadReports().filter(p => now - p.t < HEAT_WINDOW_MS);
  if (!pts.length) {
    // demo-fallback hvis ingen data
    return [
      [55.6184, 12.0796, 0.5],
      [55.6179, 12.0745, 0.7],
      [55.6169, 12.0812, 0.4]
    ];
  }
  const key = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  const mapCounts = new Map();
  pts.forEach(p => {
    const k = key(p);
    mapCounts.set(k, (mapCounts.get(k) || 0) + 1);
  });
  const max = Math.max(...mapCounts.values(), 1);
  const res = [];
  mapCounts.forEach((cnt, k) => {
    const [lat, lng] = k.split(',').map(Number);
    res.push([lat, lng, +(cnt / max).toFixed(2)]);
  });
  return res;
}

function renderHeat() {
  const points = computeHeatPoints();
  if (!heatLayer) {
    heatLayer = L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 });
  } else {
    heatLayer.setLatLngs(points);
  }
  if (heatOn && !map.hasLayer(heatLayer)) map.addLayer(heatLayer);
  if (!heatOn && heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
}

// =========================================================
// UI: knapper, events
// =========================================================
(function ensureControls() {
  const ctrl = document.querySelector('.map-ctrl');
  if (!ctrl) return;

  // Eksportér rapporter (hvis mangler)
  if (!document.getElementById('exportReports')) {
    const btn = document.createElement('button');
    btn.id = 'exportReports';
    btn.textContent = 'Eksportér rapporter';
    ctrl.appendChild(btn);
  }

  // Markér skrald (hvis mangler)
  if (!document.getElementById('reportTrash')) {
    const btn = document.createElement('button');
    btn.id = 'reportTrash';
    btn.textContent = 'Markér skrald';
    ctrl.appendChild(btn);
  }
})();

// Toggle Heatmap
document.getElementById('toggleHeat')?.addEventListener('click', (e) => {
  heatOn = !heatOn;
  e.target.textContent = `Heatmap: ${heatOn ? 'On' : 'Off'}`;
  renderHeat();
});

// Armér næste klik som rapport
document.getElementById('reportTrash')?.addEventListener('click', () => {
  armingReport = true;
  document.body.style.cursor = 'crosshair';
});

// Anvend rolle-UI ved load
applyRoleUI();

// ESC annullerer arming-mode
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && armingReport) {
    armingReport = false;
    document.body.style.cursor = 'default';
  }
});

// Klik på kortet → opret lokal rapport + “fortryd”
map.on('click', (ev) => {
  if (!armingReport) return;
  armingReport = false;
  document.body.style.cursor = 'default';

  const { lat, lng } = ev.latlng;
  lastReportId = addLocalReport(lat, lng, 'trash');
  renderHeat();
  if (__DATA) renderDash(computeTotals());
  showUndo(7000);
});

// Undo-knap
function showUndo(ms = 7000) {
  let undoBtn = document.getElementById('undoReport');
  if (!undoBtn) {
    const ctrl = document.querySelector('.map-ctrl') || document.body;
    undoBtn = document.createElement('button');
    undoBtn.id = 'undoReport';
    undoBtn.textContent = 'Fortryd markering';
    undoBtn.style.marginLeft = '8px';
    undoBtn.addEventListener('click', () => {
      if (lastReportId) removeReportById(lastReportId);
      lastReportId = null;
      clearTimeout(undoTimer);
      undoBtn.remove();
      renderHeat();
      if (__DATA) renderDash(computeTotals());
    });
    (document.querySelector('.map-ctrl') || document.body.appendChild(document.createElement('div'))).appendChild(undoBtn);
  }
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoBtn?.remove();
    lastReportId = null;
  }, ms);
}

// Eksport (JSON download)
document.getElementById('exportReports')?.addEventListener('click', () => {
  const data = JSON.stringify(loadReports(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rapporter.json';
  a.click();
  URL.revokeObjectURL(url);
});

// Init heatlayer (viser først når “On”)
renderHeat();

// =========================================================
// Modal
// =========================================================
const modal = document.getElementById('modal');
const modalContentEl = document.getElementById('modalContent');
const closeBtn = document.getElementById('closeModal');

if (modal) modal.classList.add('hidden');
closeBtn?.addEventListener('click', () => {
  modal.classList.add('hidden');
  modalContentEl.innerHTML = '';
});

function openModal(html) {
  if (!modal || !modalContentEl) return;
  modalContentEl.innerHTML = html;
  modal.classList.remove('hidden');
}

// =========================================================
// Data-load + markører
// =========================================================
const dash = document.getElementById('dash');

fetch('src/data.json')
  .then(r => r.json())
  .then(data => {
    __DATA = data;

    data.stalls.forEach(s => {
      const marker = L.marker(s.coords).addTo(map);
      marker.on('click', () => showStall(s.id));
    });

    renderDash(computeTotals());
  })
  .catch(err => console.error('Kunne ikke indlæse data.json:', err));

// Åbn bod-modal
window.showStall = (id) => {
  if (!__DATA) return;
  const s = __DATA.stalls.find(x => x.id === id);
  if (!s) return;

  const frac = (s.wasteFractions || []).map(f => `<span class="badge-chip">${f}</span>`).join(' ');
  const organicWidth = Math.min(100, Math.max(0, s.organicPct));
  const localWidth   = Math.min(100, Math.max(0, s.localPct));
  const meetsCo2 = s.co2PerMealKg <= __DATA.meta.co2GoalPerMealKg;
  const co2Line = `${s.co2PerMealKg} kg <span class="small">(mål: ${__DATA.meta.co2GoalPerMealKg} kg) ${meetsCo2 ? '✅' : '⚠️'}</span>`;

  openModal(`
    <h2>${s.name}</h2>
    <div class="info-grid">
      <div class="kv"><b>Madtype</b><div class="v">${s.foodType}</div></div>
      <div class="kv"><b>Energi</b><div class="v">${s.energy}</div></div>
      <div class="kv"><b>CO₂ pr. måltid</b><div class="v">${co2Line}</div></div>
      <div class="kv"><b>Madspild</b><div class="v">${s.foodWastePct}% • Donation: ${s.donatesSurplus ? 'Ja' : 'Nej'}</div></div>
      <div class="kv">
        <b>Økologi</b>
        <div class="progress" title="${s.organicPct}%"><span style="width:${organicWidth}%"></span></div>
        <div class="small">${s.organicPct}%</div>
      </div>
      <div class="kv">
        <b>Lokal andel</b>
        <div class="progress" title="${s.localPct}%"><span style="width:${localWidth}%"></span></div>
        <div class="small">${s.localPct}%</div>
      </div>
    </div>

    <b>Affaldssortering</b>
    <div class="badges">${frac}</div>

    <div class="flow">
      <div class="step">🍔 Mad</div><div class="sep">➜</div>
      <div class="step">🗑️ Affald</div><div class="sep">➜</div>
      <div class="step">🔄 Biogas/Genbrug</div><div class="sep">➜</div>
      <div class="step">🔋 Energi</div><div class="sep">➜</div>
      <div class="step">🎶 Festival</div>
    </div>

    <div class="actions">
      <button class="like" data-id="${s.id}" onclick="likeStall('${s.id}')" ${hasLiked(s.id) ? 'disabled' : ''}>
        ${hasLiked(s.id) ? '👍 Liked' : '👍 Like'}
      </button>
      <span id="likes-${s.id}">${s.likes}</span>
    </div>
  `);
};

// =========================================================
// Likes-handler
// =========================================================
window.likeStall = (id) => {
  if (!__DATA) return;
  if (hasLiked(id)) return;        // ignorer dobbelt-like

  const s = __DATA.stalls.find(x => x.id === id);
  if (!s) return;

  s.likes++;
  setLiked(id);

  const btn = document.querySelector(`button.like[data-id="${id}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = '👍 Liked';
    btn.classList.add('disabled');
  }
  const el = document.getElementById(`likes-${id}`);
  if (el) el.textContent = s.likes;
};

// =========================================================
// Dashboard
// =========================================================
function computeTotals() {
  const d = __DATA;
  const count = d.stalls.length;
  const sumCo2 = d.stalls.reduce((a, s) => a + s.co2PerMealKg, 0);
  const sumOrganic = d.stalls.reduce((a, s) => a + s.organicPct, 0);
  const avgCo2 = (sumCo2 / count).toFixed(2);
  const avgOrganic = Math.round(sumOrganic / count);
  const underGoal = d.stalls.filter(s => s.co2PerMealKg <= d.meta.co2GoalPerMealKg).length;
  return { avgCo2, avgOrganic, goal: d.meta.co2GoalPerMealKg, count, underGoal };
}

function renderDash(t) {
  dash.innerHTML = `
    <h4>Festival status</h4>
    <div class="row">
      <div class="pill">Gns. CO₂/ret: <b>${t.avgCo2} kg</b> <span class="badge">mål ${t.goal} kg</span></div>
      <div class="pill">Under CO₂-mål: <b>${t.underGoal}/${t.count}</b></div>
      <div class="pill">Øko (gns.): <b>${t.avgOrganic}%</b></div>
      <div class="pill">Boder: <b>${t.count}</b></div>
      <div class="pill">Rapporter: <b>${getReportCount()}</b></div>
    </div>
  `;
  // vis kun for arrangør
  dash.classList.toggle('hidden', getRole() !== 'organizer');
}
