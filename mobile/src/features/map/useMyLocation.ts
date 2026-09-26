// mobile/src/features/map/useMyLocation.ts
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { MyLocation } from '@/map/protocol';

type Permission = 'granted' | 'denied' | 'undetermined';

export function useMyLocation() {
  const [location, setLocation] = useState<MyLocation | null>(null);
  const [permission, setPermission] = useState<Permission>('undetermined');
  const sub = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let alive = true;

    const start = async (status: string) => {
      if (!alive) return;
      setPermission(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
      if (status !== 'granted' || sub.current) return;
      try {
        sub.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
          (p) => alive && setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? 999 }),
        );
      } catch (e) {
        console.warn('위치 추적 실패', e); // the map still works without the dot
      }
    };

    Location.requestForegroundPermissionsAsync().then((r) => start(r.status));

    // Coming back from Settings with location switched on should show the dot without a restart.
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') Location.getForegroundPermissionsAsync().then((r) => start(r.status));
    });

    return () => {
      alive = false;
      appState.remove();
      sub.current?.remove();
      sub.current = null;
    };
  }, []);

  return { location, permission };
}
