// « Autour de moi » : parcs POTA et sommets SOTA proches d'une position.
// Les listes téléchargées sont gardées sur l'appareil : une zone consultée chez soi
// avant de partir reste disponible sur le terrain, même sans réseau.
import { haversineKm } from './radio.js';

export const POTA_API = 'https://api.pota.app';
export const SOTA_API = 'https://api2.sota.org.uk';
const DAY = 86400000;

// Téléchargement JSON avec cache (store : { get(key), set(key, value) })
export function makeFetcher(store, fetchFn = (...a) => fetch(...a)) {
  return async function getJson(url, ttlDays) {
    const key = `cache:${url}`;
    let cached = null;
    try { cached = await store.get(key); } catch { /* pas de cache */ }
    if (cached && Date.now() - cached.t < ttlDays * DAY) return cached.v;
    try {
      const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const v = await res.json();
      try { await store.set(key, { t: Date.now(), v }); } catch { /* stockage plein */ }
      return v;
    } catch (err) {
      if (cached) return cached.v; // hors ligne : on reprend la dernière version connue
      throw err;
    }
  };
}

// Limite le nombre de téléchargements simultanés
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = { ok: true, v: await fn(items[k]) }; } catch (e) { out[k] = { ok: false, e }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Récupère tous les objets « région POTA » quelle que soit la forme de la réponse
function collectLocations(data, acc = []) {
  if (Array.isArray(data)) data.forEach((d) => collectLocations(d, acc));
  else if (data && typeof data === 'object') {
    if (data.descriptor && Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude))) acc.push(data);
    Object.values(data).forEach((v) => { if (v && typeof v === 'object') collectLocations(v, acc); });
  }
  return acc;
}

export async function nearbyPota(getJson, lat, lon, radiusKm, limit = 25) {
  const locations = collectLocations(await getJson(`${POTA_API}/locations/`, 30));
  const seen = new Set();
  const regions = locations
    .filter((l) => !seen.has(l.descriptor) && seen.add(l.descriptor))
    .map((l) => ({ code: l.descriptor, d: haversineKm(lat, lon, Number(l.latitude), Number(l.longitude)) }))
    .sort((a, b) => a.d - b.d)
    .filter((l, idx) => idx < 3 || l.d < radiusKm + 200)
    .slice(0, 6);
  const lists = await mapLimit(regions, 3, (r) => getJson(`${POTA_API}/location/parks/${encodeURIComponent(r.code)}`, 7));
  if (lists.length && lists.every((x) => !x.ok)) throw lists[0].e;
  const parks = new Map();
  for (const l of lists) {
    if (!l.ok || !Array.isArray(l.v)) continue;
    for (const p of l.v) {
      const plat = Number(p.latitude), plon = Number(p.longitude);
      if (!p.reference || !Number.isFinite(plat) || !Number.isFinite(plon) || parks.has(p.reference)) continue;
      const d = haversineKm(lat, lon, plat, plon);
      if (d <= radiusKm) {
        parks.set(p.reference, { program: 'POTA', ref: p.reference, name: p.name || '', km: d,
          activations: Number(p.activations ?? 0), grid: p.grid || '' });
      }
    }
  }
  return [...parks.values()].sort((a, b) => a.km - b.km).slice(0, limit);
}

const bboxNear = (lat, lon, km, o) => {
  const { minLat, maxLat, minLong, maxLong } = o || {};
  if (![minLat, maxLat, minLong, maxLong].every((v) => Number.isFinite(Number(v)))) return true;
  const dLat = km / 111, dLon = km / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return lat + dLat >= minLat && lat - dLat <= maxLat && lon + dLon >= minLong && lon - dLon <= maxLong;
};

export async function nearbySota(getJson, lat, lon, radiusKm, limit = 25) {
  const assocs = await getJson(`${SOTA_API}/api/associations`, 30);
  const near = (Array.isArray(assocs) ? assocs : []).filter((a) => a.associationCode && bboxNear(lat, lon, radiusKm, a));
  const details = await mapLimit(near, 3, (a) => getJson(`${SOTA_API}/api/associations/${encodeURIComponent(a.associationCode)}`, 30));
  const regions = [];
  details.forEach((d, i) => {
    if (!d.ok) return;
    for (const r of d.v?.regions || []) {
      if (r.regionCode && bboxNear(lat, lon, radiusKm, r)) regions.push([near[i].associationCode, r.regionCode]);
    }
  });
  const lists = await mapLimit(regions, 4, ([a, r]) => getJson(`${SOTA_API}/api/regions/${encodeURIComponent(a)}/${encodeURIComponent(r)}`, 30));
  if (lists.length && lists.every((x) => !x.ok)) throw lists[0].e;
  const now = new Date().toISOString();
  const out = [];
  for (const l of lists) {
    if (!l.ok) continue;
    for (const s of l.v?.summits || []) {
      const slat = Number(s.latitude), slon = Number(s.longitude);
      if (!s.summitCode || !Number.isFinite(slat) || !Number.isFinite(slon)) continue;
      if (s.validTo && String(s.validTo) < now) continue; // sommet retiré
      if (s.validFrom && String(s.validFrom) > now) continue;
      const d = haversineKm(lat, lon, slat, slon);
      if (d <= radiusKm) {
        out.push({ program: 'SOTA', ref: s.summitCode, name: s.name || '', km: d, altM: s.altM ?? null,
          points: s.points ?? null, activations: Number(s.activationCount ?? 0), grid: s.locator || '' });
      }
    }
  }
  return out.sort((a, b) => a.km - b.km).slice(0, limit);
}

// Position du navigateur (GPS sur téléphone)
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('La localisation n\'est pas disponible sur cet appareil.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1
        ? 'Localisation refusée. Autorisez-la pour ce site dans les réglages du navigateur.'
        : 'Position introuvable. Réessayez à l\'extérieur ou activez le GPS.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  });
}
