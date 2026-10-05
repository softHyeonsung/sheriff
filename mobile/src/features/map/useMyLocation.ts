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
  // Set synchronously: the permission reply and the AppState 'active' after the dialog
  // arrive together, and both must not start a watch.
  const starting = useRef(false);

  useEffect(() => {
    let alive = true;

    const start = async (status: string) => {
      if (!alive) return;
      setPermission(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
      if (status !== 'granted' || sub.current || starting.current) return;
      starting.current = true;
      try {
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10 }, // High: 걸은 자리를 칸 단위로 걷으려면 GPS 정확도가 필요하다
          (p) => alive && setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? 999 }),
        );
        // Unmounted while the watch was starting: release it instead of leaking GPS.
        if (alive) sub.current = s;
        else s.remove();
      } catch (e) {
        console.warn('위치 추적 실패', e); // the map still works without the dot
      } finally {
        starting.current = false;
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
