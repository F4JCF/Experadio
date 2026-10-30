// Génère js/dxcc-data.js à partir des Country Files d'AD1C (via @ham2k/lib-country-files)
// et des données DXCC (@ham2k/lib-dxcc-data). À relancer pour mettre à jour la table :
//   npm i @ham2k/lib-country-files @ham2k/lib-dxcc-data && node tools/build-dxcc.mjs <dossier node_modules>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const nm = process.argv[2] || 'node_modules';
const cty = JSON.parse(readFileSync(join(nm, '@ham2k/lib-country-files/src/data/bigcty.json'), 'utf8'));
const dxcc = JSON.parse(readFileSync(join(nm, '@ham2k/lib-dxcc-data/src/data/dxccCurrent.json'), 'utf8'));
const byCode = new Map(dxcc.map((e) => [e.dxccCode, e]));

// Corrections de codes ISO erronés dans la source
const ISO_FIX = { FJ: 'BL', FS: 'MF', FR: 'RE' };
// Entité principale d'un pays quand plusieurs entités DXCC partagent le même code ISO
const MAIN = new Set(['F', 'I', 'EA', 'CT', 'UA', 'SV', 'K', 'VK', 'JA', 'PY', 'VE', 'BY', 'ZL', 'ZS', 'VU', 'XE',
  'HK', 'HC', 'CE', 'TI', 'YV', 'JW', 'H4', '3B8', '3C', '3D2', 'BV', 'FK', 'FO', 'KH8', 'KP4', 'VP6', 'ZD7', 'CE9']);
// Noms français des entités qui ne sont pas un pays à part entière
const FR = { G: 'Angleterre', GM: 'Écosse', GW: 'Pays de Galles', IS: 'Sardaigne', TK: 'Corse', EA6: 'Baléares',
  EA8: 'Canaries', EA9: 'Ceuta et Melilla', CT3: 'Madère', CU: 'Açores', UA: "Russie d'Europe", UA9: "Russie d'Asie",
  UA2: 'Kaliningrad', R1FJ: 'Terre François-Joseph', SV5: 'Dodécanèse', SV9: 'Crète', 'SV/a': 'Mont Athos',
  JX: 'Jan Mayen', KH6: 'Hawaï', KL: 'Alaska', FR: 'La Réunion', FJ: 'Saint-Barthélemy', FS: 'Saint-Martin',
  '3B9': 'Île Rodrigues', HC8: 'Galápagos', CE0Y: 'Île de Pâques', 'VU4': 'Andaman-et-Nicobar', '1A': 'Ordre de Malte',
  OJ0: 'Market Reef', '4U1I': 'UIT Genève', '4U1U': 'ONU New York', '9M2': 'Malaisie occidentale', '9M6': 'Malaisie orientale',
  'FT/x': 'Kerguelen', 'FT/w': 'Crozet', 'FT/z': 'Amsterdam et Saint-Paul', 'FT/g': 'Glorieuses', 'FT/j': 'Juan de Nova et Europa',
  'FT/t': 'Tromelin', 'FO/c': 'Clipperton', 'FO/m': 'Marquises', 'FO/a': 'Australes', 'FK/c': 'Chesterfield' };

// e : préfixe d'entité -> [nom affiché ou '', code ISO, continent, code DXCC, nom anglais, latitude, longitude]
// nom affiché vide = utiliser le nom du pays en français fourni par le navigateur
const raw = {};
const isoCount = {};
for (const [key, ent] of Object.entries(cty.entities)) {
  if (key.startsWith('*')) continue; // entités WAE seulement
  const d = byCode.get(ent.dxccCode);
  const iso = ISO_FIX[key] || (d?.countryCode || '').toUpperCase();
  raw[key] = { name: ent.name, iso, cont: ent.continent, code: ent.dxccCode, lat: ent.lat, lon: ent.lon };
  if (iso) isoCount[iso] = (isoCount[iso] || 0) + 1;
}
const e = {};
for (const [key, r] of Object.entries(raw)) {
  const own = FR[key] ?? ((r.iso && (isoCount[r.iso] === 1 || MAIN.has(key))) ? '' : r.name);
  e[key] = [own, r.iso, r.cont, r.code, r.name, r.lat, r.lon];
}
// p : préfixe -> préfixe d'entité
const p = {};
for (const [pre, m] of Object.entries(cty.prefix)) {
  if (e[m.p]) p[pre] = m.p;
}
const out = `// Fichier généré par tools/build-dxcc.mjs — ne pas modifier à la main.
// Source : Amateur Radio Country Files, Jim Reisert AD1C (https://www.country-files.com/).
export const DXCC_ENTITIES = ${JSON.stringify(e)};
export const DXCC_PREFIXES = ${JSON.stringify(p)};
`;
writeFileSync(new URL('../js/dxcc-data.js', import.meta.url), out);
console.log(Object.keys(e).length, 'entités,', Object.keys(p).length, 'préfixes,', out.length, 'octets');
