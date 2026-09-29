// mobile/src/features/arrival/__tests__/useArrivalTap.test.ts
import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { useArrivalTap } from '../useArrivalTap';

jest.mock('expo-notifications', () => ({ useLastNotificationResponse: jest.fn() }));
const last = Notifications.useLastNotificationResponse as jest.Mock;
const response = (identifier: string, date: number) => ({ notification: { date, request: { identifier } } });

beforeEach(() => jest.clearAllMocks());

test('도착 알림을 누르면 한 번만 부른다(다시 마운트돼도)', async () => {
  last.mockReturnValue(response('arrival:a', 1));
  const onArrive = jest.fn();
  const first = await renderHook(() => useArrivalTap(onArrive));
  await first.rerender({});
  await first.unmount();
  await renderHook(() => useArrivalTap(onArrive));
  expect(onArrive).toHaveBeenCalledTimes(1);
});

test('새 알림 응답이면 다시 부른다', async () => {
  const onArrive = jest.fn();
  last.mockReturnValue(response('arrival:b', 2));
  const h = await renderHook(() => useArrivalTap(onArrive));
  last.mockReturnValue(response('arrival:b', 3));
  await h.rerender({});
  expect(onArrive).toHaveBeenCalledTimes(2);
});

test('도착 알림이 아니거나 응답이 없으면 무시', async () => {
  const onArrive = jest.fn();
  last.mockReturnValue(null);
  const h = await renderHook(() => useArrivalTap(onArrive));
  last.mockReturnValue(response('other', 4));
  await h.rerender({});
  expect(onArrive).not.toHaveBeenCalled();
});
