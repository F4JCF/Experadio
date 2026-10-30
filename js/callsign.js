// Identification du pays (entité DXCC) à partir d'un indicatif, hors ligne.
import { DXCC_ENTITIES, DXCC_PREFIXES } from './dxcc-data.js';

// Suffixes qui ne changent pas l'entité DXCC
const SUFFIXES = new Set(['P', 'M', 'MM', 'AM', 'QRP', 'QRPP', 'A', 'B', 'R', 'LH', 'J', 'E', 'X']);

let dnFr = null;
try { dnFr = new Intl.DisplayNames(['fr'], { type: 'region' }); } catch { /* navigateur ancien */ }

export function normalizeCall(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9/]/g, '').replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '');
}

// Partie de l'indicatif qui détermine le pays : « I1/F4JCF/P » -> « I1 », « F4JCF/EA8 » -> « EA8 »
export function dxccPart(call) {
  const parts = normalizeCall(call).split('/').filter(Boolean)
    .filter((p) => !SUFFIXES.has(p) && !/^\d$/.test(p));
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const [a, b] = parts;
  return a.length <= b.length ? a : b;
}

export function isPlausibleCall(call) {
  const c = normalizeCall(call);
  return /^([A-Z0-9]{1,4}\/)?[A-Z0-9]{1,3}\d{1,4}[A-Z]{1,5}(\/[A-Z0-9]{1,4})*$/.test(c) && /[A-Z]/.test(c) && /\d/.test(c);
}

export function flagEmoji(iso) {
  if (!iso || !/^[A-Z]{2}$/.test(iso)) return '';
  return String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function lookupCall(call) {
  const part = dxccPart(call);
  if (!part) return null;
  for (let i = part.length; i > 0; i--) {
    const ep = DXCC_PREFIXES[part.slice(0, i)];
    if (ep) {
      const [own, iso, continent, dxcc, english, lat, lon] = DXCC_ENTITIES[ep];
      let name = own;
      if (!name) {
        try { name = (dnFr && iso) ? dnFr.of(iso) : english; } catch { name = english; }
      }
      return { prefix: ep, name: name || english, iso, flag: flagEmoji(iso), continent, dxcc, lat, lon };
    }
  }
  return null;
}
