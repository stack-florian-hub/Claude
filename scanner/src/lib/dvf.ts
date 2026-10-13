// Chargement des index DVF (data/dvf/<dept>.json) avec cache mémoire. Côté serveur uniquement.
import fs from 'node:fs';
import path from 'node:path';
import type { Address, DvfIndex, DvfMutation, Settings } from './types';
import type { DvfSlice, DvfSource } from './dvf-query';
import { DATA_DIR } from './store';
import { demoDvf } from './demo';

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
