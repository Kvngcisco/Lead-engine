const NO_EMAIL = 'no email - phone/DM';
const SOCIAL = /(^|\.)(facebook|instagram|linkedin|tiktok|twitter|x|youtube|pinterest)\.com$|(^|\.)(wa\.me|whatsapp\.com)$/i;
const PAGE_TIMEOUT_MS = 3000;
const TOTAL_BUDGET_MS = 38000;
const EMAIL_RE = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

export function cleanEmails(text) {
  const found = new Set();
  const add = value => {
    const email = value.trim().replace(/^mailto:/i, '').split(/[?#]/)[0].toLowerCase().replace(/[.,;:]+$/, '');
    EMAIL_RE.lastIndex = 0;
    const domain = email.split('@')[1] || '';
    if (EMAIL_RE.test(email) && !SOCIAL.test(domain)) found.add(email);
  };
  for (const match of text.matchAll(/mailto:([^"'\s>?]+)/gi)) add(match[1]);
  EMAIL_RE.lastIndex = 0;
  for (const match of text.matchAll(EMAIL_RE)) add(match[0]);
  return [...found];
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow', cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadEngine/1.0)' } });
    if (!response.ok) return { html: '', text: '' };
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html') && !type.includes('text/plain')) return { html: '', text: '' };
    const html = (await response.text()).slice(0, 300_000);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    return { html, text };
  } catch { return { html: '', text: '' }; }
  finally { clearTimeout(timeout); }
}

export async function inspectWebsite(candidate, startedAt = Date.now()) {
  if (!candidate.website || Date.now() - startedAt >= TOTAL_BUDGET_MS) return { email: '', hasViewport: null };
  try {
    const home = await fetchPage(candidate.website);
    const hasViewport = home.html ? /<meta[^>]+name=["']viewport["'][^>]*>/i.test(home.html) : null;
    const origin = new URL(candidate.website);
    const paths = ['/contact', '/contact-us', '/about'];
    const pages = await Promise.all(paths.map(path => Date.now() - startedAt < TOTAL_BUDGET_MS ? fetchPage(new URL(path, origin).toString()) : Promise.resolve({ html: '', text: '' })));
    const emails = new Set(cleanEmails(`${home.html}\n${home.text}`));
    for (const page of pages) cleanEmails(`${page.html}\n${page.text}`).forEach(email => emails.add(email));
    return { email: [...emails][0] || '', hasViewport };
  } catch { return { email: '', hasViewport: null }; }
}

export async function enrichCandidates(candidates, startedAt = Date.now(), concurrency = 6) {
  const results = new Array(candidates.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) return;
      results[index] = Date.now() - startedAt < TOTAL_BUDGET_MS ? await inspectWebsite(candidates[index], startedAt) : { email: '', hasViewport: null };
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, Math.max(1, concurrency), candidates.length) }, worker));
  return results;
}
