// Init kort
const map = L.map('map').setView([55.6173, 12.0784], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

// Modal helpers
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
  dash.innerHTML = `
    <h4>Festival status</h4>
    <div class="row">
      <div class="pill">Gns. CO₂/ret: <b>${t.avgCo2} kg</b> <span class="badge">mål ${t.goal} kg</span></div>
      <div class="pill">Under CO₂-mål: <b>${t.underGoal}/${t.count}</b></div>
      <div class="pill">Øko (gns.): <b>${t.avgOrganic}%</b></div>
      <div class="pill">Boder: <b>${t.count}</b></div>
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
      marker.on('click', () => {
        console.log('Markør klikket:', s.id);
        showStall(s.id);
      });
    });

    renderDash(computeTotals());
  })
  .catch(err => console.error('Kunne ikke indlæse data.json:', err));

// Åbn bod‑modal (opgraderet visning)
window.showStall = (id) => {
  console.log('Åbner modal for bod:', id);
  if (!__DATA) { console.warn('DATA ikke klar endnu'); return; }
  const s = __DATA.stalls.find(x=>x.id===id);
  if (!s) { console.warn('Bod ikke fundet:', id); return; }

  const frac = (s.wasteFractions || []).map(f=>`<span class="badge-chip">${f}</span>`).join(' ');
  const organicWidth = Math.min(100, Math.max(0, s.organicPct));
  const localWidth   = Math.min(100, Math.max(0, s.localPct));
  const meetsCo2 = s.co2PerMealKg <= __DATA.meta.co2GoalPerMealKg;
  const co2Line = `${s.co2PerMealKg} kg <span class="small">(mål: ${__DATA.meta.co2GoalPerMealKg} kg) ${meetsCo2 ? '✅' : '⚠️'}</span>`;

  openModal(`
    <h2>${s.name}</h2>
    <div class="info-grid">
      <div class="kv">
        <b>Madtype</b>
        <div class="v">${s.foodType}</div>
      </div>
      <div class="kv">
        <b>Energi</b>
        <div class="v">${s.energy}</div>
      </div>
      <div class="kv">
        <b>CO₂ pr. måltid</b>
        <div class="v">${co2Line}</div>
      </div>
      <div class="kv">
        <b>Madspild</b>
        <div class="v">${s.foodWastePct}% • Donation: ${s.donatesSurplus ? 'Ja' : 'Nej'}</div>
      </div>
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

// Like‑tæller (lokal)
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
