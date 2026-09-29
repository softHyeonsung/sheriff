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

export function onOnline(cb: () => void): () => void {
  let wasOffline = false;
  const sub = Network.addNetworkStateListener((s) => {
    const now = offline(s);
    if (wasOffline && !now) cb();
    wasOffline = now;
  });
  return () => sub.remove();
}
