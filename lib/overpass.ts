import type { Candidate } from './types';

const DEFAULT_TOWNS = ["Manchester", "Birmingham", "Leeds", "Bristol", "London", "Sheffield", "Newcastle upon Tyne", "Cardiff", "Glasgow", "Edinburgh", "Brighton", "Leicester"];
const AREA_FILTER = '["boundary"="administrative"]["admin_level"~"^(6|8)$"]';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];
const queryTags = '["shop"~"beauty|hairdresser"]';

export function getTowns() {
  const configured = (process.env.LEAD_TOWNS || '').split(',').map((town) => town.trim()).filter(Boolean);
  return configured.length ? configured : DEFAULT_TOWNS;
}

function typeFromTags(tags: Record<string, string>) {
  const text = [tags.amenity, tags.healthcare, tags.shop, tags.name].filter(Boolean).join(' ').toLowerCase();
  if (/dentist|dental/.test(text)) return 'Dentist';
  if (/beauty|aesthetic|cosmetic|skin|spa|clinic/.test(text)) return /aesthetic|cosmetic|skin|spa|clinic/.test(text) ? 'Aesthetic clinic / med spa' : 'Beauty salon';
  if (/hairdresser|hair salon/.test(text)) return 'Hair salon';
  return null;
}

const SOCIAL_KEYS = ['instagram','facebook','tiktok','linkedin','youtube','twitter','x','pinterest'];
function getSocials(tags: Record<string, string>) {
  const links = new Set<string>();
  for (const [key, value] of Object.entries(tags)) {
    if (!value || !/^https?:\/\//i.test(value)) continue;
    if (SOCIAL_KEYS.some((social) => key.toLowerCase().includes(social)) || SOCIAL_KEYS.some((social) => { try { return new URL(value).hostname.includes(social); } catch { return false; } })) links.add(value);
  }
  return [...links];
}

export async function fetchTownCandidates(town: string): Promise<Candidate[]> {
  const query = `[out:json][timeout:15];area["name"="${town.replace(/["\\]/g, '')}"]["boundary"="administrative"]["admin_level"~"^(6|8)$"]->.a;(nwr["amenity"="dentist"](area.a);nwr["healthcare"~"dentist|doctor|clinic"](area.a);nwr${queryTags}(area.a);nwr["shop"="cosmetics"](area.a););out center tags 250;`;
  try {
    let lastError: unknown = null;
    const attempts: string[] = [];
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 22000);
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'LeadEngine/1.0 (small-business prospecting)' }, body: `data=${encodeURIComponent(query)}`, signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
        const text = await response.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch { throw new Error('Overpass returned a non-JSON error page'); }
        const parsed = parseOverpass(json as Parameters<typeof parseOverpass>[0], town);
        if (parsed.length === 0) { attempts.push(endpoint); await new Promise((r) => setTimeout(r, 2500)); continue; }
        return parsed;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('All Overpass endpoints failed');
  } catch (error) { throw error instanceof Error ? error : new Error('Overpass lookup failed'); }
}

function parseOverpass(json: { elements?: Array<{ tags?: Record<string, string>; lat?: number; center?: { lat: number; lon: number }; lon?: number }> }, town: string): Candidate[] {
  const rows: Candidate[] = [];
  for (const element of json.elements ?? []) {
    const tags = element.tags ?? {};
    const name = String(tags.name ?? '').trim();
    const type = typeFromTags(tags);
    if (!name || !type) continue;
    const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    const locality = tags['addr:city'] || tags['addr:town'] || town;
    const address = [street, tags['addr:suburb'], locality, tags['addr:postcode']].filter(Boolean).join(', ');
    const rawWebsite = tags.website || tags['contact:website'] || '';
    let website = '';
    try { website = rawWebsite ? new URL(rawWebsite.startsWith('http') ? rawWebsite : `https://${rawWebsite}`).toString() : ''; } catch { website = ''; }
    const phone = tags.phone || tags['contact:phone'] || '';
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    rows.push({ business_name: name, business_type: type, town_city: locality, website, phone, whatsapp: tags['contact:whatsapp'] || tags.whatsapp || '', socials: getSocials(tags), address, lat, lon });
  }
  return rows;
}
