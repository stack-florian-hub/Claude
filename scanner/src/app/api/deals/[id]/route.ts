import { NextResponse } from 'next/server';
import { deleteDeal } from '@/lib/store';

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  deleteDeal(params.id);
  return NextResponse.json({ ok: true });
}
