export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { readStore } from '@/lib/store';
import type { Lead } from '@/lib/types';
export const runtime = 'nodejs';
const columns: (keyof Lead)[] = ['id','business_name','business_type','town_city','website','email','phone','issue','recommended_fix','pitch_opener','offer','created_at'];
const q = (value: string) => `"${value.replace(/"/g, '""')}"`;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const leads = (await readStore()).leads.filter((lead) => lead.created_at.slice(0, 10) === date);
  const csv = [columns.join(','), ...leads.map((lead) => columns.map((column) => q(String(lead[column] ?? ''))).join(','))].join('\r\n');
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="lead-engine-${date}.csv"`, 'Cache-Control': 'no-store' } });
}
