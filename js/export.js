// Exports : ADIF (complet ou par programme) et CSV SOTA V2.
import { normalizeCall, lookupCall } from './callsign.js';
import { MODES, DIGITAL, normalizeGrid, parseFreq } from './radio.js';
import { normalizeRef, parseTheirRefs, PROGRAMS } from './programs.js';

export const APP_NAME = 'ExpeRadio';
export const APP_VERSION = '0.2.0';

// L'ADIF .adi est en ASCII : on retire les accents et les caractères non pris en charge
export function asciiOnly(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
}

function field(name, value) {
  const v = asciiOnly(value).trim();
  return v ? `<${name}:${v.length}>${v} ` : '';
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function adifDate(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
export function adifTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function freqString(q) {
  const f = parseFreq(q.freq);
  return f == null ? '' : String(Number(f.toFixed(6)));
}

function header(now = new Date()) {
  const ts = `${adifDate(now)} ${adifTime(now)}`;
  return `Export Expe'Radio\n${field('ADIF_VER', '3.1.4')}${field('PROGRAMID', APP_NAME)}`
    + `${field('PROGRAMVERSION', APP_VERSION)}${field('CREATED_TIMESTAMP', ts)}<EOH>\n\n`;
}

// SIG / MY_SIG utilisés par chaque export de programme
const SIG_PROGRAMS = new Set(['POTA', 'WWFF', 'BOTA']);

function record(q, activation, settings, program) {
  const m = MODES[q.mode] || { mode: q.mode };
  const refs = activation.refs || {};
  const their = parseTheirRefs(q.theirRefs);
  const info = lookupCall(q.call);
  let r = '';
  r += field('CALL', normalizeCall(q.call));
  r += field('QSO_DATE', adifDate(q.ts));
  r += field('TIME_ON', adifTime(q.ts));
  r += field('BAND', (q.band || '').toUpperCase());
  r += field('FREQ', freqString(q));
  r += field('MODE', m.mode);
  r += field('SUBMODE', m.submode || '');
  r += field('RST_SENT', q.rstSent);
  r += field('RST_RCVD', q.rstRcvd);
  r += field('STATION_CALLSIGN', normalizeCall(activation.stationCall));
  r += field('OPERATOR', normalizeCall(settings?.myCall || activation.stationCall));
  r += field('MY_GRIDSQUARE', normalizeGrid(activation.myGrid || settings?.myGrid));
  r += field('GRIDSQUARE', normalizeGrid(q.grid));
  if (info?.dxcc) r += field('DXCC', String(info.dxcc));
  r += field('TX_PWR', q.power || activation.power || '');
  r += field('MY_RIG', activation.rig);
  r += field('MY_ANTENNA', activation.antenna);
  r += field('NAME', q.name);
  r += field('COMMENT', q.comment);
  // Champs de référence normalisés ADIF 3.1.4
  r += field('MY_POTA_REF', normalizeRef(refs.POTA));
  r += field('POTA_REF', their.POTA || '');
  r += field('MY_SOTA_REF', normalizeRef(refs.SOTA));
  r += field('SOTA_REF', their.SOTA || '');
  r += field('MY_WWFF_REF', normalizeRef(refs.WWFF));
  r += field('WWFF_REF', their.WWFF || '');
  r += field('MY_IOTA', normalizeRef(refs.IOTA));
  r += field('IOTA', their.IOTA || '');
  if (SIG_PROGRAMS.has(program)) {
    r += field('MY_SIG', program);
    r += field('MY_SIG_INFO', normalizeRef(refs[program]));
    if (their[program]) {
      r += field('SIG', program);
      r += field('SIG_INFO', their[program]);
    }
  }
  return `${r.trim()} <EOR>\n`;
}

const byTime = (a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);

export function buildAdif(qsos, activation, settings, program = null) {
  return header() + [...qsos].sort(byTime).map((q) => record(q, activation, settings, program)).join('');
}

const SOTA_MODE = (mode) => {
  if (['SSB', 'CW', 'FM', 'AM'].includes(mode)) return mode;
  if (DIGITAL.has(mode)) return 'Data';
  return 'Other';
};

export function buildSotaCsv(qsos, activation, settings) {
  const my = normalizeCall(activation.stationCall);
  const summit = normalizeRef(activation.refs?.SOTA);
  return [...qsos].sort(byTime).map((q) => {
    const d = new Date(q.ts);
    const date = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    const time = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
    const their = parseTheirRefs(q.theirRefs).SOTA || '';
    return ['V2', my, summit, date, time, `${freqString(q)}MHz`, SOTA_MODE(q.mode), normalizeCall(q.call), their]
      .map((v) => asciiOnly(v).replace(/,/g, ' ')).join(',');
  }).join('\r\n') + '\r\n';
}

const hyphenCall = (c) => normalizeCall(c).replace(/\//g, '-');

function firstDate(qsos) {
  const first = [...qsos].sort(byTime)[0];
  return first ? adifDate(first.ts) : adifDate(Date.now());
}

// Fichier à produire pour un programme (ou l'ADIF complet si program est null)
export function exportFile(program, qsos, activation, settings) {
  const call = hyphenCall(activation.stationCall);
  const date = firstDate(qsos);
  const ref = normalizeRef(activation.refs?.[program]);
  switch (program) {
    case 'POTA':
      return { name: `${call}@${ref}-${date}.adi`, mime: 'text/plain', text: buildAdif(qsos, activation, settings, 'POTA') };
    case 'WWFF':
      return { name: `${call} @ ${ref} ${date}.adi`, mime: 'text/plain', text: buildAdif(qsos, activation, settings, 'WWFF') };
    case 'SOTA':
      return { name: `${call}_${ref.replace(/\//g, '_')}_${date}.csv`, mime: 'text/csv', text: buildSotaCsv(qsos, activation, settings) };
    case 'IOTA':
    case 'BOTA':
      return { name: `${call}_${program}_${ref.replace(/\//g, '_')}_${date}.adi`, mime: 'text/plain', text: buildAdif(qsos, activation, settings, program) };
    default:
      return { name: `${call}_${date}_complet.adi`, mime: 'text/plain', text: buildAdif(qsos, activation, settings, null) };
  }
}

export const EXPORT_HELP = {
  POTA: 'À téléverser sur pota.app (onglet Logs).',
  SOTA: 'Format CSV V2, à téléverser sur la base de données SOTA.',
  WWFF: 'À envoyer au gestionnaire de logs WWFF du pays activé, avec une photo de l\'activation.',
  IOTA: 'À téléverser sur Club Log en indiquant la référence IOTA.',
  BOTA: 'Format ADIF avec MY_SIG=BOTA. Vérifiez le format attendu par le WWBOTA Logger avant envoi.',
};

export { PROGRAMS };
