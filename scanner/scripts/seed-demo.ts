// (Ré)initialise la base locale avec le jeu de démo. Les annonces et opérations saisies sont conservées.
// Usage : npm run demo            (ajoute/rafraîchit la démo)
//         npm run demo -- --reset (repart de zéro : supprime aussi paramètres et zones)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, seedDemo } from '../src/lib/store';

if (process.argv.includes('--reset')) {
  for (const f of ['listings', 'deals', 'settings', 'zones']) fs.rmSync(path.join(DATA_DIR, 'db', f + '.json'), { force: true });
  seedDemo(false);
} else seedDemo(true);
console.log('✔ Jeu de démo chargé dans', path.join(DATA_DIR, 'db'));
