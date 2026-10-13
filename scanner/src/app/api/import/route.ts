import { NextResponse } from 'next/server';
import { LISTING_PROVIDERS } from '@/lib/providers/listing';
import { findSameProperty, fromInput, getListings } from '@/lib/store';
import { analyzeAll } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Analyse un contenu (collage, CSV, JSON) sans l'enregistrer : aperçu avant import. */
export async function POST(req: Request) {
  const { provider, content } = (await req.json()) as { provider: string; content: string };
  const p = LISTING_PROVIDERS.find((x) => x.id === provider);
  if (!p?.parse) return NextResponse.json({ error: 'Source inconnue' }, { status: 400 });
  try {
    const parsed = p.parse(content);
    const rows = analyzeAll(parsed.map((x) => fromInput(x)));
    const known = getListings();
    return NextResponse.json(parsed.map((x, i) => {
      const same = findSameProperty(known, x);
      return { input: x, analysis: rows[i].analysis, zone: rows[i].zone, existing: same ? { id: same.id, price: same.price, title: same.title } : undefined };
    }));
  } catch (e) {
    return NextResponse.json({ error: `Lecture impossible : ${(e as Error).message}` }, { status: 400 });
  }
}
