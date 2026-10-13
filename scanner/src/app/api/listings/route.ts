import { NextResponse } from 'next/server';
import { addListings, getListings, getSettings, updateListing } from '@/lib/store';
import { analyzeAll, geocode } from '@/lib/server';
import type { ListingInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(analyzeAll(getListings()));
}

/** Ajoute des annonces (import). Géocode celles sans code INSEE si l'option est active. */
export async function POST(req: Request) {
  const body = (await req.json()) as { listings: ListingInput[] };
  const { added, priceUpdates, duplicates } = addListings(body.listings.map((l) => ({ ...l, parseNotes: undefined }) as ListingInput));
  let geocoded = 0;
  if (getSettings().connectors.geocode) {
    for (const l of added.slice(0, 40)) {
      if (l.address.insee && l.address.lat != null) continue;
      const g = await geocode(l);
      if (g && g.score > 0.4) {
        const cp = /^\d{5}$/.test(l.address.postalCode) ? l.address.postalCode : g.postcode;
        updateListing(l.id, { address: { ...l.address, lat: l.address.lat ?? (g.precise ? g.lat : undefined), lon: l.address.lon ?? (g.precise ? g.lon : undefined), insee: l.address.insee || g.insee, postalCode: cp, dept: cp.slice(0, 2), city: l.address.city || g.city } });
        geocoded++;
      }
    }
  }
  return NextResponse.json({ added: added.length, skipped: duplicates, priceUpdates, geocoded, ids: added.map((l) => l.id) });
}
