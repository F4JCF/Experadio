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

// Distance (km) et azimut (degrés) entre deux locators
export function distanceBearing(g1, g2) {
  const a = gridToLatLon(g1), b = gridToLatLon(g2);
  if (!a || !b) return null;
  const rad = Math.PI / 180;
  const φ1 = a.lat * rad, φ2 = b.lat * rad, Δφ = (b.lat - a.lat) * rad, Δλ = (b.lon - a.lon) * rad;
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const deg = (Math.atan2(y, x) / rad + 360) % 360;
  return { km: Math.round(km), deg: Math.round(deg) };
}
