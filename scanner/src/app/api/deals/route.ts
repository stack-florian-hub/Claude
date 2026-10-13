import { NextResponse } from 'next/server';
import { getDeals, saveDeal, updateListing } from '@/lib/store';
import type { Deal } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getDeals());
}

export async function POST(req: Request) {
  const d = (await req.json()) as Deal;
  saveDeal(d);
  if (d.listingId) updateListing(d.listingId, { status: 'pipeline' });
  return NextResponse.json(d);
}
