// supabase/functions/suggest-course/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { type Deps, flattenRoute, handle, kakaoRoute, pickStops, tourNearby } from './index.ts';

const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
const me = { lat: 37.5, lng: 127 };
// 위도 0.001 ≈ 111m
const spot = (name: string, dLat: number) => ({ name, address: null, lat: 37.5 + dLat, lng: 127 });
const deps = (over: Partial<Deps> = {}): Deps => ({
  signedIn: () => Promise.resolve(true),
  candidates: () => Promise.resolve([spot('가', 0.002), spot('나', 0.004)]),
  hideouts: () => Promise.resolve([]),
  useCall: () => Promise.resolve(true),
  directions: () => Promise.resolve({ route: [[37.5, 127], [37.502, 127]], distanceM: 450 }),
  ...over,
});

Deno.test('pickStops: 가까운 곳부터 이어 최대 4곳, 구간 거리', () => {
  const r = pickStops(me, [spot('e', 0.009), spot('c', 0.005), spot('a', 0.001), spot('d', 0.007), spot('b', 0.003)], []);
  assertEquals(r.map((s) => s.name), ['a', 'b', 'c', 'd']);
  assertEquals(r[0].legM > 100 && r[0].legM < 120, true);
  assertEquals(r[1].legM > 210 && r[1].legM < 235, true); // a에서 b까지
});

Deno.test('pickStops: 내 아지트 50m 안은 가본 곳이라 빠지고, 채우지 않는다', () => {
  const r = pickStops(me, [spot('가본곳', 0.001), spot('새곳', 0.003)], [{ lat: 37.5012, lng: 127 }]);
  assertEquals(r.map((s) => s.name), ['새곳']);
  assertEquals(pickStops(me, [], []), []);
});

Deno.test('pickStops: 같은 자리(30m 안) 항목은 한 곳만', () => {
  const r = pickStops(me, [spot('박물관', 0.002), spot('박물관 안 스크린', 0.0021), spot('공원', 0.004)], []);
  assertEquals(r.map((s) => s.name), ['박물관', '공원']);
});

Deno.test('flattenRoute: [경도,위도,…]를 [위도,경도]로, 500점 넘으면 솎되 끝점 유지', () => {
  assertEquals(flattenRoute([{ roads: [{ vertexes: [127, 37.5, 127.1, 37.6] }] }, { roads: [{ vertexes: [127.2, 37.7] }] }]), [
    [37.5, 127], [37.6, 127.1], [37.7, 127.2],
  ]);
  const long = Array.from({ length: 1200 }, (_, i) => [127 + i / 1e5, 37.5]).flat();
  const thin = flattenRoute([{ roads: [{ vertexes: long }] }]);
  assertEquals(thin.length, 500);
  assertEquals(thin[0], [37.5, 127]);
  assertEquals(thin[499], [37.5, 127 + 1199 / 1e5]);
});

Deno.test('tourNearby: 요청 주소·후보 모양, 0건(items="")·좌표 없는 항목', async () => {
  let called = '';
  const fake = (body: unknown) => ((url: string) => {
    called = url;
    return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body)));
  }) as unknown as typeof fetch;
  const ok = { response: { header: { resultCode: '0000' }, body: { items: { item: [
    { title: '세종로공원', addr1: '서울 종로구 세종대로 189', mapx: '126.9759', mapy: '37.5734' },
    { title: '좌표 없음', addr1: '', mapx: '', mapy: '' },
  ] } } } };
  assertEquals(await tourNearby(me, fake(ok), 'K'), [{ name: '세종로공원', address: '서울 종로구 세종대로 189', lat: 37.5734, lng: 126.9759 }]);
  for (const part of ['KorService2/locationBasedList2', 'serviceKey=K', 'mapX=127', 'mapY=37.5', 'radius=2000', 'arrange=E', 'contentTypeId=12', '_type=json']) {
    assertEquals(called.includes(part), true, part);
  }
  assertEquals(await tourNearby(me, fake({ response: { header: { resultCode: '0000' }, body: { items: '' } } }), 'K'), []);
  let threw = 0;
  await tourNearby(me, fake({ response: { header: { resultCode: '0030' } } }), 'K').catch(() => threw++);
  await tourNearby(me, fake('<OpenAPI_ServiceResponse>SERVICE ERROR</OpenAPI_ServiceResponse>'), 'K').catch(() => threw++);
  assertEquals(threw, 2);
});

Deno.test('kakaoRoute: 출발·경유·도착, 실패 코드는 null', async () => {
  let called = '';
  const fake = (body: unknown) => ((url: string) => {
    called = decodeURIComponent(url);
    return Promise.resolve(new Response(JSON.stringify(body)));
  }) as unknown as typeof fetch;
  const pts = [me, { lat: 37.51, lng: 127.01 }, { lat: 37.52, lng: 127.02 }];
  const good = { routes: [{ result_code: 0, summary: { distance: 2650 }, sections: [{ roads: [{ vertexes: [127, 37.5, 127.02, 37.52] }] }] }] };
  assertEquals(await kakaoRoute(pts, fake(good), 'k'), { route: [[37.5, 127], [37.52, 127.02]], distanceM: 2650 });
  assertEquals(called.includes('origin=127,37.5') && called.includes('destination=127.02,37.52') && called.includes('waypoints=127.01,37.51'), true);
  assertEquals(await kakaoRoute(pts, fake({ routes: [{ result_code: 104, result_msg: '너무 가까움' }] }), 'k'), null);
  assertEquals(await kakaoRoute([me], fake(good), 'k'), null);
});

Deno.test('handle: 로그인·입력 검사', async () => {
  assertEquals((await handle(req(me), deps({ signedIn: () => Promise.resolve(false) }))).status, 401);
  assertEquals((await handle(req({ lat: 95, lng: 127 }), deps())).status, 400);
  assertEquals((await handle(req({ lat: '37.5', lng: 127 }), deps())).status, 400);
  assertEquals((await handle(new Request('http://x', { method: 'POST', body: 'x' }), deps())).status, 400);
});

Deno.test('handle: 코스 + 경로', async () => {
  let asked: unknown;
  const res = await handle(req(me), deps({ directions: (p) => { asked = p; return Promise.resolve({ route: [[37.5, 127], [37.504, 127]], distanceM: 450 }); } }));
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.stops.map((s: { name: string }) => s.name), ['가', '나']);
  assertEquals(body.route, [[37.5, 127], [37.504, 127]]);
  assertEquals(body.distanceM, 450);
  assertEquals(body.routeLimited, false);
  assertEquals((asked as unknown[]).length, 3); // 현재 위치 + 2곳
});

Deno.test('handle: 한도를 넘으면 길찾기를 부르지 않고 핀만', async () => {
  let called = 0;
  const res = await handle(req(me), deps({ useCall: () => Promise.resolve(false), directions: () => { called++; return Promise.resolve(null); } }));
  const body = await res.json();
  assertEquals([res.status, body.stops.length, body.route, body.routeLimited, called], [200, 2, null, true, 0]);
});

Deno.test('handle: 길찾기·한도 확인 실패는 핀만(200)', async () => {
  for (const over of [{ directions: () => Promise.reject(new Error('navi 500')) }, { directions: () => Promise.resolve(null) }, { useCall: () => Promise.reject(new Error('db')) }]) {
    const res = await handle(req(me), deps(over));
    const body = await res.json();
    assertEquals([res.status, body.stops.length, body.route, body.routeLimited], [200, 2, null, false]);
  }
});

Deno.test('handle: 후보 0이면 한도를 쓰지 않는다', async () => {
  let used = 0;
  const res = await handle(req(me), deps({ candidates: () => Promise.resolve([]), useCall: () => { used++; return Promise.resolve(true); } }));
  assertEquals(await res.json(), { stops: [], route: null, distanceM: null, routeLimited: false });
  assertEquals(used, 0);
});

Deno.test('handle: TourAPI·아지트 조회 실패는 502', async () => {
  assertEquals((await handle(req(me), deps({ candidates: () => Promise.reject(new Error('tourapi 500')) }))).status, 502);
  assertEquals((await handle(req(me), deps({ hideouts: () => Promise.reject(new Error('db')) }))).status, 502);
});

Deno.test('tourNearby: 결과가 하나라 item이 배열이 아니어도 읽는다', async () => {
  const one = { response: { header: { resultCode: '0000' }, body: { items: { item: { title: '세종로공원', addr1: '', mapx: '126.9759', mapy: '37.5734' } } } } };
  const fake = (() => Promise.resolve(new Response(JSON.stringify(one)))) as unknown as typeof fetch;
  assertEquals(await tourNearby(me, fake, 'K'), [{ name: '세종로공원', address: null, lat: 37.5734, lng: 126.9759 }]);
});

Deno.test('handle: 오류 기록에 TourAPI 키가 남지 않는다', async () => {
  const logged: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { logged.push(a.map(String).join(' ')); };
  try {
    const leaky = new TypeError('error sending request for url (https://apis.data.go.kr/x?serviceKey=SECRETKEY&MobileOS=ETC)');
    assertEquals((await handle(req(me), deps({ candidates: () => Promise.reject(leaky) }))).status, 502);
  } finally {
    console.error = orig;
  }
  assertEquals(logged.length, 1);
  assertEquals(logged[0].includes('SECRETKEY'), false);
  assertEquals(logged[0].includes('serviceKey=***'), true);
});
