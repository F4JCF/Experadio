// Génère js/world-data.js : contours du monde (Natural Earth 1:110m, domaine public, via world-atlas)
// en projection équirectangulaire : x = (lon + 180) * 2, y = (90 - lat) * 2 (planisphère de 720 × 360).
//   npm i world-atlas@2 topojson-client@3 && node tools/build-world.mjs <dossier node_modules>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const nm = process.argv[2] || 'node_modules';
const require = createRequire(join(nm, 'x.js'));
const topojson = require('topojson-client');
const world = JSON.parse(readFileSync(join(nm, 'world-atlas/countries-110m.json'), 'utf8'));

const K = 2;
const pt = ([lon, lat]) => `${((lon + 180) * K).toFixed(1)} ${((90 - lat) * K).toFixed(1)}`;

// Les contours qui franchissent l'antiméridien sont « déroulés » (longitudes continues), puis
// dessinés une seconde fois décalés de 360° : le cadre de la carte coupe proprement ce qui dépasse.
function unwrap(ring) {
  const out = [];
  let shift = 0;
  ring.forEach((c, i) => {
    if (i) {
      const d = c[0] + shift - out[i - 1][0];
      if (d > 180) shift -= 360; else if (d < -180) shift += 360;
    }
    out.push([c[0] + shift, c[1]]);
  });
  return out;
}

function ringsToPath(rings, close) {
  const parts = [];
  for (const raw of rings) {
    const ring = unwrap(raw);
    const lons = ring.map((c) => c[0]);
    const copies = [0];
    if (Math.max(...lons) > 180) copies.push(-360);
    if (Math.min(...lons) < -180) copies.push(360);
    for (const off of copies) {
      parts.push(ring.map((c, i) => `${i ? 'L' : 'M'}${pt([c[0] + off, c[1]])}`).join('') + (close ? 'Z' : ''));
    }
  }
  return parts.join('');
}

const land = topojson.merge(world, world.objects.countries.geometries);
const landPath = ringsToPath(land.coordinates.flat(), true);
const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
const borderPath = ringsToPath(borders.coordinates, false);

const out = `// Fichier généré par tools/build-world.mjs — ne pas modifier à la main.
// Contours : Natural Earth 1:110m (domaine public), via world-atlas (ISC).
export const WORLD_W = ${360 * K};
export const WORLD_H = ${180 * K};
export const WORLD_K = ${K};
export const LAND_PATH = ${JSON.stringify(landPath)};
export const BORDER_PATH = ${JSON.stringify(borderPath)};
`;
writeFileSync(new URL('../js/world-data.js', import.meta.url), out);
console.log('world-data.js', out.length, 'octets');
