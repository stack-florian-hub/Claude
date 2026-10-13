// Base locale : fichiers JSON dans data/db (écriture atomique). Côté serveur uniquement.
import fs from 'node:fs';
import path from 'node:path';
import type { Deal, Listing, ListingInput, Settings, Zone } from './types';
import { DEFAULT_SETTINGS, DEFAULT_ZONES } from './defaults';
import { demoDeals, demoListings } from './demo';
import { uid } from './util';

export const DATA_DIR = process.env.SCANNER_DATA_DIR || path.join(process.cwd(), 'data');
const DB = path.join(DATA_DIR, 'db');

function file(name: string) {
  return path.join(DB, name + '.json');
}

function read<T>(name: string, fallback: () => T): T {
  ensureSeeded();
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8')) as T;
  } catch {
    return fallback();
  }
}

function write(name: string, data: unknown) {
  fs.mkdirSync(DB, { recursive: true });
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file(name));
}

let seeded = false;
function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  if (!fs.existsSync(file('listings'))) seedDemo(false);
}

/** Recharge le jeu de démo. keepUserData = conserve les annonces/opérations non-démo. */
export function seedDemo(keepUserData = true) {
  seeded = true;
  const prevListings: Listing[] = keepUserData && fs.existsSync(file('listings')) ? JSON.parse(fs.readFileSync(file('listings'), 'utf8')) : [];
  const prevDeals: Deal[] = keepUserData && fs.existsSync(file('deals')) ? JSON.parse(fs.readFileSync(file('deals'), 'utf8')) : [];
  const listings = demoListings().map(fromInput);
  const byTitle = (s: string) => listings.find((l) => l.title.startsWith(s))?.id;
  const deals = demoDeals(byTitle);
  for (const d of deals) {
    const l = listings.find((x) => x.id === d.listingId);
    if (l) l.status = 'pipeline';
  }
  write('listings', [...prevListings.filter((l) => !l.demo), ...listings]);
  write('deals', [...prevDeals.filter((d) => !d.demo), ...deals]);
  if (!fs.existsSync(file('settings'))) write('settings', DEFAULT_SETTINGS);
  if (!fs.existsSync(file('zones'))) write('zones', DEFAULT_ZONES);
}

export function clearDemo() {
  write('listings', getListings().filter((l) => !l.demo));
  write('deals', getDeals().filter((d) => !d.demo));
}

export function fromInput(i: ListingInput): Listing {
  const now = new Date().toISOString();
  return {
    ...i,
    id: uid('a'),
    importedAt: now,
    status: i.status ?? 'nouveau',
    priceHistory: i.priceHistory?.length ? i.priceHistory : [{ date: (i.publishedAt || now).slice(0, 10), price: i.price, source: 'import' }],
    lots: i.lots.map((l) => ({ ...l, id: l.id || uid('l') })),
  };
}

// --- Annonces
export const getListings = () => read<Listing[]>('listings', () => []);
export const getListing = (id: string) => getListings().find((l) => l.id === id);
/** Même bien ? même URL, ou même code postal + même type principal + surface à ±3 % + prix à ±25 %. */
export function findSameProperty(all: Listing[], i: ListingInput): Listing | undefined {
  if (i.url) {
    const byUrl = all.find((l) => l.url === i.url || l.alsoOn?.some((o) => o.url === i.url));
    if (byUrl) return byUrl;
  }
  const main = (x: { lots: { type: string; surface?: number }[]; surface?: number }) => ({ type: x.lots[0]?.type, surface: x.lots[0]?.surface ?? x.surface });
  const mi = main(i);
  return all.find((l) => {
    if (l.address.postalCode !== i.address.postalCode || !i.price || !l.price) return false;
    const ml = main(l);
    if (ml.type !== mi.type || l.lots.length !== i.lots.length) return false;
    const priceClose = Math.abs(l.price - i.price) / l.price <= 0.25;
    if (ml.surface && mi.surface) return Math.abs(ml.surface - mi.surface) / ml.surface <= 0.03 && priceClose;
    return l.title === i.title && priceClose;
  });
}

export function addListings(inputs: ListingInput[]) {
  const all = getListings();
  const added: Listing[] = [];
  const priceUpdates: { id: string; title: string; from: number; to: number }[] = [];
  let duplicates = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const i of inputs) {
    const same = findSameProperty(all, i);
    if (same) {
      // autre site : on le note ; prix différent : on l'ajoute à l'historique (signal de baisse)
      if (i.url && i.url !== same.url && !same.alsoOn?.some((o) => o.url === i.url)) same.alsoOn = [...(same.alsoOn || []), { source: i.source, url: i.url, price: i.price, date: today }];
      if (i.price && i.price !== same.price) {
        priceUpdates.push({ id: same.id, title: same.title, from: same.price, to: i.price });
        same.priceHistory = [...same.priceHistory, { date: today, price: i.price, source: i.source }];
        same.price = i.price;
      } else duplicates++;
      continue;
    }
    const l = fromInput(i);
    all.push(l);
    added.push(l);
  }
  write('listings', all);
  return { added, priceUpdates, duplicates };
}
export function updateListing(id: string, patch: Partial<Listing>) {
  const all = getListings();
  const i = all.findIndex((l) => l.id === id);
  if (i < 0) return null;
  const prev = all[i];
  const next = { ...prev, ...patch, id };
  if (patch.price != null && patch.price !== prev.price && !patch.priceHistory) {
    next.priceHistory = [...prev.priceHistory, { date: new Date().toISOString().slice(0, 10), price: patch.price, source: 'modification' }];
  }
  all[i] = next;
  write('listings', all);
  return next;
}
export function deleteListing(id: string) {
  write('listings', getListings().filter((l) => l.id !== id));
}

// --- Opérations (pipeline)
export const getDeals = () => read<Deal[]>('deals', () => []);
export function saveDeal(d: Deal) {
  const all = getDeals();
  const i = all.findIndex((x) => x.id === d.id);
  if (i < 0) all.push(d);
  else all[i] = d;
  write('deals', all);
  return d;
}
export function deleteDeal(id: string) {
  write('deals', getDeals().filter((d) => d.id !== id));
}

// --- Paramètres et zones
export function getSettings(): Settings {
  const s = read<Partial<Settings>>('settings', () => DEFAULT_SETTINGS);
  // fusion superficielle avec les défauts : un fichier ancien reste lisible après ajout de champs
  const merged = { ...DEFAULT_SETTINGS, ...s } as Settings;
  for (const k of ['fees', 'thresholds', 'budget', 'financing', 'tax', 'dvf', 'connectors', 'treasury', 'resaleMonths'] as const) {
    (merged as any)[k] = { ...(DEFAULT_SETTINGS as any)[k], ...((s as any)[k] || {}) };
  }
  merged.group = { ...DEFAULT_SETTINGS.group, ...(s.group || {}) };
  return merged;
}
export const saveSettings = (s: Settings) => write('settings', s);
export const getZones = () => read<Zone[]>('zones', () => DEFAULT_ZONES);
export const saveZones = (z: Zone[]) => write('zones', z);
