// Recherche d'indicatifs : QRZ.com, HamQTH et QRZCQ, dans l'ordre choisi par l'utilisateur.
// Les fiches trouvées sont gardées sur l'appareil pour être disponibles sur le terrain sans réseau.
import { normalizeCall } from './callsign.js';
import { isValidGrid, normalizeGrid } from './radio.js';

export const AGENT = 'ExpeRadio-0.3';
const DAY = 86400000;
export const CACHE_DAYS = 180;

export const SERVICES = {
  qrz: { label: 'QRZ.com', note: 'La recherche détaillée (locator, ville) demande en général un abonnement XML QRZ.', sessionHours: 23 },
  hamqth: { label: 'HamQTH', note: 'Gratuit : il suffit d\'un compte sur hamqth.com.', sessionHours: 0.9 },
  qrzcq: { label: 'QRZCQ', note: 'L\'accès XML peut demander un compte Premium QRZCQ.', sessionHours: 60 },
};
export const DEFAULT_ORDER = ['qrz', 'hamqth', 'qrzcq'];

// ---------- Lecture XML simple (réponses plates de ces trois services) ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });
}
function block(xml, tag) {
  const m = String(xml).match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : '';
}
function tag(xml, name) {
  const m = String(xml).match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
}
const first = (xml, ...names) => names.map((n) => tag(xml, n)).find(Boolean) || '';

// Erreurs : 'auth' (identifiants refusés), 'session' (à renouveler), 'notfound', 'network', 'other'
export class LookupError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}
function classify(msg) {
  const m = String(msg).toLowerCase();
  if (/not found|introuvable|callsign not/.test(m)) return 'notfound';
  if (/session|timeout|expired|invalid key|key/.test(m)) return 'session';
  if (/password|user|login|premium|refused|denied|incorrect|wrong/.test(m)) return 'auth';
  return 'other';
}

function record(service, call, f) {
  const grid = isValidGrid(f.grid) ? normalizeGrid(f.grid) : '';
  return {
    call: normalizeCall(f.call || call), name: f.name || '', qth: f.qth || '', country: f.country || '',
    grid, lat: Number.isFinite(Number(f.lat)) && f.lat !== '' ? Number(f.lat) : null,
    lon: Number.isFinite(Number(f.lon)) && f.lon !== '' ? Number(f.lon) : null,
    source: SERVICES[service].label,
  };
}

// ---------- Adaptateurs par service ----------
const ADAPTERS = {
  qrz: {
    loginUrl: (u, p) => `https://xmldata.qrz.com/xml/current/?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&agent=${AGENT}`,
    searchUrl: (key, call) => `https://xmldata.qrz.com/xml/current/?s=${encodeURIComponent(key)}&callsign=${encodeURIComponent(call)}&agent=${AGENT}`,
    parseLogin(xml) {
      const s = block(xml, 'Session');
      const key = tag(s, 'Key');
      if (!key) throw new LookupError('auth', tag(s, 'Error') || 'Connexion refusée');
      return { key, info: tag(s, 'SubExp') };
    },
    parseSearch(xml, call) {
      const c = block(xml, 'Callsign');
      if (!c) {
        const err = tag(block(xml, 'Session'), 'Error') || 'Réponse inattendue';
        const kind = tag(block(xml, 'Session'), 'Key') ? classify(err) : (classify(err) === 'notfound' ? 'notfound' : 'session');
        throw new LookupError(kind, err);
      }
      const name = [first(c, 'nickname') || first(c, 'fname'), first(c, 'name')].filter(Boolean).join(' ');
      return record('qrz', call, { call: tag(c, 'call'), name, qth: tag(c, 'addr2'), country: first(c, 'land', 'country'),
        grid: tag(c, 'grid'), lat: tag(c, 'lat'), lon: tag(c, 'lon') });
    },
  },
  hamqth: {
    loginUrl: (u, p) => `https://www.hamqth.com/xml.php?u=${encodeURIComponent(u)}&p=${encodeURIComponent(p)}`,
    searchUrl: (key, call) => `https://www.hamqth.com/xml.php?id=${encodeURIComponent(key)}&callsign=${encodeURIComponent(call)}&prg=${AGENT}`,
    parseLogin(xml) {
      const key = tag(xml, 'session_id');
      if (!key) throw new LookupError('auth', tag(xml, 'error') || 'Connexion refusée');
      return { key, info: '' };
    },
    parseSearch(xml, call) {
      const c = block(xml, 'search');
      if (!c) {
        const err = tag(xml, 'error') || 'Réponse inattendue';
        throw new LookupError(classify(err), err);
      }
      return record('hamqth', call, { call: tag(c, 'callsign'), name: first(c, 'nick', 'adr_name'), qth: first(c, 'qth', 'adr_city'),
        country: tag(c, 'country'), grid: tag(c, 'grid'), lat: tag(c, 'latitude'), lon: tag(c, 'longitude') });
    },
  },
  qrzcq: {
    loginUrl: (u, p) => `https://ssl.qrzcq.com/xml?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&agent=${AGENT}`,
    searchUrl: (key, call) => `https://ssl.qrzcq.com/xml?s=${encodeURIComponent(key)}&callsign=${encodeURIComponent(call)}&agent=${AGENT}`,
    parseLogin(xml) {
      const s = block(xml, 'Session');
      const key = tag(s, 'Key');
      if (!key) throw new LookupError('auth', tag(s, 'Error') || 'Connexion refusée');
      return { key, info: tag(s, 'SubExp') };
    },
    parseSearch(xml, call) {
      const c = block(xml, 'Callsign');
      if (!c) {
        const err = tag(block(xml, 'Session'), 'Error') || 'Réponse inattendue';
        throw new LookupError(classify(err), err);
      }
      return record('qrzcq', call, { call: tag(c, 'call'), name: tag(c, 'name'), qth: first(c, 'city', 'qth'),
        country: tag(c, 'country'), grid: first(c, 'locator', 'grid'), lat: tag(c, 'latitude'), lon: tag(c, 'longitude') });
    },
  },
};

// Comptes : { order: ['qrz', ...], qrz: { user, pass }, ... }
export function configuredServices(accounts) {
  const order = (accounts?.order?.length ? accounts.order : DEFAULT_ORDER).filter((k) => SERVICES[k]);
  return order.filter((k) => accounts?.[k]?.user && accounts?.[k]?.pass);
}

// store : { get(key), set(key, value), del?(key) } — fetchFn : fetch du navigateur
export function makeLookup({ store, fetchFn = (...a) => fetch(...a), getAccounts, isOnline = () => navigator.onLine, now = () => Date.now() }) {
  const sessions = new Map();

  async function getText(url) {
    let res;
    try { res = await fetchFn(url); } catch (e) {
      throw new LookupError('network', 'Service injoignable (réseau, ou le service refuse les connexions depuis un navigateur).');
    }
    if (!res.ok) throw new LookupError('network', `Erreur HTTP ${res.status}`);
    return res.text();
  }

  async function session(service, acc, fresh = false) {
    const id = `sess:${service}:${acc.user}`;
    if (!fresh) {
      const mem = sessions.get(id) || await store.get(id).catch(() => null);
      if (mem && now() - mem.t < SERVICES[service].sessionHours * 3600000) return mem;
    }
    const xml = await getText(ADAPTERS[service].loginUrl(acc.user, acc.pass));
    const s = { ...ADAPTERS[service].parseLogin(xml), t: now() };
    sessions.set(id, s);
    await store.set(id, s).catch(() => {});
    return s;
  }

  async function searchOne(service, acc, call) {
    let s = await session(service, acc);
    try {
      return ADAPTERS[service].parseSearch(await getText(ADAPTERS[service].searchUrl(s.key, call)), call);
    } catch (e) {
      if (e.kind !== 'session') throw e;
      s = await session(service, acc, true); // session expirée : une seule reconnexion
      return ADAPTERS[service].parseSearch(await getText(ADAPTERS[service].searchUrl(s.key, call)), call);
    }
  }

  // Indicatif « de base » pour la recherche : I1/F4JCF/P -> F4JCF
  function baseForSearch(call) {
    const parts = normalizeCall(call).split('/').filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    return parts.reduce((a, b) => (/\d/.test(b) && /[A-Z]/.test(b) && b.length > a.length ? b : a), '');
  }

  return {
    baseForSearch,
    async cached(call) {
      const c = await store.get(`call:${baseForSearch(call)}`).catch(() => null);
      return c && now() - c.t < CACHE_DAYS * DAY ? { ...c.v, cached: true } : null;
    },
    // Renvoie la fiche ou null ; ne lève pas d'erreur (la saisie ne doit jamais être bloquée)
    async lookup(call) {
      const base = baseForSearch(call);
      if (!base) return null;
      const hit = await this.cached(base);
      if (hit) return hit;
      if (!isOnline()) return null;
      const accounts = await getAccounts();
      for (const service of configuredServices(accounts)) {
        try {
          const r = await searchOne(service, accounts[service], base);
          await store.set(`call:${base}`, { t: now(), v: r }).catch(() => {});
          return r;
        } catch { /* service suivant */ }
      }
      return null;
    },
    // Test d'un compte depuis les réglages : renvoie un message lisible ou lève LookupError
    async test(service, acc, call) {
      const s = await session(service, acc, true);
      const r = await searchOne(service, acc, call);
      return { info: s.info, result: r };
    },
  };
}
