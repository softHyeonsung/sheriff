import { act, renderHook } from '@testing-library/react-native';
import { dongAt } from '../territoryApi';
import { useDongAt } from '../useDongAt';

jest.mock('../territoryApi', () => ({ dongAt: jest.fn() }));
const d = (name: string) => ({ code: name, name, stage: 'fog', hideoutCount: 0, exploredCells: 0, totalCells: 100, ratio: 0 });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

const settle = async () => act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); await Promise.resolve(); });

test('멈춘 뒤 300ms에 한 번만 조회', async () => {
  (dongAt as jest.Mock).mockResolvedValue(d('사직동'));
  const { result } = await renderHook(() => useDongAt());
  await act(async () => {
    result.current.onIdle({ lat: 1, lng: 1 });
    result.current.onIdle({ lat: 2, lng: 2 });
  });
  await settle();
  expect(dongAt).toHaveBeenCalledTimes(1);
  expect(dongAt).toHaveBeenCalledWith({ lat: 2, lng: 2 });
  expect(result.current.dong?.name).toBe('사직동');
});

test('늦게 온 옛 응답은 버린다', async () => {
  let resolveOld!: (v: unknown) => void;
  (dongAt as jest.Mock)
    .mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }))
    .mockResolvedValueOnce(d('새동'));
  const { result } = await renderHook(() => useDongAt());
  await act(async () => result.current.onIdle({ lat: 1, lng: 1 }));
  await settle();
  await act(async () => result.current.onIdle({ lat: 2, lng: 2 }));
  await settle();
  await act(async () => { resolveOld(d('옛동')); await Promise.resolve(); });
  expect(result.current.dong?.name).toBe('새동');
});

test('실패하면 이전 값 유지, refresh는 마지막 위치로 다시', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (dongAt as jest.Mock).mockResolvedValueOnce(d('사직동')).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(d('사직동'));
  const { result } = await renderHook(() => useDongAt());
  await act(async () => result.current.onIdle({ lat: 1, lng: 1 }));
  await settle();
  await act(async () => result.current.onIdle({ lat: 3, lng: 3 }));
  await settle();
  expect(result.current.dong?.name).toBe('사직동');
  await act(async () => result.current.refresh());
  await settle();
  expect(dongAt).toHaveBeenLastCalledWith({ lat: 3, lng: 3 });
});
