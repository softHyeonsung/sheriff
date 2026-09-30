// mobile/src/features/memories/__tests__/photo.test.ts
import * as ImagePicker from 'expo-image-picker';
import { clearLocalPhotos, pickMemoryPhoto } from '../photo';

const mockResize = jest.fn();
const mockMoved: string[] = [];
let mockDirExists = false;
const mockDirDelete = jest.fn();

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: (size: object) => {
        mockResize(size);
        return {
          renderAsync: async () => ({ saveAsync: async (o: object) => ({ uri: `file:///cache/out.jpg`, options: o }) }),
        };
      },
    })),
  },
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///doc' },
  Directory: class {
    uri: string;
    constructor(base: string, name: string) {
      this.uri = `${base}/${name}`;
    }
    get exists() {
      return mockDirExists;
    }
    create() {
      mockDirExists = true;
    }
    delete() {
      mockDirDelete(this.uri);
    }
  },
  File: class {
    uri: string;
    constructor(a: string | { uri: string }, name?: string) {
      this.uri = name ? `${typeof a === 'string' ? a : a.uri}/${name}` : (a as string);
    }
    async move(dest: { uri: string }) {
      mockMoved.push(`${this.uri} -> ${dest.uri}`);
      this.uri = dest.uri;
    }
  },
}));

const P = ImagePicker as jest.Mocked<typeof ImagePicker>;

beforeEach(() => {
  jest.clearAllMocks();
  mockMoved.length = 0;
  mockDirExists = false;
});

test('카메라 권한이 없으면 denied, 찍지 않는다', async () => {
  P.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as never);
  expect(await pickMemoryPhoto('camera')).toEqual({ status: 'denied' });
  expect(P.launchCameraAsync).not.toHaveBeenCalled();
});

test('취소하면 canceled', async () => {
  P.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
  P.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);
  expect(await pickMemoryPhoto('library')).toEqual({ status: 'canceled' });
});

test('가로 사진은 너비 1280으로 줄여 앱 폴더 memories/{id}.jpg로 옮긴다', async () => {
  P.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
  P.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///tmp/a.jpg', width: 4000, height: 3000 }] } as never);
  const r = await pickMemoryPhoto('camera');
  expect(P.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
  expect(mockResize).toHaveBeenCalledWith({ width: 1280 });
  expect(r.status).toBe('ok');
  if (r.status !== 'ok') return;
  expect(r.uri).toBe(`file:///doc/memories/${r.id}.jpg`);
  expect(mockMoved).toEqual([`file:///cache/out.jpg -> file:///doc/memories/${r.id}.jpg`]);
});

test('세로 사진은 높이 기준, 작은 사진은 키우지 않는다', async () => {
  P.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
  P.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///tmp/b.jpg', width: 600, height: 900 }] } as never);
  await pickMemoryPhoto('library');
  expect(P.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
  expect(mockResize).toHaveBeenCalledWith({ height: 900 });
});

test('clearLocalPhotos는 memories 폴더를 지운다(없으면 그냥)', () => {
  clearLocalPhotos();
  expect(mockDirDelete).not.toHaveBeenCalled();
  mockDirExists = true;
  clearLocalPhotos();
  expect(mockDirDelete).toHaveBeenCalledWith('file:///doc/memories');
});
