import { NextRequest, NextResponse } from 'next/server';
import { fetchTownCandidates, getTowns } from '@/lib/overpass';
import { enrichCandidates } from '@/lib/email-scraper';
import { createPitch } from '@/lib/pitch';
import { readStore, writeStore } from '@/lib/store';
import type { Candidate, Lead } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
const BATCH_SIZE = Math.max(10, Math.min(120, Number(process.env.LEAD_BATCH_SIZE) || 80));
const NO_EMAIL = 'no email - phone/DM';

function fingerprint(candidate: Candidate) {
  return `${candidate.business_name}|${candidate.town_city}|${candidate.business_type}`.toLowerCase().replace(/[^a-z0-9|]/g, '');
}
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !secret || request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) { return generate(request); }
export async function POST(request: NextRequest) { return generate(request); }

async function generate(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const startedAt = Date.now();
  try {
    const store = await readStore();
    const towns = getTowns();
    const params = request.nextUrl.searchParams;
    const requestedSize = Number(params.get('limit'));
    const limit = Number.isFinite(requestedSize) && requestedSize > 0 ? Math.min(BATCH_SIZE, requestedSize) : BATCH_SIZE;
    let failedTownQueries = 0;

    let pool = store.pool.slice(store.poolIndex);
    const seen = new Set(store.seen);
    if (pool.length < limit) {
      const townCount = Math.min(towns.length, 2);
      const selectedTowns = Array.from({ length: townCount }, (_, i) => towns[(store.townIndex + i) % towns.length]);
      const gathered: Candidate[] = [];
      const settled: Array<PromiseSettledResult<Candidate[]>> = [];
      const townBudgetMs = 30000;
      for (const [i, town] of selectedTowns.entries()) {
        if (i > 0 && Date.now() - startedAt > townBudgetMs) break;
        try {
          const rows = await fetchTownCandidates(town);
          settled.push({ status: 'fulfilled', value: rows });
          gathered.push(...rows);
          if (i < selectedTowns.length - 1) await new Promise((r) => setTimeout(r, 1500));
        } catch (error) {
          settled.push({ status: 'rejected', reason: error });
          console.error(`Town query failed [${town}]:`, error instanceof Error ? error.message : error);
        }
      }
      failedTownQueries = settled.filter((result) => result.status === 'rejected').length;
      const pooledKeys = new Set<string>();
      pool = [...pool];
      for (const candidate of gathered) {
        const key = fingerprint(candidate);
        if (seen.has(key) || pooledKeys.has(key)) continue;
        pooledKeys.add(key);
        pool.push(candidate);
      }
      store.townIndex = (store.townIndex + townCount) % towns.length;
    }

    const fresh = pool.slice(0, limit);
    const remainingPool = pool.slice(fresh.length);
    const enriched = await enrichCandidates(fresh, startedAt, 6);
    const created: Lead[] = fresh.map((candidate, index) => {
      const email = enriched[index]?.email || NO_EMAIL;
      return {
        id: `${Date.now().toString(36)}-${index.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        business_name: candidate.business_name,
        business_type: candidate.business_type,
        town_city: candidate.town_city,
        website: candidate.website,
        email,
        phone: candidate.phone,
        whatsapp: candidate.whatsapp || '',
        socials: candidate.socials || [],
        address: candidate.address || '',
        status: 'new',
        notes: '',
        hasViewport: enriched[index]?.hasViewport ?? null,
        ...createPitch(candidate, { hasViewport: enriched[index]?.hasViewport }),
        created_at: new Date().toISOString(),
      };
    });

    store.leads = [...created, ...store.leads].slice(0, 15000);
    store.seen = [...store.seen, ...fresh.map(fingerprint)].slice(-100000);
    store.pool = remainingPool.slice(0, 5000);
    store.poolIndex = 0;
    await writeStore(store);

    const today = new Date().toISOString().slice(0, 10);
    if (request.headers.get('x-vercel-cron') === '1' || params.get('digest') === '1') {
      const origin = new URL(request.url).origin;
      const digestResponse = await fetch(`${origin}/api/morning-digest`, {
        method: 'POST',
        headers: { authorization: request.headers.get('authorization') || '', 'content-type': 'application/json' },
        body: JSON.stringify({ date: today }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (digestResponse && !digestResponse.ok) console.error('Morning digest route returned an error');
    }
    return NextResponse.json({ ok: true, date: today, found: created.length + remainingPool.length, added: created.length, failedTownQueries, batchSize: limit, queued: remainingPool.length, totalStored: store.leads.length, emailCount: created.filter((lead) => lead.email !== NO_EMAIL).length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Lead generation failed:', error instanceof Error ? error.stack : JSON.stringify(error));
    return NextResponse.json({ error: 'Lead generation failed. Check the function logs and retry.' }, { status: 500 });
  }
}
