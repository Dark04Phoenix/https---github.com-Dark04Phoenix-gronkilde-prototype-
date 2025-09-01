// ==== Init kort ====
const map = L.map('map').setView([55.6173, 12.0784], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

// ==== HEATMAP + RAPPORTER (lokal demo uden backend) ====
// UI state
let heatLayer = null;
let heatOn = false;
let armingReport = false;
let undoTimer = null;
let lastReportId = null;

const HEAT_WINDOW_MS = 24 * 60 * 60 * 1000;   // kun seneste 24 timer vises i heatmap
const LS_REPORTS = 'gronkilde_reports';

// Hjælpere til lokal storage
function loadReports(){
  try { return JSON.parse(localStorage.getItem(LS_REPORTS) || '[]'); }
  catch { return []; }
}
function saveReports(arr){
  localStorage.setItem(LS_REPORTS, JSON.stringify(arr));
}
function getReportCount(){
  return loadReports().length;
}

// Tilføj/slet rapport
function addLocalReport(lat, lng, type='trash'){
  const id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const arr = loadReports();
  arr.push({ id, lat, lng, type, t: Date.now() });
  saveReports(arr);
  return id;
}
function removeReportById(id){
  const arr = loadReports().filter(r => r.id !== id);
  saveReports(arr);
}

// Aggreger til heatmap-punkter (gruppering + intensitet 0..1) m. tidsfilter
function computeHeatPoints(){
  const now = Date.now();
  const pts = loadReports().filter(p => now - p.t < HEAT_WINDOW_MS);
  if (!pts.length) {
    // fallback demo-punkter hvis ingen data endnu
    return [
      [55.6184, 12.0796, 0.5],
      [55.6179, 12.0745, 0.7],
      [55.6169, 12.0812, 0.4]
    ];
  }
  const key = (p)=> `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  const mapCounts = new Map();
  pts.forEach(p => {
    const k = key(p);
    mapCounts.set(k, (mapCounts.get(k) || 0) + 1);
  });
  const max = Math.max(...mapCounts.values(), 1);
  const res = [];
  mapCounts.forEach((cnt, k)=>{
    const [lat, lng] = k.split(',').map(Number);
    res.push([lat, lng, +(cnt/max).toFixed(2)]);
  });
  return res;
}

// Tegn/ret heatlayer
function renderHeat(){
  const points = computeHeatPoints();
  if (!heatLayer) {
    heatLayer = L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 });
  } else {
    heatLayer.setLatLngs(points);
  }
  if (heatOn && !map.hasLayer(heatLayer)) map.addLayer(heatLayer);
  if (!heatOn && heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
}

// UI-knapper (tilføj Export-knap hvis den ikke findes)
(function ensureControls(){
  const ctrl = document.querySelector('.map-ctrl');
  if (ctrl && !document.getElementById('exportReports')) {
    const btn = document.createElement('button');
    btn.id = 'exportReports';
    btn.textContent = 'Eksportér rapporter';
    ctrl.appendChild(btn);
  }
})();

// Toggle heatmap
document.getElementById('toggleHeat')?.addEventListener('click', (e)=>{
  heatOn = !heatOn;
  e.target.textContent = `Heatmap: ${heatOn ? 'On' : 'Off'}`;
  renderHeat();
});

// Klik på kortet = opret lokal rapport + "fortryd" i få sekunder
map.on('click', (ev)=>{
  if (!armingReport) return;
  armingReport = false;
  document.body.style.cursor = 'default';

  const { lat, lng } = ev.latlng;
  lastReportId = addLocalReport(lat, lng, 'trash');
  renderHeat();
  // opdater dashboard tallet
  if (__DATA) renderDash(computeTotals());

  showUndo(7000); // 7 sekunders chance for at fortryde
});

// Enkel “fortryd” knap i hjørnet (auto-skjules)
function showUndo(ms=7000){
  let undoBtn = document.getElementById('undoReport');
  if (!undoBtn) {
    const ctrl = document.querySelector('.map-ctrl') || document.body;
    undoBtn = document.createElement('button');
    undoBtn.id = 'undoReport';
    undoBtn.textContent = 'Fortryd markering';
    undoBtn.style.marginLeft = '8px';
    undoBtn.addEventListener('click', ()=>{
      if (lastReportId) removeReportById(lastReportId);
      lastReportId = null;
      clearTimeout(undoTimer);
      undoBtn.remove();
      renderHeat();
      if (__DATA) renderDash(computeTotals());
    });
    (document.querySelector('.map-ctrl') || document.body.appendChild(document.createElement('div'))).appendChild(undoBtn);
  }
  // auto-hide
  clearTimeout(undoTimer);
  undoTimer = setTimeout(()=> {
    undoBtn?.remove();
    lastReportId = null;
  }, ms);
}

// Eksportér rapporter (JSON-download)
document.getElementById('exportReports')?.addEventListener('click', ()=>{
  const data = JSON.stringify(loadReports(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rapporter.json';
  a.click();
  URL.revokeObjectURL(url);
});

// Tegn initialt (viser kun hvis Heatmap: On)
renderHeat();


// ==== Modal/Dashboard/Existing features ====
const modal = document.getElementById('modal');
const modalContentEl = document.getElementById('modalContent');
const closeBtn = document.getElementById('closeModal');

// sørger for at modallen er skjult fra start
if (modal) modal.classList.add('hidden');

// binder X-knap robust
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    modalContentEl.innerHTML = '';
  });
}

function openModal(html){
  if (!modal || !modalContentEl) return;
  modalContentEl.innerHTML = html;
  modal.classList.remove('hidden');
}

// Dashboard helpers
const dash = document.getElementById('dash');
function renderDash(t){
  // + Rapporter tæller
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
  dash.classList.remove('hidden');
}

let __DATA = null;

// Indlæs data + sæt markører
fetch('src/data.json')
  .then(r=>r.json())
  .then(data=>{
    __DATA = data;

    data.stalls.forEach(s=>{
      const marker = L.marker(s.coords).addTo(map);
      marker.on('click', () => showStall(s.id));
    });

    renderDash(computeTotals());
  })
  .catch(err => console.error('Kunne ikke indlæse data.json:', err));

// Åbn bod-modal
window.showStall = (id) => {
  if (!__DATA) return;
  const s = __DATA.stalls.find(x=>x.id===id);
  if (!s) return;

  const frac = (s.wasteFractions || []).map(f=>`<span class="badge-chip">${f}</span>`).join(' ');
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
      <button class="like" onclick="likeStall('${s.id}')">👍 Like</button>
      <span id="likes-${s.id}">${s.likes}</span>
    </div>
  `);
};

// Like-tæller (lokal)
window.likeStall = (id) => {
  const s = __DATA?.stalls.find(x=>x.id===id);
  if (!s) return;
  s.likes++;
  const el = document.getElementById(`likes-${id}`);
  if (el) el.textContent = s.likes;
};

// Dashboard beregninger
function computeTotals(){
  const d = __DATA;
  const count = d.stalls.length;
  const sumCo2 = d.stalls.reduce((a,s)=>a + s.co2PerMealKg, 0);
  const sumOrganic = d.stalls.reduce((a,s)=>a + s.organicPct, 0);
  const avgCo2 = (sumCo2 / count).toFixed(2);
  const avgOrganic = Math.round(sumOrganic / count);
  const underGoal = d.stalls.filter(s => s.co2PerMealKg <= d.meta.co2GoalPerMealKg).length;
  return { avgCo2, avgOrganic, goal: d.meta.co2GoalPerMealKg, count, underGoal };
}

