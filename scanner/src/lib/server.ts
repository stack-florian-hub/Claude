// Contexte serveur partagé par les pages et les routes API.
import type { Analysis, Listing } from './types';
import { getListings, getSettings, getZones } from './store';
import { dvfSource } from './dvf';
import { analyze, zoneFor } from './scoring';

export function ctx() {
  const settings = getSettings();
  const zones = getZones();
  return { settings, zones, dvf: dvfSource(settings) };
}

export interface Row { listing: Listing; analysis: Analysis; zone?: string; tension: number }

export function analyzeAll(listings: Listing[] = getListings()): Row[] {
  const { settings, zones, dvf } = ctx();
  return listings.map((l) => {
    const z = zoneFor(l, zones);
    return { listing: l, analysis: analyze(l, settings, zones, dvf), zone: z?.name, tension: z?.tension ?? 2 };
  });
}

/** Géocodage gratuit (Base Adresse Nationale / Géoplateforme) : coordonnées + code INSEE. */
export async function geocode(l: Pick<Listing, 'address'>) {
  const a = l.address;
  const q = [a.number, a.street, a.city].filter(Boolean).join(' ');
  if (!q.trim()) return null;
  const params = `q=${encodeURIComponent(q)}&limit=1${/^\d{5}$/.test(a.postalCode) ? `&postcode=${a.postalCode}` : ''}`;
  for (const base of ['https://data.geopf.fr/geocodage/search', 'https://api-adresse.data.gouv.fr/search/']) {
    try {
      const r = await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const j = await r.json();
      const f = j.features?.[0];
      if (!f) return null;
      return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], insee: f.properties.citycode as string, postcode: f.properties.postcode as string, city: f.properties.city as string, score: f.properties.score as number, label: f.properties.label as string, precise: ['housenumber', 'street'].includes(f.properties.type) };
    } catch {
      /* source suivante */
    }
  }
  return null;
}
