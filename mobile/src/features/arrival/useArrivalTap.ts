// mobile/src/features/arrival/useArrivalTap.ts
// 도착 알림을 누르고 들어오면 onArrive 한 번. 지도 화면이 다시 마운트돼도 같은 응답은 다시 처리하지 않는다.
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

let handled: string | null = null; // 모듈 변수: 화면 수명보다 오래 기억해야 한다

export function useArrivalTap(onArrive: () => void): void {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    const { date, request } = response.notification;
    if (!request.identifier.startsWith('arrival:')) return;
    const key = `${request.identifier}@${date}`;
    if (handled === key) return;
    handled = key;
    onArrive();
  }, [response, onArrive]);
}
