// mobile/src/map/MapBridge.tsx
// The only component that touches the map WebView. Screens pass data and get callbacks.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { GRADES } from './grades';
import { markerFor } from './markers';
import { type AppToMap, type HideoutPin, type LatLng, type MyLocation, parseMapMessage, toMapScript } from './protocol';
import { buildMapHtml } from './webview-template';

export type MapBridgeHandle = { panTo: (lat: number, lng: number) => void };

type Props = {
  hideouts: HideoutPin[];
  myLocation: MyLocation | null;
  center: LatLng;
  onHideoutTap: (id: string) => void;
  onError: (reason: string) => void;
};

const ORIGIN = 'http://localhost'; // registered as a Web platform domain in the Kakao console

export const MapBridge = forwardRef<MapBridgeHandle, Props>(function MapBridge(
  { hideouts, myLocation, center, onHideoutTap, onError },
  ref,
) {
  const jsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  // The page is built once; later center changes go through panTo, not a reload.
  const [initialCenter] = useState(center);
  const html = useMemo(
    () => buildMapHtml({ jsKey, markers: Object.fromEntries(GRADES.map((g) => [g, markerFor(g)])) as never, center: initialCenter }),
    [jsKey, initialCenter],
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
    }),
    [ready],
  );

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = parseMapMessage(e.nativeEvent.data);
    if (!msg) return;
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'hideoutTap') onHideoutTap(msg.id);
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
