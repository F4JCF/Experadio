// Stockage local sur l'appareil (IndexedDB). Rien n'est envoyé sur Internet.
const DB_NAME = 'experadio';
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('activations')) db.createObjectStore('activations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('qsos')) {
        const s = db.createObjectStore('qsos', { keyPath: 'id' });
        s.createIndex('activationId', 'activationId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

const req2p = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const db = {
  getKv: (key) => run('kv', 'readonly', (s) => req2p(s.get(key))),
  setKv: (key, v) => run('kv', 'readwrite', (s) => { s.put(v, key); }),
  // Nombre d'entrées et effacement par préfixe (ex. fiches d'indicatifs « call: »)
  countKv: (prefix) => run('kv', 'readonly', (s) => req2p(s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}\uffff`)))).then((k) => k.length),
  clearKv: (prefix) => run('kv', 'readwrite', (s) => { s.delete(IDBKeyRange.bound(prefix, `${prefix}\uffff`)); }),
  getSettings: () => run('kv', 'readonly', (s) => req2p(s.get('settings'))).then((v) => v || {}),
  saveSettings: (v) => run('kv', 'readwrite', (s) => { s.put(v, 'settings'); }),

  listActivations: () => run('activations', 'readonly', (s) => req2p(s.getAll()))
    .then((l) => l.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))),
  getActivation: (id) => run('activations', 'readonly', (s) => req2p(s.get(id))),
  saveActivation: (a) => run('activations', 'readwrite', (s) => { s.put(a); }),
  deleteActivation: async (id) => {
    const qsos = await db.listQsos(id);
    await run('qsos', 'readwrite', (s) => { qsos.forEach((q) => s.delete(q.id)); });
    await run('activations', 'readwrite', (s) => { s.delete(id); });
  },

  listQsos: (activationId) => run('qsos', 'readonly', (s) => req2p(s.index('activationId').getAll(activationId)))
    .then((l) => l.sort((a, b) => (a.ts < b.ts ? 1 : -1))),
  allQsos: () => run('qsos', 'readonly', (s) => req2p(s.getAll())),
  saveQso: (q) => run('qsos', 'readwrite', (s) => { s.put(q); }),
  deleteQso: (id) => run('qsos', 'readwrite', (s) => { s.delete(id); }),

  // Sauvegarde complète (fichier JSON) et restauration par fusion
  async backup() {
    return { app: 'experadio', version: 1, exportedAt: new Date().toISOString(),
      settings: await db.getSettings(), activations: await db.listActivations(), qsos: await db.allQsos() };
  },
  async restore(data) {
    if (!data || data.app !== 'experadio') throw new Error('Ce fichier n\'est pas une sauvegarde Expé\'Radio.');
    const acts = Array.isArray(data.activations) ? data.activations : [];
    const qsos = Array.isArray(data.qsos) ? data.qsos : [];
    await run('activations', 'readwrite', (s) => { acts.forEach((a) => a?.id && s.put(a)); });
    await run('qsos', 'readwrite', (s) => { qsos.forEach((q) => q?.id && q.activationId && s.put(q)); });
    const current = await db.getSettings();
    if (!current.myCall && data.settings) await db.saveSettings(data.settings);
    return { activations: acts.length, qsos: qsos.length };
  },
};
