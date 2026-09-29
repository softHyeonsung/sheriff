// mobile/src/map/MapBridge.tsx
// The only component that touches the map WebView. Screens pass data and get callbacks.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { color } from '@/constants/tokens';
import { CAT_IMAGES } from './cat-image.generated';
import type { CatColor } from './catColors';
import { GRADES } from './grades';
import { markerFor } from './markers';
import { type AppToMap, type FogCell, type HideoutPin, type LatLng, type MyLocation, parseMapMessage, toMapScript } from './protocol';
import { buildMapHtml } from './webview-template';

export type MapBridgeHandle = { panTo: (lat: number, lng: number) => void; catSay: (text: string) => void };

type Props = {
  hideouts: HideoutPin[];
  myLocation: MyLocation | null;
  center: LatLng;
  onHideoutTap: (id: string) => void;
  onError: (reason: string) => void;
  fog: FogCell[] | null; // null = not loaded yet: draw no fog rather than fog over everything
  onIdle: (center: LatLng) => void;
  onCatTap: () => void;
  catColor: CatColor;
};

const ORIGIN = 'http://localhost'; // registered as a Web platform domain in the Kakao console

export const MapBridge = forwardRef<MapBridgeHandle, Props>(function MapBridge(
  { hideouts, myLocation, center, onHideoutTap, onError, fog, onIdle, onCatTap, catColor },
  ref,
) {
  const jsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  // The page is built once; later center changes go through panTo, not a reload.
  const [initialCenter] = useState(center);
  const [initialCat] = useState(catColor); // the page is built once — the coat is chosen in onboarding, before the map
  const html = useMemo(
    () => buildMapHtml({ jsKey, markers: Object.fromEntries(GRADES.map((g) => [g, markerFor(g)])) as never, center: initialCenter, cat: CAT_IMAGES[initialCat], fogColor: color.fog }),
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
    if (ready && fog) send({ type: 'setFog', cells: fog });
  }, [ready, fog]);

  useEffect(() => {
    if (ready && myLocation) send({ type: 'setMyLocation', ...myLocation });
  }, [ready, myLocation]);

  // A panTo before the map is ready (the screen centering on the first fix) is kept, not dropped.
  const pendingPan = useRef<LatLng | null>(null);
  useEffect(() => {
    if (ready && pendingPan.current) {
      send({ type: 'panTo', ...pendingPan.current });
      pendingPan.current = null;
    }
  }, [ready]);

  useImperativeHandle(
    ref,
    () => ({
      panTo: (lat, lng) => {
        if (ready) send({ type: 'panTo', lat, lng });
        else pendingPan.current = { lat, lng };
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
      onShouldStartLoadWithRequest={(req) => req.url.startsWith(ORIGIN) || req.url.startsWith('about:')}
      style={{ flex: 1 }}
    />
  );
});
