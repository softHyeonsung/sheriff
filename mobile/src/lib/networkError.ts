// mobile/src/lib/networkError.ts
// 서버가 답하지 못한(연결이 안 된) 오류인지. SDK import 없이 모양만 본다.
const FETCH = /Network request (failed|timed out)|Failed to fetch|FetchError|AbortError/;

export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  if (name === 'FunctionsFetchError') return true;
  return typeof message === 'string' && FETCH.test(message);
}
