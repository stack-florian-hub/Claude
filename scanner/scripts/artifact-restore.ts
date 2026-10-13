// Reconstruit la base locale (data/db/listings.json) à partir du data.json publié la semaine précédente,
// pour que la collecte suivante garde les identifiants, l'historique des prix et les annonces retirées.
// Usage : npm run artifact:restore -- chemin/vers/data.json
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../src/lib/store';
import { DEFAULT_SETTINGS, DEFAULT_ZONES } from '../src/lib/defaults';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.log('Usage : npm run artifact:restore -- data.json   (fichier publié de l’artefact)');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(src, 'utf8'));
const db = path.join(DATA_DIR, 'db');
fs.mkdirSync(db, { recursive: true });
fs.writeFileSync(path.join(db, 'listings.json'), JSON.stringify(data.listings || [], null, 1));
for (const [f, v] of [['deals', []], ['settings', DEFAULT_SETTINGS], ['zones', DEFAULT_ZONES]] as const) {
  const p = path.join(db, `${f}.json`);
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(v, null, 1));
}
if (data.meta?.collecte) {
  fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'logs', 'collecte-precedente.json'), JSON.stringify(data.meta.collecte));
}
console.log(`✔ ${data.listings?.length ?? 0} annonces restaurées depuis ${src}`);
