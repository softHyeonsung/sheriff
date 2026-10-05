// mobile/src/features/checkin/__tests__/offline.test.ts
import { readMapCache } from '@/features/map/mapCache';
import { isOffline } from '@/lib/network';
import { suggestPlace } from '../checkinApi';
import { CheckinError } from '../errors';
import { offlineCandidates, suggestOrOffline } from '../offline';

jest.mock('@/lib/network', () => ({ isOffline: jest.fn() }));
jest.mock('@/features/map/mapCache', () => ({ readMapCache: jest.fn() }));
// Not requireActual: the real module imports the Supabase client, which needs env vars.
jest.mock('../checkinApi', () => ({ suggestPlace: jest.fn() }));

const fix = { lat: 37.5, lng: 127, accuracy: 20 };
const at = (id: string, dLatM: number, grade = 'box') => ({
  id, name: id, grade, footprintCount: 2, lat: 37.5 + dLatM / 111000, lng: 127, lastVisitedAt: null,
}) as const;

beforeEach(() => {
  jest.clearAllMocks();
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [at('far', 200), at('near', 20, 'hut'), at('edge', 49)], thresholds: null, fog: null });
});

test('50m 안 내 아지트만, 가까운 순', () => {
  const c = offlineCandidates(fix, [at('far', 200), at('near', 20, 'hut'), at('edge', 49)] as never);
  expect(c.map((x) => x.aidutId)).toEqual(['near', 'edge']);
  expect(c[0]).toMatchObject({ kind: 'mine', name: 'near', grade: 'hut' });
  expect(c[0].distanceM).toBeGreaterThan(19);
  expect(c[0].distanceM).toBeLessThan(21);
});

test('온라인이면 서버 후보', async () => {
  (isOffline as jest.Mock).mockResolvedValue(false);
  (suggestPlace as jest.Mock).mockResolvedValue({ status: 'ok', hereAddress: '서울 1', candidates: [] });
  expect(await suggestOrOffline(fix)).toEqual({ status: 'ok', hereAddress: '서울 1', candidates: [], offline: false });
  (suggestPlace as jest.Mock).mockResolvedValue({ status: 'weak_gps' });
  expect(await suggestOrOffline(fix)).toEqual({ status: 'weak_gps' });
});

test('오프라인이면 저장본 후보(서버는 안 부름)', async () => {
  (isOffline as jest.Mock).mockResolvedValue(true);
  const s = await suggestOrOffline(fix);
  expect(suggestPlace).not.toHaveBeenCalled();
  expect(s).toMatchObject({ status: 'ok', hereAddress: null, offline: true });
  expect(s.status === 'ok' && s.candidates.map((c) => (c.kind === 'mine' ? c.aidutId : '')).join()).toBe('near,edge');
});

test('온라인 판정인데 연결 실패면 저장본 후보', async () => {
  (isOffline as jest.Mock).mockResolvedValue(false);
  (suggestPlace as jest.Mock).mockRejectedValue(new CheckinError('offline'));
  expect(await suggestOrOffline(fix)).toMatchObject({ status: 'ok', offline: true });
});

test('다른 오류는 그대로 던진다', async () => {
  (isOffline as jest.Mock).mockResolvedValue(false);
  (suggestPlace as jest.Mock).mockRejectedValue(new CheckinError('unknown'));
  await expect(suggestOrOffline(fix)).rejects.toMatchObject({ code: 'unknown' });
});

test('오프라인에서 정확도가 150m보다 나쁘면 GPS 약함', async () => {
  (isOffline as jest.Mock).mockResolvedValue(true);
  expect(await suggestOrOffline({ ...fix, accuracy: 151 })).toEqual({ status: 'weak_gps' });
});
