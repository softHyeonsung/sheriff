// mobile/src/features/onboarding/permissions.ts
// "이미 물어봤나"(이어하기 판단)와 요청. 거절도 물어본 것 — 다시 조르지 않는다.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function locationAsked(): Promise<boolean> {
  return (await Location.getForegroundPermissionsAsync()).status !== 'undetermined';
}

export async function askLocation(): Promise<boolean> {
  return (await Location.requestForegroundPermissionsAsync()).status === 'granted';
}

export async function notificationsAsked(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).status !== 'undetermined';
}

// 도착 알림 채널. 없으면 안드로이드 8+에서 알림이 안 뜬다. 여러 번 불러도 된다.
export async function ensureArrivalChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('arrival', { name: '도착 알림', importance: Notifications.AndroidImportance.DEFAULT });
  }
}

export async function askNotifications(): Promise<boolean> {
  // Android 13+: no channel, no permission prompt.
  await ensureArrivalChannel();
  return (await Notifications.requestPermissionsAsync()).granted;
}
