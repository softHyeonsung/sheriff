// supabase/functions/search-place/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { keywordSearch } from '../_shared/kakaoKeyword.ts';
import { handle, parseSearch } from './index.ts';

const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });

Deno.test('keywordSearch: 좌표가 있으면 거리순, 결과를 장소 모양으로', async () => {
  let called = '';
  const fake = ((url: string) => {
    called = url;
    return Promise.resolve(new Response(JSON.stringify({ documents: [
      { id: '123', place_name: '찜한 카페', x: '126.94', y: '37.5', road_address_name: '서울 성수로 1', address_name: '서울 성수동 1', distance: '42' },
      { id: '456', place_name: '주소만', x: '127', y: '37.6', road_address_name: '', address_name: '서울 어딘가', distance: '' },
    ] })));
  }) as unknown as typeof fetch;
  const r = await keywordSearch('카페', { lat: 37.5, lng: 126.9 }, fake, 'k');
  assertEquals(called.includes('sort=distance') && called.includes('x=126.9') && called.includes('y=37.5'), true);
  assertEquals(r, [
    { placeId: '123', name: '찜한 카페', roadAddress: '서울 성수로 1', lat: 37.5, lng: 126.94, distanceM: 42 },
    { placeId: '456', name: '주소만', roadAddress: '서울 어딘가', lat: 37.6, lng: 127, distanceM: null },
  ]);
});

Deno.test('parseSearch: 검색어 1~40자, 좌표는 있으면', () => {
  assertEquals(parseSearch({ query: '  카페 ' }), { query: '카페', near: null });
  assertEquals(parseSearch({ query: '카페', lat: 37.5, lng: 127 }), { query: '카페', near: { lat: 37.5, lng: 127 } });
  assertEquals(parseSearch({ query: '' }), null);
  assertEquals(parseSearch({ query: 'x'.repeat(41) }), null);
  assertEquals(parseSearch(null), null);
});

Deno.test('handle: 로그인 필요, 15개까지, 카카오 실패는 502', async () => {
  const place = { placeId: '1', name: 'a', roadAddress: null, lat: 1, lng: 1, distanceM: null };
  const many = Array.from({ length: 20 }, (_, i) => ({ ...place, placeId: String(i) }));
  assertEquals((await handle(req({ query: '카페' }), { signedIn: () => Promise.resolve(false), search: () => Promise.resolve([]) })).status, 401);
  assertEquals((await handle(req({ query: '' }), { signedIn: () => Promise.resolve(true), search: () => Promise.resolve([]) })).status, 400);
  const ok = await handle(req({ query: '카페' }), { signedIn: () => Promise.resolve(true), search: () => Promise.resolve(many) });
  assertEquals((await ok.json()).places.length, 15);
  const bad = await handle(req({ query: '카페' }), { signedIn: () => Promise.resolve(true), search: () => Promise.reject(new Error('kakao 500')) });
  assertEquals(bad.status, 502);
});
