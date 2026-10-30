import { NextRequest, NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/store';
const statuses = ['new','contacted','replied','won','lost'];
export const runtime = 'nodejs';
export async function GET() {
  try {
    const store = await readStore();
    return NextResponse.json({ leads: store.leads });
  } catch {
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 });
  }
}
export async function PATCH(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id, status, notes } = await request.json();
    const store = await readStore(); const lead = store.leads.find((row) => row.id === id);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (status !== undefined) { if (!statuses.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 }); lead.status = status; }
    if (notes !== undefined) lead.notes = String(notes).slice(0, 2000);
    await writeStore(store); return NextResponse.json({ lead });
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
}
