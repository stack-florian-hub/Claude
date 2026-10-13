// Sélection des comparables DVF et calcul des fourchettes (fonctions pures, utilisables partout).
import type { Address, Comparable, DvfMutation, Listing, LotValuation, Range, Settings, SubLot } from './types';
import { addMonths, haversine, quantile, round, streetCore, streetKey } from './util';
import { impliedDependency } from './dvf-stats';

export interface DvfSlice {
  kind: 'reel' | 'demo' | 'aucun';
  commune: DvfMutation[]; // même commune (INSEE) ou, à défaut, même code postal
  dept: DvfMutation[];
  refDate: string; // date de la mutation la plus récente du département (DVF a ~6 mois de retard)
}

export interface DvfSource {
  slice(addr: Address): DvfSlice;
}

const TYPE_CODE: Partial<Record<SubLot['type'], DvfMutation['t']>> = { appartement: 'A', maison: 'M', local: 'L' };

function toComparable(m: DvfMutation, addr: Address): Comparable {
  return {
    date: m.d,
    value: m.v,
    surface: m.s,
    pricePerM2: m.s ? Math.round(m.v / m.s) : undefined,
    type: { A: 'Appartement', M: 'Maison', D: 'Dépendance', L: 'Local' }[m.t],
    address: [m.n, m.r].filter(Boolean).join(' '),
    postalCode: m.cp,
    distanceM: addr.lat != null && addr.lon != null && m.y != null && m.x != null ? Math.round(haversine(addr.lat, addr.lon, m.y, m.x)) : undefined,
  };
}

function sameStreet(m: DvfMutation, key: string, core: string) {
  if (!core) return false;
  const k = streetKey(m.r);
  return k === key || (core.length >= 4 && streetCore(m.r) === core);
}

function sortRecent(a: DvfMutation, b: DvfMutation) {
  return b.d.localeCompare(a.d);
}

interface Tier { source: LotValuation['source']; list: DvfMutation[]; minN: number; conf: (n: number) => number }

/**
 * Niveaux de comparables, du plus local au plus large :
 * même rue → < 300 m → < 800 m (si l'adresse est géocodée) → commune → département.
 * Les rayons portent sur tout le département : une vente de la commune voisine à 200 m compte.
 */
function tiers(pool: DvfSlice, addr: Address, filter: (m: DvfMutation) => boolean, s: Settings): Tier[] {
  const since = addMonths(pool.refDate, -12 * s.dvf.years);
  const key = streetKey(addr.street), core = streetCore(addr.street);
  const commune = pool.commune.filter((m) => m.d >= since && filter(m));
  const dept = pool.dept.filter((m) => m.d >= since && filter(m));
  const hasXY = addr.lat != null && addr.lon != null;
  const withDist = hasXY ? dept.filter((m) => m.y != null && m.x != null).map((m) => ({ m, dist: haversine(addr.lat!, addr.lon!, m.y!, m.x!) })) : [];
  const within = (r: number) => withDist.filter((x) => x.dist <= r).map((x) => x.m);
  // environs : ventes à moins de 10 km du centre de la commune (centre = moyenne des ventes géolocalisées de la commune)
  const located = pool.commune.filter((m) => m.x != null && m.y != null);
  let environs: DvfMutation[] = [];
  if (located.length >= 3) {
    const cx = located.reduce((a, m) => a + m.x!, 0) / located.length, cy = located.reduce((a, m) => a + m.y!, 0) / located.length;
    environs = dept.filter((m) => m.x != null && m.y != null && haversine(cy, cx, m.y!, m.x!) <= 10000);
  }
  return [
    { source: 'dvf-rue', list: commune.filter((m) => sameStreet(m, key, core)), minN: s.dvf.minStreet, conf: (n) => Math.min(0.9, 0.6 + n / 30) },
    { source: 'dvf-proche', list: within(300), minN: s.dvf.minStreet, conf: (n) => Math.min(0.85, 0.55 + n / 40) },
    { source: 'dvf-quartier', list: within(800), minN: s.dvf.minCommune, conf: (n) => Math.min(0.75, 0.45 + n / 80) },
    { source: 'dvf-commune', list: commune, minN: s.dvf.minCommune, conf: (n) => Math.min(0.55, 0.35 + n / 150) },
    { source: 'dvf-environs', list: environs, minN: 10, conf: (n) => Math.min(0.45, 0.3 + n / 300) },
    { source: 'dvf-dept', list: dept, minN: 10, conf: () => 0.15 },
  ];
}

/** Valeur forfaitaire retranchée par dépendance incluse dans une vente de logement (P25 des dépendances vendues seules, bornée). */
export function dependencyAdjustment(pool: DvfSlice) {
  const v = pool.commune.filter((m) => m.t === 'D' && m.nd === 1 && m.v >= 1000 && m.v <= 120000).map((m) => m.v).sort((a, b) => a - b);
  return v.length >= 10 ? Math.min(15000, Math.max(3000, quantile(v, 0.25))) : 8000;
}

/**
 * Valeur DVF d'un appartement, d'une maison ou d'un local : quartiles du €/m² × surface.
 * Toutes les ventes sont gardées (celles « sans dépendance » sont biaisées vers les immeubles anciens / quartiers moins chers),
 * en retranchant une valeur forfaitaire par dépendance vendue avec le logement.
 */
function valueBuilt(lot: SubLot, listing: Listing, pool: DvfSlice, s: Settings): LotValuation | null {
  const t = TYPE_CODE[lot.type];
  if (!t) return null;
  const surf = lot.surface ?? (listing.lots.length === 1 ? listing.surface : undefined);
  const adj = dependencyAdjustment(pool);
  const net = (m: DvfMutation) => Math.max(m.v * 0.5, m.v - m.nd * adj);
  const ok = (m: DvfMutation) => {
    if (m.t !== t || !m.s || m.s < 9) return false;
    const ppm = net(m) / m.s;
    if (ppm < 300 || ppm > 20000) return false;
    // maisons : bande de surface plus étroite (le €/m² baisse vite avec la surface)
    const band = t === 'M' ? 0.25 : 0.4;
    return !surf || (m.s >= surf * (1 - band) && m.s <= surf * (1 + band));
  };
  // maisons : terrain, état et annexes pèsent lourd → fourchette prudente (P20 / P40 / P60)
  const Q = t === 'M' ? [0.2, 0.4, 0.6] : [0.25, 0.5, 0.75];
  for (const tier of tiers(pool, listing.address, ok, s)) {
    if (tier.list.length < tier.minN) continue;
    const used = tier.list;
    const ppm = used.map((m) => net(m) / m.s!).sort((a, b) => a - b);
    const p = { low: Math.round(quantile(ppm, Q[0])), mid: Math.round(quantile(ppm, Q[1])), high: Math.round(quantile(ppm, Q[2])) };
    const val: Range = surf
      ? { low: round(p.low * surf), mid: round(p.mid * surf), high: round(p.high * surf) }
      : (() => {
          const v = used.map(net).sort((a, b) => a - b);
          return { low: round(quantile(v, 0.25)), mid: round(quantile(v, 0.5)), high: round(quantile(v, 0.75)) };
        })();
    const notes: string[] = [];
    let conf = tier.conf(used.length) * (surf ? 1 : 0.6) * (t === 'M' ? 0.7 : 1);
    if (!surf) notes.push('Surface inconnue : valeur médiane des ventes, peu fiable');
    if (t === 'M') notes.push('Maison : fourchette prudente (quantiles 20/40/60 %), terrain et état non pris en compte : visiter avant de conclure');
    if (t === 'M' && surf && surf > 150) conf *= 0.7;
    const spread = p.low > 0 ? p.high / p.low : 1;
    if ((tier.source === 'dvf-commune' || tier.source === 'dvf-environs') && spread > 1.45) {
      // quartier inconnu dans une commune hétérogène : on se place en bas de fourchette (P15 / P35 / P60)
      conf *= 0.7;
      p.low = Math.round(quantile(ppm, 0.15)); p.mid = Math.round(quantile(ppm, 0.35)); p.high = Math.round(quantile(ppm, 0.6));
      if (surf) Object.assign(val, { low: round(p.low * surf), mid: round(p.mid * surf), high: round(p.high * surf) });
      notes.push(`Commune hétérogène (écart P75/P25 de ${Math.round((spread - 1) * 100)} %) et adresse imprécise : estimation en bas de fourchette (P15/P35/P60). Préciser l’adresse pour comparer au quartier`);
    }
    if (used.some((m) => m.nd > 0)) notes.push(`Ventes avec dépendance corrigées de ${Math.round(adj / 100) * 100} € par dépendance`);
    return {
      lotId: lot.id, type: lot.type, ...val, pricePerM2: p, source: tier.source, n: used.length, confidence: conf,
      comparables: [...used].sort(sortRecent).slice(0, 12).map((m) => toComparable(m, listing.address)),
      note: notes.join(' · ') || undefined,
    };
  }
  return null;
}

// Quantiles des ventes de dépendance seule utilisés pour chaque type (hypothèse prudente, affichée dans la fiche).
// DVF range sous « dépendance » garages, parkings, caves mais aussi remises, hangars, chais : on vise bas et on plafonne.
const DEP_Q: Record<string, [number, number, number]> = { garage: [0.25, 0.45, 0.65], parking: [0.1, 0.25, 0.4], cave: [0.05, 0.1, 0.2] };

/** Garage / parking / cave : calibrage sur les dépendances vendues seules, borné par les valeurs par défaut de la zone. */
function valueDependance(lot: SubLot, listing: Listing, pool: DvfSlice, s: Settings, defaults: Range): LotValuation | null {
  const q = DEP_Q[lot.type];
  if (!q) return null;
  const ok = (m: DvfMutation) => m.t === 'D' && m.nd === 1 && m.v >= 1000 && m.v <= 120000;
  for (const tier of tiers(pool, listing.address, ok, s)) {
    if (tier.source === 'dvf-dept' || tier.list.length < Math.max(tier.minN, 5)) continue;
    const v = tier.list.map((m) => m.v).sort((a, b) => a - b);
    let r: Range = { low: round(quantile(v, q[0])), mid: round(quantile(v, q[1])), high: round(quantile(v, q[2])) };
    const notes = [`Dépendances vendues seules (DVF ne distingue pas garage/parking/cave) : quantiles ${q.map((x) => Math.round(x * 100)).join('/')} %`];
    if (lot.type === 'cave') {
      // les caves se vendent rarement seules : on reste dans la fourchette par défaut
      r = { low: Math.min(r.low, defaults.low), mid: Math.min(Math.max(r.mid, defaults.low), defaults.mid), high: Math.min(Math.max(r.high, defaults.mid), defaults.high) };
    } else {
      const capMid = round(defaults.high * 1.2), capHigh = round(defaults.high * 1.6);
      if (r.mid > capMid || r.high > capHigh) notes.push(`plafonné à ${capMid / 1000} k€ / ${capHigh / 1000} k€ (valeurs de zone × 1,2 / × 1,6) : forcer la valeur si un comparable direct le justifie`);
      r = { low: Math.min(r.low, capMid), mid: Math.min(r.mid, capMid), high: Math.min(r.high, capHigh) };
    }
    return {
      lotId: lot.id, type: lot.type, ...r, source: tier.source, n: v.length,
      confidence: tier.conf(v.length) * (lot.type === 'cave' ? 0.6 : 0.8),
      comparables: [...tier.list].sort(sortRecent).slice(0, 12).map((m) => toComparable(m, listing.address)),
      note: notes.join(' · '),
    };
  }
  return null;
}

export function valueLotFromDvf(lot: SubLot, listing: Listing, pool: DvfSlice, s: Settings, defaults: Range | undefined): LotValuation | null {
  if (pool.kind === 'aucun') return null;
  if (lot.type in DEP_Q) return defaults ? valueDependance(lot, listing, pool, s, defaults) : null;
  return valueBuilt(lot, listing, pool, s);
}

/** Statistiques de quartier pour la fiche (€/m² appartement/maison et dépendances). */
export function marketStats(pool: DvfSlice, s: Settings) {
  const since = addMonths(pool.refDate, -12 * s.dvf.years);
  const stat = (t: DvfMutation['t']) => {
    const l = pool.commune.filter((m) => m.d >= since && m.t === t && (t === 'D' ? m.nd === 1 : m.s && m.s >= 9));
    const v = l.map((m) => (t === 'D' ? m.v : m.v / m.s!)).sort((a, b) => a - b);
    return { n: v.length, p25: quantile(v, 0.25), med: quantile(v, 0.5), p75: quantile(v, 0.75) };
  };
  const recent = pool.commune.filter((m) => m.d >= since);
  const imp = impliedDependency(recent, [0.25, 0.5, 0.75]);
  return {
    A: stat('A'), M: stat('M'), D: stat('D'), since, refDate: pool.refDate, kind: pool.kind,
    implied: { n: imp.n, p25: imp.q[0], med: imp.q[1], p75: imp.q[2] },
  };
}
