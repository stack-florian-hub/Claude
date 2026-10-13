import { NextResponse } from 'next/server';
import { LISTING_PROVIDERS } from '@/lib/providers/listing';
import { fromInput } from '@/lib/store';
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
    return NextResponse.json(parsed.map((x, i) => ({ input: x, analysis: rows[i].analysis, zone: rows[i].zone })));
  } catch (e) {
    return NextResponse.json({ error: `Lecture impossible : ${(e as Error).message}` }, { status: 400 });
  }
}
