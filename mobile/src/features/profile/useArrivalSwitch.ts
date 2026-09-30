// mobile/src/features/profile/useArrivalSwitch.ts
// 프로필의 도착 알림 스위치. 폰 설정에서 권한을 바꿨을 수 있어 보일 때마다 다시 읽는다.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { arrivalSwitchState, setArrivalEnabled } from '@/features/arrival/register';
import { readMapCache } from '@/features/map/mapCache';

export function useArrivalSwitch() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsSettings, setNeedsSettings] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setOn((await arrivalSwitchState()).on);
    } catch (e) {
      console.warn('도착 알림 상태 읽기 실패', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const toggle = useCallback(async (next: boolean) => {
    setBusy(true);
    setNeedsSettings(false);
    try {
      const { hideouts } = await readMapCache();
      const r = await setArrivalEnabled(next, hideouts);
      setOn(r === 'on');
      setNeedsSettings(r === 'needs_settings');
    } catch (e) {
      console.warn('도착 알림 바꾸기 실패', e);
    } finally {
      setBusy(false);
    }
  }, []);

  return { on, busy, needsSettings, toggle };
}
