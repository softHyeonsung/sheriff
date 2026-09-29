// supabase/functions/home-region/index.ts
//
// 온보딩 "내 동네": 좌표 → 행정동 추정, 이름 → 동 검색. 카카오 키는 서버에만.
// POST { lat, lng } | { query } -> { dongs: { name }[] }. 카카오 실패는 빈 목록(앱이 검색·"못 찾았어요"로).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KAKAO_REST_KEY = Deno.env.get('KAKAO_REST_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MAX = 10;

export type RegionResult = { dongs: { name: string }[] };
export type Input = { kind: 'at'; lat: number; lng: number } | { kind: 'search'; query: string };

interface RegionDoc { region_type: string; address_name: string }
interface AddressDoc {
  address: { region_1depth_name: string; region_2depth_name: string; region_3depth_h_name: string; region_3depth_name: string } | null;
}

async function kakao<T>(path: string, fetchImpl: typeof fetch, key: string, timeoutMs: number): Promise<T[]> {
  const res = await fetchImpl(`https://dapi.kakao.com${path}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  return ((await res.json()).documents ?? []) as T[];
}

export async function regionAt(lat: number, lng: number, fetchImpl: typeof fetch = fetch, key = KAKAO_REST_KEY, timeoutMs = 2000): Promise<RegionResult> {
  try {
    const docs = await kakao<RegionDoc>(`/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`, fetchImpl, key, timeoutMs);
    const h = docs.find((d) => d.region_type === 'H');
    return { dongs: h?.address_name ? [{ name: h.address_name }] : [] };
  } catch (e) {
    console.error('coord2regioncode 실패', e);
    return { dongs: [] };
  }
}

export async function searchRegion(query: string, fetchImpl: typeof fetch = fetch, key = KAKAO_REST_KEY, timeoutMs = 2000): Promise<RegionResult> {
  try {
    const docs = await kakao<AddressDoc>(
      `/v2/local/search/address.json?query=${encodeURIComponent(query)}&analyze_type=similar&size=30`,
      fetchImpl, key, timeoutMs,
    );
    const names = new Set<string>();
    for (const { address: a } of docs) {
      const dong = a?.region_3depth_h_name || a?.region_3depth_name; // 행정동 우선
      if (!a || !dong) continue;
      names.add([a.region_1depth_name, a.region_2depth_name, dong].filter(Boolean).join(' '));
    }
    return { dongs: [...names].slice(0, MAX).map((name) => ({ name })) };
  } catch (e) {
    console.error('search/address 실패', e);
    return { dongs: [] };
  }
}

export function parseInput(body: unknown): Input | null {
  if (typeof body !== 'object' || body === null) return null;
  const o = body as Record<string, unknown>;
  if (typeof o.query === 'string') {
    const q = o.query.trim();
    return q.length >= 1 && q.length <= 20 ? { kind: 'search', query: q } : null;
  }
  const { lat, lng } = o;
  if (typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { kind: 'at', lat, lng };
  }
  return null;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export interface Deps {
  signedIn(req: Request): Promise<boolean>;
  regionAt(lat: number, lng: number): Promise<RegionResult>;
  searchRegion(query: string): Promise<RegionResult>;
}

// The gateway's verify_jwt also accepts the app's public anon key: require a real signed-in user,
// or this is a free proxy to our Kakao quota.
export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (!(await deps.signedIn(req))) return json({ error: 'unauthorized' }, 401);
  const input = parseInput(await req.json().catch(() => null));
  if (!input) return json({ error: 'invalid_input' }, 400);
  return json(input.kind === 'at' ? await deps.regionAt(input.lat, input.lng) : await deps.searchRegion(input.query), 200);
}

const liveDeps: Deps = {
  signedIn: async (req) => {
    const auth = req.headers.get('Authorization');
    if (!auth) return false;
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data, error } = await db.auth.getUser();
    return !error && !!data.user;
  },
  regionAt: (lat, lng) => regionAt(lat, lng),
  searchRegion: (q) => searchRegion(q),
};

Deno.serve((req) => handle(req, liveDeps));
