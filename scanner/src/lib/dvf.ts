// Chargement des index DVF (data/dvf/<dept>.json) avec cache mémoire. Côté serveur uniquement.
import fs from 'node:fs';
import path from 'node:path';
import type { Address, DvfIndex, DvfMutation, Settings } from './types';
import type { DvfSlice, DvfSource } from './dvf-query';
import { DATA_DIR } from './store';
import { DEMO_COMMUNES, demoDvf } from './demo';
const DEMO_NAMES = Object.fromEntries(DEMO_COMMUNES.map((c) => [c.insee, c.name]));
import { impliedDependency, quantiles } from './dvf-stats';
import { addMonths as addMonthsIso } from './util';

export const DVF_DIR = path.join(DATA_DIR, 'dvf');

interface Loaded { idx: DvfIndex; mtime: number; byInsee: Map<string, DvfMutation[]>; byCp: Map<string, DvfMutation[]>; refDate: string; kind: 'reel' | 'demo' }
const cache = new Map<string, Loaded>();

function build(idx: DvfIndex, kind: 'reel' | 'demo', mtime: number): Loaded {
  const byInsee = new Map<string, DvfMutation[]>(), byCp = new Map<string, DvfMutation[]>();
  let refDate = '0000';
  for (const m of idx.mutations) {
    (byInsee.get(m.c) || byInsee.set(m.c, []).get(m.c)!).push(m);
    (byCp.get(m.cp) || byCp.set(m.cp, []).get(m.cp)!).push(m);
    if (m.d > refDate) refDate = m.d;
  }
  return { idx, mtime, byInsee, byCp, refDate, kind };
}

export function loadDept(dept: string, useDemo: boolean): Loaded | null {
  const f = path.join(DVF_DIR, `${dept}.json`);
  if (fs.existsSync(f)) {
    const mtime = fs.statSync(f).mtimeMs;
    const c = cache.get(dept);
    if (c && c.kind === 'reel' && c.mtime === mtime) return c;
    const l = build(JSON.parse(fs.readFileSync(f, 'utf8')), 'reel', mtime);
    cache.set(dept, l);
    return l;
  }
  if (!useDemo) return null;
  const c = cache.get(dept + ':demo');
  if (c) return c;
  const idx = demoDvf(dept);
  if (!idx) return null;
  const l = build(idx, 'demo', 0);
  cache.set(dept + ':demo', l);
  return l;
}

export function dvfSource(s: Settings): DvfSource {
  return {
    slice(addr: Address): DvfSlice {
      const l = loadDept(addr.dept, s.dvf.useDemo);
      if (!l) return { kind: 'aucun', commune: [], dept: [], refDate: new Date().toISOString().slice(0, 10) };
      const commune = (addr.insee && l.byInsee.get(addr.insee)) || l.byCp.get(addr.postalCode) || [];
      return { kind: l.kind, commune, dept: l.idx.mutations, refDate: l.refDate };
    },
  };
}

export function dvfStatus(depts: string[], useDemo: boolean) {
  return depts.map((dept) => {
    const f = path.join(DVF_DIR, `${dept}.json`);
    const real = fs.existsSync(f);
    const l = loadDept(dept, useDemo);
    return {
      dept,
      kind: l?.kind ?? 'aucun',
      n: l?.idx.mutations.length ?? 0,
      years: l?.idx.years ?? [],
      builtAt: l?.idx.builtAt,
      refDate: l?.refDate,
      sizeMb: real ? +(fs.statSync(f).size / 1e6).toFixed(1) : 0,
    };
  });
}

export interface CommuneMarket {
  zone: string; zoneId: string; tension: number; insee: string; name: string; dept: string; kind: 'reel' | 'demo' | 'aucun';
  aptN: number; aptP25: number; aptMed: number; aptP75: number; perYear: Record<string, number>; trend: number;
  houseMed: number; houseN: number;
  depN: number; depP20: number; depMed: number; depP80: number; implied: number; impliedN: number; prime: number;
  bundledShare: number; salesPerYear: number;
}

/** Indicateurs de marché par commune des zones (DVF réelle ou démo). */
export function zoneMarkets(zones: import('./types').Zone[], s: Settings): CommuneMarket[] {
  const out: CommuneMarket[] = [];
  for (const z of zones.filter((x) => x.active)) {
    for (const insee of z.communes.filter((c) => /^\d{5}$/.test(c))) {
      const dept = insee.startsWith('97') ? insee.slice(0, 3) : insee.slice(0, 2);
      const l = loadDept(dept, s.dvf.useDemo);
      const all = l?.byInsee.get(insee) || [];
      const since = l ? addMonthsIso(l.refDate, -12 * s.dvf.years) : '';
      const m = all.filter((x) => x.d >= since);
      const apt = m.filter((x) => x.t === 'A' && x.s && x.s >= 9).map((x) => ({ y: x.d.slice(0, 4), ppm: x.v / x.s! })).filter((x) => x.ppm > 300 && x.ppm < 20000);
      const A = quantiles(apt.map((x) => x.ppm), [0.25, 0.5, 0.75]);
      const years = [...new Set(apt.map((x) => x.y))].sort();
      const perYear: Record<string, number> = {};
      for (const y of years) {
        const v = apt.filter((x) => x.y === y).map((x) => x.ppm);
        if (v.length >= 10) perYear[y] = Math.round(quantiles(v, [0.5]).q[0]);
      }
      const ys = Object.keys(perYear).sort();
      const trend = ys.length >= 2 ? perYear[ys[ys.length - 1]] / perYear[ys[0]] - 1 : NaN;
      const M = quantiles(m.filter((x) => x.t === 'M' && x.s && x.s >= 9).map((x) => x.v / x.s!), [0.5]);
      const D = quantiles(m.filter((x) => x.t === 'D' && x.nd === 1 && x.v >= 1000 && x.v <= 120000).map((x) => x.v), [0.2, 0.5, 0.8]);
      const I = impliedDependency(m, [0.5]);
      const aptAll = m.filter((x) => x.t === 'A');
      out.push({
        zone: z.name, zoneId: z.id, tension: z.tension, insee, name: l?.idx.communes?.[insee] || DEMO_NAMES[insee] || insee, dept, kind: l?.kind ?? 'aucun',
        aptN: A.n, aptP25: A.q[0], aptMed: A.q[1], aptP75: A.q[2], perYear, trend,
        houseMed: M.q[0], houseN: M.n,
        depN: D.n, depP20: D.q[0], depMed: D.q[1], depP80: D.q[2], implied: I.q[0], impliedN: I.n, prime: D.q[1] - I.q[0],
        bundledShare: aptAll.length ? aptAll.filter((x) => x.nd > 0).length / aptAll.length : NaN,
        salesPerYear: m.length / Math.max(1, s.dvf.years),
      });
    }
  }
  return out;
}
