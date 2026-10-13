// Construit l'artefact publiable : artifact/dist/index.html (application) + artifact/dist/data.json (données de la semaine).
// Usage : npm run artifact:build   (après npm run collect et npm run dvf:fetch)
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';
import { DATA_DIR, getListings, getSettings, getZones } from '../src/lib/store';
import { dvfSource, dvfStatus, loadDept, zoneMarkets } from '../src/lib/dvf';
import { valueLots } from '../src/lib/scoring';
import { marketStats } from '../src/lib/dvf-query';
import type { LotValuation } from '../src/lib/types';
import { addMonths } from '../src/lib/util';
import type { ArtifactData, CompactMut } from '../artifact/state';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'artifact', 'dist');
fs.mkdirSync(OUT, { recursive: true });

// ---------- données
const settings = getSettings();
settings.dvf.useDemo = false;
const zones = getZones();
const listings = getListings().filter((l) => !l.demo);
// DVF embarquée : communes des zones seulement (annonces collées à la main dans l'artefact)
const communes = new Set<string>(zones.flatMap((z) => z.communes.filter((c) => /^\d{5}$/.test(c))));
const depts = [...new Set([...zones.map((z) => z.dept), ...listings.map((l) => l.address.dept)])].filter((d) => /^\d{2}$/.test(d)).sort();
const byInsee: Record<string, CompactMut[]> = {};
const refDates: Record<string, string> = {};
for (const d of depts) {
  const l = loadDept(d, false);
  if (!l) continue;
  refDates[d] = l.refDate;
  const since = addMonths(l.refDate, -12 * settings.dvf.years);
  for (const [insee, ms] of l.byInsee) {
    if (!communes.has(insee)) continue;
    byInsee[insee] = ms.filter((m) => m.d >= since).map((m) => [m.d, m.v, m.t, m.s ?? 0, m.nd, m.cp, m.r, m.x ?? null, m.y ?? null]);
  }
}
// valeurs des lots et statistiques de marché calculées ici, sur toute la DVF du département
const dvf = dvfSource(settings);
const valuations: Record<string, LotValuation[]> = {};
const stats: Record<string, ReturnType<typeof marketStats>> = {};
for (const l of listings) {
  valuations[l.id] = valueLots(l, settings, zones, dvf).map((v) => ({ ...v, comparables: v.comparables.slice(0, 8) }));
  const k = l.address.insee || l.address.postalCode;
  if (k && !stats[k]) stats[k] = marketStats(dvf.slice(l.address), settings);
}
const lastFile = path.join(DATA_DIR, 'logs', 'derniere-collecte.json');
const collecte = fs.existsSync(lastFile) ? JSON.parse(fs.readFileSync(lastFile, 'utf8')) : undefined;
const today = new Date();
const nextMonday = new Date(today);
nextMonday.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));
const data: ArtifactData = {
  meta: {
    generatedAt: today.toISOString(),
    dvf: dvfStatus(depts, false).filter((x) => x.kind === 'reel').map((x) => ({ dept: x.dept, refDate: x.refDate!, n: x.n, years: x.years })),
    collecte,
    nextUpdate: nextMonday.toISOString().slice(0, 10),
  },
  listings: listings.map((l) => ({ ...l, description: l.description.slice(0, 2500) })),
  valuations,
  stats,
  dvf: { refDates, byInsee },
  markets: zoneMarkets(zones, settings),
};
const json = JSON.stringify(data);
fs.writeFileSync(path.join(OUT, 'data.json'), json);
console.log(`data.json : ${listings.length} annonces, ${Object.keys(byInsee).length} communes DVF, ${(json.length / 1e6).toFixed(1)} Mo`);

// ---------- application (React chargé depuis cdnjs, le reste empaqueté)
const reactGlobals: Plugin = {
  name: 'react-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/client|\/jsx-runtime)?$/ }, (a) => ({ path: a.path, namespace: 'g' }));
    b.onLoad({ filter: /.*/, namespace: 'g' }, (a) => ({
      contents: a.path.startsWith('react-dom') ? 'module.exports = window.ReactDOM' : 'module.exports = window.React',
      loader: 'js',
    }));
  },
};
const shim = (p: string) => path.join(ROOT, 'artifact', 'shims', p);
(async () => {
  const r = await build({
    entryPoints: [path.join(ROOT, 'artifact', 'main.tsx')],
    bundle: true, minify: true, write: false, format: 'iife', target: 'es2020', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    inject: [path.join(ROOT, 'artifact', 'react-inject.ts')],
    alias: { 'next/link': shim('next-link.tsx'), 'next/navigation': shim('next-navigation.ts'), '@/lib/api': shim('api.ts'), '@': path.join(ROOT, 'src') },
    plugins: [reactGlobals],
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync(path.join(ROOT, 'src', 'app', 'globals.css'), 'utf8')
    .replace('html, body { margin: 0; padding: 0; }', 'body { margin: 0; }')
    .replace('.nav { background: var(--panel); border-right: 1px solid var(--line); padding: 14px 10px; position: sticky; top: 0; height: 100vh; }', '.nav { background: var(--panel); border-right: 1px solid var(--line); padding: 14px 10px; position: sticky; top: env(safe-area-inset-top, 0px); height: 100vh; }');
  const foot = `Données du ${today.toLocaleDateString('fr-FR')} · prochaine mise à jour lundi ${new Date(data.meta.nextUpdate).toLocaleDateString('fr-FR')}`;
  const html = `<title>Scanner MdB TUÉ et Fils</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
${css}
@media (max-width: 900px) { main { padding: 12px 16px; } }
</style>
<div id="root"></div>
<script>window.__SCANNER_FOOT__ = ${JSON.stringify(foot)}; window.__SCANNER_ARTIFACT__ = true;</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  console.log(`index.html : ${(html.length / 1e3).toFixed(0)} ko`);
})();
