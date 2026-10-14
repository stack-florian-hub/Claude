// Collecte automatique des annonces des réseaux branchés (AJP, Century 21, Laforêt, Immonot) vers la base locale.
// Usage : npm run collect                       (départements des zones actives, tous les réseaux)
//         npm run collect -- --depts 85,44 --networks ajp,immonot
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, addListings, getListings, getSettings, getZones, updateListing } from '../src/lib/store';
import { collectAjp } from '../src/lib/collect/ajp';
import { collectCentury21 } from '../src/lib/collect/century21';
import { collectLaforet } from '../src/lib/collect/laforet';
import { collectImmonot } from '../src/lib/collect/immonot';
import { DiskCache } from '../src/lib/collect/http';
import type { ListingInput } from '../src/lib/types';
import { analyzeAll, geocode } from '../src/lib/server';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const zones = getZones().filter((z) => z.active);
const depts = (opt('--depts')?.split(',') ?? [...new Set(zones.map((z) => z.dept))]).map((d) => d.trim());
const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
const logFile = path.join(DATA_DIR, 'logs', `collecte-${today}.log`);
const log = (m: string) => { console.log(m); fs.appendFileSync(logFile, m + '\n'); };

(async () => {
  log(`Collecte du ${today} – départements ${depts.join(', ')}`);
  const before = new Map(getListings().map((l) => [l.url, l]));
  const only = opt('--networks')?.split(',');
  const want = (id: string) => !only || only.includes(id);
  const cacheDir = (n: string) => path.join(DATA_DIR, 'collect', n);
  // chaque réseau a son propre site : les collectes tournent en parallèle, chacune au rythme d'une requête par seconde
  const results = await Promise.all([
    want('ajp') ? collectAjp({ depts, cacheDir: cacheDir('ajp'), log, maxDetails: +(opt('--max-details') ?? 2000) }).then((x) => ({ network: 'ajp', label: 'AJP Immobilier', pages: x.agencies, cards: x.cards.length, inputs: x.inputs, details: x.details, errors: x.errors })) : null,
    want('century21') ? collectCentury21({ depts, log, cache: new DiskCache(cacheDir('century21'), fs, path) }) : null,
    want('laforet') ? collectLaforet({ depts, log, cache: new DiskCache(cacheDir('laforet'), fs, path) }) : null,
    want('immonot') ? collectImmonot({ depts, log }) : null,
  ].map((p) => (p ? p.catch((e: Error) => ({ network: '?', label: '?', pages: 0, cards: 0, inputs: [] as ListingInput[], details: 0, errors: [e.message] })) : Promise.resolve(null))));
  const ran = results.filter((x): x is NonNullable<typeof x> => !!x);
  for (const x of ran) log(`${x.label} : ${x.cards} biens lus, ${x.inputs.length} retenus, ${x.details} fiches détaillées, ${x.errors.length} erreur(s)`);
  const r = { inputs: ran.flatMap((x) => x.inputs), cards: ran.reduce((a, x) => a + x.cards, 0), agencies: ran.find((x) => x.network === 'ajp')?.pages ?? 0, errors: ran.flatMap((x) => x.errors) };

  const { added, priceUpdates } = addListings(r.inputs);
  // fiches enrichies (description lue après coup) et retours sur le marché
  for (const i of r.inputs) {
    const old = before.get(i.url);
    if (!old) continue;
    const patch: Record<string, unknown> = {};
    if (i.landSurface && !old.landSurface) patch.landSurface = i.landSurface;
    if (!old.description && i.description) Object.assign(patch, { description: i.description, lots: i.lots, title: i.title, dpe: i.dpe, chargesAnnual: i.chargesAnnual, coproLots: i.coproLots, agency: i.agency });
    if (old.offMarketAt) patch.offMarketAt = undefined;
    if (Object.keys(patch).length) updateListing(old.id, patch);
  }
  // annonces disparues du site de leur réseau : vendues ou retirées (seulement pour les réseaux collectés sans incident)
  const live = new Set(r.inputs.map((i) => i.url));
  const okNets = new Set(ran.filter((x) => x.errors.length < 5 && x.cards > 0).map((x) => x.network));
  const gone = getListings().filter((l) => l.network && okNets.has(l.network) && !l.demo && l.url && !live.has(l.url) && !l.offMarketAt && depts.includes(l.address.dept));
  for (const l of gone) updateListing(l.id, { offMarketAt: today });

  // code postal / INSEE des nouvelles annonces (commune seulement : pas de coordonnées sans rue)
  let geo = 0;
  for (const l of added) {
    if (l.address.insee) continue;
    const g = await geocode(l);
    if (g && g.postcode?.startsWith(l.address.dept)) {
      updateListing(l.id, { address: { ...l.address, city: g.city || l.address.city, insee: g.insee, postalCode: /^\d{5}$/.test(l.address.postalCode) ? l.address.postalCode : g.postcode, lat: g.precise ? g.lat : undefined, lon: g.precise ? g.lon : undefined } });
      geo++;
    }
  }

  const ids = new Set(added.map((l) => l.id));
  const fresh = analyzeAll(getListings().filter((l) => ids.has(l.id))).filter((x) => x.analysis.flagged).sort((a, b) => b.analysis.score - a.analysis.score);
  const drops = priceUpdates.filter((u) => u.to < u.from);
  log(`\nRésumé : ${added.length} nouvelles annonces (${geo} localisées), ${drops.length} baisses de prix, ${gone.length} annonces retirées, ${fresh.length} nouvelles alertes.`);
  for (const x of fresh.slice(0, 15)) log(`  ⚑ ${x.analysis.score} | ${x.listing.title} | ${x.listing.price} € → lots ${x.analysis.total.mid} € | gain ${x.analysis.gain.mid} € | ${x.listing.url}`);
  for (const u of drops.slice(0, 15)) log(`  ↓ ${u.title} : ${u.from} → ${u.to} €`);
  fs.writeFileSync(path.join(DATA_DIR, 'logs', 'derniere-collecte.json'), JSON.stringify({ date: today, depts, agencies: r.agencies, cards: r.cards, networks: ran.map((x) => ({ network: x.network, label: x.label, cards: x.cards, retenus: x.inputs.length, errors: x.errors.length })), added: added.length, drops, gone: gone.length, alerts: fresh.slice(0, 30).map((x) => ({ id: x.listing.id, title: x.listing.title, score: x.analysis.score, gain: x.analysis.gain.mid, url: x.listing.url })), errors: r.errors.slice(0, 20) }, null, 1));
})();
