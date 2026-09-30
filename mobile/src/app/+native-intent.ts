// mobile/src/app/+native-intent.ts
// 공유로 앱이 열릴 때 들어오는 주소(expo-share-intent)는 화면 경로가 아니다: 홈으로 보내고
// 내용은 useIncomingShare가 읽는다. 그 밖의 주소는 그대로.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (path.includes('dataUrl=')) return '/';
  return path;
}
