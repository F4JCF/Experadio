// Tests de la logique de l'application : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupCall, dxccPart, isPlausibleCall, flagEmoji } from '../js/callsign.js';
import { bandFromFreq, distanceBearing, isValidGrid, normalizeGrid } from '../js/radio.js';
import { detectProgram, parseTheirRefs, programStatus, findDupe, isValidRef } from '../js/programs.js';
import { buildAdif, buildSotaCsv, exportFile } from '../js/export.js';

test('pays depuis l\'indicatif', () => {
  assert.equal(lookupCall('F4JCF').iso, 'FR');
  assert.equal(lookupCall('DL1AB').iso, 'DE');
  assert.equal(lookupCall('EA3XYZ').iso, 'ES');
  assert.equal(lookupCall('HB9AB').iso, 'CH');
  assert.equal(lookupCall('I1/F4JCF/P').iso, 'IT');
  assert.equal(lookupCall('F4JCF/EA8').prefix, 'EA8');
  assert.equal(lookupCall('TK5XX').name, 'Corse');
  assert.equal(lookupCall('3A2AB').iso, 'MC');
  assert.equal(lookupCall('G4ABC').name, 'Angleterre');
  assert.equal(lookupCall('K1ABC').iso, 'US');
  assert.equal(dxccPart('F4JCF/P'), 'F4JCF');
  assert.equal(lookupCall(''), null);
});

test('indicatif plausible et drapeau', () => {
  assert.ok(isPlausibleCall('F4JCF'));
  assert.ok(isPlausibleCall('I1/F4JCF/P'));
  assert.ok(!isPlausibleCall('BONJOUR'));
  assert.equal(flagEmoji('FR'), '🇫🇷');
});

test('bandes et locators', () => {
  assert.equal(bandFromFreq('14.285'), '20m');
  assert.equal(bandFromFreq('7,145'), '40m');
  assert.equal(bandFromFreq(145.5), '2m');
  assert.equal(bandFromFreq(12), '');
  assert.ok(isValidGrid('JN33lp'));
  assert.equal(normalizeGrid('jn33LP'), 'JN33lp');
  const d = distanceBearing('JN33', 'JO31');
  assert.ok(d.km > 800 && d.km < 1000, `distance ${d.km}`);
});

test('références des programmes', () => {
  assert.deepEqual(detectProgram('it-0745'), { program: 'POTA', ref: 'IT-0745' });
  assert.equal(detectProgram('IFF-0123').program, 'WWFF');
  assert.equal(detectProgram('F/AM-123').program, 'SOTA');
  assert.equal(detectProgram('EU-064').program, 'IOTA');
  assert.equal(detectProgram('BOTA:B/F-0001').program, 'BOTA');
  assert.deepEqual(parseTheirRefs('FR-0123, F/AM-001'), { POTA: 'FR-0123', SOTA: 'F/AM-001' });
  assert.ok(isValidRef('POTA', 'IT-0745'));
  assert.ok(!isValidRef('SOTA', 'IT-0745'));
});

const q = (call, ts, band = '20m', mode = 'SSB', extra = {}) => ({ id: call + ts + band + mode, call, ts, band, mode, freq: '14.285', rstSent: '59', rstRcvd: '57', ...extra });

test('comptage et validation', () => {
  const day = '2026-10-31T10:';
  const list = Array.from({ length: 10 }, (_, i) => q(`F4A${String.fromCharCode(65 + i)}`, `${day}${10 + i}:00.000Z`));
  assert.equal(programStatus('POTA', list).valid, true);
  assert.equal(programStatus('SOTA', list.slice(0, 3)).valid, false);
  assert.equal(programStatus('SOTA', list.slice(0, 4)).valid, true);
  assert.equal(programStatus('WWFF', list).count, 10);
  assert.equal(programStatus('WWFF', list).valid, false);
  // Le même correspondant sur deux bandes compte deux fois pour POTA, une fois pour SOTA
  const two = [q('DL1AB', `${day}00:00.000Z`), q('DL1AB', `${day}05:00.000Z`, '40m')];
  assert.equal(programStatus('POTA', two).count, 2);
  assert.equal(programStatus('SOTA', two).count, 1);
  // BOTA : seuil réduit en VHF seule
  const vhf = Array.from({ length: 5 }, (_, i) => q(`F1A${String.fromCharCode(65 + i)}`, `${day}2${i}:00.000Z`, '2m', 'FM'));
  assert.equal(programStatus('BOTA', vhf).target, 5);
  assert.equal(programStatus('BOTA', vhf).valid, true);
  assert.ok(findDupe(two, q('DL1AB', `${day}30:00.000Z`)));
  assert.equal(findDupe(two, q('DL1AB', '2026-11-01T10:00:00.000Z')), null);
});

const activation = { stationCall: 'I1/F4JCF/P', refs: { POTA: 'IT-0745', SOTA: 'I/PM-001', WWFF: 'IFF-0001' }, myGrid: 'JN34' };
const settings = { myCall: 'F4JCF', myGrid: 'JN33lp' };
const qsos = [
  q('DL1AB', '2026-10-31T09:42:10.000Z', '20m', 'SSB', { grid: 'JO31', theirRefs: 'DE-0001 DLFF-0002', name: 'Jürgen' }),
  q('EA3XYZ', '2026-10-31T09:39:00.000Z', '20m', 'FT8', { freq: '14.074' }),
];

test('export ADIF POTA', () => {
  const f = exportFile('POTA', qsos, activation, settings);
  assert.equal(f.name, 'I1-F4JCF-P@IT-0745-20261031.adi');
  assert.match(f.text, /<ADIF_VER:5>3\.1\.4/);
  assert.match(f.text, /<MY_SIG:4>POTA <MY_SIG_INFO:7>IT-0745 <SIG:4>POTA <SIG_INFO:7>DE-0001/);
  assert.match(f.text, /<STATION_CALLSIGN:10>I1\/F4JCF\/P/);
  assert.match(f.text, /<OPERATOR:5>F4JCF/);
  assert.match(f.text, /<NAME:6>Jurgen/);
  assert.match(f.text, /<BAND:3>20M/);
  // Ordre chronologique
  assert.ok(f.text.indexOf('EA3XYZ') < f.text.indexOf('DL1AB'));
  assert.equal((f.text.match(/<EOR>/g) || []).length, 2);
});

test('export WWFF et complet', () => {
  const w = exportFile('WWFF', qsos, activation, settings);
  assert.equal(w.name, 'I1-F4JCF-P @ IFF-0001 20261031.adi');
  assert.match(w.text, /<MY_SIG:4>WWFF <MY_SIG_INFO:8>IFF-0001 <SIG:4>WWFF <SIG_INFO:9>DLFF-0002/);
  const full = buildAdif(qsos, activation, settings);
  assert.doesNotMatch(full, /MY_SIG/);
  assert.match(full, /<MY_SOTA_REF:8>I\/PM-001/);
  assert.match(full, /<MODE:3>FT8/);
});

test('export SOTA CSV V2', () => {
  const csv = buildSotaCsv(qsos, activation, settings);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'V2,I1/F4JCF/P,I/PM-001,31/10/2026,0939,14.074MHz,Data,EA3XYZ,');
  assert.equal(lines[1], 'V2,I1/F4JCF/P,I/PM-001,31/10/2026,0942,14.285MHz,SSB,DL1AB,');
});
