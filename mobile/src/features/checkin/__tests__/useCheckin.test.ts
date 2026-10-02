// mobile/src/features/checkin/__tests__/useCheckin.test.ts
import { act, renderHook } from '@testing-library/react-native';
import { cancelArrivalAlert } from '@/features/arrival/task';
import * as api from '../checkinApi';
import { suggestOrOffline } from '../offline';
import { enqueueCheckin } from '../queue';
import { isOffline } from '@/lib/network';
import { CheckinError } from '../errors';
import { useCheckin } from '../useCheckin';

// Not requireActual: the real module imports the Supabase client, which needs env vars.
jest.mock('../checkinApi', () => ({ getFreshFix: jest.fn(), submitCheckin: jest.fn() }));
jest.mock('../offline', () => ({ suggestOrOffline: jest.fn() }));
jest.mock('../queue', () => ({ enqueueCheckin: jest.fn() }));
jest.mock('@/lib/network', () => ({ isOffline: jest.fn() }));

jest.mock('@/features/arrival/task', () => ({ cancelArrivalAlert: jest.fn() }));

const fix = { lat: 37.5, lng: 126.9, accuracy: 12 };
const cand = { kind: 'kakao' as const, placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: null, distanceM: 10 };
const ok = { status: 'ok' as const, hereAddress: '서울 1', candidates: [cand], offline: false };
const result = { aidutId: 'a1', name: '카페', footprintCount: 1, grade: 'paw' as const, gradeChanged: false, newCellsCleared: 1 };
const getFix = api.getFreshFix as jest.Mock;
const suggest = suggestOrOffline as jest.Mock;
const submit = api.submitCheckin as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getFix.mockResolvedValue(fix);
  suggest.mockResolvedValue(ok);
  submit.mockResolvedValue(result);
  (enqueueCheckin as jest.Mock).mockResolvedValue(undefined);
  (isOffline as jest.Mock).mockResolvedValue(true);
  (cancelArrivalAlert as jest.Mock).mockResolvedValue(undefined);
});

test('시작 → 후보 고르기 → 발자국 → 축하', async () => {
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toEqual({ name: 'choosing', fix, hereAddress: '서울 1', candidates: [cand], offline: false, busy: false, error: null });
  await act(async () => h.current.choose({ kind: 'new', roadAddress: '서울 1' }));
  expect(submit).toHaveBeenCalledWith(fix, { kind: 'new', roadAddress: '서울 1' });
  expect(h.current.state).toEqual({ name: 'celebrating', result, fix });
  await act(async () => h.current.close());
  expect(h.current.state).toEqual({ name: 'idle' });
});

test('GPS 약함은 자동으로 한 번 더, 그래도 약하면 안내', async () => {
  suggest.mockResolvedValue({ status: 'weak_gps' });
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(getFix).toHaveBeenCalledTimes(2);
  expect(h.current.state).toEqual({ name: 'failed', message: '잠깐, 위치를 확인하고 있다냥…', needsSettings: false });
});

test('GPS 약함 뒤 두 번째에 잡히면 그대로 진행', async () => {
  suggest.mockResolvedValueOnce({ status: 'weak_gps' }).mockResolvedValueOnce(ok);
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state.name).toBe('choosing');
});

test('위치 권한 없음 → 설정 안내', async () => {
  getFix.mockResolvedValue('denied');
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toEqual({
    name: 'failed',
    message: '위치가 꺼져 있어서 발자국을 남기기 어렵다냥. 켜두면 내가 도와줄게냥.',
    needsSettings: true,
  });
  expect(suggest).not.toHaveBeenCalled();
});

test('후보 조회 실패 → 멈추지 않고 다시 시도할 수 있는 안내', async () => {
  suggest.mockRejectedValue(new CheckinError('unknown'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toEqual({ name: 'failed', message: '앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?', needsSettings: false });
  suggest.mockResolvedValue(ok);
  await act(async () => h.current.start());
  expect(h.current.state.name).toBe('choosing');
});

test('기록 거절 → 시트는 열린 채 안내(다른 후보 고르기 가능)', async () => {
  submit.mockRejectedValue(new CheckinError('too_far'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(h.current.state).toMatchObject({ name: 'choosing', busy: false, error: '조금만 더 가까이 가면 발자국을 남길 수 있다냥.' });
});

test('진행 중 두 번째 요청 무시(연타)', async () => {
  let release: (v: typeof result) => void = () => {};
  submit.mockReturnValue(new Promise((r) => (release = r)));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => {
    void h.current.choose({ kind: 'new', roadAddress: null });
    void h.current.choose({ kind: 'new', roadAddress: null });
  });
  expect(h.current.state).toMatchObject({ name: 'choosing', busy: true });
  await act(async () => release(result));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(h.current.state.name).toBe('celebrating');

  getFix.mockClear();
  await act(async () => h.current.close());
  await act(async () => {
    void h.current.start();
    void h.current.start();
  });
  expect(getFix).toHaveBeenCalledTimes(1);
});

test('위치가 응답 없이 멈추면 제한 시간 뒤 다시 시도할 수 있는 안내', async () => {
  jest.useFakeTimers();
  try {
    getFix.mockReturnValue(new Promise(() => {}));
    const { result: h } = await renderHook(() => useCheckin());
    await act(async () => {
      void h.current.start();
    });
    expect(h.current.state).toEqual({ name: 'locating' });
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    expect(h.current.state).toEqual({ name: 'failed', message: '앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?', needsSettings: false });
  } finally {
    jest.useRealTimers();
  }
});

test('위치 확인 중에 닫으면 늦게 온 결과는 무시하고 다시 시작할 수 있다', async () => {
  let resolveFix: (v: typeof fix) => void = () => {};
  getFix.mockReturnValueOnce(new Promise((r) => (resolveFix = r)));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => {
    void h.current.start();
  });
  await act(async () => h.current.close());
  await act(async () => resolveFix(fix));
  expect(h.current.state).toEqual({ name: 'idle' });
  await act(async () => h.current.start());
  expect(h.current.state.name).toBe('choosing');
});

test('거절 뒤 다시 누르면 새 위치로 보낸다(가까이 걸어온 경우)', async () => {
  const closer = { lat: 37.5009, lng: 126.9, accuracy: 8 };
  submit.mockRejectedValueOnce(new CheckinError('too_far')).mockResolvedValueOnce(result);
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  getFix.mockResolvedValue(closer);
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(submit).toHaveBeenLastCalledWith(closer, { kind: 'mine', aidutId: 'a1' });
  expect(h.current.state.name).toBe('celebrating');
});

test('발자국을 남기면 그곳 도착 알림 예약을 취소한다(실패해도 축하는 그대로)', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (cancelArrivalAlert as jest.Mock).mockRejectedValueOnce(new Error('nope'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'new', roadAddress: '서울 1' }));
  expect(cancelArrivalAlert).toHaveBeenCalledWith('a1');
  expect(h.current.state).toEqual({ name: 'celebrating', result, fix });
});

const mine = { kind: 'mine' as const, aidutId: 'a1', name: '단골 카페', grade: 'box' as const, distanceM: 20 };

test('오프라인 후보에서 고르면 대기열에 챙기고 queued(서버엔 안 보냄)', async () => {
  suggest.mockResolvedValue({ status: 'ok', hereAddress: null, candidates: [mine], offline: true });
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toMatchObject({ name: 'choosing', offline: true });
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(enqueueCheckin).toHaveBeenCalledWith({ fix, target: { kind: 'mine', aidutId: 'a1' }, name: '단골 카페' });
  expect(submit).not.toHaveBeenCalled();
  expect(h.current.state).toEqual({ name: 'queued' });
});

test('오프라인 새로 만들기는 "새 아지트"로 챙긴다', async () => {
  suggest.mockResolvedValue({ status: 'ok', hereAddress: null, candidates: [], offline: true });
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'new', roadAddress: null }));
  expect(enqueueCheckin).toHaveBeenCalledWith({ fix, target: { kind: 'new', roadAddress: null }, name: '새 아지트' });
});

test('온라인 제출이 연결 실패면 고른 발자국을 챙긴다', async () => {
  submit.mockRejectedValue(new CheckinError('offline'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'kakao', placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: null }));
  expect(enqueueCheckin).toHaveBeenCalledWith({
    fix,
    target: { kind: 'kakao', placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: null },
    name: '카페',
  });
  expect(h.current.state).toEqual({ name: 'queued' });
});

test('챙기기(파일 쓰기)가 실패하면 시트에 안내', async () => {
  suggest.mockResolvedValue({ status: 'ok', hereAddress: null, candidates: [mine], offline: true });
  (enqueueCheckin as jest.Mock).mockRejectedValue(new Error('disk'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(h.current.state).toMatchObject({ name: 'choosing', busy: false, error: '앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?' });
});

test('오프라인 후보였어도 고를 때 연결돼 있으면 바로 보낸다(느린 서버로 오프라인 후보가 뜬 경우)', async () => {
  suggest.mockResolvedValue({ status: 'ok', hereAddress: null, candidates: [mine], offline: true });
  (isOffline as jest.Mock).mockResolvedValue(false);
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(submit).toHaveBeenCalledWith(fix, { kind: 'mine', aidutId: 'a1' });
  expect(enqueueCheckin).not.toHaveBeenCalled();
  expect(h.current.state).toEqual({ name: 'celebrating', result, fix });
});

test('내 아지트를 챙기면 그곳 도착 알림 예약도 거둔다', async () => {
  suggest.mockResolvedValue({ status: 'ok', hereAddress: null, candidates: [mine], offline: true });
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(cancelArrivalAlert).toHaveBeenCalledWith('a1');
});

test('카카오 장소에 남기면 그 장소의 찜 도착 알림도 거둔다', async () => {
  (isOffline as jest.Mock).mockResolvedValue(false);
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'kakao', placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: null }));
  expect(cancelArrivalAlert).toHaveBeenCalledWith('a1');
  expect(cancelArrivalAlert).toHaveBeenCalledWith('wish:p1');
});
