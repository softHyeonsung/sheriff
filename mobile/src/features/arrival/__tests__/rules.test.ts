// mobile/src/features/arrival/__tests__/rules.test.ts
import { ARRIVAL, arrivalMessage, decideArrival, pickNearest, type ArrivalRegion } from '../rules';

const at = (h: number, m = 0, d = 29) => new Date(2026, 8, d, h, m).getTime();
const region: ArrivalRegion = { name: '동네 빵집', grade: 'box', lastVisitedAt: null };

test('낮에 처음 오면 보낸다', () => {
  expect(decideArrival(at(14), 'a', region, [])).toBe(true);
});

test('야간 경계는 발송 시각(진입+2분) 기준', () => {
  expect(decideArrival(at(21, 57), 'a', region, [])).toBe(true); // 21:59 발송
  expect(decideArrival(at(21, 59), 'a', region, [])).toBe(false); // 22:01 발송
  expect(decideArrival(at(7, 57), 'a', region, [])).toBe(false); // 07:59 발송
  expect(decideArrival(at(7, 59), 'a', region, [])).toBe(true); // 08:01 발송
});

test('6시간 안에 발자국 남긴 곳은 안 보낸다', () => {
  const visited = (h: number) => ({ ...region, lastVisitedAt: new Date(at(h)).toISOString() });
  expect(decideArrival(at(14), 'a', visited(9), [])).toBe(false); // 발송 14:02, 5시간 2분 전
  expect(decideArrival(at(14), 'a', visited(8), [])).toBe(true); // 6시간 2분 전
});

test('같은 곳에 6시간 안에 보냈거나 예약돼 있으면 안 보낸다(진입 이벤트 중복 포함)', () => {
  expect(decideArrival(at(14), 'a', region, [{ id: 'a', at: at(14, 2) }])).toBe(false);
  expect(decideArrival(at(14), 'a', region, [{ id: 'a', at: at(9) }])).toBe(false);
  expect(decideArrival(at(14), 'a', region, [{ id: 'a', at: at(8) }])).toBe(true);
  expect(decideArrival(at(14), 'a', region, [{ id: 'b', at: at(14, 2) }])).toBe(true);
});

test('오늘 8번 보냈으면 안 보낸다, 어제 것은 안 센다', () => {
  const today = Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, at: at(9 + (i % 4), i) }));
  expect(decideArrival(at(14), 'a', region, today)).toBe(false);
  expect(decideArrival(at(14), 'a', region, today.slice(1))).toBe(true);
  const yesterday = today.map((e) => ({ ...e, at: e.at - 24 * 3600 * 1000 }));
  expect(decideArrival(at(14), 'a', region, yesterday)).toBe(true);
});

test('pickNearest는 가까운 순으로 n개', () => {
  const origin = { lat: 37.5, lng: 127 };
  const items = [
    { id: 'far', lat: 37.6, lng: 127 },
    { id: 'near', lat: 37.5001, lng: 127 },
    { id: 'mid', lat: 37.51, lng: 127 },
  ];
  expect(pickNearest(items, origin, 2).map((i) => i.id)).toEqual(['near', 'mid']);
  expect(pickNearest(items, origin, ARRIVAL.maxRegions)).toHaveLength(3);
});

test('문구: 작은 집 이상은 단골 문구', () => {
  expect(arrivalMessage('동네 빵집', 'paw')).toBe('동네 빵집 오셨네요. 발자국 남길까요?');
  expect(arrivalMessage('동네 빵집', 'box')).toBe('동네 빵집 오셨네요. 발자국 남길까요?');
  expect(arrivalMessage('동네 빵집', 'hut')).toBe('또 왔네요, 동네 빵집. 여기 자주 오시네요 :)');
  expect(arrivalMessage('동네 빵집', 'palace')).toBe('또 왔네요, 동네 빵집. 여기 자주 오시네요 :)');
});

test('찜한 곳 문구', () => {
  expect(arrivalMessage('찜한 카페', 'paw', true)).toBe('가고 싶다던 찜한 카페, 드디어 왔어요!');
});
