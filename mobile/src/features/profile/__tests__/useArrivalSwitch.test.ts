// mobile/src/features/profile/__tests__/useArrivalSwitch.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { arrivalSwitchState, setArrivalEnabled } from '@/features/arrival/register';
import { readMapCache } from '@/features/map/mapCache';
import { useArrivalSwitch } from '../useArrivalSwitch';

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@/features/arrival/register', () => ({ arrivalSwitchState: jest.fn(), setArrivalEnabled: jest.fn() }));
jest.mock('@/features/map/mapCache', () => ({ readMapCache: jest.fn() }));

const cafe = { id: 'a1', name: 'A', grade: 'box', footprintCount: 2, lat: 37.5, lng: 127, lastVisitedAt: null };

beforeEach(() => {
  jest.clearAllMocks();
  (arrivalSwitchState as jest.Mock).mockResolvedValue({ on: true });
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [cafe], thresholds: null, fog: null });
});

test('보일 때 상태를 읽는다', async () => {
  const { result } = await renderHook(() => useArrivalSwitch());
  await waitFor(() => expect(result.current.on).toBe(true));
});

test('켜기는 저장본 아지트로, 설정이 필요하면 안내', async () => {
  (arrivalSwitchState as jest.Mock).mockResolvedValue({ on: false });
  (setArrivalEnabled as jest.Mock).mockResolvedValueOnce('needs_settings').mockResolvedValueOnce('on');
  const { result } = await renderHook(() => useArrivalSwitch());
  await act(async () => result.current.toggle(true));
  expect(setArrivalEnabled).toHaveBeenCalledWith(true, [cafe]);
  expect(result.current).toMatchObject({ on: false, needsSettings: true });
  await act(async () => result.current.toggle(true));
  expect(result.current).toMatchObject({ on: true, needsSettings: false });
});

test('끄기', async () => {
  (setArrivalEnabled as jest.Mock).mockResolvedValue('off');
  const { result } = await renderHook(() => useArrivalSwitch());
  await waitFor(() => expect(result.current.on).toBe(true));
  await act(async () => result.current.toggle(false));
  expect(setArrivalEnabled).toHaveBeenCalledWith(false, [cafe]);
  expect(result.current.on).toBe(false);
});
