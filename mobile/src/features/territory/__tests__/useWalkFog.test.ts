// mobile/src/features/territory/__tests__/useWalkFog.test.ts
import { renderHook } from '@testing-library/react-native';
import { clearFogAt } from '../territoryApi';
import { useWalkFog } from '../useWalkFog';

jest.mock('../territoryApi', () => ({ clearFogAt: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));

const m = 1 / 111320; // 위도 1m
const at = (north: number, accuracy = 10) => ({ lat: 37.5 + north * m, lng: 126.9, accuracy });

beforeEach(() => jest.clearAllMocks());

test('움직일 때마다 그 칸을 걷고, 새로 걷혔을 때만 알린다', async () => {
  (clearFogAt as jest.Mock).mockResolvedValueOnce(true).mockResolvedValue(false);
  const onCleared = jest.fn();
  const { rerender } = await renderHook(({ l }: { l: ReturnType<typeof at> | null }) => useWalkFog(l, onCleared), { initialProps: { l: at(0) } });
  expect(clearFogAt).toHaveBeenCalledWith(at(0));
  expect(onCleared).toHaveBeenCalledTimes(1);
  await rerender({ l: at(10) }); // 조금 움직인 것은 보내지 않는다
  expect(clearFogAt).toHaveBeenCalledTimes(1);
  await rerender({ l: at(40) });
  expect(clearFogAt).toHaveBeenCalledTimes(2);
  expect(onCleared).toHaveBeenCalledTimes(1); // 이미 걷힌 칸
});

test('위치를 모르거나 흐리면 보내지 않는다', async () => {
  const { rerender } = await renderHook(({ l }: { l: ReturnType<typeof at> | null }) => useWalkFog(l, jest.fn()), { initialProps: { l: null as ReturnType<typeof at> | null } });
  await rerender({ l: at(0, 80) });
  expect(clearFogAt).not.toHaveBeenCalled();
});

test('못 보냈으면 다음 위치에서 다시 보낸다', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (clearFogAt as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(false);
  const { rerender } = await renderHook(({ l }: { l: ReturnType<typeof at> | null }) => useWalkFog(l, jest.fn()), { initialProps: { l: at(0) } });
  await rerender({ l: at(5) });
  expect(clearFogAt).toHaveBeenCalledTimes(2);
});
