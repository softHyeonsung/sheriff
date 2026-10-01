// supabase/functions/suggest-course/index.ts
//
// 고양이의 산책 제안: POST { lat, lng } -> { stops, route, distanceM, routeLimited }.
// 주변 관광지(TourAPI)에서 내 아지트 50m 안(가본 곳)을 빼고, 가까운 곳부터 이어 최대 4곳.
// 길은 카카오 모빌리티 한 번(경유지 포함). 하루 한도를 넘거나 길찾기가 실패하면 핀만.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { signedIn } from '../_shared/auth.ts';

export type LatLng = { lat: number; lng: number };
export type Candidate = { name: string; address: string | null; lat: number; lng: number };
export type Stop = Candidate & { legM: number };
export type Route = { route: [number, number][]; distanceM: number | null };

export interface Deps {
  signedIn(req: Request): Promise<boolean>;
  candidates(at: LatLng): Promise<Candidate[]>;
  hideouts(req: Request): Promise<LatLng[]>;
  useCall(req: Request): Promise<boolean>;
  directions(points: LatLng[]): Promise<Route | null>;
}

const MAX_STOPS = 4;
const VISITED_M = 50;
const SAME_SPOT_M = 30; // TourAPI가 같은 건물의 항목을 여러 개 준다
const MAX_ROUTE_POINTS = 500;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const rad = (d: number) => (d * Math.PI) / 180;
export function distanceM(a: LatLng, b: LatLng): number {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function pickStops(from: LatLng, candidates: Candidate[], hideouts: LatLng[]): Stop[] {
  let pool = candidates.filter((c) => !hideouts.some((h) => distanceM(c, h) <= VISITED_M));
  const stops: Stop[] = [];
  let at = from;
  while (stops.length < MAX_STOPS && pool.length > 0) {
    const here = at;
    const next = pool.reduce((best, c) => (distanceM(here, c) < distanceM(here, best) ? c : best));
    stops.push({ ...next, legM: Math.round(distanceM(here, next)) });
    at = next;
    pool = pool.filter((c) => distanceM(next, c) > SAME_SPOT_M); // 고른 곳과 같은 자리 항목도 같이 뺀다
  }
  return stops;
}

type Section = { roads?: { vertexes: number[] }[] };

export function flattenRoute(sections: Section[]): [number, number][] {
  const pts: [number, number][] = [];
  for (const s of sections) {
    for (const road of s.roads ?? []) {
      for (let i = 0; i + 1 < road.vertexes.length; i += 2) pts.push([road.vertexes[i + 1], road.vertexes[i]]);
    }
  }
  if (pts.length <= MAX_ROUTE_POINTS) return pts;
  const step = (pts.length - 1) / (MAX_ROUTE_POINTS - 1);
  return Array.from({ length: MAX_ROUTE_POINTS }, (_, i) => pts[Math.round(i * step)]);
}

interface TourItem { title: string; addr1: string; mapx: string; mapy: string }

export async function tourNearby(
  at: LatLng,
  fetchImpl: typeof fetch = fetch,
  key = Deno.env.get('TOURAPI_KEY') ?? '',
  timeoutMs = 3000,
): Promise<Candidate[]> {
  const params = new URLSearchParams({
    serviceKey: key, MobileOS: 'ETC', MobileApp: 'sanchaeknyang', _type: 'json',
    mapX: String(at.lng), mapY: String(at.lat), radius: '2000', arrange: 'E', contentTypeId: '12', numOfRows: '30', pageNo: '1',
  });
  const res = await fetchImpl(`https://apis.data.go.kr/B551011/KorService2/locationBasedList2?${params}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`tourapi ${res.status}`);
  const r = (await res.json()).response; // 키 오류 등은 JSON이 아닌 글로 온다 → 여기서 던진다
  if (r?.header?.resultCode !== '0000') throw new Error(`tourapi ${r?.header?.resultCode}`);
  // 0건이면 items가 "", 한 건이면 item이 배열이 아닐 수 있다.
  const items = ([] as TourItem[]).concat(r.body?.items?.item ?? []);
  return items
    .filter((i) => i.title && i.mapx && i.mapy)
    .map((i) => ({ name: i.title.slice(0, 60), address: i.addr1 || null, lat: Number(i.mapy), lng: Number(i.mapx) }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180);
}

// ponytail: 자동차 길 기준(골목·횡단보도 반영 안 됨). 걷는 길이 필요해지면 티맵 보행자 경로로 교체.
export async function kakaoRoute(
  points: LatLng[],
  fetchImpl: typeof fetch = fetch,
  key = Deno.env.get('KAKAO_REST_KEY') ?? '',
  timeoutMs = 3000,
): Promise<Route | null> {
  if (points.length < 2) return null;
  const xy = (p: LatLng) => `${p.lng},${p.lat}`;
  const params = new URLSearchParams({ origin: xy(points[0]), destination: xy(points[points.length - 1]) });
  const mid = points.slice(1, -1);
  if (mid.length) params.set('waypoints', mid.map(xy).join('|'));
  const res = await fetchImpl(`https://apis-navi.kakaomobility.com/v1/directions?${params}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`navi ${res.status}`);
  const r = (await res.json()).routes?.[0];
  if (!r || r.result_code !== 0) return null;
  const route = flattenRoute(r.sections ?? []);
  return route.length > 1 ? { route, distanceM: r.summary?.distance ?? null } : null;
}

export function parseAt(body: unknown): LatLng | null {
  if (typeof body !== 'object' || body === null) return null;
  const { lat, lng } = body as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (!(await deps.signedIn(req))) return json({ error: 'unauthorized' }, 401);
  const at = parseAt(await req.json().catch(() => null));
  if (!at) return json({ error: 'invalid_input' }, 400);

  let stops: Stop[];
  try {
    const [candidates, mine] = await Promise.all([deps.candidates(at), deps.hideouts(req)]);
    stops = pickStops(at, candidates, mine);
  } catch (e) {
    // fetch 오류 글에는 요청 주소(= TourAPI 키)가 들어 있을 수 있다: 가리고 남긴다.
    console.error('코스 후보 실패', String(e).replace(/serviceKey=[^&)\s]+/g, 'serviceKey=***'));
    return json({ error: 'course_failed' }, 502);
  }
  if (stops.length === 0) return json({ stops, route: null, distanceM: null, routeLimited: false }, 200);

  // 길은 덤: 한도를 넘었거나 실패해도 핀은 보여준다.
  let found: Route | null = null;
  let routeLimited = false;
  try {
    if (await deps.useCall(req)) found = await deps.directions([at, ...stops]);
    else routeLimited = true;
  } catch (e) {
    console.error('코스 길찾기 실패', String(e));
  }
  return json({ stops, route: found?.route ?? null, distanceM: found?.distanceM ?? null, routeLimited }, 200);
}

// 요청자의 토큰으로: my_hideouts·use_course_call이 그 사용자의 것으로 동작한다.
const userDb = (req: Request) =>
  createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

if (import.meta.main) {
  Deno.serve((req) =>
    handle(req, {
      signedIn,
      candidates: (at) => tourNearby(at),
      hideouts: async (r) => {
        const { data, error } = await userDb(r).rpc('my_hideouts');
        if (error) throw error;
        return ((data ?? []) as LatLng[]).map(({ lat, lng }) => ({ lat, lng }));
      },
      useCall: async (r) => {
        const { data, error } = await userDb(r).rpc('use_course_call');
        if (error) throw error;
        return data === true;
      },
      directions: (points) => kakaoRoute(points),
    })
  );
}
