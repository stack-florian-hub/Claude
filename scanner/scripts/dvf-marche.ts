// Fiche marché DVF par commune : €/m², dépendances vendues seules, valeur implicite d'une dépendance vendue avec un logement.
// Usage : npm run dvf:marche                    (toutes les communes des zones actives)
//         npm run dvf:marche -- 44109 85194     (codes INSEE)
import fs from 'node:fs';
import path from 'node:path';
import type { DvfIndex, DvfMutation, Zone } from '../src/lib/types';
import { DEFAULT_ZONES } from '../src/lib/defaults';
import { DATA_DIR, DVF_DIR } from './dvf-lib';
import { impliedDependency, quantiles } from '../src/lib/dvf-stats';

const zonesFile = path.join(DATA_DIR, 'db', 'zones.json');
const zones: Zone[] = fs.existsSync(zonesFile) ? JSON.parse(fs.readFileSync(zonesFile, 'utf8')) : DEFAULT_ZONES;
const args = process.argv.slice(2);
const targets = args.length ? args.map((c) => ({ insee: c, name: c, dept: c.slice(0, 2) })) : zones.filter((z) => z.active).flatMap((z) => z.communes.filter((c) => /^\d{5}$/.test(c)).map((c) => ({ insee: c, name: z.name, dept: z.dept })));

const cache = new Map<string, DvfIndex>();
const load = (d: string) => {
  if (!cache.has(d)) {
    const f = path.join(DVF_DIR, `${d}.json`);
    if (!fs.existsSync(f)) return null;
    cache.set(d, JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  return cache.get(d)!;
};
const k = (x: number) => (isFinite(x) ? (x / 1000).toFixed(1) : '—');
const r = (x: number) => (isFinite(x) ? Math.round(x).toString() : '—');

console.log('INSEE  commune                         | appart €/m² P25/méd/P75 (n)   | dépendance seule k€ P20/P50/P80 (n) | dépendance implicite avec appart k€ P25/méd/P75 (n)');
for (const t of targets) {
  const idx = load(t.dept);
  if (!idx) { console.log(`${t.insee}  DVF du ${t.dept} absente`); continue; }
  const m: DvfMutation[] = idx.mutations.filter((x) => x.c === t.insee);
  const A = quantiles(m.filter((x) => x.t === 'A' && x.nd === 0 && x.s! >= 9).map((x) => x.v / x.s!).filter((v) => v > 300 && v < 20000), [0.25, 0.5, 0.75]);
  const D = quantiles(m.filter((x) => x.t === 'D' && x.nd === 1 && x.v >= 1000 && x.v <= 120000).map((x) => x.v), [0.2, 0.5, 0.8]);
  const I = impliedDependency(m);
  console.log(`${t.insee}  ${t.name.slice(0, 30).padEnd(30)} | ${r(A.q[0])}/${r(A.q[1])}/${r(A.q[2])} (${A.n})`.padEnd(73) + `| ${k(D.q[0])}/${k(D.q[1])}/${k(D.q[2])} (${D.n})`.padEnd(37) + `| ${k(I.q[0])}/${k(I.q[1])}/${k(I.q[2])} (${I.n})`);
}
