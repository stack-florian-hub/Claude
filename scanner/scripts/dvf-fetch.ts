// Télécharge la DVF géolocalisée (data.gouv.fr, gratuite) par département et construit l'index local.
// Usage : npm run dvf:fetch -- 44 85 49 37 78 [--years 2023,2024,2025]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RAW_DIR, mergeIntoIndex, readDvfFile } from './dvf-lib';

const args = process.argv.slice(2);
const yi = args.indexOf('--years');
const thisYear = new Date().getFullYear();
const years = yi >= 0 ? args[yi + 1].split(',').map(Number) : [thisYear - 3, thisYear - 2, thisYear - 1];
const depts = args.filter((a, i) => !a.startsWith('--') && (yi < 0 || i !== yi + 1));
if (!depts.length) {
  console.log('Usage : npm run dvf:fetch -- 44 85 49 37 78 [--years 2023,2024,2025]');
  process.exit(1);
}

async function download(url: string, dest: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    // repli sur curl (proxy d'entreprise, certificats…)
    try {
      execFileSync('curl', ['-sSfL', '-m', '600', '-o', dest, url]);
    } catch {
      throw new Error(`échec du téléchargement ${url} (${(e as Error).message})`);
    }
  }
}

(async () => {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  for (const dept of depts) {
    const all = [];
    for (const y of years) {
      const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${y}/departements/${dept}.csv.gz`;
      const dest = path.join(RAW_DIR, `geo-dvf-${y}-${dept}.csv.gz`);
      if (!fs.existsSync(dest)) {
        process.stdout.write(`↓ ${dept} ${y} … `);
        try {
          await download(url, dest);
          console.log(`${(fs.statSync(dest).size / 1e6).toFixed(1)} Mo`);
        } catch (e) {
          console.log(`indisponible (${(e as Error).message}) — année ignorée`);
          continue;
        }
      }
      const { byDept, lines } = await readDvfFile(dest, new Set([dept]));
      const muts = byDept.get(dept) || [];
      console.log(`  ${dept} ${y} : ${lines} lignes → ${muts.length} mutations utiles`);
      all.push(...muts);
    }
    if (!all.length) {
      console.log(`  ${dept} : rien à indexer`);
      continue;
    }
    const r = mergeIntoIndex(dept, all, 'geo-dvf data.gouv.fr');
    console.log(`✔ ${r.file} : ${r.n} mutations (${r.years.join(', ')})`);
  }
})();
