import { NextResponse } from 'next/server';
import { clearDemo, seedDemo } from '@/lib/store';

export async function POST(req: Request) {
  const { action } = await req.json();
  if (action === 'clear') clearDemo();
  else seedDemo(true);
  return NextResponse.json({ ok: true });
}
