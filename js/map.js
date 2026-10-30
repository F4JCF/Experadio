// Carte des contacts : planisphère hors ligne, liaisons station -> correspondants colorées par bande.
import { WORLD_W, WORLD_H, WORLD_K, LAND_PATH, BORDER_PATH } from './world-data.js';
import { gridToLatLon, greatCircle, bandColor, bandLabel, BANDS } from './radio.js';
import { lookupCall, normalizeCall } from './callsign.js';

const X = (lon) => (lon + 180) * WORLD_K;
const Y = (lat) => (90 - lat) * WORLD_K;
const f1 = (n) => n.toFixed(1);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BAND_ORDER = BANDS.map(([b]) => b);

// Position de ma station : locator de l'activation, sinon locator habituel, sinon pays de l'indicatif
export function stationPosition(activation, settings) {
  const g = gridToLatLon(activation?.myGrid) || gridToLatLon(settings?.myGrid);
  if (g) return { ...g, approx: false };
  const c = lookupCall(activation?.stationCall);
  return c && Number.isFinite(c.lat) ? { lat: c.lat, lon: c.lon, approx: true } : null;
}

// Position d'un correspondant : son locator, sinon le centre de son pays (approximatif)
export function contactPosition(q) {
  const g = gridToLatLon(q.grid);
  if (g) return { ...g, approx: false };
  const c = lookupCall(q.call);
  return c && Number.isFinite(c.lat) ? { lat: c.lat, lon: c.lon, approx: true } : null;
}

// Tracé d'une ligne (lon/lat) en coupant au passage de l'antiméridien
function linePath(pts) {
  let d = '';
  let prev = null;
  for (const p of pts) {
    const jump = prev && Math.abs(p.lon - prev.lon) > 180;
    d += `${!prev || jump ? 'M' : 'L'}${f1(X(p.lon))} ${f1(Y(p.lat))}`;
    prev = p;
  }
  return d;
}

// Cadre ajusté aux points, au rapport 2:1 du planisphère
function fitBox(points, crossesDateline) {
  if (!points.length || crossesDateline) return [0, 0, WORLD_W, WORLD_H];
  let minLon = Math.min(...points.map((p) => p.lon)), maxLon = Math.max(...points.map((p) => p.lon));
  let minLat = Math.min(...points.map((p) => p.lat)), maxLat = Math.max(...points.map((p) => p.lat));
  const pad = Math.max(4, (maxLon - minLon) * 0.12, (maxLat - minLat) * 0.2);
  minLon -= pad; maxLon += pad; minLat -= pad; maxLat += pad;
  let w = Math.max(maxLon - minLon, 30), h = Math.max(maxLat - minLat, 15);
  if (w / h > 2) h = w / 2; else w = h * 2;
  const cLon = (minLon + maxLon) / 2, cLat = (minLat + maxLat) / 2;
  w = Math.min(w, 360); h = Math.min(h, 180);
  const lon0 = Math.min(Math.max(cLon - w / 2, -180), 180 - w);
  const lat1 = Math.min(Math.max(cLat + h / 2, -90 + h), 90);
  return [X(lon0), Y(lat1), w * WORLD_K, h * WORLD_K];
}

// Construit la carte. Renvoie { svg, legend, approx, total, placed }
export function buildContactMap(activation, settings, qsos, { world = false } = {}) {
  const me = stationPosition(activation, settings);
  const seen = new Map(); // un tracé par correspondant et par bande
  for (const q of qsos) {
    const key = `${normalizeCall(q.call)}|${q.band}`;
    if (!seen.has(key)) seen.set(key, q);
  }
  const contacts = [];
  for (const q of seen.values()) {
    const pos = contactPosition(q);
    if (pos) contacts.push({ q, pos });
  }
  const crosses = me && contacts.some(({ pos }) => greatCircle(me, pos, 24).some((p, i, arr) => i && Math.abs(p.lon - arr[i - 1].lon) > 180));
  const pts = me ? [me, ...contacts.map((c) => c.pos)] : contacts.map((c) => c.pos);
  const [vx, vy, vw, vh] = world ? [0, 0, WORLD_W, WORLD_H] : fitBox(pts, crosses);
  const r = vw / 160; // taille des points proportionnelle au cadrage

  const legend = new Map();
  let approx = 0;
  // Bandes les plus hautes dessinées en dernier pour rester visibles
  contacts.sort((a, b) => BAND_ORDER.indexOf(a.q.band) - BAND_ORDER.indexOf(b.q.band));
  const lines = [];
  const dots = [];
  for (const { q, pos } of contacts) {
    const color = bandColor(q.band);
    const l = legend.get(q.band) || { band: q.band, label: bandLabel(q.band), color, count: 0 };
    l.count++; legend.set(q.band, l);
    if (pos.approx) approx++;
    if (me) {
      lines.push(`<path d="${linePath(greatCircle(me, pos))}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.9"${pos.approx ? ' stroke-dasharray="5 4"' : ''}/>`);
    }
    dots.push(`<circle cx="${f1(X(pos.lon))}" cy="${f1(Y(pos.lat))}" r="${f1(r)}" fill="${color}" stroke="#10151C" stroke-width="1" vector-effect="non-scaling-stroke"><title>${esc(q.call)} · ${esc(bandLabel(q.band))}${pos.approx ? ' · position approximative' : ''}</title></circle>`);
  }
  const grat = [];
  for (let lon = -150; lon <= 150; lon += 30) grat.push(`M${X(lon)} 0V${WORLD_H}`);
  for (let lat = -60; lat <= 60; lat += 30) grat.push(`M0 ${Y(lat)}H${WORLD_W}`);
  const meMark = me ? `<g><circle cx="${f1(X(me.lon))}" cy="${f1(Y(me.lat))}" r="${f1(r * 2.2)}" fill="none" stroke="#F5A623" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${f1(X(me.lon))}" cy="${f1(Y(me.lat))}" r="${f1(r * 1.1)}" fill="#F5A623"><title>Ma station ${esc(activation.stationCall)}</title></circle></g>` : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f1(vx)} ${f1(vy)} ${f1(vw)} ${f1(vh)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carte des contacts : ${contacts.length} liaisons depuis ${esc(activation.stationCall)}">
  <defs><clipPath id="world"><rect x="0" y="0" width="${WORLD_W}" height="${WORLD_H}"/></clipPath></defs>
  <rect x="0" y="0" width="${WORLD_W}" height="${WORLD_H}" fill="#0E1A24"/>
  <g clip-path="url(#world)">
  <path d="${grat.join('')}" stroke="#1A2836" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/>
  <path d="${LAND_PATH}" fill="#243142" fill-rule="evenodd"/>
  <path d="${BORDER_PATH}" fill="none" stroke="#3A4757" stroke-width="0.8" vector-effect="non-scaling-stroke"/>
  </g>
  ${lines.join('')}
  ${dots.join('')}
  ${meMark}
</svg>`;
  return {
    svg,
    legend: [...legend.values()].sort((a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band)),
    approx, total: seen.size, placed: contacts.length, hasStation: !!me, aspect: vw / vh,
  };
}

// Image PNG de la carte avec titre et légende (pour la garder ou la partager)
export async function mapToPng(map, title, subtitle, width = 1600) {
  const mapH = Math.round(width / map.aspect);
  const headH = 110, legendH = 70 + Math.ceil(map.legend.length / 6) * 44;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = headH + mapH + legendH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#10151C'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([map.svg], { type: 'image/svg+xml' }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  ctx.drawImage(img, 0, headH, width, mapH);
  URL.revokeObjectURL(url);
  const font = (w, s) => `${w} ${s}px Atkinson, system-ui, sans-serif`;
  ctx.fillStyle = '#F5A623'; ctx.font = font(700, 40); ctx.fillText(title, 40, 58);
  ctx.fillStyle = '#C7D1DC'; ctx.font = font(400, 26); ctx.fillText(subtitle, 40, 94);
  let x = 40, y = headH + mapH + 52;
  ctx.font = font(400, 26);
  map.legend.forEach((l, i) => {
    if (i && i % 6 === 0) { x = 40; y += 44; }
    ctx.fillStyle = l.color; ctx.fillRect(x, y - 12, 40, 8);
    ctx.fillStyle = '#EEF2F6'; ctx.fillText(`${l.label} (${l.count})`, x + 52, y);
    x += 250;
  });
  ctx.fillStyle = '#9AA8B8'; ctx.font = font(400, 20);
  ctx.fillText("Expé'Radio", width - 140, canvas.height - 20);
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}
