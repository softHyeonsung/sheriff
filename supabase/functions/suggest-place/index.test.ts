// supabase/functions/suggest-place/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { kakaoAddress, kakaoNearby, parseInput, type KakaoCandidate, type MineCandidate, suggestPlace, type SuggestDeps } from './index.ts';

const mine = (id: string, distanceM: number, kakaoPlaceId: string | null = null) =>
  ({ kind: 'mine', aidutId: id, name: `내 ${id}`, grade: 'paw', distanceM, kakaoPlaceId }) as MineCandidate & { kakaoPlaceId: string | null };
const place = (id: string, distanceM: number): KakaoCandidate =>
  ({ kind: 'kakao', placeId: id, name: `가게 ${id}`, lat: 37.5, lng: 126.94, roadAddress: '서울 테스트로 1', distanceM });

const deps = (over: Partial<SuggestDeps> = {}): SuggestDeps => ({
  config: () => Promise.resolve({ radiusM: 150, accuracyMaxM: 150 }),
  nearbyMine: () => Promise.resolve([]),
  kakaoNearby: () => Promise.resolve([]),
  kakaoAddress: () => Promise.resolve('서울 테스트로 1'),
  ...over,
});
const input = { lat: 37.5, lng: 126.94, accuracy: 20 };

Deno.test('GPS가 약하면 후보 없이 weak_gps, 조회도 안 한다', async () => {
  let called = false;
  const r = await suggestPlace({ ...input, accuracy: 200 }, deps({ nearbyMine: () => ((called = true), Promise.resolve([])) }));
  assertEquals(r, { status: 'weak_gps' });
  assertEquals(called, false);
});

Deno.test('내 아지트가 카카오보다 먼저, 각각 거리순, 최대 5개', async () => {
  const r = await suggestPlace(input, deps({
    nearbyMine: () => Promise.resolve([mine('m2', 90), mine('m1', 40)]),
    kakaoNearby: () => Promise.resolve([place('p3', 70), place('p1', 5), place('p2', 30), place('p4', 100)]),
  }));
  assertEquals(r.status, 'ok');
  if (r.status !== 'ok') return;
  assertEquals(r.candidates.map((c) => (c.kind === 'mine' ? c.aidutId : c.placeId)), ['m1', 'm2', 'p1', 'p2', 'p3']);
  assertEquals(r.hereAddress, '서울 테스트로 1');
  assertEquals('kakaoPlaceId' in r.candidates[0], false); // 내부 필드는 응답에 새지 않는다
});

Deno.test('이미 내 아지트인 카카오 장소는 중복으로 안 나온다', async () => {
  const r = await suggestPlace(input, deps({
    nearbyMine: () => Promise.resolve([mine('m1', 10, 'p1')]),
    kakaoNearby: () => Promise.resolve([place('p1', 10), place('p2', 20)]),
  }));
  if (r.status !== 'ok') throw new Error('expected ok');
  assertEquals(r.candidates.map((c) => (c.kind === 'mine' ? c.aidutId : c.placeId)), ['m1', 'p2']);
});

Deno.test('카카오가 실패해도 내 아지트만으로 응답한다', async () => {
  const r = await suggestPlace(input, deps({
    nearbyMine: () => Promise.resolve([mine('m1', 10)]),
    kakaoNearby: () => Promise.reject(new Error('kakao 500')),
    kakaoAddress: () => Promise.reject(new Error('kakao 500')),
  }));
  assertEquals(r, { status: 'ok', hereAddress: null, candidates: [{ kind: 'mine', aidutId: 'm1', name: '내 m1', grade: 'paw', distanceM: 10 }] });
});

Deno.test({
  name: '느린 카카오(무응답)는 타임아웃 후 빈 목록',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const hang = (_u: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const started = Date.now();
    const r = await kakaoNearby(37.5, 126.94, 150, hang as typeof fetch, 'k', 50);
    assertEquals(r, []);
    assertEquals(Date.now() - started < 1000, true);
  },
});

Deno.test({
  name: 'kakaoNearby: 카테고리 응답을 합치고 id로 중복 제거, 실패한 카테고리는 건너뛴다',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let n = 0;
    const fake = (url: string | URL | Request) => {
      n++;
      if (String(url).includes('category_group_code=FD6')) return Promise.resolve(new Response('x', { status: 500 }));
      const doc = { id: 'p1', place_name: '테스트 카페', x: '126.9401', y: '37.5001', road_address_name: '서울 테스트로 1', distance: '12' };
      return Promise.resolve(new Response(JSON.stringify({ documents: [doc] }), { status: 200 }));
    };
    const r = await kakaoNearby(37.5, 126.94, 150, fake as typeof fetch, 'k');
    assertEquals(n > 1, true);
    assertEquals(r, [{ kind: 'kakao', placeId: 'p1', name: '테스트 카페', lat: 37.5001, lng: 126.9401, roadAddress: '서울 테스트로 1', distanceM: 12 }]);
  },
});

Deno.test({
  name: 'kakaoAddress: 도로명 우선, 없으면 지번, 실패면 null',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const ok = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    assertEquals(await kakaoAddress(37.5, 126.94, ok({ documents: [{ road_address: { address_name: '도로명 1' }, address: { address_name: '지번 1' } }] }) as typeof fetch, 'k'), '도로명 1');
    assertEquals(await kakaoAddress(37.5, 126.94, ok({ documents: [{ road_address: null, address: { address_name: '지번 1' } }] }) as typeof fetch, 'k'), '지번 1');
    assertEquals(await kakaoAddress(37.5, 126.94, (() => Promise.resolve(new Response('x', { status: 401 }))) as typeof fetch, 'k'), null);
  },
});

Deno.test('parseInput: 숫자 셋이 아니거나 범위 밖이면 null', () => {
  assertEquals(parseInput({ lat: 37.5, lng: 126.94, accuracy: 10 }), { lat: 37.5, lng: 126.94, accuracy: 10 });
  assertEquals(parseInput(null), null);
  assertEquals(parseInput('x'), null);
  assertEquals(parseInput({ lat: '37.5', lng: 126.94, accuracy: 10 }), null);
  assertEquals(parseInput({ lat: 95, lng: 126.94, accuracy: 10 }), null);
  assertEquals(parseInput({ lat: 37.5, lng: 126.94 }), null);
});
