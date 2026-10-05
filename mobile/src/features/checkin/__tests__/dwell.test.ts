// mobile/src/features/checkin/__tests__/dwell.test.ts
import { type Dwell, DWELL_MS, judgeDwell } from '../dwell';

jest.mock('@/services/supabase', () => ({ supabase: {} }));

const d: Dwell = { fix: { lat: 37.5759, lng: 126.9769, accuracy: 10 }, target: { kind: 'mine', aidutId: 'a1' }, name: '경복궁', until: 1000 + DWELL_MS };
const here = { lat: 37.5759, lng: 126.9769, accuracy: 10 };
const m = 1 / 111320; // 위도 1m

test('3분이 안 됐으면 기다린다', () => {
  expect(judgeDwell(d, { ...here, at: d.until - 1 })).toBe('wait');
});

test('3분 뒤에도 그 자리면 머문 것', () => {
  expect(judgeDwell(d, { ...here, at: d.until })).toBe('stayed');
  expect(judgeDwell(d, { ...here, lat: here.lat + 40 * m, at: d.until })).toBe('stayed');
});

test('기준 거리 밖으로 나갔으면 3분 전이든 뒤든 떠난 것', () => {
  expect(judgeDwell(d, { ...here, lat: here.lat + 80 * m, at: d.until - 60000 })).toBe('left');
  expect(judgeDwell(d, { ...here, lat: here.lat + 80 * m, at: d.until })).toBe('left');
});

test('GPS가 흔들리는 만큼은 봐주되, 기준 거리만큼까지만', () => {
  expect(judgeDwell(d, { ...here, lat: here.lat + 80 * m, accuracy: 40, at: d.until })).toBe('stayed');
  expect(judgeDwell(d, { ...here, lat: here.lat + 120 * m, accuracy: 500, at: d.until })).toBe('left');
});
