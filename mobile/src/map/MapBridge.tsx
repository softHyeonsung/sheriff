// mobile/src/map/MapBridge.tsx
// The only component that touches the map WebView. Screens pass data and get callbacks.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { catPoses } from './catArt';
import type { CatColor } from './catColors';
import { GRADES } from './grades';
import { GROUND } from './ground-images.generated';
import { markerFor } from './markers';
import { type AppToMap, type CoursePlan, type FogCell, type HideoutPin, type LatLng, type MyLocation, type WishPin, parseMapMessage, toMapScript } from './protocol';
import { buildMapHtml } from './webview-template';

// panTo의 level: 그만큼 가까이 당기며 이동(이미 더 가까우면 그대로).
export type MapBridgeHandle = {
  panTo: (lat: number, lng: number, level?: number) => void;
  fit: (points: LatLng[]) => void; // 이 점들이 모두 보이게
  catSay: (text: string) => void;
};

type Props = {
  hideouts: HideoutPin[];
  wishes: WishPin[];
  onWishTap: (placeId: string) => void;
  myLocation: MyLocation | null;
  center: LatLng;
  onHideoutTap: (id: string) => void;
  onError: (reason: string) => void;
  fog: FogCell[] | null; // null = not loaded yet: draw no fog rather than fog over everything
  onIdle: (center: LatLng) => void;
  onCatTap: () => void;
  catColor: CatColor;
  course: CoursePlan | null;
  focus: LatLng | null; // 검색해서 고른 곳
};

const ORIGIN = 'http://localhost'; // registered as a Web platform domain in the Kakao console

export const MapBridge = forwardRef<MapBridgeHandle, Props>(function MapBridge(
  { hideouts, wishes, onWishTap, myLocation, center, onHideoutTap, onError, fog, onIdle, onCatTap, catColor, course, focus },
  ref,
) {
  const jsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  // The page is built once; later center changes go through panTo, not a reload.
  const [initialCenter] = useState(center);
  const [initialCat] = useState(catColor); // 페이지는 한 번만 만든다 — 이후 교체는 setCat으로
  const html = useMemo(
    () => buildMapHtml({ jsKey, markers: Object.fromEntries(GRADES.map((g) => [g, markerFor(g)])) as never, center: initialCenter, cat: catPoses(initialCat), ground: GROUND }),
    [jsKey, initialCenter, initialCat],
  );

  const send = (msg: AppToMap) => web.current?.injectJavaScript(toMapScript(msg));

  useEffect(() => {
    if (!jsKey) onError('missing_js_key');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsKey]);

  // Anything that arrived before the map was ready is sent once it is.
  useEffect(() => {
    if (ready) send({ type: 'setHideouts', hideouts });
  }, [ready, hideouts]);

  useEffect(() => {
    if (ready) send({ type: 'setWishes', wishes });
  }, [ready, wishes]);

  useEffect(() => {
    if (ready && fog) send({ type: 'setFog', cells: fog });
  }, [ready, fog]);

  // 프로필에서 고양이를 바꾸면 페이지를 다시 만들지 않고 그림 묶음만 바꾼다.
  useEffect(() => {
    if (ready) send({ type: 'setCat', poses: catPoses(catColor) });
  }, [ready, catColor]);

  useEffect(() => {
    if (ready && myLocation) send({ type: 'setMyLocation', ...myLocation });
  }, [ready, myLocation]);

  // 내 위치 뒤에: 코스 범위를 맞출 때 내 위치도 들어가게.
  useEffect(() => {
    if (ready) send({ type: 'setCourse', course });
  }, [ready, course]);

  useEffect(() => {
    if (ready) send({ type: 'setFocus', at: focus });
  }, [ready, focus]);

  // A panTo before the map is ready (the screen centering on the first fix) is kept, not dropped.
  const pendingPan = useRef<(LatLng & { level?: number }) | null>(null);
  useEffect(() => {
    if (ready && pendingPan.current) {
      send({ type: 'panTo', ...pendingPan.current });
      pendingPan.current = null;
    }
  }, [ready]);

  useImperativeHandle(
    ref,
    () => ({
      panTo: (lat, lng, level) => {
        if (ready) send({ type: 'panTo', lat, lng, level });
        else pendingPan.current = { lat, lng, level };
      },
      fit: (points) => {
        if (ready) send({ type: 'fit', points });
      },
      // A line said before the map is ready has no cat to say it — dropped.
      catSay: (text) => {
        if (ready) send({ type: 'catSay', text });
      },
    }),
    [ready],
  );

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = parseMapMessage(e.nativeEvent.data);
    if (!msg) return;
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'hideoutTap') onHideoutTap(msg.id);
    else if (msg.type === 'wishTap') onWishTap(msg.placeId);
    else if (msg.type === 'idle') onIdle(msg.center);
    else if (msg.type === 'catTap') onCatTap();
    else onError(msg.reason);
  };

  if (!jsKey) return null;

  return (
    <WebView
      ref={web}
      source={{ html, baseUrl: ORIGIN }}
      onMessage={onMessage}
      onError={() => onError('webview_load_failed')}
      // The page process can die (iOS kills it in the background, Android on low memory): route
      // it to the failure screen, whose retry remounts us, instead of leaving a white map.
      onContentProcessDidTerminate={() => onError('content_process_gone')}
      onRenderProcessGone={() => onError('render_process_gone')}
      // Kakao logo / copyright links would navigate the WebView away and lose the map.
      // 주소 앞부분만 보면 http://localhost.evil.example 도 통과한다: 우리 주소 그 자체이거나 그 아래 경로만.
      onShouldStartLoadWithRequest={(req) => req.url === ORIGIN || req.url.startsWith(`${ORIGIN}/`) || req.url.startsWith('about:')}
      style={{ flex: 1 }}
    />
  );
});
