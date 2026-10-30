// Tests de la recherche « Autour de moi » avec des réponses simulées
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latLonToGrid, haversineKm } from '../js/radio.js';
import { makeFetcher, nearbyPota, nearbySota, POTA_API, SOTA_API } from '../js/nearby.js';

test('position GPS vers locator', () => {
  assert.equal(latLonToGrid(43.6, 7.0), 'JN33mo');
  assert.equal(latLonToGrid(48.8566, 2.3522), 'JN18eu');
  assert.equal(latLonToGrid(-33.86, 151.21), 'QF56od');
  assert.ok(Math.abs(haversineKm(48.8566, 2.3522, 43.6, 7.0) - 686) < 10);
});

// Mougins approximativement
const ME = { lat: 43.6, lon: 7.0 };

const FAKE = {
  [`${POTA_API}/locations/`]: [
    { descriptor: 'FR-PAC', name: "Provence-Alpes-Côte d'Azur", latitude: 43.9, longitude: 6.0, parks: 2 },
    { descriptor: 'IT-PM', name: 'Piemonte', latitude: 45.0, longitude: 7.9, parks: 1 },
    { descriptor: 'US-ID', name: 'Idaho', latitude: 44, longitude: -114, parks: 1 },
  ],
  [`${POTA_API}/location/parks/FR-PAC`]: [
    { reference: 'FR-0001', name: 'Parc proche', latitude: 43.65, longitude: 7.05, activations: 0, grid: 'JN33' },
    { reference: 'FR-0002', name: 'Parc lointain', latitude: 44.3, longitude: 6.6, activations: 12, grid: 'JN34' },
  ],
  [`${POTA_API}/location/parks/IT-PM`]: [
    { reference: 'IT-0745', name: 'Alpi Marittime', latitude: 44.2, longitude: 7.25, activations: 30 },
  ],
  [`${POTA_API}/location/parks/US-ID`]: [
    { reference: 'US-4567', name: 'Boise', latitude: 43.6, longitude: -116 },
  ],
  [`${SOTA_API}/api/associations`]: [
    { associationCode: 'F', minLat: 41, maxLat: 51, minLong: -5, maxLong: 9 },
    { associationCode: 'W7I', minLat: 42, maxLat: 49, minLong: -117, maxLong: -111 },
  ],
  [`${SOTA_API}/api/associations/F`]: { regions: [{ regionCode: 'AM', minLat: 43.5, maxLat: 44.4, minLong: 6.6, maxLong: 7.7 }, { regionCode: 'PO', minLat: 48, maxLat: 50, minLong: 0, maxLong: 2 }] },
  [`${SOTA_API}/api/regions/F/AM`]: { summits: [
    { summitCode: 'F/AM-001', name: 'Mont proche', latitude: 43.7, longitude: 7.0, altM: 1200, points: 4, activationCount: 3, locator: 'JN33lq' },
    { summitCode: 'F/AM-099', name: 'Retiré', latitude: 43.61, longitude: 7.0, validTo: '2010-01-01T00:00:00Z' },
  ] },
};

const fakeGet = async (url) => {
  if (!(url in FAKE)) throw new Error(`URL inattendue ${url}`);
  return FAKE[url];
};

test('parcs POTA proches', async () => {
  const r = await nearbyPota(fakeGet, ME.lat, ME.lon, 25);
  assert.deepEqual(r.map((p) => p.ref), ['FR-0001']);
  assert.equal(r[0].activations, 0);
  const wide = await nearbyPota(fakeGet, ME.lat, ME.lon, 100);
  assert.deepEqual(wide.map((p) => p.ref), ['FR-0001', 'IT-0745', 'FR-0002']);
});

test('sommets SOTA proches, sommets retirés exclus', async () => {
  const r = await nearbySota(fakeGet, ME.lat, ME.lon, 25);
  assert.deepEqual(r.map((s) => s.ref), ['F/AM-001']);
  assert.equal(r[0].altM, 1200);
});

test('cache : réutilisé hors ligne', async () => {
  const mem = new Map();
  const store = { get: async (k) => mem.get(k), set: async (k, v) => mem.set(k, v) };
  let calls = 0;
  const okFetch = async () => { calls++; return { ok: true, json: async () => ({ x: 1 }) }; };
  const g = makeFetcher(store, okFetch);
  assert.deepEqual(await g('https://exemple/a', 1), { x: 1 });
  assert.deepEqual(await g('https://exemple/a', 1), { x: 1 });
  assert.equal(calls, 1);
  // Cache expiré + réseau coupé : on garde la dernière version
  mem.set('cache:https://exemple/a', { t: 0, v: { x: 2 } });
  const offline = makeFetcher(store, async () => { throw new Error('réseau'); });
  assert.deepEqual(await offline('https://exemple/a', 1), { x: 2 });
  await assert.rejects(() => offline('https://exemple/b', 1));
});
