// supabase/functions/parse-shared/index.ts
//
// 공유로 찜하기: 다른 앱에서 공유된 글(또는 붙여넣은 링크)에서 가게 이름을 찾아 카카오 후보로.
// POST { text, lat?, lng? } -> { places, query }. 허용된 지도·인스타 주소만 따라간다(SSRF 방지).
import { signedIn } from '../_shared/auth.ts';
import { keywordSearch, type Place } from '../_shared/kakaoKeyword.ts';

export const ALLOWED_HOSTS = [
  'naver.me', 'map.naver.com', 'm.place.naver.com', 'kko.to', 'place.map.kakao.com', 'map.kakao.com', 'instagram.com', 'www.instagram.com',
];
const MAX_NAMES = 3;
const MAX_PLACES = 15;
const MAX_HOPS = 3;
const MAX_BYTES = 200_000;
const GENERIC_TITLES = /^(네이버\s*지도|네이버|카카오\s*맵|kakaomap|instagram)$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function urlsIn(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>"']+/g) ?? []).slice(0, 3);
}

// 링크를 뺀 줄 중 이름처럼 보이는 것. "[카카오맵] 가게"처럼 앞에 붙은 머리말은 떼고,
// 머리말만 있는 줄·전화번호·너무 긴 줄은 뺀다.
export function lineCandidates(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/https?:\/\/\S+/g, '').replace(/^\s*\[[^\]]*\]\s*/, '').trim())
    .filter((l) => l.length >= 1 && l.length <= 40 && !/^[\d\s\-+()]+$/.test(l))
    .slice(0, MAX_NAMES);
}

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function meta(html: string, prop: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'));
  return m ? decode(m[1]) : null;
}

export function titleFrom(html: string, host: string): string | null {
  if (host.endsWith('instagram.com')) {
    const d = meta(html, 'og:description');
    const caption = d?.match(/:\s*"([\s\S]*)"/)?.[1] ?? null;
    const first = caption?.split(/\r?\n/)[0].trim().slice(0, 30);
    return first || null;
  }
  const raw = meta(html, 'og:title') ?? html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null;
  if (!raw) return null;
  const name = decode(raw).split(/\s[:|-]\s/)[0].trim(); // "가게 : 네이버", "가게 | 카카오맵"
  // 사이트 이름뿐인 제목(서버에서 열면 첫 화면으로 가는 경우)은 가게 이름이 아니다.
  if (GENERIC_TITLES.test(name)) return null;
  return name || null;
}

const allowed = (u: URL) => (u.protocol === 'https:' || u.protocol === 'http:') && ALLOWED_HOSTS.includes(u.hostname);

export async function fetchTitle(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 3000): Promise<string | null> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return null;
  }
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!allowed(current)) return null;
    const res = await fetchImpl(current.toString(), { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      if (!loc) return null;
      current = new URL(loc, current);
      continue;
    }
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, MAX_BYTES);
    return titleFrom(html, current.hostname);
  }
  return null;
}

export interface ParseDeps {
  fetchTitle(url: string): Promise<string | null>;
  search(query: string, near: { lat: number; lng: number } | null): Promise<Place[]>;
}

export async function parseShared(
  text: string,
  near: { lat: number; lng: number } | null,
  deps: ParseDeps,
): Promise<{ places: Place[]; query: string | null }> {
  const names: string[] = [];
  for (const url of urlsIn(text)) {
    let host: URL;
    try {
      host = new URL(url);
    } catch {
      continue;
    }
    if (!allowed(host)) continue; // 모르는 사이트는 부르지 않는다
    const t = await deps.fetchTitle(url).catch(() => null);
    if (t) names.push(t);
  }
  names.push(...lineCandidates(text));
  const unique = [...new Set(names)].slice(0, MAX_NAMES);

  const seen = new Set<string>();
  const places: Place[] = [];
  for (const name of unique) {
    const found = await deps.search(name, near).catch(() => [] as Place[]);
    for (const p of found) {
      if (seen.has(p.placeId)) continue;
      seen.add(p.placeId);
      places.push(p);
    }
  }
  return { places: places.slice(0, MAX_PLACES), query: unique[0] ?? null };
}

export async function handle(req: Request, deps: ParseDeps & { signedIn(req: Request): Promise<boolean> }): Promise<Response> {
  if (!(await deps.signedIn(req))) return json({ error: 'unauthorized' }, 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (text.length < 1 || text.length > 2000) return json({ error: 'invalid_input' }, 400);
  const near =
    typeof body?.lat === 'number' && typeof body?.lng === 'number' ? { lat: body.lat as number, lng: body.lng as number } : null;
  return json(await parseShared(text, near, deps), 200);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, { signedIn, fetchTitle: (u) => fetchTitle(u), search: (q, near) => keywordSearch(q, near) }));
}
