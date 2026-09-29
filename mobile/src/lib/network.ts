// mobile/src/lib/network.ts
// 연결 상태. 모르면(null) 온라인으로 보고 평소처럼 시도한다 — 실패하면 그때 오프라인 경로로.
import * as Network from 'expo-network';

type State = { isConnected?: boolean | null; isInternetReachable?: boolean | null };
const offline = (s: State) => s.isConnected === false || s.isInternetReachable === false;

export async function isOffline(): Promise<boolean> {
  try {
    return offline(await Network.getNetworkStateAsync());
  } catch {
    return false;
  }
}

// 온라인 소식마다 부른다. 안드로이드는 구독할 때 처음 상태를 안 보내서 "끊김→연결" 변화만 보면
// 비행기 모드로 켠 앱이 연결돼도 모른다. 부르는 쪽(올리기)이 중복 실행을 막는다.
export function onOnline(cb: () => void): () => void {
  const sub = Network.addNetworkStateListener((s) => {
    if (!offline(s)) cb();
  });
  return () => sub.remove();
}
