// mobile/src/features/auth/__tests__/clearLocalData.test.ts
import { clearArrivalData } from '@/features/arrival/register';
import { clearQueue } from '@/features/checkin/queue';
import { clearMapCache } from '@/features/map/mapCache';
import { clearMemoryQueue } from '@/features/memories/memoryQueue';
import { clearLocalPhotos } from '@/features/memories/photo';
import { clearLocalData } from '../clearLocalData';

jest.mock('@/features/arrival/register', () => ({ clearArrivalData: jest.fn() }));
jest.mock('@/features/checkin/queue', () => ({ clearQueue: jest.fn() }));
jest.mock('@/features/map/mapCache', () => ({ clearMapCache: jest.fn() }));
jest.mock('@/features/memories/memoryQueue', () => ({ clearMemoryQueue: jest.fn() }));
jest.mock('@/features/memories/photo', () => ({ clearLocalPhotos: jest.fn() }));

test('로그아웃하면 이 폰에 남긴 내 것(대기열·지도 저장본·도착 알림)을 모두 지운다 — 하나가 실패해도 나머지는', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (clearArrivalData as jest.Mock).mockRejectedValue(new Error('perm'));
  (clearQueue as jest.Mock).mockResolvedValue(undefined);
  (clearMapCache as jest.Mock).mockResolvedValue(undefined);
  (clearMemoryQueue as jest.Mock).mockResolvedValue(undefined);
  await clearLocalData();
  expect(clearArrivalData).toHaveBeenCalled();
  expect(clearQueue).toHaveBeenCalled();
  expect(clearMapCache).toHaveBeenCalled();
  expect(clearMemoryQueue).toHaveBeenCalled();
  expect(clearLocalPhotos).toHaveBeenCalled();
  expect(console.warn).toHaveBeenCalled();
});
