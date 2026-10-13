// Importe un fichier DVF déjà téléchargé.
// Usage : npm run dvf:import -- <fichier> [--dept 44,85,49,37]
//  - ValeursFoncieres-2024.txt (DVF brut, séparateur |, fichier national : préciser --dept)
//  - 44.csv ou 44.csv.gz (geo-dvf départemental)
import fs from 'node:fs';
import { mergeIntoIndex, readDvfFile } from './dvf-lib';

const args = process.argv.slice(2);
const di = args.indexOf('--dept');
const depts = di >= 0 ? new Set(args[di + 1].split(',').map((d) => d.trim().padStart(2, '0'))) : undefined;
const files = args.filter((a, i) => !a.startsWith('--') && (di < 0 || i !== di + 1));
if (!files.length) {
  console.log('Usage : npm run dvf:import -- ValeursFoncieres-2024.txt --dept 44,85,49,37');
  process.exit(1);
}

(async () => {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`Fichier introuvable : ${file}`);
      continue;
    }
    console.log(`Lecture de ${file}${depts ? ` (départements ${[...depts].join(', ')})` : ''} …`);
    const { byDept, lines, years, names } = await readDvfFile(file, depts);
    console.log(`  ${lines} lignes lues, années ${[...years].join(', ')}`);
    for (const [dept, muts] of byDept) {
      const r = mergeIntoIndex(dept, muts, file.split('/').pop()!, names);
      console.log(`✔ ${dept} : +${muts.length} → ${r.n} mutations (${r.years.join(', ')})`);
    }
  }
})();
