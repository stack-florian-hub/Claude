import { NextResponse } from 'next/server';
import { deleteListing, getListing, updateListing } from '@/lib/store';
import { analyzeAll, geocode } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const l = getListing(params.id);
  return l ? NextResponse.json(analyzeAll([l])[0]) : NextResponse.json({ error: 'introuvable' }, { status: 404 });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const patch = await req.json();
  if (patch.geocode) {
    const l = getListing(params.id);
    if (!l) return NextResponse.json({ error: 'introuvable' }, { status: 404 });
    const g = await geocode(l);
    if (!g) return NextResponse.json({ error: 'Géocodage impossible (adresse incomplète ou service injoignable)' }, { status: 502 });
    const u = updateListing(params.id, { address: { ...l.address, lat: g.precise ? g.lat : undefined, lon: g.precise ? g.lon : undefined, insee: g.insee, postalCode: /^\d{5}$/.test(l.address.postalCode) ? l.address.postalCode : g.postcode } });
    return NextResponse.json({ ok: true, label: g.label, listing: u });
  }
  const u = updateListing(params.id, patch);
  return u ? NextResponse.json(u) : NextResponse.json({ error: 'introuvable' }, { status: 404 });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  deleteListing(params.id);
  return NextResponse.json({ ok: true });
}
