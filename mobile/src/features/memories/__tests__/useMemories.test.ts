// mobile/src/features/memories/__tests__/useMemories.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { readMemoryQueue } from '../memoryQueue';
import { listMemories } from '../memoriesApi';
import { useMemories } from '../useMemories';

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('../memoriesApi', () => ({ listMemories: jest.fn() }));
jest.mock('../memoryQueue', () => ({ readMemoryQueue: jest.fn() }));

const photo = { id: 'm1', url: 'https://s/1', createdAt: '2026-09-30T01:00:00Z' };

beforeEach(() => {
  jest.clearAllMocks();
  (readMemoryQueue as jest.Mock).mockResolvedValue([{ aidutId: 'a1' }, { aidutId: 'a2' }, { aidutId: 'a1' }]);
});

test('사진과 이 아지트의 올라가는 중 개수', async () => {
  (listMemories as jest.Mock).mockResolvedValue([photo]);
  const { result } = await renderHook(() => useMemories('a1'));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.photos).toEqual([photo]);
  await waitFor(() => expect(result.current.pending).toBe(2));
});

test('연결 실패면 offline, 그 밖은 error, refresh로 다시', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (listMemories as jest.Mock).mockRejectedValueOnce({ message: 'TypeError: Network request failed' });
  const { result } = await renderHook(() => useMemories('a1'));
  await waitFor(() => expect(result.current.status).toBe('offline'));
  (listMemories as jest.Mock).mockRejectedValueOnce({ message: 'boom', code: 'XX000' });
  await act(async () => result.current.refresh());
  expect(result.current.status).toBe('error');
  (listMemories as jest.Mock).mockResolvedValueOnce([]);
  await act(async () => result.current.refresh());
  expect(result.current.status).toBe('ready');
});
