import { act, renderHook, waitFor } from '@testing-library/react-native';
import { myFog } from '../territoryApi';
import { useMyFog } from '../useMyFog';

jest.mock('../territoryApi', () => ({ myFog: jest.fn() }));
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
const cell = { sw: { lat: 37.5, lng: 126.9 }, ne: { lat: 37.501, lng: 126.901 } };

beforeEach(() => jest.clearAllMocks());

test('걷힌 칸을 불러오고 refresh로 다시', async () => {
  (myFog as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([cell]);
  const { result } = await renderHook(() => useMyFog());
  await waitFor(() => expect(myFog).toHaveBeenCalledTimes(1));
  await act(async () => result.current.refresh());
  expect(result.current.cells).toEqual([cell]);
});

test('실패하면 이전 칸 유지', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (myFog as jest.Mock).mockResolvedValueOnce([cell]).mockRejectedValueOnce(new Error('net'));
  const { result } = await renderHook(() => useMyFog());
  await waitFor(() => expect(result.current.cells).toEqual([cell]));
  await act(async () => result.current.refresh());
  expect(result.current.cells).toEqual([cell]);
});

test('불러오기 전·첫 실패 때는 null(안개 없이 지도만)', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (myFog as jest.Mock).mockRejectedValueOnce(new Error('net'));
  const { result } = await renderHook(() => useMyFog());
  await waitFor(() => expect(myFog).toHaveBeenCalledTimes(1));
  expect(result.current.cells).toBeNull();
});
