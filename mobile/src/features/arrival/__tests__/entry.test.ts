// mobile/src/features/arrival/__tests__/entry.test.ts
/* eslint-disable @typescript-eslint/no-explicit-any -- a plain global used as a recorder across hoisted mock factories */
// Android wakes a killed app for a geofence event without rendering anything, so route files
// (_layout.tsx) never load. The task must be defined by the app entry itself, before the router.
import pkg from '../../../../package.json';
import '../../../../index';

// Mock factories run while index.ts is imported (hoisted above everything), so record on a global.
jest.mock('../task', () => {
  ((globalThis as any).entryOrder ??= []).push('task');
  return {};
});
jest.mock('../../checkin/dwell', () => {
  ((globalThis as any).entryOrder ??= []).push('dwell');
  return {};
});
jest.mock('expo-router/entry', () => {
  ((globalThis as any).entryOrder ??= []).push('router');
  return {};
});

test('앱 진입점이 라우터보다 먼저 백그라운드 태스크(도착 알림·머무름 확인)를 정의한다', () => {
  expect(pkg.main).toBe('index.ts');
  expect((globalThis as any).entryOrder).toEqual(['task', 'dwell', 'router']);
});
