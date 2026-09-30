// mobile/src/features/memories/photo.ts
// 순간 사진 준비: 권한 → 찍기/고르기 → 긴 변 1280px JPEG로 줄이기 → 앱 폴더로 옮기기.
// 앨범·카메라 임시 파일은 지워질 수 있어서, 대기열이 쓸 사본은 앱 문서 폴더에 둔다.
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export const MEMORY_MAX_PX = 1280;

export type Picked = { status: 'ok'; id: string; uri: string } | { status: 'canceled' } | { status: 'denied' };

const photosDir = () => new Directory(Paths.document, 'memories');
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function pickMemoryPhoto(source: 'camera' | 'library'): Promise<Picked> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  const options = { mediaTypes: ['images' as const], quality: 1 };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = r.assets?.[0];
  if (r.canceled || !asset) return { status: 'canceled' };

  const size =
    asset.width >= asset.height
      ? { width: Math.min(asset.width, MEMORY_MAX_PX) }
      : { height: Math.min(asset.height, MEMORY_MAX_PX) };
  const rendered = await ImageManipulator.manipulate(asset.uri).resize(size).renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });

  const id = newId();
  const dir = photosDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${id}.jpg`);
  await new File(saved.uri).move(dest);
  return { status: 'ok', id, uri: dest.uri };
}

export function clearLocalPhotos(): void {
  const dir = photosDir();
  if (dir.exists) dir.delete();
}
