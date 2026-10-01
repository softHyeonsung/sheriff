// supabase/functions/suggest-place/index.ts
//
// "여기 ○○ 맞나요?" 후보: 150m 안의 내 아지트(먼저) + 카카오 주변 장소, 거리순 최대 5개.
// POST { lat, lng, accuracy } -> SuggestResult. 기록은 하지 않는다(submit_checkin RPC가 한다).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const KAKAO_REST_KEY = Deno.env.get('KAKAO_REST_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MAX_CANDIDATES = 5;
// 카페·음식점·편의점·관광명소·문화시설·지하철역 — 산책 중 "머무를 만한 곳".
const CATEGORIES = ['CE7', 'FD6', 'CS2', 'AT4', 'CT1', 'SW8'];

export type MineCandidate = { kind: 'mine'; aidutId: string; name: string; grade: string; distanceM: number };
export type KakaoCandidate = {
  kind: 'kakao';
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  roadAddress: string | null;
  distanceM: number;
};
export type SuggestResult =
  | { status: 'weak_gps' }
  | { status: 'ok'; hereAddress: string | null; candidates: (MineCandidate | KakaoCandidate)[] };

export interface SuggestDeps {
  config(): Promise<{ radiusM: number; accuracyMaxM: number }>;
  nearbyMine(lat: number, lng: number, radiusM: number): Promise<(MineCandidate & { kakaoPlaceId: string | null })[]>;
  kakaoNearby(lat: number, lng: number, radiusM: number): Promise<KakaoCandidate[]>;
  kakaoAddress(lat: number, lng: number): Promise<string | null>;
}

const byDistance = (a: { distanceM: number }, b: { distanceM: number }) => a.distanceM - b.distanceM;

export async function suggestPlace(
  { lat, lng, accuracy }: { lat: number; lng: number; accuracy: number },
  deps: SuggestDeps,
): Promise<SuggestResult> {
  const cfg = await deps.config();
  if (!(accuracy <= cfg.accuracyMaxM)) return { status: 'weak_gps' };

  // Kakao is optional: a failure or timeout leaves only my hideouts, never blocks a check-in.
  const [mine, places, hereAddress] = await Promise.all([
    deps.nearbyMine(lat, lng, cfg.radiusM),
    deps.kakaoNearby(lat, lng, cfg.radiusM).catch(() => [] as KakaoCandidate[]),
    deps.kakaoAddress(lat, lng).catch(() => null),
  ]);

  const mineIds = new Set(mine.map((m) => m.kakaoPlaceId).filter((id): id is string => !!id));
  const mineCandidates: MineCandidate[] = [...mine]
    .sort(byDistance)
    .map(({ kakaoPlaceId: _drop, ...m }) => m);
  const kakaoCandidates = places.filter((p) => !mineIds.has(p.placeId)).sort(byDistance);

  return { status: 'ok', hereAddress, candidates: [...mineCandidates, ...kakaoCandidates].slice(0, MAX_CANDIDATES) };
}

interface KakaoDoc {
  id: string;
  place_name: string;
  x: string;
  y: string;
  road_address_name: string;
  distance: string;
}

export async function kakaoNearby(
  lat: number,
  lng: number,
  radiusM: number,
  fetchImpl: typeof fetch = fetch,
  key = KAKAO_REST_KEY,
  timeoutMs = 2000,
): Promise<KakaoCandidate[]> {
  const signal = AbortSignal.timeout(timeoutMs);
  const results = await Promise.allSettled(
    CATEGORIES.map(async (code) => {
      const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${code}` +
        `&x=${lng}&y=${lat}&radius=${Math.round(radiusM)}&sort=distance&size=5`;
      const res = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${key}` }, signal });
      if (!res.ok) throw new Error(`kakao ${code} ${res.status}`);
      return ((await res.json()).documents ?? []) as KakaoDoc[];
    }),
  );
  const byId = new Map<string, KakaoCandidate>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const d of r.value) {
      byId.set(d.id, {
        kind: 'kakao',
        placeId: d.id,
        name: d.place_name,
        lat: Number(d.y),
        lng: Number(d.x),
        roadAddress: d.road_address_name || null,
        distanceM: Number(d.distance),
      });
    }
  }
  return [...byId.values()];
}

export async function kakaoAddress(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch,
  key = KAKAO_REST_KEY,
  timeoutMs = 2000,
): Promise<string | null> {
  const res = await fetchImpl(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const d = (await res.json()).documents?.[0];
  return d?.road_address?.address_name ?? d?.address?.address_name ?? null;
}

// db must carry the caller's JWT: nearby_aidut and app_config are read under the user's RLS.
export function liveDeps(db: SupabaseClient, fetchImpl: typeof fetch = fetch): SuggestDeps {
  return {
    config: async () => {
      const { data, error } = await db
        .from('app_config')
        .select('key, value')
        .in('key', ['checkin_radius_m', 'gps_accuracy_max_m']);
      if (error) throw error;
      const get = (k: string) => {
        const v = Number(data?.find((r) => r.key === k)?.value);
        if (!Number.isFinite(v)) throw new Error(`missing app_config ${k}`);
        return v;
      };
      return { radiusM: get('checkin_radius_m'), accuracyMaxM: get('gps_accuracy_max_m') };
    },
    nearbyMine: async (lat, lng, radiusM) => {
      const { data, error } = await db.rpc('nearby_aidut', { p_lat: lat, p_lng: lng, p_radius_m: radiusM });
      if (error) throw error;
      return (data ?? []).map((r: { id: string; name: string; grade: string; kakao_place_id: string | null; distance_m: number }) => ({
        kind: 'mine' as const,
        aidutId: r.id,
        name: r.name,
        grade: r.grade,
        distanceM: r.distance_m,
        kakaoPlaceId: r.kakao_place_id,
      }));
    },
    kakaoNearby: (lat, lng, radiusM) => kakaoNearby(lat, lng, radiusM, fetchImpl),
    kakaoAddress: (lat, lng) => kakaoAddress(lat, lng, fetchImpl),
  };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function parseInput(body: unknown): { lat: number; lng: number; accuracy: number } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { lat, lng, accuracy } = body as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lng !== 'number' || typeof accuracy !== 'number') return null;
  if (![lat, lng, accuracy].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, accuracy };
}

Deno.serve(async (req) => {
  try {
    // 잘못된 요청(JSON이 아님 포함)은 서버 오류(500)가 아니라 400.
    const input = parseInput(await req.json().catch(() => null));
    if (!input) return json({ error: 'invalid_input' }, 400);
    const { lat, lng, accuracy } = input;
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    return json(await suggestPlace({ lat, lng, accuracy }, liveDeps(db)), 200);
  } catch (e) {
    console.error('suggest-place failed', e);
    return json({ error: 'suggest_failed' }, 500);
  }
});
