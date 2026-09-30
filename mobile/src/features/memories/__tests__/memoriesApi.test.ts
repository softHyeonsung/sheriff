// mobile/src/features/memories/__tests__/memoriesApi.test.ts
import { supabase } from '@/services/supabase';
import { flushMemories } from '../memoryQueue';
import { attachMemory, flushMemoriesNow, listMemories, MemoryError, removeMemoryFile, uploadMemory } from '../memoriesApi';

const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockSigned = jest.fn();
jest.mock('@/services/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    auth: { getSession: jest.fn() },
    storage: { from: jest.fn(() => ({ upload: mockUpload, remove: mockRemove, createSignedUrls: mockSigned })) },
  },
}));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(u: string) {
      this.uri = u;
    }
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
  },
}));
jest.mock('../memoryQueue', () => ({ flushMemories: jest.fn() }));

const rpc = supabase.rpc as jest.Mock;
const fix = { lat: 37.5, lng: 127, accuracy: 20 };

beforeEach(() => jest.clearAllMocks());

test('올리기: memories 버킷에 JPEG로 덮어쓰기 허용', async () => {
  mockUpload.mockResolvedValue({ error: null });
  await uploadMemory('u1/p1.jpg', 'file:///doc/memories/p1.jpg');
  expect(supabase.storage.from).toHaveBeenCalledWith('memories');
  expect(mockUpload).toHaveBeenCalledWith('u1/p1.jpg', new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg', upsert: true });
});

test('올리기 실패: 연결이면 offline, 아니면 unknown', async () => {
  mockUpload.mockResolvedValueOnce({ error: { message: 'TypeError: Network request failed' } });
  await expect(uploadMemory('u1/p1.jpg', 'x')).rejects.toMatchObject({ code: 'offline' });
  mockUpload.mockResolvedValueOnce({ error: { message: 'Payload too large' } });
  await expect(uploadMemory('u1/p1.jpg', 'x')).rejects.toMatchObject({ code: 'unknown' });
});

test('기록: attach_memory에 위치를 같이 보내고 거절 코드는 그대로', async () => {
  rpc.mockResolvedValueOnce({ data: 'm1', error: null });
  await attachMemory('a1', 'u1/p1.jpg', fix);
  expect(rpc).toHaveBeenCalledWith('attach_memory', { p_aidut: 'a1', p_path: 'u1/p1.jpg', p_lat: 37.5, p_lng: 127, p_accuracy: 20 });
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'too_far', code: 'P0001' } });
  await expect(attachMemory('a1', 'u1/p1.jpg', fix)).rejects.toEqual(new MemoryError('too_far'));
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
  await expect(attachMemory('a1', 'u1/p1.jpg', fix)).rejects.toMatchObject({ code: 'offline' });
});

test('저장소 파일 지우기', async () => {
  mockRemove.mockResolvedValue({ error: null });
  await removeMemoryFile('u1/p1.jpg');
  expect(mockRemove).toHaveBeenCalledWith(['u1/p1.jpg']);
});

test('목록: 1시간 임시 링크, 링크 못 받은 사진은 url null', async () => {
  rpc.mockResolvedValue({
    data: [
      { id: 'm2', path: 'u1/p2.jpg', created_at: '2026-09-30T02:00:00Z' },
      { id: 'm1', path: 'u1/p1.jpg', created_at: '2026-09-30T01:00:00Z' },
    ],
    error: null,
  });
  mockSigned.mockResolvedValue({ data: [{ path: 'u1/p2.jpg', signedUrl: 'https://s/p2' }, { path: 'u1/p1.jpg', signedUrl: '' }], error: null });
  expect(await listMemories('a1')).toEqual([
    { id: 'm2', url: 'https://s/p2', createdAt: '2026-09-30T02:00:00Z' },
    { id: 'm1', url: null, createdAt: '2026-09-30T01:00:00Z' },
  ]);
  expect(rpc).toHaveBeenCalledWith('my_memories', { p_aidut: 'a1' });
  expect(mockSigned).toHaveBeenCalledWith(['u1/p2.jpg', 'u1/p1.jpg'], 3600);
});

test('목록이 비면 링크를 받지 않는다', async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await listMemories('a1')).toEqual([]);
  expect(mockSigned).not.toHaveBeenCalled();
});

test('flushMemoriesNow: 로그인 안 돼 있으면 안 올린다, 겹쳐 불러도 한 번만 돈다', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({ data: { session: null } });
  expect(await flushMemoriesNow()).toEqual({ attached: [], dropped: 0 });
  expect(flushMemories).not.toHaveBeenCalled();

  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  let release: (v: unknown) => void = () => {};
  (flushMemories as jest.Mock).mockImplementationOnce(() => new Promise((r) => (release = r)));
  const a = flushMemoriesNow();
  const b = flushMemoriesNow();
  await new Promise((r) => setTimeout(r, 0));
  release({ attached: ['a1'], dropped: 0 });
  expect(await a).toEqual({ attached: ['a1'], dropped: 0 });
  expect(await b).toEqual({ attached: ['a1'], dropped: 0 });
  expect(flushMemories).toHaveBeenCalledTimes(1);
  expect((flushMemories as jest.Mock).mock.calls[0][0]).toMatchObject({ uid: 'u1' });
});
