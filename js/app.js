// Expé'Radio — interface de l'application
import { db, uid } from './db.js';
import { lookupCall, normalizeCall, isPlausibleCall } from './callsign.js';
import { bandFromFreq, bandLabel, MODES, parseFreq, isValidGrid, normalizeGrid, distanceBearing } from './radio.js';
import { PROGRAMS, PROGRAM_KEYS, activePrograms, programStatus, findDupe, isValidRef, normalizeRef, parseTheirRefs } from './programs.js';
import { exportFile, EXPORT_HELP, APP_VERSION } from './export.js';

const app = document.getElementById('app');
let cleanup = null;
let settings = {};
let installPrompt = null;
let swWaiting = null;

// ---------- Outils ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = app) => root.querySelector(sel);
const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, '0');
const utcHM = (ts) => { const d = new Date(ts); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const frDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

const ICON = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="#7FD8A8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
  wait: '<svg viewBox="0 0 24 24" fill="none" stroke="#F5C46B" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function onlineChip() {
  return navigator.onLine
    ? '<span class="chip ok"><span class="dot"></span>En ligne</span>'
    : '<span class="chip"><span class="dot"></span>Hors ligne · tout est enregistré</span>';
}

function refsLine(a) {
  const keys = activePrograms(a);
  return keys.length ? keys.map((k) => esc(normalizeRef(a.refs[k]))).join(' · ') : 'Sortie portable';
}

function download(file) {
  const blob = new Blob([file.text], { type: `${file.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast(`Fichier enregistré : ${file.name}`);
}

function canShareFiles() {
  try { return !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }); } catch { return false; }
}

async function share(file) {
  const f = new File([file.text], file.name, { type: 'text/plain' });
  try { await navigator.share({ files: [f], title: file.name }); } catch (e) { if (e?.name !== 'AbortError') download(file); }
}

// ---------- Accueil ----------
async function viewHome() {
  const acts = await db.listActivations();
  const counts = await Promise.all(acts.map((a) => db.listQsos(a.id).then((l) => l.length)));
  app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <span class="brand">Expé'Radio</span>
      <div class="row">${onlineChip()}<a class="icon-btn" href="#/reglages" aria-label="Réglages">${ICON.gear}</a></div>
    </div>
    ${!settings.myCall ? '<div class="banner">Commencez par indiquer votre indicatif dans les <a href="#/reglages">réglages</a>.</div>' : ''}
    ${swWaiting ? '<div class="banner ok row spread"><span>Une nouvelle version est disponible.</span><button class="btn" id="reload">Mettre à jour</button></div>' : ''}
    <a class="btn primary big" href="#/nouvelle">Nouvelle activation</a>
    ${installPrompt ? '<button class="btn block" id="install">Installer l\'application sur cet appareil</button>' : ''}
    <section class="act-list" aria-label="Mes activations">
      <h2>Mes activations</h2>
      ${acts.length ? acts.map((a, i) => `
        <a class="act-item" href="#/a/${esc(a.id)}${a.closed ? '/cloture' : ''}">
          <span style="display:flex;flex-direction:column;gap:2px;min-width:0">
            <span class="refs">${refsLine(a)}</span>
            <span class="small muted mono">${esc(a.stationCall)}</span>
          </span>
          <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="small muted">${frDate(a.createdAt)} · ${counts[i]} QSO</span>
            ${a.closed ? '<span class="chip">Clôturée</span>' : '<span class="chip warn">En cours</span>'}
          </span>
        </a>`).join('') : '<p class="empty">Aucune activation pour l\'instant.</p>'}
    </section>
    <p class="small muted">Version ${APP_VERSION} · vos données restent sur cet appareil.</p>
  </div>`;
  $('#install')?.addEventListener('click', async () => {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    route();
  });
  $('#reload')?.addEventListener('click', () => swWaiting.postMessage('skipWaiting'));
}

// ---------- Réglages ----------
async function viewSettings() {
  app.innerHTML = `
  <div class="page">
    <div class="topbar"><a class="icon-btn" href="#/" aria-label="Retour">${ICON.back}</a><h1 style="flex:1">Réglages</h1></div>
    <form class="card" id="f">
      <h2>Ma station</h2>
      <label class="field">Mon indicatif
        <input name="myCall" class="mono" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(settings.myCall)}" required>
      </label>
      <label class="field">Mon locator habituel
        <input name="myGrid" class="mono" autocomplete="off" spellcheck="false" placeholder="ex. JN33lp" value="${esc(settings.myGrid)}">
        <span class="hint">Sert pour la distance et l'azimut des correspondants. Modifiable pour chaque activation.</span>
      </label>
      <button class="btn primary" type="submit">Enregistrer</button>
    </form>
    <section class="card">
      <h2>Sauvegarde</h2>
      <p class="small muted" style="margin:0">Vos activations ne sont stockées que sur cet appareil. Une sauvegarde régulière permet de les retrouver ou de les transférer sur un autre appareil (PC, tablette, téléphone).</p>
      <button class="btn" id="backup">Télécharger une sauvegarde</button>
      <label class="btn" for="restore">Restaurer une sauvegarde</label>
      <input type="file" id="restore" accept=".json,application/json" class="sr">
    </section>
    <section class="card">
      <h2>Comptes de recherche d'indicatifs</h2>
      <p class="small muted" style="margin:0">La recherche automatique du nom et du locator via QRZ.com, HamQTH et QRZCQ arrive dans la prochaine version. En attendant, le pays et le drapeau sont trouvés hors ligne, et le locator se saisit à la main.</p>
    </section>
    <section class="card">
      <h2>À propos</h2>
      <p class="small muted" style="margin:0">Expé'Radio ${APP_VERSION} — logiciel libre sous licence GPL v3.<br>
      Identification des pays : Country Files d'AD1C (country-files.com). Drapeaux : Twemoji (CC-BY 4.0).<br>
      Polices : Atkinson Hyperlegible et JetBrains Mono (SIL OFL).</p>
    </section>
  </div>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const myCall = normalizeCall(fd.get('myCall'));
    const g = String(fd.get('myGrid') || '').trim();
    if (g && !isValidGrid(g)) { toast('Locator invalide (ex. JN33lp)'); return; }
    settings = { ...settings, myCall, myGrid: normalizeGrid(g) };
    await db.saveSettings(settings);
    location.hash = '#/';
    setTimeout(() => toast('Réglages enregistrés'), 50);
  });
  $('#backup').addEventListener('click', async () => {
    const data = await db.backup();
    const d = new Date();
    download({ name: `experadio-sauvegarde-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`, mime: 'application/json', text: JSON.stringify(data, null, 1) });
  });
  $('#restore').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const r = await db.restore(JSON.parse(await file.text()));
      settings = await db.getSettings();
      toast(`Restauré : ${r.activations} activations, ${r.qsos} QSO`);
    } catch (err) {
      toast(err.message || 'Fichier illisible');
    }
    e.target.value = '';
  });
}

// ---------- Nouvelle activation / modification ----------
async function viewActivationForm(id) {
  const a = id ? await db.getActivation(id) : null;
  if (id && !a) { location.hash = '#/'; return; }
  const cur = a || { stationCall: settings.myCall || '', refs: {}, myGrid: settings.myGrid || '' };
  app.innerHTML = `
  <div class="page">
    <div class="topbar"><a class="icon-btn" href="${a ? `#/a/${esc(a.id)}` : '#/'}" aria-label="Retour">${ICON.back}</a>
      <h1 style="flex:1">${a ? 'Modifier l\'activation' : 'Nouvelle activation'}</h1></div>
    <form class="page" style="padding:0" id="f" novalidate>
      <section class="card">
        <label class="field">Indicatif utilisé sur l'air
          <input name="stationCall" class="mono" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(cur.stationCall)}" required>
          <span class="hint">À l'étranger, ajoutez le préfixe du pays : par exemple I1/F4JCF/P en Italie.</span>
        </label>
        <label class="field">Locator du lieu d'activation
          <input name="myGrid" class="mono" autocomplete="off" spellcheck="false" placeholder="ex. JN34" value="${esc(cur.myGrid)}">
        </label>
      </section>
      <section class="card">
        <h2>Programmes</h2>
        <p class="small muted" style="margin:0">Cochez les programmes de cette sortie et indiquez leur référence. Une même sortie peut compter pour plusieurs programmes.</p>
        ${PROGRAM_KEYS.map((k) => {
          const p = PROGRAMS[k];
          const ref = cur.refs?.[k] || '';
          return `
          <div class="prog" data-k="${k}" style="display:flex;flex-direction:column;gap:6px">
            <label class="check"><input type="checkbox" name="on_${k}" ${ref ? 'checked' : ''}><span><b>${p.label}</b> <span class="muted small">${p.full}</span></span></label>
            <label class="field ${ref ? '' : 'hidden'}"><span class="sr">Référence ${p.label}</span>
              <input name="ref_${k}" class="mono" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${p.example ? `ex. ${esc(p.example)}` : 'référence'}" value="${esc(ref)}">
              <span class="hint">${esc(p.rule)}</span>
            </label>
          </div>`;
        }).join('')}
      </section>
      <section class="card">
        <label class="field">Notes (facultatif)
          <textarea name="notes" placeholder="Matériel, conditions, accès…">${esc(cur.notes)}</textarea>
        </label>
      </section>
      <p class="banner hidden" id="err" role="alert"></p>
      <button class="btn primary big" type="submit">${a ? 'Enregistrer' : 'Démarrer l\'activation'}</button>
    </form>
  </div>`;
  $$('.prog').forEach((el) => {
    const cb = el.querySelector('input[type=checkbox]');
    const fieldEl = el.querySelector('.field');
    cb.addEventListener('change', () => {
      fieldEl.classList.toggle('hidden', !cb.checked);
      if (cb.checked) fieldEl.querySelector('input').focus();
    });
  });
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errors = [];
    const stationCall = normalizeCall(fd.get('stationCall'));
    if (!isPlausibleCall(stationCall)) errors.push('L\'indicatif utilisé semble incorrect.');
    const g = String(fd.get('myGrid') || '').trim();
    if (g && !isValidGrid(g)) errors.push('Le locator est invalide (ex. JN34 ou JN34ab).');
    const refs = {};
    for (const k of PROGRAM_KEYS) {
      if (!fd.get(`on_${k}`)) continue;
      const r = normalizeRef(fd.get(`ref_${k}`));
      if (!r) { errors.push(`Indiquez la référence ${k}.`); continue; }
      if (!isValidRef(k, r)) errors.push(`La référence ${k} « ${r} » ne ressemble pas au format attendu${PROGRAMS[k].example ? ` (ex. ${PROGRAMS[k].example})` : ''}.`);
      refs[k] = r;
    }
    const err = $('#err');
    if (errors.length) {
      err.innerHTML = errors.map(esc).join('<br>');
      err.classList.remove('hidden');
      err.scrollIntoView({ block: 'center' });
      return;
    }
    const act = { ...(a || { id: uid(), createdAt: new Date().toISOString(), closed: false }),
      stationCall, myGrid: normalizeGrid(g), refs, notes: String(fd.get('notes') || '').trim() };
    await db.saveActivation(act);
    location.hash = `#/a/${act.id}`;
  });
}

// ---------- Saisie sur le terrain ----------
function countersHtml(a, qsos) {
  const keys = activePrograms(a);
  return `
    <div class="total"><b>${qsos.length}</b><span class="muted">QSO</span></div>
    ${keys.length ? `<div class="bars">${keys.map((k) => {
      const s = programStatus(k, qsos);
      const pct = s.target ? Math.min(100, Math.round((s.count / s.target) * 100)) : (s.count ? 100 : 0);
      const val = s.target == null ? `<span class="val">${s.count}</span>`
        : s.valid ? '<span class="val ok">Validé</span>' : `<span class="val">${s.count} / ${s.target}</span>`;
      return `<b>${k}</b><div class="bar ${s.valid ? 'done' : ''}" role="img" aria-label="${k} : ${s.count}${s.target ? ` sur ${s.target}` : ''}"><span style="width:${pct}%"></span></div>${val}`;
    }).join('')}</div>` : ''}`;
}

function logRowHtml(q, n) {
  const info = lookupCall(q.call);
  const their = parseTheirRefs(q.theirRefs);
  const tags = Object.entries(their).map(([k, v]) => `<span class="tag">${esc(k)} ${esc(v)}</span>`).join(' ');
  return `
    <div class="log-row" data-id="${esc(q.id)}">
      <span class="meta mono d">${utcHM(q.ts)}</span>
      <span class="who">${info?.flag ? `<span class="flag" title="${esc(info.name)}">${info.flag}</span>` : ''}${esc(q.call)}${q.grid ? ` <span class="sub">${esc(q.grid)}</span>` : ''} ${tags}</span>
      <span class="meta d">${esc(bandLabel(q.band))}</span>
      <span class="meta d">${esc(q.mode)}</span>
      <span class="meta mono d">${esc(q.rstSent)}/${esc(q.rstRcvd)}</span>
      <span class="meta small d">${esc(q.name || '')}${q.name && q.comment ? ' · ' : ''}${esc(q.comment || '')}</span>
      <span class="meta m">${esc(bandLabel(q.band))} · ${esc(q.mode)} · ${utcHM(q.ts)}<span class="sr">, QSO n°${n}</span></span>
      <button class="icon-btn" data-del="${esc(q.id)}" aria-label="Supprimer le QSO avec ${esc(q.call)}">${ICON.trash}</button>
    </div>`;
}

async function viewTerrain(id) {
  const a = await db.getActivation(id);
  if (!a) { location.hash = '#/'; return; }
  let qsos = await db.listQsos(id);
  const last = a.last || {};
  const mode = MODES[last.mode] ? last.mode : 'SSB';
  const myGrid = a.myGrid || settings.myGrid || '';

  app.innerHTML = `
  <div class="page wide">
    <div class="topbar">
      <div class="row" style="gap:4px;min-width:0">
        <a class="icon-btn" href="#/" aria-label="Retour à l'accueil">${ICON.back}</a>
        <div style="display:flex;flex-direction:column;min-width:0">
          <span class="refs">${refsLine(a)}</span>
          <span class="small muted mono">${esc(a.stationCall)}</span>
        </div>
      </div>
      <div class="row">
        <span class="clock" id="clock" aria-label="Heure UTC"></span>
        <span id="net">${onlineChip()}</span>
        <a class="icon-btn" href="#/a/${esc(a.id)}/modifier" aria-label="Modifier l'activation">${ICON.edit}</a>
        <a class="btn" href="#/a/${esc(a.id)}/cloture">Terminer</a>
      </div>
    </div>
    <div class="terrain">
      <div class="side" style="display:flex;flex-direction:column;gap:16px">
        <section class="card counter" id="counters" aria-live="polite">${countersHtml(a, qsos)}</section>
        <form class="card" id="qf" autocomplete="off" novalidate>
          <div class="grid2">
            <label class="field"><span>Fréquence (MHz) <span id="band" class="small"></span></span>
              <input name="freq" class="mono" inputmode="decimal" value="${esc(last.freq || '')}" placeholder="ex. 14.285">
            </label>
            <label class="field">Mode
              <select name="mode">${Object.keys(MODES).map((m) => `<option ${m === mode ? 'selected' : ''}>${m}</option>`).join('')}</select>
            </label>
          </div>
          <label class="field call">Indicatif du correspondant
            <input name="call" autocapitalize="characters" spellcheck="false" enterkeyhint="done" aria-describedby="callinfo">
          </label>
          <div class="callinfo" id="callinfo" aria-live="polite"></div>
          <div class="grid2">
            <label class="field">Report envoyé<input name="rstSent" class="mono" inputmode="text" value="${MODES[mode].rst}"></label>
            <label class="field">Report reçu<input name="rstRcvd" class="mono" inputmode="text" value="${MODES[mode].rst}"></label>
          </div>
          <label class="field">Sa référence, s'il est en activation (P2P, S2S…)
            <input name="theirRefs" class="mono" autocapitalize="characters" spellcheck="false" placeholder="ex. FR-0123 ou F/AM-001">
          </label>
          <details class="more">
            <summary>Plus de champs (locator, nom, heure…)</summary>
            <div style="display:flex;flex-direction:column;gap:10px;padding-top:6px">
              <div class="grid2">
                <label class="field">Son locator<input name="grid" class="mono" spellcheck="false" placeholder="ex. JO31"></label>
                <label class="field">Heure UTC<input name="time" class="mono" inputmode="numeric" placeholder="auto"></label>
              </div>
              <label class="field">Nom<input name="name" autocomplete="off"></label>
              <label class="field">Commentaire<input name="comment" autocomplete="off"></label>
            </div>
          </details>
          <button class="btn primary big" type="submit">Enregistrer le QSO</button>
          <p class="small muted" style="margin:0">Astuce : la touche Entrée enregistre le QSO.</p>
        </form>
      </div>
      <section class="card" aria-label="Journal">
        <div class="row spread"><h2>Journal</h2><span class="small muted">heures en UTC</span></div>
        <div class="log-head"><span>Heure</span><span>Indicatif</span><span>Bande</span><span>Mode</span><span>Reports</span><span>Notes</span><span></span></div>
        <div class="log" id="log"></div>
      </section>
    </div>
  </div>`;

  const f = $('#qf');
  const el = (n) => f.elements[n];

  const renderLog = () => {
    $('#log').innerHTML = qsos.length ? qsos.map((q, i) => logRowHtml(q, qsos.length - i)).join('') : '<p class="empty">Aucun QSO pour l\'instant.</p>';
    $('#counters').innerHTML = countersHtml(a, qsos);
  };
  const updateBand = () => {
    const b = bandFromFreq(el('freq').value);
    const v = el('freq').value.trim();
    $('#band').textContent = b ? `· ${bandLabel(b)}` : (v ? '· hors bande' : '');
    el('freq').setAttribute('aria-invalid', v && !b ? 'true' : 'false');
  };
  const updateCallInfo = () => {
    const call = normalizeCall(el('call').value);
    const box = $('#callinfo');
    if (!call) { box.innerHTML = ''; return; }
    const info = lookupCall(call);
    const parts = [];
    if (info) parts.push(`${info.flag ? `<span class="flag" aria-hidden="true">${info.flag}</span>` : ''}<b>${esc(info.name)}</b>`);
    const g = el('grid').value.trim();
    if (g && isValidGrid(g) && myGrid) {
      const d = distanceBearing(myGrid, g);
      if (d) parts.push(`<span class="muted">${d.km} km · ${d.deg}°</span>`);
    }
    const cand = { call, band: bandFromFreq(el('freq').value), mode: el('mode').value, ts: new Date().toISOString() };
    const dupe = cand.band && findDupe(qsos, cand);
    if (dupe) parts.push(`<span class="warn">Déjà contacté à ${utcHM(dupe.ts)} sur cette bande et ce mode</span>`);
    box.innerHTML = parts.join('');
  };

  renderLog();
  updateBand();

  el('freq').addEventListener('input', () => { updateBand(); updateCallInfo(); });
  el('call').addEventListener('input', updateCallInfo);
  el('grid').addEventListener('input', updateCallInfo);
  el('mode').addEventListener('change', () => {
    const def = MODES[el('mode').value].rst;
    const defaults = new Set(Object.values(MODES).map((m) => m.rst));
    if (defaults.has(el('rstSent').value)) el('rstSent').value = def;
    if (defaults.has(el('rstRcvd').value)) el('rstRcvd').value = def;
    updateCallInfo();
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const call = normalizeCall(el('call').value);
    if (!call) { el('call').focus(); return; }
    const band = bandFromFreq(el('freq').value);
    if (!band) { toast('Indiquez une fréquence dans une bande radioamateur'); el('freq').focus(); return; }
    let ts = new Date();
    const t = el('time').value.replace(/\D/g, '');
    if (t) {
      if (t.length !== 4 || Number(t.slice(0, 2)) > 23 || Number(t.slice(2)) > 59) { toast('Heure UTC au format HHMM, ex. 0942'); el('time').focus(); return; }
      ts = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(), Number(t.slice(0, 2)), Number(t.slice(2))));
    }
    const g = el('grid').value.trim();
    if (g && !isValidGrid(g)) { toast('Locator invalide (ex. JO31)'); el('grid').focus(); return; }
    const q = {
      id: uid(), activationId: a.id, ts: ts.toISOString(), call,
      freq: String(parseFreq(el('freq').value)), band, mode: el('mode').value,
      rstSent: el('rstSent').value.trim(), rstRcvd: el('rstRcvd').value.trim(),
      theirRefs: el('theirRefs').value.trim().toUpperCase(), grid: normalizeGrid(g),
      name: el('name').value.trim(), comment: el('comment').value.trim(),
    };
    await db.saveQso(q);
    qsos = [q, ...qsos].sort((x, y) => (x.ts < y.ts ? 1 : -1));
    a.last = { freq: el('freq').value.trim(), mode: q.mode };
    await db.saveActivation(a);
    renderLog();
    ['call', 'theirRefs', 'grid', 'name', 'comment', 'time'].forEach((n) => { el(n).value = ''; });
    el('rstSent').value = MODES[q.mode].rst;
    el('rstRcvd').value = MODES[q.mode].rst;
    updateCallInfo();
    el('call').focus();
    const newly = activePrograms(a).filter((k) => {
      const before = programStatus(k, qsos.filter((x) => x.id !== q.id)).valid;
      return !before && programStatus(k, qsos).valid && programStatus(k, qsos).target;
    });
    toast(newly.length ? `${newly.join(' et ')} : activation validée !` : `QSO n°${qsos.length} enregistré`);
  });

  $('#log').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const q = qsos.find((x) => x.id === btn.dataset.del);
    if (!q || !confirm(`Supprimer le QSO avec ${q.call} à ${utcHM(q.ts)} ?`)) return;
    await db.deleteQso(q.id);
    qsos = qsos.filter((x) => x.id !== q.id);
    renderLog();
    toast('QSO supprimé');
  });

  const tick = () => {
    const d = new Date();
    const c = document.getElementById('clock');
    if (c) c.textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  };
  tick();
  const timer = setInterval(tick, 10000);
  const net = () => { const n = document.getElementById('net'); if (n) n.innerHTML = onlineChip(); };
  addEventListener('online', net); addEventListener('offline', net);
  cleanup = () => { clearInterval(timer); removeEventListener('online', net); removeEventListener('offline', net); };
  if (matchMedia('(min-width: 960px)').matches || !qsos.length) el(el('freq').value ? 'call' : 'freq').focus();
}

// ---------- Clôture ----------
async function viewClose(id) {
  const a = await db.getActivation(id);
  if (!a) { location.hash = '#/'; return; }
  const qsos = await db.listQsos(id);
  const keys = activePrograms(a);
  const sharing = canShareFiles();
  const files = [...keys.map((k) => ({ k, file: exportFile(k, qsos, a, settings) })), { k: null, file: exportFile(null, qsos, a, settings) }];

  const statusHtml = keys.map((k) => {
    const s = programStatus(k, qsos);
    const cls = s.valid ? 'ok' : 'warn';
    const title = s.target == null ? `${k} : ${s.count} QSO` : s.valid ? `${k} validée` : `${k} : pas encore validée`;
    const detail = s.target == null ? s.note : `${s.count} / ${s.target}${s.note ? ` · ${s.note}` : ''}`;
    return `<div class="status ${cls}">${s.valid ? ICON.ok : ICON.wait}<div style="display:flex;flex-direction:column">
      <span class="title">${esc(title)}</span><span class="small mono">${esc(normalizeRef(a.refs[k]))} · ${esc(detail)}</span></div></div>`;
  }).join('');

  app.innerHTML = `
  <div class="page">
    <div class="topbar"><a class="icon-btn" href="#/" aria-label="Retour à l'accueil">${ICON.back}</a><h1 style="flex:1">Clôturer l'activation</h1></div>
    <p class="muted" style="margin:0"><span class="refs">${refsLine(a)}</span> · <span class="mono">${esc(a.stationCall)}</span> · ${qsos.length} QSO</p>
    ${statusHtml}
    ${qsos.length ? `
    <section style="display:flex;flex-direction:column;gap:10px">
      <h2>Fichiers à envoyer</h2>
      ${files.map(({ k, file }, i) => `
        <div class="export">
          <div class="row spread"><b>${k ? esc(k) : 'ADIF complet'}</b><span class="small muted">${k ? '' : 'pour QLog, Log4OM, LoTW…'}</span></div>
          <span class="fname">${esc(file.name)}</span>
          <span class="small muted">${esc(k ? EXPORT_HELP[k] : 'Tous les QSO avec toutes les références, à importer dans votre carnet de trafic.')}</span>
          <div class="row">
            <button class="btn ${k ? 'primary' : ''}" data-dl="${i}">Télécharger</button>
            ${sharing ? `<button class="btn" data-sh="${i}">Partager</button>` : ''}
          </div>
        </div>`).join('')}
    </section>` : '<p class="empty">Aucun QSO enregistré dans cette activation.</p>'}
    <section class="card">
      <div class="row">
        <a class="btn" href="#/a/${esc(a.id)}">Retour à la saisie</a>
        <button class="btn" id="toggle">${a.closed ? 'Rouvrir l\'activation' : 'Marquer comme clôturée'}</button>
      </div>
      <button class="btn danger" id="del">Supprimer cette activation</button>
    </section>
  </div>`;

  $$('[data-dl]').forEach((b) => b.addEventListener('click', () => download(files[Number(b.dataset.dl)].file)));
  $$('[data-sh]').forEach((b) => b.addEventListener('click', () => share(files[Number(b.dataset.sh)].file)));
  $('#toggle').addEventListener('click', async () => {
    a.closed = !a.closed;
    await db.saveActivation(a);
    location.hash = a.closed ? '#/' : `#/a/${a.id}`;
    setTimeout(() => toast(a.closed ? 'Activation clôturée' : 'Activation rouverte'), 50);
  });
  $('#del').addEventListener('click', async () => {
    if (!confirm(`Supprimer définitivement cette activation et ses ${qsos.length} QSO ? Pensez à exporter les fichiers avant.`)) return;
    await db.deleteActivation(a.id);
    location.hash = '#/';
    setTimeout(() => toast('Activation supprimée'), 50);
  });
}

// ---------- Navigation ----------
const ROUTES = [
  [/^#?\/?$/, () => viewHome()],
  [/^#\/reglages$/, () => viewSettings()],
  [/^#\/nouvelle$/, () => viewActivationForm(null)],
  [/^#\/a\/([^/]+)\/modifier$/, (m) => viewActivationForm(m[1])],
  [/^#\/a\/([^/]+)\/cloture$/, (m) => viewClose(m[1])],
  [/^#\/a\/([^/]+)$/, (m) => viewTerrain(m[1])],
];

async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  document.getElementById('toast').classList.remove('show');
  const h = location.hash || '#/';
  for (const [re, fn] of ROUTES) {
    const m = h.match(re);
    if (m) {
      try { await fn(m); } catch (err) {
        console.error(err);
        app.innerHTML = `<div class="page"><p class="banner">Une erreur est survenue : ${esc(err.message)}</p><a class="btn" href="#/">Accueil</a></div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

addEventListener('hashchange', route);
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (!location.hash || location.hash === '#/') route(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const watch = (w) => w && w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) { swWaiting = w; if (!location.hash || location.hash === '#/') route(); }
    });
    if (reg.waiting && navigator.serviceWorker.controller) swWaiting = reg.waiting;
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

(async () => {
  try { settings = await db.getSettings(); } catch { settings = {}; }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  route();
})();
