// Bandes, modes et locators.

// Plages des bandes radioamateurs (MHz), nom au format ADIF
export const BANDS = [
  ['2190m', 0.1357, 0.1378], ['630m', 0.472, 0.479], ['160m', 1.8, 2.0], ['80m', 3.5, 4.0],
  ['60m', 5.06, 5.45], ['40m', 7.0, 7.3], ['30m', 10.1, 10.15], ['20m', 14.0, 14.35],
  ['17m', 18.068, 18.168], ['15m', 21.0, 21.45], ['12m', 24.89, 24.99], ['10m', 28.0, 29.7],
  ['6m', 50.0, 54.0], ['4m', 70.0, 71.0], ['2m', 144.0, 148.0], ['1.25m', 222.0, 225.0],
  ['70cm', 420.0, 450.0], ['23cm', 1240.0, 1300.0], ['13cm', 2300.0, 2450.0], ['3cm', 10000.0, 10500.0],
];

export const VHF_BANDS = new Set(['6m', '4m', '2m', '1.25m', '70cm', '23cm', '13cm', '3cm']);

export function parseFreq(s) {
  const n = parseFloat(String(s || '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function bandFromFreq(mhz) {
  const f = typeof mhz === 'number' ? mhz : parseFreq(mhz);
  if (f == null) return '';
  const b = BANDS.find(([, lo, hi]) => f >= lo && f <= hi);
  return b ? b[0] : '';
}

// Libellé affiché : « 20 m », « 70 cm »
// Couleur de chaque bande sur la carte
export const BAND_COLORS = {
  '160m': '#B39DFF', '80m': '#8C7CF0', '60m': '#7A8CF5', '40m': '#5AA9F0', '30m': '#3CC6D8', '20m': '#3FB97A',
  '17m': '#A3D94B', '15m': '#F5D547', '12m': '#F5A623', '10m': '#FF7A45', '6m': '#FF5C8A', '4m': '#F06BD0',
  '2m': '#D88CFF', '70cm': '#F2F2F2', '23cm': '#C7D1DC',
};
export const bandColor = (b) => BAND_COLORS[b] || '#9AA8B8';

export function bandLabel(band) {
  return band ? band.replace(/^([\d.]+)(c?m)$/, '$1 $2') : '';
}

// Modes proposés, avec correspondance ADIF (MODE/SUBMODE) et report par défaut
export const MODES = {
  SSB: { mode: 'SSB', rst: '59' },
  CW: { mode: 'CW', rst: '599' },
  FM: { mode: 'FM', rst: '59' },
  AM: { mode: 'AM', rst: '59' },
  FT8: { mode: 'FT8', rst: '-10' },
  FT4: { mode: 'MFSK', submode: 'FT4', rst: '-10' },
  RTTY: { mode: 'RTTY', rst: '599' },
  PSK31: { mode: 'PSK', submode: 'PSK31', rst: '599' },
  DMR: { mode: 'DIGITALVOICE', submode: 'DMR', rst: '59' },
  'C4FM': { mode: 'DIGITALVOICE', submode: 'C4FM', rst: '59' },
};
export const DIGITAL = new Set(['FT8', 'FT4', 'RTTY', 'PSK31']);

// --- Locators Maidenhead -------------------------------------------------
export function isValidGrid(g) {
  return /^[A-R]{2}\d{2}([A-X]{2}(\d{2})?)?$/i.test(String(g || '').trim());
}

export function normalizeGrid(g) {
  const s = String(g || '').trim();
  if (!isValidGrid(s)) return '';
  return s.slice(0, 2).toUpperCase() + s.slice(2, 4) + s.slice(4, 6).toLowerCase() + s.slice(6);
}

// Locator à partir d'une position GPS (4, 6 ou 8 caractères)
export function latLonToGrid(lat, lon, len = 6) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return '';
  let x = Math.min(lon + 180, 359.999999);
  let y = Math.min(lat + 90, 179.999999);
  const A = 65;
  let g = String.fromCharCode(A + Math.floor(x / 20)) + String.fromCharCode(A + Math.floor(y / 10));
  x %= 20; y %= 10;
  g += Math.floor(x / 2) + '' + Math.floor(y);
  if (len >= 6) {
    x = (x % 2) * 12; y = (y % 1) * 24;
    g += String.fromCharCode(97 + Math.floor(x)) + String.fromCharCode(97 + Math.floor(y));
    if (len >= 8) g += Math.floor((x % 1) * 10) + '' + Math.floor((y % 1) * 10);
  }
  return g;
}

// Carrés de 4 caractères voisins (rayon en carrés), pour charger les références autour d'une position
export function neighborSquares(lat, lon, rLon = 1, rLat = 1) {
  const out = new Set();
  for (let i = -rLon; i <= rLon; i++) {
    for (let j = -rLat; j <= rLat; j++) {
      const la = lat + j, lo = ((lon + i * 2 + 540) % 360) - 180;
      if (la > -90 && la < 90) out.add(latLonToGrid(la, lo, 4));
    }
  }
  return [...out].filter(Boolean);
}

// Distance (km) et azimut (degrés) entre deux positions
export function distanceBearingLL(a, b) {
  const rad = Math.PI / 180;
  const φ1 = a.lat * rad, φ2 = b.lat * rad, Δφ = (b.lat - a.lat) * rad, Δλ = (b.lon - a.lon) * rad;
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return { km, deg: (Math.atan2(y, x) / rad + 360) % 360 };
}

// Points d'un grand cercle entre deux positions (pour tracer les liaisons sur la carte)
export function greatCircle(a, b, n = 48) {
  const rad = Math.PI / 180;
  const toV = (p) => [Math.cos(p.lat * rad) * Math.cos(p.lon * rad), Math.cos(p.lat * rad) * Math.sin(p.lon * rad), Math.sin(p.lat * rad)];
  const v1 = toV(a), v2 = toV(b);
  const dot = Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
  const ω = Math.acos(dot);
  if (ω < 1e-9) return [a, b];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s1 = Math.sin((1 - t) * ω) / Math.sin(ω), s2 = Math.sin(t * ω) / Math.sin(ω);
    const x = s1 * v1[0] + s2 * v2[0], y = s1 * v1[1] + s2 * v2[1], z = s1 * v1[2] + s2 * v2[2];
    pts.push({ lat: Math.atan2(z, Math.hypot(x, y)) / rad, lon: Math.atan2(y, x) / rad });
  }
  return pts;
}

// Centre du carré, en degrés
export function gridToLatLon(g) {
  const s = String(g || '').trim().toUpperCase();
  if (!isValidGrid(s)) return null;
  let lon = (s.charCodeAt(0) - 65) * 20 - 180;
  let lat = (s.charCodeAt(1) - 65) * 10 - 90;
  lon += Number(s[2]) * 2;
  lat += Number(s[3]);
  let w = 2, h = 1;
  if (s.length >= 6) {
    lon += (s.charCodeAt(4) - 65) * (2 / 24);
    lat += (s.charCodeAt(5) - 65) * (1 / 24);
    w = 2 / 24; h = 1 / 24;
  }
  if (s.length >= 8) {
    lon += Number(s[6]) * (2 / 240);
    lat += Number(s[7]) * (1 / 240);
    w = 2 / 240; h = 1 / 240;
  }
  return { lat: lat + h / 2, lon: lon + w / 2 };
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Distance (km) et azimut (degrés) entre deux locators
export function distanceBearing(g1, g2) {
  const a = gridToLatLon(g1), b = gridToLatLon(g2);
  if (!a || !b) return null;
  const d = distanceBearingLL(a, b);
  return { km: Math.round(d.km), deg: Math.round(d.deg) };
}
