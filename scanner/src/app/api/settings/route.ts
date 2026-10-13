import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/store';
import type { Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function PUT(req: Request) {
  const s = (await req.json()) as Settings;
  saveSettings(s);
  return NextResponse.json(s);
}
