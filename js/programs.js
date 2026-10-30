// Programmes d'activation : références, seuils de validation et comptage des QSO.
import { normalizeCall } from './callsign.js';
import { VHF_BANDS } from './radio.js';

export const PROGRAMS = {
  POTA: {
    label: 'POTA', full: 'Parks on the Air', example: 'IT-0745',
    pattern: /^[A-Z0-9]{1,4}-\d{4,5}$/,
    rule: '10 QSO dans la même journée UTC',
  },
  SOTA: {
    label: 'SOTA', full: 'Summits on the Air', example: 'I/PM-001',
    pattern: /^[A-Z0-9]{1,4}\/[A-Z]{2}-\d{3}$/,
    rule: '4 correspondants différents dans la même journée UTC',
  },
  WWFF: {
    label: 'WWFF', full: 'World Wide Flora & Fauna', example: 'IFF-0001',
    pattern: /^[A-Z0-9]{1,4}FF-\d{4}$/,
    rule: '44 QSO, cumulables sur plusieurs sorties',
  },
  IOTA: {
    label: 'IOTA', full: 'Islands on the Air', example: 'EU-064',
    pattern: /^(AF|AN|AS|EU|NA|OC|SA)-\d{3}$/,
    rule: 'Pas de minimum : le log est envoyé sur Club Log',
  },
  BOTA: {
    label: 'BOTA', full: 'Bunkers on the Air', example: '',
    pattern: /^[A-Z0-9/-]{3,20}$/,
    rule: '25 QSO (5 en VHF/UHF uniquement)',
  },
};
export const PROGRAM_KEYS = Object.keys(PROGRAMS);

export function normalizeRef(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, '');
}

export function isValidRef(program, ref) {
  const r = normalizeRef(ref);
  return !!r && PROGRAMS[program].pattern.test(r);
}

// Programme probable d'une référence saisie pour le correspondant
export function detectProgram(ref) {
  const r = normalizeRef(ref);
  const m = r.match(/^(POTA|SOTA|WWFF|IOTA|BOTA):(.+)$/);
  if (m) return { program: m[1], ref: m[2] };
  if (PROGRAMS.IOTA.pattern.test(r)) return { program: 'IOTA', ref: r };
  if (PROGRAMS.SOTA.pattern.test(r)) return { program: 'SOTA', ref: r };
  if (PROGRAMS.WWFF.pattern.test(r)) return { program: 'WWFF', ref: r };
  if (PROGRAMS.POTA.pattern.test(r)) return { program: 'POTA', ref: r };
  return null;
}

// « FR-0123, F/AM-001 » -> { POTA: 'FR-0123', SOTA: 'F/AM-001' }
export function parseTheirRefs(text) {
  const out = {};
  for (const part of String(text || '').split(/[\s,;]+/).filter(Boolean)) {
    const d = detectProgram(part);
    if (d && !out[d.program]) out[d.program] = d.ref;
  }
  return out;
}

// Programmes actifs d'une activation, dans l'ordre d'affichage
export function activePrograms(activation) {
  return PROGRAM_KEYS.filter((k) => normalizeRef(activation?.refs?.[k]));
}

const utcDay = (q) => String(q.ts).slice(0, 10);

function uniqueCount(qsos, keyFn) {
  return new Set(qsos.map(keyFn)).size;
}

function lastDayQsos(qsos) {
  if (!qsos.length) return [];
  const last = qsos.reduce((a, q) => (q.ts > a ? q.ts : a), qsos[0].ts).slice(0, 10);
  return qsos.filter((q) => utcDay(q) === last);
}

const cbm = (q) => `${normalizeCall(q.call)}|${q.band}|${q.mode}`;

// État d'un programme pour une liste de QSO : { count, target, valid, note }
export function programStatus(program, qsos) {
  const list = qsos || [];
  switch (program) {
    case 'POTA': {
      const count = uniqueCount(lastDayQsos(list), cbm);
      return { count, target: 10, valid: count >= 10, note: 'sur la journée UTC' };
    }
    case 'SOTA': {
      const count = uniqueCount(lastDayQsos(list), (q) => normalizeCall(q.call));
      return { count, target: 4, valid: count >= 4, note: 'correspondants différents' };
    }
    case 'WWFF': {
      const count = uniqueCount(list, cbm);
      return { count, target: 44, valid: count >= 44, note: 'cumulable' };
    }
    case 'BOTA': {
      const count = uniqueCount(list, (q) => `${normalizeCall(q.call)}|${q.band}`);
      const vhfOnly = list.length > 0 && list.every((q) => VHF_BANDS.has(q.band));
      const target = vhfOnly ? 5 : 25;
      return { count, target, valid: count >= target, note: vhfOnly ? 'VHF/UHF uniquement' : '' };
    }
    case 'IOTA': {
      const count = uniqueCount(list, cbm);
      return { count, target: null, valid: count > 0, note: 'pas de minimum' };
    }
    default:
      return { count: list.length, target: null, valid: false, note: '' };
  }
}

// Doublon : même indicatif, même bande, même mode, même journée UTC
export function findDupe(qsos, candidate, excludeId) {
  const key = cbm(candidate);
  const day = utcDay(candidate);
  return (qsos || []).find((q) => q.id !== excludeId && cbm(q) === key && utcDay(q) === day) || null;
}
