import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Store } from './types';

function dataFile(): string {
  if (process.env.VERCEL) return path.join('/tmp', 'leads.json');
  return path.join(process.cwd(), 'data', 'leads.json');
}
const KEY = 'lead-engine:store:v1';
const emptyStore = (): Store => ({ leads: [], seen: [], pool: [], poolIndex: 0, poolDate: '', townIndex: 0 });

async function kvCommand<T>(command: unknown[]): Promise<T | null> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), cache: 'no-store' });
  if (!response.ok) throw new Error(`KV request failed (${response.status}) at ${url}`);
  const body = await response.json();
  return (body.result ?? null) as T | null;
}

export async function readStore(): Promise<Store> {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const raw = await kvCommand<string>(['GET', KEY]);
      return raw ? { ...emptyStore(), ...JSON.parse(raw) } : emptyStore();
    } catch (error) {
      console.error('KV read failed, starting with empty store:', error instanceof Error ? error.message : error);
      return emptyStore();
    }
  }
  try {
    const raw = await fs.readFile(dataFile(), 'utf8');
    return { ...emptyStore(), ...JSON.parse(raw) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
    throw error;
  }
}

export async function writeStore(store: Store) {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      await kvCommand(['SET', KEY, JSON.stringify(store)]);
      return;
    } catch (error) {
      console.error('KV write failed:', error instanceof Error ? error.message : error);
      throw new Error('KV_UNAVAILABLE');
    }
  }
  await fs.mkdir(path.dirname(dataFile()), { recursive: true });
  try {
      await fs.writeFile(dataFile(), JSON.stringify(store, null, 2), 'utf8');
    } catch {
      // read-only filesystem: in-memory only for this invocation unless KV is configured
    }
}
