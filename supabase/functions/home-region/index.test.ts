// supabase/functions/home-region/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { parseInput, regionAt, searchRegion } from './index.ts';

const fakeFetch = (docs: unknown, ok = true) =>
  ((_url: string) => Promise.resolve(new Response(JSON.stringify({ documents: docs }), { status: ok ? 200 : 500 }))) as unknown as typeof fetch;

Deno.test('좌표 → 행정동(H) 이름 하나', async () => {
  const r = await regionAt(37.57, 126.97, fakeFetch([
    { region_type: 'B', address_name: '서울특별시 종로구 사직동' },
    { region_type: 'H', address_name: '서울특별시 종로구 사직동' },
  ]), 'k');
  assertEquals(r, { dongs: [{ name: '서울특별시 종로구 사직동' }] });
});

Deno.test('카카오 실패·H 없음 → 빈 목록', async () => {
  assertEquals(await regionAt(37.57, 126.97, fakeFetch([], false), 'k'), { dongs: [] });
  assertEquals(await regionAt(37.57, 126.97, fakeFetch([{ region_type: 'B', address_name: 'x' }]), 'k'), { dongs: [] });
  const throwing = (() => Promise.reject(new Error('timeout'))) as unknown as typeof fetch;
  assertEquals(await regionAt(37.57, 126.97, throwing, 'k'), { dongs: [] });
});

Deno.test('검색: "시도 시군구 동", 행정동 우선, 동 없는 결과·중복 제거, 최대 10개', async () => {
  const a = (r3h: string, r3 = r3h, r2 = '종로구') => ({ address: { region_1depth_name: '서울특별시', region_2depth_name: r2, region_3depth_h_name: r3h, region_3depth_name: r3 } });
  const docs = [a('사직동'), a('사직동'), a('', '사직동', '동래구'), { address: null }, a('', '')];
  for (let i = 0; i < 12; i++) docs.push(a(`동${i}`));
  const r = await searchRegion('사직동', fakeFetch(docs), 'k');
  assertEquals(r.dongs[0], { name: '서울특별시 종로구 사직동' });
  assertEquals(r.dongs[1], { name: '서울특별시 동래구 사직동' });
  assertEquals(r.dongs.length, 10);
});

Deno.test('입력 검사', () => {
  assertEquals(parseInput({ lat: 37.5, lng: 126.9 }), { kind: 'at', lat: 37.5, lng: 126.9 });
  assertEquals(parseInput({ query: ' 사직동 ' }), { kind: 'search', query: '사직동' });
  for (const bad of [null, {}, { query: '' }, { query: '   ' }, { query: 'x'.repeat(21) }, { lat: 95, lng: 0 }, { lat: '37', lng: 126 }]) {
    assertEquals(parseInput(bad), null);
  }
});
