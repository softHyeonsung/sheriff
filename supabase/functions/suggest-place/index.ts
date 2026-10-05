// supabase/functions/suggest-place/index.ts
//
// "여기 ○○ 맞나요?" 후보: 150m 안의 내 아지트와 거기서 간 곳들(먼저, 많이 간 순) + 카카오 주변 장소, 최대 5개.
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
  | { status: 'ok'; hereAddress: string | null; hereName: string | null; candidates: (MineCandidate | KakaoCandidate)[] };

// 지금 서 있는 자리: 주소와, 알면 그 건물의 이름(새 아지트의 이름이 된다).
export type Here = { address: string; name: string | null };

// 내 아지트(건물)에서 간 곳 하나. 좌표·주소는 아지트의 것(다시 고르면 같은 아지트로 합쳐진다).
export type Visited = { aidutId: string; placeId: string | null; name: string; visits: number; lat: number; lng: number; roadAddress: string | null };

export interface SuggestDeps {
  config(): Promise<{ radiusM: number; accuracyMaxM: number }>;
  nearbyMine(lat: number, lng: number, radiusM: number): Promise<(MineCandidate & { kakaoPlaceId: string | null })[]>;
  visited(lat: number, lng: number, radiusM: number): Promise<Visited[]>;
  kakaoNearby(lat: number, lng: number, radiusM: number): Promise<KakaoCandidate[]>;
  kakaoAddress(lat: number, lng: number): Promise<Here | null>;
}

const byDistance = (a: { distanceM: number }, b: { distanceM: number }) => a.distanceM - b.distanceM;

export async function suggestPlace(
  { lat, lng, accuracy }: { lat: number; lng: number; accuracy: number },
  deps: SuggestDeps,
): Promise<SuggestResult> {
  const cfg = await deps.config();
  if (!(accuracy <= cfg.accuracyMaxM)) return { status: 'weak_gps' };

  // Kakao is optional: a failure or timeout leaves only my hideouts, never blocks a check-in.
  const [mine, visited, places, here] = await Promise.all([
    deps.nearbyMine(lat, lng, cfg.radiusM),
    // 간 곳 조회가 실패해도 예전처럼(아지트 + 주변 장소) 응답한다.
    deps.visited(lat, lng, cfg.radiusM).catch(() => [] as Visited[]),
    deps.kakaoNearby(lat, lng, cfg.radiusM).catch(() => [] as KakaoCandidate[]),
    deps.kakaoAddress(lat, lng).catch(() => null),
  ]);

  // 가까운 아지트부터, 그 건물에서 간 곳을 많이 간 순으로: 같은 건물의 다른 가게에 다시 왔을 때
  // 그 가게를 먼저 물어봐야 발자국이 그 가게로 기록된다. 아지트의 원래 가게(번호가 같거나 번호 없이 남긴 것)는 아지트 그 자체.
  const known = new Set<string>();
  const mineCandidates: (MineCandidate | KakaoCandidate)[] = [];
  for (const { kakaoPlaceId, ...m } of [...mine].sort(byDistance)) {
    if (kakaoPlaceId) known.add(kakaoPlaceId);
    const here = visited.filter((v) => v.aidutId === m.aidutId);
    const others = here.filter((v) => v.placeId && v.placeId !== kakaoPlaceId);
    const own = Math.max(0, ...here.filter((v) => !others.includes(v)).map((v) => v.visits));
    const group: { visits: number; c: MineCandidate | KakaoCandidate }[] = [{ visits: own, c: m }];
    for (const v of others) {
      known.add(v.placeId as string);
      group.push({
        visits: v.visits,
        c: { kind: 'kakao', placeId: v.placeId as string, name: v.name, lat: v.lat, lng: v.lng, roadAddress: v.roadAddress, distanceM: m.distanceM },
      });
    }
    mineCandidates.push(...group.sort((a, b) => b.visits - a.visits).map((g) => g.c)); // 같으면 아지트가 먼저(안정 정렬)
  }
  const kakaoCandidates = places.filter((p) => !known.has(p.placeId)).sort(byDistance);

  return { status: 'ok', hereAddress: here?.address ?? null, hereName: here?.name ?? null, candidates: [...mineCandidates, ...kakaoCandidates].slice(0, MAX_CANDIDATES) };
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
): Promise<Here | null> {
  const res = await fetchImpl(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const d = (await res.json()).documents?.[0];
  const address = d?.road_address?.address_name ?? d?.address?.address_name;
  return address ? { address, name: d?.road_address?.building_name || null } : null;
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
    visited: async (lat, lng, radiusM) => {
      const { data, error } = await db.rpc('nearby_my_places', { p_lat: lat, p_lng: lng, p_radius_m: radiusM });
      if (error) throw error;
      return (data ?? []).map((r: { aidut_id: string; place_id: string | null; name: string; visits: number; lat: number; lng: number; road_address: string | null }) => ({
        aidutId: r.aidut_id,
        placeId: r.place_id,
        name: r.name,
        visits: r.visits,
        lat: r.lat,
        lng: r.lng,
        roadAddress: r.road_address,
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
