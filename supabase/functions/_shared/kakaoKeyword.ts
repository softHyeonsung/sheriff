// supabase/functions/_shared/kakaoKeyword.ts
// 카카오 로컬 키워드 검색 → 찜 후보 모양. 키는 서버에만.
export type Place = { placeId: string; name: string; roadAddress: string | null; lat: number; lng: number; distanceM: number | null };

interface Doc { id: string; place_name: string; x: string; y: string; road_address_name: string; address_name: string; distance: string }

export async function keywordSearch(
  query: string,
  near: { lat: number; lng: number } | null,
  fetchImpl: typeof fetch = fetch,
  key = Deno.env.get('KAKAO_REST_KEY') ?? '',
  timeoutMs = 3000,
): Promise<Place[]> {
  const params = new URLSearchParams({ query, size: '15' });
  if (near) {
    params.set('x', String(near.lng));
    params.set('y', String(near.lat));
    params.set('sort', 'distance');
  }
  const res = await fetchImpl(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  const docs = ((await res.json()).documents ?? []) as Doc[];
  return docs.map((d) => ({
    placeId: d.id,
    name: d.place_name,
    roadAddress: d.road_address_name || d.address_name || null,
    lat: Number(d.y),
    lng: Number(d.x),
    distanceM: d.distance ? Number(d.distance) : null,
  }));
}
