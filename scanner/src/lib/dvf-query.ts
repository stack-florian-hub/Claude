// Sélection des comparables DVF et calcul des fourchettes (fonctions pures, utilisables partout).
import type { Address, Comparable, DvfMutation, Listing, LotValuation, Range, Settings, SubLot } from './types';
import { addMonths, haversine, quantile, round, streetCore, streetKey } from './util';

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

function sameStreet(m: DvfMutation, addr: Address, key: string, core: string) {
  if (addr.lat != null && addr.lon != null && m.y != null && m.x != null && haversine(addr.lat, addr.lon, m.y, m.x) < 300) return true;
  if (!core) return false;
  const k = streetKey(m.r);
  return k === key || (core.length >= 4 && streetCore(m.r) === core);
}

function sortRecent(a: DvfMutation, b: DvfMutation) {
  return b.d.localeCompare(a.d);
}

interface Tier { source: LotValuation['source']; list: DvfMutation[]; minN: number; conf: (n: number) => number }

function tiers(pool: DvfSlice, addr: Address, filter: (m: DvfMutation) => boolean, s: Settings): Tier[] {
  const since = addMonths(pool.refDate, -12 * s.dvf.years);
  const key = streetKey(addr.street), core = streetCore(addr.street);
  const commune = pool.commune.filter((m) => m.d >= since && filter(m));
  const street = commune.filter((m) => sameStreet(m, addr, key, core));
  const dept = pool.dept.filter((m) => m.d >= since && filter(m));
  return [
    { source: 'dvf-rue', list: street, minN: s.dvf.minStreet, conf: (n) => Math.min(0.9, 0.6 + n / 30) },
    { source: 'dvf-commune', list: commune, minN: s.dvf.minCommune, conf: (n) => Math.min(0.65, 0.4 + n / 120) },
    { source: 'dvf-dept', list: dept, minN: 10, conf: () => 0.2 },
  ];
}

/** Valeur DVF d'un appartement, d'une maison ou d'un local : quartiles du €/m² × surface. */
function valueBuilt(lot: SubLot, listing: Listing, pool: DvfSlice, s: Settings): LotValuation | null {
  const t = TYPE_CODE[lot.type];
  if (!t) return null;
  const surf = lot.surface ?? (listing.lots.length === 1 ? listing.surface : undefined);
  const ok = (m: DvfMutation) => {
    if (m.t !== t || !m.s || m.s < 9) return false;
    const ppm = m.v / m.s;
    if (ppm < 300 || ppm > 20000) return false;
    return !surf || (m.s >= surf * 0.6 && m.s <= surf * 1.4);
  };
  for (const tier of tiers(pool, listing.address, ok, s)) {
    if (tier.list.length < tier.minN) continue;
    // ventes « pures » (sans dépendance) si assez nombreuses : évite de gonfler le €/m²
    const pure = tier.list.filter((m) => m.nd === 0);
    const used = pure.length >= tier.minN ? pure : tier.list;
    const ppm = used.map((m) => m.v / m.s!).sort((a, b) => a - b);
    const p = { low: Math.round(quantile(ppm, 0.25)), mid: Math.round(quantile(ppm, 0.5)), high: Math.round(quantile(ppm, 0.75)) };
    const val: Range = surf
      ? { low: round(p.low * surf), mid: round(p.mid * surf), high: round(p.high * surf) }
      : (() => {
          const v = used.map((m) => m.v).sort((a, b) => a - b);
          return { low: round(quantile(v, 0.25)), mid: round(quantile(v, 0.5)), high: round(quantile(v, 0.75)) };
        })();
    return {
      lotId: lot.id, type: lot.type, ...val, pricePerM2: p, source: tier.source, n: used.length,
      confidence: tier.conf(used.length) * (surf ? 1 : 0.6),
      comparables: [...used].sort(sortRecent).slice(0, 12).map((m) => toComparable(m, listing.address)),
      note: surf ? undefined : 'Surface inconnue : valeur médiane des ventes, peu fiable',
    };
  }
  return null;
}

// Quantiles des ventes de dépendance seule utilisés pour chaque type (hypothèse affichée dans la fiche).
const DEP_Q: Record<string, [number, number, number]> = { garage: [0.4, 0.6, 0.8], parking: [0.2, 0.35, 0.5], cave: [0.05, 0.1, 0.2] };

/** Garage / parking / cave : DVF les note « Dépendance » sans distinction ; calibrage par quantiles bornés par les valeurs par défaut. */
function valueDependance(lot: SubLot, listing: Listing, pool: DvfSlice, s: Settings, defaults: Range): LotValuation | null {
  const q = DEP_Q[lot.type];
  if (!q) return null;
  const ok = (m: DvfMutation) => m.t === 'D' && m.nd === 1 && m.v >= 1000 && m.v <= 120000;
  for (const tier of tiers(pool, listing.address, ok, s)) {
    if (tier.source === 'dvf-dept' || tier.list.length < tier.minN) continue;
    const v = tier.list.map((m) => m.v).sort((a, b) => a - b);
    let r: Range = { low: round(quantile(v, q[0])), mid: round(quantile(v, q[1])), high: round(quantile(v, q[2])) };
    if (lot.type === 'cave') {
      // les caves se vendent rarement seules : on reste dans la fourchette par défaut
      r = { low: Math.min(r.low, defaults.low), mid: Math.min(Math.max(r.mid, defaults.low), defaults.mid), high: Math.min(Math.max(r.high, defaults.mid), defaults.high) };
    }
    return {
      lotId: lot.id, type: lot.type, ...r, source: tier.source, n: v.length,
      confidence: tier.conf(v.length) * (lot.type === 'cave' ? 0.6 : 0.85),
      comparables: [...tier.list].sort(sortRecent).slice(0, 12).map((m) => toComparable(m, listing.address)),
      note: `Dépendances vendues seules (DVF ne distingue pas garage/parking/cave) : quantiles ${q.map((x) => Math.round(x * 100)).join('/')} %`,
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
  return { A: stat('A'), M: stat('M'), D: stat('D'), since, refDate: pool.refDate, kind: pool.kind };
}
