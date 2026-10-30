import { NextRequest, NextResponse } from 'next/server';
import { readStore } from '@/lib/store';
import { generateMessages } from '@/lib/pitch';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id');
  const lead = (await readStore()).leads.find((row) => row.id === id);
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  return NextResponse.json(generateMessages(lead), { headers: { 'Cache-Control': 'no-store' } });
}
