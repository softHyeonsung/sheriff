// mobile/src/lib/__tests__/networkError.test.ts
import { isNetworkError } from '../networkError';

test('연결 실패 모양을 알아본다', () => {
  expect(isNetworkError({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' })).toBe(true);
  expect(isNetworkError({ message: 'TypeError: Network request failed', code: '' })).toBe(true);
  expect(isNetworkError({ message: 'AbortError: Aborted', code: '' })).toBe(true);
});

test('서버가 답한 오류는 연결 실패가 아니다', () => {
  expect(isNetworkError({ message: 'too_far', code: 'P0001' })).toBe(false);
  expect(isNetworkError(new Error('network'))).toBe(false);
  expect(isNetworkError(null)).toBe(false);
  expect(isNetworkError('Network request failed')).toBe(false);
});
