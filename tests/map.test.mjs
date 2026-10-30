// Tests de la carte des contacts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContactMap, stationPosition, contactPosition } from '../js/map.js';
import { greatCircle, latLonToGrid } from '../js/radio.js';

const act = { stationCall: 'I1/F4JCF/P', myGrid: 'JN34', refs: {} };
const q = (call, band, grid = '') => ({ id: call + band, call, band, grid, mode: 'SSB', ts: '2026-10-31T10:00:00.000Z' });

test('positions', () => {
  assert.equal(stationPosition(act, {}).approx, false);
  assert.equal(stationPosition({ stationCall: 'F4JCF' }, {}).approx, true);
  assert.equal(contactPosition(q('DL1AB', '20m', 'JO31')).approx, false);
  assert.equal(contactPosition(q('DL1AB', '20m')).approx, true);
  assert.equal(latLonToGrid(43.6, 7.0, 4), 'JN33');
});

test('grand cercle', () => {
  const pts = greatCircle({ lat: 44.5, lon: 7 }, { lat: 40.7, lon: -74 }, 10);
  assert.equal(pts.length, 11);
  assert.ok(pts[5].lat > 44.5, 'la route vers New York passe au nord');
});

test('carte : une ligne par correspondant et par bande, légende par bande', () => {
  const qsos = [q('DL1AB', '20m', 'JO31'), q('DL1AB', '20m', 'JO31'), q('DL1AB', '40m', 'JO31'), q('EA3XYZ', '20m'), q('K1ABC', '15m')];
  const m = buildContactMap(act, {}, qsos);
  assert.equal(m.total, 4);
  assert.equal(m.placed, 4);
  assert.equal(m.approx, 2);
  assert.deepEqual(m.legend.map((l) => [l.band, l.count]), [['40m', 1], ['20m', 2], ['15m', 1]]);
  assert.equal((m.svg.match(/stroke-dasharray/g) || []).length, 2);
  assert.match(m.svg, /^<svg[^>]+viewBox="/);
  // Liaisons européennes seulement : cadre resserré
  const eu = buildContactMap(act, {}, [q('DL1AB', '20m', 'JO31')]);
  const w = Number(eu.svg.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+)/)[1]);
  assert.ok(w < 200, `cadre ${w}`);
  const world = buildContactMap(act, {}, [q('DL1AB', '20m', 'JO31')], { world: true });
  assert.match(world.svg, /viewBox="0\.0 0\.0 720\.0 360\.0"/);
});
