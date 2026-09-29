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

export async function askNotifications(): Promise<boolean> {
  // Android 13+: no channel, no permission prompt.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('arrival', { name: '도착 알림', importance: Notifications.AndroidImportance.DEFAULT });
  }
  return (await Notifications.requestPermissionsAsync()).granted;
}
