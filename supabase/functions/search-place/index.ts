// supabase/functions/search-place/index.ts
//
// 찜 화면 검색: POST { query, lat?, lng? } -> { places: Place[] } (최대 15, 좌표 있으면 거리순).
import { signedIn } from '../_shared/auth.ts';
import { keywordSearch, type Place } from '../_shared/kakaoKeyword.ts';

const MAX = 15;

export interface Deps {
  signedIn(req: Request): Promise<boolean>;
  search(query: string, near: { lat: number; lng: number } | null): Promise<Place[]>;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function parseSearch(body: unknown): { query: string; near: { lat: number; lng: number } | null } | null {
  if (typeof body !== 'object' || body === null) return null;
  const o = body as Record<string, unknown>;
  if (typeof o.query !== 'string') return null;
  const query = o.query.trim();
  if (query.length < 1 || query.length > 40) return null;
  const near =
    typeof o.lat === 'number' && typeof o.lng === 'number' && Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180
      ? { lat: o.lat, lng: o.lng }
      : null;
  return { query, near };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (!(await deps.signedIn(req))) return json({ error: 'unauthorized' }, 401);
  const input = parseSearch(await req.json().catch(() => null));
  if (!input) return json({ error: 'invalid_input' }, 400);
  try {
    return json({ places: (await deps.search(input.query, input.near)).slice(0, MAX) }, 200);
  } catch (e) {
    console.error('장소 검색 실패', e);
    return json({ error: 'search_failed' }, 502);
  }
}

if (import.meta.main) Deno.serve((req) => handle(req, { signedIn, search: (q, near) => keywordSearch(q, near) }));
