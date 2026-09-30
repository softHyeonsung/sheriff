// mobile/src/features/map/__tests__/mapCache.test.ts
import { readMapCache, saveFog, saveHideouts, saveWishes } from '../mapCache';

const disk: Record<string, string> = {};
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    get exists() {
      return this.uri in disk;
    }
    create() {
      disk[this.uri] = '';
    }
    async text() {
      return disk[this.uri];
    }
    write(s: string) {
      disk[this.uri] = s;
    }
  },
}));

const cafe = { id: 'a1', name: 'A', grade: 'box' as const, footprintCount: 2, lat: 37.5, lng: 126.9, lastVisitedAt: null };
const T = { box: 2, hut: 5, tower: 10, palace: 20 };
const cell = { sw: { lat: 1, lng: 2 }, ne: { lat: 3, lng: 4 } };

test('비어 있으면 빈 저장본, 아지트와 안개는 따로 저장해도 같이 남는다', async () => {
  expect(await readMapCache()).toEqual({ hideouts: [], thresholds: null, fog: null, wishes: [] });
  await Promise.all([saveHideouts([cafe], T), saveFog([cell])]);
  expect(await readMapCache()).toEqual({ hideouts: [cafe], thresholds: T, fog: [cell], wishes: [] });
});

test('찜도 저장본에', async () => {
  const w = { placeId: '1', name: 'a', roadAddress: null, lat: 1, lng: 2, achievedAt: null };
  await saveWishes([w]);
  expect((await readMapCache()).wishes).toEqual([w]);
});
