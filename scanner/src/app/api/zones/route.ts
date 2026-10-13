import { NextResponse } from 'next/server';
import { getZones, saveZones } from '@/lib/store';
import type { Zone } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getZones());
}

export async function PUT(req: Request) {
  const z = (await req.json()) as Zone[];
  saveZones(z);
  return NextResponse.json(z);
}
