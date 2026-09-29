// mobile/src/features/onboarding/__tests__/permissions.test.ts
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { askLocation, askNotifications, locationAsked, notificationsAsked } from '../permissions';

jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: jest.fn(), requestForegroundPermissionsAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

beforeEach(() => jest.clearAllMocks());

test('물어봤는지 = undetermined가 아님', async () => {
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'undetermined' }).mockResolvedValueOnce({ status: 'denied' });
  expect(await locationAsked()).toBe(false);
  expect(await locationAsked()).toBe(true);
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
  expect(await notificationsAsked()).toBe(true);
});

test('요청 결과는 허용 여부', async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
  expect(await askLocation()).toBe(false);
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  expect(await askNotifications()).toBe(true);
});

test('Android는 알림 요청 전에 채널부터(13+ 팝업 조건)', async () => {
  const os = Platform.OS;
  Platform.OS = 'android';
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
  await askNotifications();
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('arrival', { name: '도착 알림', importance: 3 });
  expect((Notifications.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0])
    .toBeLessThan((Notifications.requestPermissionsAsync as jest.Mock).mock.invocationCallOrder[0]);
  Platform.OS = os;
});
