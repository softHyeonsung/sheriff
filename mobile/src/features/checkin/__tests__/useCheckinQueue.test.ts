// mobile/src/features/checkin/__tests__/useCheckinQueue.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { cancelArrivalAlert } from '@/features/arrival/task';
import { onOnline } from '@/lib/network';
import { submitCheckin } from '../checkinApi';
import { flushQueue, readQueue } from '../queue';
import { useCheckinQueue } from '../useCheckinQueue';

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@/lib/network', () => ({ onOnline: jest.fn() }));
jest.mock('@/features/arrival/task', () => ({ cancelArrivalAlert: jest.fn() }));
jest.mock('../checkinApi', () => ({ submitCheckin: jest.fn() }));
jest.mock('../queue', () => ({ flushQueue: jest.fn(), readQueue: jest.fn() }));

const flush = flushQueue as jest.Mock;
const result = (id: string) => ({ aidutId: id, name: id, footprintCount: 2, grade: 'box', gradeChanged: true, newCellsCleared: 0 });
let online: () => void = () => {};
let appState: (s: string) => void = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  (readQueue as jest.Mock).mockResolvedValue([]);
  flush.mockResolvedValue({ results: [], dropped: 0 });
  (cancelArrivalAlert as jest.Mock).mockResolvedValue(undefined);
  (onOnline as jest.Mock).mockImplementation((cb: () => void) => {
    online = cb;
    return jest.fn();
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, cb) => {
    appState = cb as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
});

test('보이면 올리고, 결과는 축하 목록으로, 한 번 새로고침', async () => {
  flush.mockResolvedValueOnce({ results: [result('a'), result('b')], dropped: 1 });
  (readQueue as jest.Mock).mockResolvedValue([{ id: 'x' }]);
  const onSynced = jest.fn();
  const { result: h } = await renderHook(() => useCheckinQueue(onSynced));
  await waitFor(() => expect(h.current.celebrations).toHaveLength(2));
  expect(flush).toHaveBeenCalledWith(submitCheckin);
  expect(onSynced).toHaveBeenCalledTimes(1);
  expect(cancelArrivalAlert).toHaveBeenCalledWith('a'); // 올라간 곳의 도착 알림은 늦은 말
  expect(cancelArrivalAlert).toHaveBeenCalledWith('b');
  expect(h.current.dropped).toBe(1);
  await waitFor(() => expect(h.current.pending).toBe(1));
  await act(async () => h.current.next());
  expect(h.current.celebrations.map((r) => r.aidutId)).toEqual(['b']);
  await act(async () => h.current.clearDropped());
  expect(h.current.dropped).toBe(0);
});

test('다시 연결되거나 앱이 앞으로 나오면 올린다', async () => {
  await renderHook(() => useCheckinQueue(jest.fn()));
  await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
  await act(async () => online());
  await waitFor(() => expect(flush).toHaveBeenCalledTimes(2));
  await act(async () => appState('background'));
  await act(async () => appState('active'));
  await waitFor(() => expect(flush).toHaveBeenCalledTimes(3));
});

test('올리는 중에 또 불려도 겹치지 않는다', async () => {
  let release: () => void = () => {};
  flush.mockImplementationOnce(() => new Promise((r) => (release = () => r({ results: [], dropped: 0 }))));
  await renderHook(() => useCheckinQueue(jest.fn()));
  await act(async () => online());
  await act(async () => appState('active'));
  expect(flush).toHaveBeenCalledTimes(1);
  await act(async () => release());
});

test('올리기 실패는 조용히(다음에 다시)', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  flush.mockRejectedValueOnce(new Error('disk'));
  const onSynced = jest.fn();
  const { result: h } = await renderHook(() => useCheckinQueue(onSynced));
  await waitFor(() => expect(console.warn).toHaveBeenCalled());
  expect(onSynced).not.toHaveBeenCalled();
  expect(h.current.celebrations).toEqual([]);
});

test('flush를 직접 부를 수 있다(챙긴 직후 바로 시도)', async () => {
  const { result: h } = await renderHook(() => useCheckinQueue(jest.fn()));
  await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
  await act(async () => h.current.flush());
  expect(flush).toHaveBeenCalledTimes(2);
});
