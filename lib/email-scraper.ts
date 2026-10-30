import type { Candidate } from './types';

const EMAIL = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
const SOCIAL = /(^|\.)((facebook|instagram|linkedin|tiktok|twitter|x|youtube|pinterest)\.com|wa\.me|whatsapp\.com)$/i;
const PAGE_TIMEOUT_MS = 2500;
const TOTAL_BUDGET_MS = 15000;

function cleanEmails(text: string, sourceUrl: string) {
  const emails = new Set<string>();
  const add = (value: string) => {
    const email = value.trim().replace(/^mailto:/i, '').split(/[?#]/)[0].toLowerCase().replace(/[.,;:]+$/,'');
    const domain = email.split('@')[1] || '';
    if (EMAIL.test(email) && !SOCIAL.test(domain)) emails.add(email);
    EMAIL.lastIndex = 0;
  };
  for (const match of text.matchAll(/mailto:([^"'\s>?]+)/gi)) add(match[1]);
  for (const match of text.matchAll(EMAIL)) add(match[0]);
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    return [...emails].filter((email) => !SOCIAL.test(email.split('@')[1]) && !email.endsWith(`@${host}`) || email.endsWith(`@${host}`));
  } catch { return [...emails]; }
}

async function fetchPage(url: string): Promise<{ text: string; html: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadEngine/1.0; +https://example.com)' }, cache: 'no-store' });
    if (!response.ok) return { text: '', html: '' };
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return { text: '', html: '' };
    const html = (await response.text()).slice(0, 350_000);
    return { text: html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '), html };
  } catch { return { text: '', html: '' }; }
  finally { clearTimeout(timer); }
}

export async function inspectWebsite(candidate: Candidate, startedAt: number) {
  if (!candidate.website || Date.now() - startedAt > TOTAL_BUDGET_MS) return { email: '', hasViewport: null as boolean | null };
  try {
    const homepage = await fetchPage(candidate.website);
    const hasViewport = homepage.html ? /<meta[^>]+name=["']viewport["'][^>]*>/i.test(homepage.html) : null;
    const root = new URL(candidate.website);
    const pagePaths = ['/contact', '/about'];
    const pageResults = await Promise.all(pagePaths.map(async (part) => {
      if (Date.now() - startedAt > TOTAL_BUDGET_MS) return { text: '', html: '' };
      const url = new URL(part, root).toString();
      return fetchPage(url);
    }));
    const emails = new Set([...cleanEmails(`${homepage.html}\\n${homepage.text}`, candidate.website)]);
    pageResults.forEach((page, i) => cleanEmails(`${page.html}\\n${page.text}`, new URL(pagePaths[i], root).toString()).forEach((email) => emails.add(email)));
    return { email: [...emails][0] || '', hasViewport };
  } catch { return { email: '', hasViewport: null as boolean | null }; }
}

export async function enrichCandidates(candidates: Candidate[], startedAt: number, concurrency = 6) {
  const results: Array<{ email: string; hasViewport: boolean | null }> = new Array(candidates.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= candidates.length) return;
      if (Date.now() - startedAt >= TOTAL_BUDGET_MS) {
        results[index] = { email: '', hasViewport: null };
        continue;
      }
      results[index] = await inspectWebsite(candidates[index], startedAt);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  return results;
}
