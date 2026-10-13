// Vérifie le scoring sur le jeu de démo (sans toucher à la base) : npm test
import fsx from 'node:fs';
import { DEFAULT_SETTINGS, DEFAULT_ZONES } from '../src/lib/defaults';
import { demoDvf, demoListings } from '../src/lib/demo';
import { analyze } from '../src/lib/scoring';
import { parseListingText } from '../src/lib/detect';
import { simulate } from '../src/lib/simulation';
import type { DvfSource } from '../src/lib/dvf-query';
import type { Listing } from '../src/lib/types';

const s = structuredClone(DEFAULT_SETTINGS);
const dvf: DvfSource = {
  slice(a) {
    const idx = demoDvf(a.dept);
    if (!idx) return { kind: 'aucun', commune: [], dept: [], refDate: '2025-12-31' };
    return { kind: 'demo', commune: idx.mutations.filter((m) => m.c === a.insee), dept: idx.mutations, refDate: idx.mutations.reduce((x, m) => (m.d > x ? m.d : x), '') };
  },
};
let fails = 0;
const check = (cond: boolean, msg: string) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) fails++; };

const listings: Listing[] = demoListings().map((i, k) => ({ ...i, id: 'x' + k, importedAt: '', status: 'nouveau', priceHistory: i.priceHistory ?? [{ date: '', price: i.price }] }));
const res = listings.map((l) => ({ l, a: analyze(l, s, DEFAULT_ZONES, dvf) })).sort((x, y) => y.a.score - x.a.score);
console.log('score  prix      Σ lots    écart     gain      gain%  alerte  titre');
for (const { l, a } of res)
  console.log(String(a.score).padStart(5), String(l.price).padStart(9), String(a.total.mid).padStart(9), String(a.ecart).padStart(9), String(a.gain.mid).padStart(9), (a.gainPct * 100).toFixed(0).padStart(5) + '%', a.flagged ? '  ⚑   ' : '      ', l.title.slice(0, 60));

const np = res.find((r) => r.l.title.startsWith('Lot de 4'))!;
console.log('\nNew Port, détail :');
for (const v of np.a.lots) console.log(`  ${v.type.padEnd(12)} ${v.low}–${v.mid}–${v.high} (${v.source}, n=${v.n})`);
check(np.a.ecart > 150000 && np.a.ecart < 215000, `New Port : sous-évaluation ~180 k€ (obtenu ${np.a.ecart})`);
check(np.a.flagged, 'New Port signalé (gain > 30 k€)');
check(res.slice(0, 3).some((r) => r.l === np.l), 'New Port dans le top 3');
const garage = np.a.lots.find((v) => v.type === 'garage')!;
check(garage.mid >= 15000 && garage.high >= 20000, `Garage New Port valorisé (démo) ${garage.low}/${garage.mid}/${garage.high}`);
const neg = res.find((r) => r.l.title.startsWith('Studio 30 m² Nantes'))!;
check(!neg.a.flagged && neg.a.gain.mid < 0, 'Annonce surévaluée non signalée');

const p = parseListingText(`Appartement T3 58 m² avec cave et deux places de parking
12 rue de Coulmiers 44000 Nantes
Prix : 168 000 € FAI. Charges : 1 400 €/an. DPE : E. Copropriété de 24 lots. Particulier.
Parking visiteurs dans la résidence.`);
check(p.price === 168000 && p.surface === 58 && p.address.postalCode === '44000' && p.dpe === 'E', 'Lecture de texte : prix, surface, CP, DPE');
check(p.lots.map((x) => x.type).join(',') === 'appartement,cave,parking,parking', `Lot groupé détecté : ${p.lots.map((x) => x.type).join(',')}`);
check(p.seller === 'particulier' && p.chargesAnnual === 1400 && p.coproLots === 24, 'Vendeur, charges, copro');

// Captures de pages de portails (bruit : prix au m², mensualités, annonces similaires)

const lbc = parseListingText(fsx.readFileSync('scripts/fixtures/leboncoin.txt', 'utf8'));
check(lbc.source === 'leboncoin' && lbc.price === 189000 && lbc.address.city === 'Nantes' && lbc.address.postalCode === '44100' && lbc.dpe === 'D' && lbc.chargesAnnual === 1320 && lbc.seller === 'particulier', `Capture Leboncoin : ${lbc.price} €, ${lbc.address.postalCode} ${lbc.address.city}, DPE ${lbc.dpe}, charges ${lbc.chargesAnnual}`);
check(lbc.lots.map((x) => x.type).join(',') === 'appartement,cave,parking', `Capture Leboncoin : lots ${lbc.lots.map((x) => x.type).join(',')} (annonces similaires ignorées)`);
const sl = parseListingText(fsx.readFileSync('scripts/fixtures/seloger.txt', 'utf8'));
check(sl.source === 'seloger' && sl.price === 159000 && sl.dpe === 'C' && sl.lots.map((x) => x.type).join(',') === 'appartement,garage,cave' && sl.seller === 'agence', `Capture SeLoger : ${sl.price} €, DPE ${sl.dpe}, lots ${sl.lots.map((x) => x.type).join(',')}`);

const sim = simulate({ price: 525000, acquisitionFees: 39400, travaux: 12000, travauxMonth: 1, loanAmount: 450000, loanRate: 4.5, loanRepayment: 'in_fine', chargesMonthly: 400, lots: [
  { label: 'Garage', resale: 30000, month: 2, saleCostsPct: 0 }, { label: 'Parking', resale: 17000, month: 3, saleCostsPct: 4 }, { label: 'Cave', resale: 7000, month: 4, saleCostsPct: 4 }, { label: 'Appartement', resale: 650000, month: 6, saleCostsPct: 4 }] }, s);
check(sim.netGain > 0 && sim.peakCash > 100000 && sim.irr > 0, `Simulation New Port : gain net ${Math.round(sim.netGain)} €, besoin ${Math.round(sim.peakCash)} €, TRI ${(sim.irr * 100).toFixed(0)} %`);
// Avec la vraie DVF du 78 (si chargée) : New Port valorisé au quartier (centre de Saint-Germain), pas à la médiane communale
import('node:fs').then(async (fs) => {
  if (fs.existsSync('data/dvf/78.json')) {
    const { dvfSource } = await import('../src/lib/dvf');
    const real = structuredClone(s);
    real.dvf.useDemo = false;
    const l = structuredClone(np.l);
    const sansXY = structuredClone(np.l);
    delete sansXY.address.lat; delete sansXY.address.lon;
    const commune = analyze(sansXY, real, DEFAULT_ZONES, dvfSource(real));
    l.address.lat = 48.8976; l.address.lon = 2.0937;
    const local = analyze(l, real, DEFAULT_ZONES, dvfSource(real));
    const apt = local.lots[0];
    check(apt.source === 'dvf-proche' || apt.source === 'dvf-quartier', `DVF réelle : comparables de quartier (${apt.source}, n=${apt.n})`);
    check(apt.pricePerM2!.mid > 6500, `DVF réelle : €/m² du centre de Saint-Germain > 6 500 (${apt.pricePerM2!.mid} ; commune sans géocodage : ${commune.lots[0].pricePerM2?.mid})`);
    const g = local.lots.find((v) => v.type === 'garage')!;
    check(g.mid >= 24000 && g.mid <= 36000, `DVF réelle : garage New Port ~30 k€ (${g.low}/${g.mid}/${g.high}, ${g.source})`);
    check(local.ecart > 150000, `DVF réelle : New Port sous-évalué de plus de 150 k€ (${local.ecart})`);
  } else console.log('· DVF réelle du 78 absente : tests sur données réelles ignorés (npm run dvf:fetch -- 78)');
  process.exit(fails ? 1 : 0);
});
