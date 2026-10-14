// État de l'artefact : données publiées (data.json, remplacé chaque lundi) + actions de l'utilisateur (base de l'artefact).
import type { Address, Analysis, Deal, DvfMutation, Listing, ListingInput, LotValuation, Settings, Zone } from '@/lib/types';
import { marketStats } from '@/lib/dvf-query';
import type { DvfSlice, DvfSource } from '@/lib/dvf-query';
import type { CommuneMarket } from '@/lib/dvf';
import { DEFAULT_SETTINGS, DEFAULT_ZONES } from '@/lib/defaults';
import { aggregate, analyze, zoneFor } from '@/lib/scoring';
import { uid } from '@/lib/util';
import { emit, refresh } from './shims/router';

// [date, valeur, type, surface, nb dépendances, code postal, voie, lon, lat]
export type CompactMut = [string, number, DvfMutation['t'], number, number, string, string, number | null, number | null];

export interface ArtifactData {
  meta: {
    generatedAt: string;
    dvf: { dept: string; refDate: string; n: number; years: number[] }[];
    collecte?: { date: string; agencies: number; cards: number; networks?: { network: string; label: string; cards: number; retenus: number; errors: number }[]; added: number; drops: { title: string; from: number; to: number }[]; gone: number; alerts: { id: string; title: string; score: number; gain: number }[] };
    nextUpdate: string;
  };
  listings: Listing[];
  valuations: Record<string, LotValuation[]>; // valeurs des lots calculées lundi sur toute la DVF
  stats: Record<string, ReturnType<typeof marketStats>>; // marché de la commune (clé INSEE ou code postal)
  dvf: { refDates: Record<string, string>; byInsee: Record<string, CompactMut[]> };
  markets: CommuneMarket[];
}

type Db = {
  doc(p: string): { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }> };
  collection(p: string): { limit(n: number): { get(): Promise<{ docs: { id: string; data(): Record<string, unknown> | undefined }[] }> } };
};

export const S = {
  ready: false,
  loadError: '',
  saveError: '',
  dbAvailable: false,
  data: null as ArtifactData | null,
  edits: {} as Record<string, Partial<Listing> & { deleted?: boolean }>,
  userListings: {} as Record<string, Listing>,
  deals: [] as Deal[],
  settings: DEFAULT_SETTINGS as Settings,
  zones: DEFAULT_ZONES as Zone[],
  db: null as Db | null,
};

// ---------- DVF dans le navigateur (communes des annonces et des zones)
let dvfCache: { byInsee: Map<string, DvfMutation[]>; byCp: Map<string, DvfMutation[]>; byDept: Map<string, DvfMutation[]> } | null = null;
function dvfIndex() {
  if (dvfCache) return dvfCache;
  const byInsee = new Map<string, DvfMutation[]>(), byCp = new Map<string, DvfMutation[]>(), byDept = new Map<string, DvfMutation[]>();
  for (const [insee, rows] of Object.entries(S.data?.dvf.byInsee || {})) {
    const ms = rows.map(([d, v, t, s, nd, cp, r, x, y]) => ({ d, v, t, s: s || undefined, nd, cp, c: insee, r, x: x ?? undefined, y: y ?? undefined }) as DvfMutation);
    byInsee.set(insee, ms);
    for (const m of ms) (byCp.get(m.cp) || byCp.set(m.cp, []).get(m.cp)!).push(m);
    const dept = insee.slice(0, 2);
    (byDept.get(dept) || byDept.set(dept, []).get(dept)!).push(...ms);
  }
  dvfCache = { byInsee, byCp, byDept };
  return dvfCache;
}
export const browserDvf: DvfSource = {
  slice(addr: Address): DvfSlice {
    const ix = dvfIndex();
    const refDate = S.data?.dvf.refDates[addr.dept];
    const commune = (addr.insee && ix.byInsee.get(addr.insee)) || ix.byCp.get(addr.postalCode) || [];
    const dept = ix.byDept.get(addr.dept) || [];
    if (!refDate || (!commune.length && !dept.length)) return { kind: 'aucun', commune: [], dept: [], refDate: new Date().toISOString().slice(0, 10) };
    return { kind: 'reel', commune, dept, refDate };
  },
};

// ---------- Annonces fusionnées et analyses (mémorisées)
let listCache: { key: unknown[]; list: Listing[] } | null = null;
export function allListings(): Listing[] {
  const key = [S.data, S.edits, S.userListings];
  if (listCache && listCache.key.every((k, i) => k === key[i])) return listCache.list;
  const base = (S.data?.listings || []).filter((l) => !S.edits[l.id]?.deleted).map((l) => (S.edits[l.id] ? ({ ...l, ...S.edits[l.id] } as Listing) : l));
  const list = [...base, ...Object.values(S.userListings)];
  listCache = { key, list };
  return list;
}
const anaCache = new WeakMap<Listing, { settings: Settings; zones: Zone[]; a: Analysis }>();
export function analysisOf(l: Listing): Analysis {
  const c = anaCache.get(l);
  if (c && c.settings === S.settings && c.zones === S.zones) return c.a;
  const a = computeAnalysis(l);
  anaCache.set(l, { settings: S.settings, zones: S.zones, a });
  return a;
}
/** Valeurs de lots de la mise à jour hebdomadaire si les lots n'ont pas changé (valeurs forcées appliquées), sinon recalcul sur la DVF embarquée. */
function computeAnalysis(l: Listing): Analysis {
  const pre = S.data?.valuations[l.id];
  const sameLots = pre && pre.length === l.lots.length && l.lots.every((lot, i) => {
    const base = S.data!.listings.find((x) => x.id === l.id)?.lots[i];
    return base && base.id === lot.id && base.type === lot.type && base.surface === lot.surface;
  });
  if (pre && sameLots) {
    const lots = pre.map((v, i) => {
      const o = l.lots[i].resaleOverride;
      return o ? { ...v, low: Math.round(o * 0.95), mid: o, high: Math.round(o * 1.05), source: 'force' as const, confidence: 0.9, note: 'Valeur saisie' } : v;
    });
    return aggregate(l, lots, S.settings, S.zones);
  }
  return analyze(l, S.settings, S.zones, browserDvf);
}

export function statsOf(l: Listing) {
  return S.data?.stats[l.address.insee || l.address.postalCode] ?? marketStats(browserDvf.slice(l.address), S.settings);
}

export function zoneInfo(l: Listing) {
  const z = zoneFor(l, S.zones);
  return { zone: z?.name, tension: z?.tension ?? 2 };
}

// ---------- Chargement
export async function load() {
  try {
    const r = await fetch('data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    S.data = (await r.json()) as ArtifactData;
  } catch (e) {
    S.loadError = `Données indisponibles (${(e as Error).message}).`;
  }
  S.ready = true;
  emit();
  const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  const db = (await claude?.use('db').catch(() => null)) as Db | null;
  if (!db) return;
  S.db = db;
  S.dbAvailable = true;
  try {
    const [edits, annonces, ops, params, zones] = await Promise.all([
      db.collection('edits').limit(1000).get(), db.collection('annonces').limit(1000).get(), db.collection('operations').limit(1000).get(),
      db.doc('reglages/parametres').get(), db.doc('reglages/zones').get(),
    ]);
    S.edits = Object.fromEntries(edits.docs.map((d) => [d.id, d.data() as Partial<Listing>]));
    S.userListings = Object.fromEntries(annonces.docs.map((d) => [d.id, d.data() as unknown as Listing]));
    S.deals = ops.docs.map((d) => d.data() as unknown as Deal);
    if (params.exists) S.settings = mergeSettings(params.data() as Partial<Settings>);
    if (zones.exists) S.zones = ((zones.data() as { list: Zone[] }).list) || DEFAULT_ZONES;
  } catch (e) {
    S.saveError = `Lecture de vos données impossible (${(e as { message?: string }).message ?? e}). Les modifications ne seront pas gardées.`;
  }
  refresh();
}

function mergeSettings(s: Partial<Settings>): Settings {
  const m = { ...DEFAULT_SETTINGS, ...s } as Settings;
  for (const k of ['fees', 'thresholds', 'budget', 'financing', 'tax', 'dvf', 'connectors', 'treasury', 'resaleMonths'] as const) (m as any)[k] = { ...(DEFAULT_SETTINGS as any)[k], ...((s as any)[k] || {}) };
  m.group = { ...DEFAULT_SETTINGS.group, ...(s.group || {}) };
  return m;
}

// ---------- Écritures (état local immédiat, puis base de l'artefact)
async function write(fn: (db: Db) => Promise<void>) {
  if (!S.db) {
    S.saveError = 'Base de l’artefact indisponible dans cette vue : la modification n’est pas gardée.';
    refresh();
    return;
  }
  try {
    await fn(S.db);
    if (S.saveError) { S.saveError = ''; refresh(); }
  } catch (e) {
    const c = (e as { code?: string }).code;
    S.saveError = c === 'quota_exceeded' ? 'Base pleine : supprimez des annonces collées ou des opérations.' : `Enregistrement impossible (${(e as { message?: string }).message ?? c}).`;
    refresh();
  }
}
const clean = (o: unknown) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

export function isBase(id: string) {
  return !!S.data?.listings.some((l) => l.id === id);
}

export async function patchListing(id: string, patch: Partial<Listing> & { deleted?: boolean }) {
  const cur = allListings().find((l) => l.id === id);
  if (!cur) return null;
  const p = { ...patch };
  if (p.price != null && p.price !== cur.price && !p.priceHistory) p.priceHistory = [...cur.priceHistory, { date: new Date().toISOString().slice(0, 10), price: p.price, source: 'modification' }];
  if (isBase(id)) {
    const e = { ...(S.edits[id] || {}), ...p };
    S.edits = { ...S.edits, [id]: e };
    await write((db) => db.doc(`edits/${id}`).set(clean(e)));
  } else {
    const next = { ...cur, ...p } as Listing;
    S.userListings = { ...S.userListings, [id]: next };
    await write((db) => db.doc(`annonces/${id}`).set(clean(next)));
  }
  return allListings().find((l) => l.id === id) ?? null;
}

export async function deleteListing(id: string) {
  if (isBase(id)) return patchListing(id, { deleted: true });
  const { [id]: _gone, ...rest } = S.userListings;
  S.userListings = rest;
  await write((db) => db.doc(`annonces/${id}`).delete());
}

export function fromInput(i: ListingInput): Listing {
  const now = new Date().toISOString();
  return {
    ...i, id: uid('u'), importedAt: now, status: i.status ?? 'nouveau',
    priceHistory: i.priceHistory?.length ? i.priceHistory : [{ date: (i.publishedAt || now).slice(0, 10), price: i.price, source: 'import' }],
    lots: i.lots.map((l) => ({ ...l, id: l.id || uid('l') })),
  };
}

export async function addUserListing(l: Listing) {
  S.userListings = { ...S.userListings, [l.id]: l };
  await write((db) => db.doc(`annonces/${l.id}`).set(clean(l)));
}

export async function saveDeal(d: Deal) {
  S.deals = S.deals.some((x) => x.id === d.id) ? S.deals.map((x) => (x.id === d.id ? d : x)) : [...S.deals, d];
  await write((db) => db.doc(`operations/${d.id}`).set(clean(d)));
}
export async function deleteDeal(id: string) {
  S.deals = S.deals.filter((d) => d.id !== id);
  await write((db) => db.doc(`operations/${id}`).delete());
}
export async function saveSettings(s: Settings) {
  S.settings = s;
  await write((db) => db.doc('reglages/parametres').set(clean(s)));
}
export async function saveZones(z: Zone[]) {
  S.zones = z;
  await write((db) => db.doc('reglages/zones').set({ list: clean(z) }));
}
