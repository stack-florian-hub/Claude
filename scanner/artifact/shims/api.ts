// Remplace les routes /api/* du serveur local par l'état de l'artefact (mêmes formats de réponse).
import type { Deal, ListingInput, Settings, Zone } from '@/lib/types';
import { LISTING_PROVIDERS } from '@/lib/providers/listing';
import { findSameProperty } from '@/lib/identity';
import { S, addUserListing, allListings, analysisOf, deleteDeal, deleteListing, fromInput, patchListing, saveDeal, saveSettings, saveZones, zoneInfo } from '../state';

export async function api<T = unknown>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const m = url.match(/^\/api\/([a-z]+)(?:\/([^/?]+))?/);
  if (!m) throw new Error('Route inconnue');
  const [, route, id] = m;
  const b = body as any;
  const out = await (async (): Promise<unknown> => {
    if (route === 'import' && method === 'POST') {
      const p = LISTING_PROVIDERS.find((x) => x.id === b.provider);
      if (!p?.parse) throw new Error('Source inconnue');
      const parsed = p.parse(b.content);
      const known = allListings();
      return parsed.map((x) => {
        const l = fromInput(x);
        const same = findSameProperty(known, x);
        return { input: x, analysis: analysisOf(l), zone: zoneInfo(l).zone, existing: same ? { id: same.id, price: same.price, title: same.title } : undefined };
      });
    }
    if (route === 'listings' && !id && method === 'POST') {
      const inputs = (b.listings as (ListingInput & { parseNotes?: string[] })[]).map(({ parseNotes: _n, ...x }) => x as ListingInput);
      const ids: string[] = [];
      const priceUpdates: { id: string; title: string; from: number; to: number }[] = [];
      let skipped = 0;
      for (const i of inputs) {
        const same = findSameProperty(allListings(), i);
        if (same) {
          if (i.price && i.price !== same.price) {
            priceUpdates.push({ id: same.id, title: same.title, from: same.price, to: i.price });
            await patchListing(same.id, { price: i.price, priceHistory: [...same.priceHistory, { date: new Date().toISOString().slice(0, 10), price: i.price, source: i.source }] });
          } else skipped++;
          continue;
        }
        const l = fromInput(i);
        await addUserListing(l);
        ids.push(l.id);
      }
      return { added: ids.length, skipped, priceUpdates, geocoded: 0, ids };
    }
    if (route === 'listings' && id && method === 'PATCH') {
      if (b.geocode) throw new Error('Le géocodage se fait lors de la mise à jour du lundi (le navigateur de l’artefact ne peut pas joindre la Base Adresse Nationale).');
      return patchListing(id, b);
    }
    if (route === 'listings' && id && method === 'DELETE') return deleteListing(id).then(() => ({ ok: true }));
    if (route === 'deals' && method === 'POST') {
      const d = b as Deal;
      await saveDeal(d);
      if (d.listingId) await patchListing(d.listingId, { status: 'pipeline' });
      return d;
    }
    if (route === 'deals' && id && method === 'DELETE') return deleteDeal(id).then(() => ({ ok: true }));
    if (route === 'settings' && method === 'PUT') return saveSettings(b as Settings).then(() => b);
    if (route === 'zones' && method === 'PUT') return saveZones(b as Zone[]).then(() => b);
    if (route === 'demo') throw new Error('Le jeu de démo n’existe que dans l’application locale.');
    throw new Error('Action indisponible dans l’artefact');
  })();
  return out as T;
}
export const _S = S;
