// mobile/src/features/checkin/__tests__/useCheckin.test.ts
import { act, renderHook } from '@testing-library/react-native';
import * as api from '../checkinApi';
import { CheckinError } from '../errors';
import { useCheckin } from '../useCheckin';

// Not requireActual: the real module imports the Supabase client, which needs env vars.
jest.mock('../checkinApi', () => ({ getFreshFix: jest.fn(), suggestPlace: jest.fn(), submitCheckin: jest.fn() }));

const fix = { lat: 37.5, lng: 126.9, accuracy: 12 };
const cand = { kind: 'kakao' as const, placeId: 'p1', name: '카페', lat: 37.5, lng: 126.9, roadAddress: null, distanceM: 10 };
const ok = { status: 'ok' as const, hereAddress: '서울 1', candidates: [cand] };
const result = { aidutId: 'a1', name: '카페', footprintCount: 1, grade: 'paw' as const, gradeChanged: false, newCellsCleared: 1 };
const getFix = api.getFreshFix as jest.Mock;
const suggest = api.suggestPlace as jest.Mock;
const submit = api.submitCheckin as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getFix.mockResolvedValue(fix);
  suggest.mockResolvedValue(ok);
  submit.mockResolvedValue(result);
});

test('시작 → 후보 고르기 → 발자국 → 축하', async () => {
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toEqual({ name: 'choosing', fix, hereAddress: '서울 1', candidates: [cand], busy: false, error: null });
  await act(async () => h.current.choose({ kind: 'new', roadAddress: '서울 1' }));
  expect(submit).toHaveBeenCalledWith(fix, { kind: 'new', roadAddress: '서울 1' });
  expect(h.current.state).toEqual({ name: 'celebrating', result });
  await act(async () => h.current.close());
  expect(h.current.state).toEqual({ name: 'idle' });
});

test('GPS 약함은 자동으로 한 번 더, 그래도 약하면 안내', async () => {
  suggest.mockResolvedValue({ status: 'weak_gps' });
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(getFix).toHaveBeenCalledTimes(2);
  expect(h.current.state).toEqual({ name: 'failed', message: '잠깐, 위치를 확인하고 있어요…', needsSettings: false });
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
    message: '위치가 꺼져 있어서 발자국을 남기기 어려워요. 켜두시면 제가 도와드릴게요.',
    needsSettings: true,
  });
  expect(suggest).not.toHaveBeenCalled();
});

test('후보 조회 실패 → 멈추지 않고 다시 시도할 수 있는 안내', async () => {
  suggest.mockRejectedValue(new CheckinError('unknown'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  expect(h.current.state).toEqual({ name: 'failed', message: '앗, 잠깐 문제가 생겼어요. 다시 해볼까요?', needsSettings: false });
  suggest.mockResolvedValue(ok);
  await act(async () => h.current.start());
  expect(h.current.state.name).toBe('choosing');
});

test('기록 거절 → 시트는 열린 채 안내(다른 후보 고르기 가능)', async () => {
  submit.mockRejectedValue(new CheckinError('too_far'));
  const { result: h } = await renderHook(() => useCheckin());
  await act(async () => h.current.start());
  await act(async () => h.current.choose({ kind: 'mine', aidutId: 'a1' }));
  expect(h.current.state).toMatchObject({ name: 'choosing', busy: false, error: '조금만 더 가까이 가면 발자국을 남길 수 있어요.' });
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
    expect(h.current.state).toEqual({ name: 'failed', message: '앗, 잠깐 문제가 생겼어요. 다시 해볼까요?', needsSettings: false });
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
