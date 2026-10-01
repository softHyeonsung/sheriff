// mobile/src/map/__tests__/MapBridge.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles for native components */
import { createRef } from 'react';
import { act, render } from '@testing-library/react-native';
import { catArt } from '../catArt';
import { MapBridge, type MapBridgeHandle } from '../MapBridge';

const mockInject = jest.fn();
let mockWebProps: Record<string, any> = {};
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef(function MockWebView(props: any, ref: any) {
      mockWebProps = props;
      React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
      return <View testID="webview" />;
    }),
  };
});

const pins = [{ id: 'a1', lat: 37.5, lng: 126.9, grade: 'hut' as const }];
const base = { hideouts: pins, myLocation: null, center: { lat: 37.5665, lng: 126.978 }, onHideoutTap: jest.fn(), onError: jest.fn(), fog: [], onIdle: jest.fn(), onCatTap: jest.fn(), catColor: 'cheese' as const, wishes: [], onWishTap: jest.fn(), course: null };
const send = async (data: string) => act(async () => mockWebProps.onMessage({ nativeEvent: { data } }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_KAKAO_JS_KEY = 'test-key';
});

test('지도 준비 전엔 보내지 않고, ready 이후에 보낸다', async () => {
  await render(<MapBridge {...base} />);
  expect(mockInject).not.toHaveBeenCalled();
  await send('{"type":"ready"}');
  expect(mockInject).toHaveBeenCalledTimes(5);
  expect(mockInject.mock.calls.some(([s]) => s.includes('setCourse'))).toBe(true);
  expect(mockInject.mock.calls[0][0]).toContain('setHideouts');
  expect(mockInject.mock.calls[0][0]).toContain('a1');
  expect(mockInject.mock.calls.some(([s]) => s.includes('setWishes'))).toBe(true);
  expect(mockInject.mock.calls.some(([s]) => s.includes('setFog'))).toBe(true);
});

test('위치가 오면 setMyLocation을 보낸다', async () => {
  const { rerender } = await render(<MapBridge {...base} />);
  await send('{"type":"ready"}');
  await rerender(<MapBridge {...base} myLocation={{ lat: 37.51, lng: 126.95, accuracy: 10 }} />);
  expect(mockInject.mock.calls.some(([s]) => s.includes('setMyLocation'))).toBe(true);
});

test('마커 탭·오류는 콜백으로, 이상한 메시지는 버린다', async () => {
  await render(<MapBridge {...base} />);
  await send('{"type":"hideoutTap","id":"a1"}');
  await send('{"type":"navigate","url":"https://evil.example"}');
  await send('garbage');
  await send('{"type":"error","reason":"sdk_load_failed"}');
  expect(base.onHideoutTap).toHaveBeenCalledWith('a1');
  expect(base.onError).toHaveBeenCalledTimes(1);
  expect(base.onError).toHaveBeenCalledWith('sdk_load_failed');
});

test('ref.panTo는 panTo 메시지를 보낸다', async () => {
  const ref = createRef<MapBridgeHandle>();
  await render(<MapBridge {...base} ref={ref} />);
  await send('{"type":"ready"}');
  await act(async () => ref.current?.panTo(37.4, 127.0));
  expect(mockInject.mock.calls.some(([s]) => s.includes('panTo'))).toBe(true);
});

test('준비 전에 온 panTo는 버리지 않고 ready 때 보낸다(첫 중심 맞추기)', async () => {
  const ref = createRef<MapBridgeHandle>();
  await render(<MapBridge {...base} ref={ref} />);
  await act(async () => ref.current?.panTo(37.4, 127.0));
  expect(mockInject).not.toHaveBeenCalled();
  await send('{"type":"ready"}');
  expect(mockInject.mock.calls.some(([s]) => s.includes('panTo') && s.includes('127'))).toBe(true);
});

test('외부 페이지 이동 차단(카카오 로고 등을 눌러도 지도가 사라지지 않음)', async () => {
  await render(<MapBridge {...base} />);
  const allow = mockWebProps.onShouldStartLoadWithRequest;
  expect(allow({ url: 'http://localhost/', isTopFrame: true })).toBe(true);
  expect(allow({ url: 'about:blank', isTopFrame: true })).toBe(true);
  expect(allow({ url: 'https://map.kakao.com/', isTopFrame: true })).toBe(false);
  expect(allow({ url: 'http://localhost', isTopFrame: true })).toBe(true);
  expect(allow({ url: 'http://localhost.evil.example/', isTopFrame: true })).toBe(false); // 앞부분만 같은 주소
  expect(allow({ url: 'http://localhost:8080/', isTopFrame: true })).toBe(false);
  expect(mockWebProps.source.baseUrl).toBe('http://localhost');
});

test('JS 키 없음 → 빈 화면 대신 바로 오류', async () => {
  process.env.EXPO_PUBLIC_KAKAO_JS_KEY = '';
  const { queryByTestId } = await render(<MapBridge {...base} />);
  expect(queryByTestId('webview')).toBeNull();
  expect(base.onError).toHaveBeenCalledWith('missing_js_key');
});

test('WebView 자체 로드 실패도 오류로', async () => {
  await render(<MapBridge {...base} />);
  await act(async () => mockWebProps.onError({ nativeEvent: { description: 'offline' } }));
  expect(base.onError).toHaveBeenCalledWith('webview_load_failed');
});

test('WebView 프로세스가 죽으면(iOS 백그라운드 등) 흰 화면 대신 오류로', async () => {
  await render(<MapBridge {...base} />);
  await act(async () => mockWebProps.onContentProcessDidTerminate?.({ nativeEvent: {} }));
  await act(async () => mockWebProps.onRenderProcessGone?.({ nativeEvent: { didCrash: true } }));
  expect(base.onError).toHaveBeenCalledWith('content_process_gone');
  expect(base.onError).toHaveBeenCalledWith('render_process_gone');
});

const cell = { sw: { lat: 37.5, lng: 126.9 }, ne: { lat: 37.501, lng: 126.901 } };

test('걷힌 칸이 바뀌면 setFog를 보낸다', async () => {
  const { rerender } = await render(<MapBridge {...base} />);
  await send('{"type":"ready"}');
  mockInject.mockClear();
  await rerender(<MapBridge {...base} fog={[cell]} />);
  expect(mockInject).toHaveBeenCalledTimes(1);
  expect(mockInject.mock.calls[0][0]).toContain('setFog');
  expect(mockInject.mock.calls[0][0]).toContain('37.501');
});

test('idle·catTap을 콜백으로 넘긴다', async () => {
  const onIdle = jest.fn();
  const onCatTap = jest.fn();
  await render(<MapBridge {...base} onIdle={onIdle} onCatTap={onCatTap} />);
  await send('{"type":"idle","center":{"lat":37.5,"lng":126.9}}');
  await send('{"type":"catTap"}');
  expect(onIdle).toHaveBeenCalledWith({ lat: 37.5, lng: 126.9 });
  expect(onCatTap).toHaveBeenCalled();
});

test('catSay는 준비된 뒤에만 보낸다', async () => {
  const ref = createRef<MapBridgeHandle>();
  await render(<MapBridge {...base} ref={ref} />);
  await act(async () => ref.current!.catSay('안녕'));
  expect(mockInject).not.toHaveBeenCalled();
  await send('{"type":"ready"}');
  mockInject.mockClear();
  await act(async () => ref.current!.catSay('안녕'));
  expect(mockInject.mock.calls[0][0]).toContain('catSay');
});

test('걷힌 칸을 아직 못 불러왔으면(null) 안개를 보내지 않는다 — 전국이 안개로 덮이지 않게', async () => {
  await render(<MapBridge {...base} fog={null} />);
  await send('{"type":"ready"}');
  expect(mockInject.mock.calls.some(([s]) => s.includes('setFog'))).toBe(false);
});

test('고른 털색의 고양이 그림을 싣는다', async () => {
  await render(<MapBridge {...base} catColor="white" />);
  // PNG 머리는 셋 다 같으니 끝부분으로 구분
  expect(mockWebProps.source.html).toContain(catArt('white', 'sit').slice(-80));
  expect(mockWebProps.source.html).not.toContain(catArt('cheese', 'sit').slice(-80));
});

test('찜 핀을 보내고, wishTap을 넘긴다', async () => {
  await render(<MapBridge {...base} wishes={[{ placeId: '777', lat: 37.5, lng: 127 }]} />);
  await send('{"type":"ready"}');
  expect(mockInject.mock.calls.some(([s]) => s.includes('setWishes') && s.includes('777'))).toBe(true);
  await send('{"type":"wishTap","placeId":"777"}');
  expect(base.onWishTap).toHaveBeenCalledWith('777');
});

test('고양이를 바꾸면 지도에 새 자세 묶음을 보낸다(앱을 다시 켜지 않아도)', async () => {
  const { rerender } = await render(<MapBridge {...base} catColor="cheese" />);
  await send('{"type":"ready"}');
  mockInject.mockClear();
  await rerender(<MapBridge {...base} catColor="white" />);
  expect(mockInject.mock.calls.some(([s]) => s.includes('setCat'))).toBe(true);
});

test('코스가 바뀌면 setCourse를 보낸다', async () => {
  const { rerender } = await render(<MapBridge {...base} />);
  await send('{"type":"ready"}');
  mockInject.mockClear();
  await rerender(<MapBridge {...base} course={{ stops: [{ lat: 37.5, lng: 127 }], route: null }} />);
  expect(mockInject).toHaveBeenCalledTimes(1);
  expect(mockInject.mock.calls[0][0]).toContain('setCourse');
});

test('코스보다 내 위치를 먼저 보낸다(범위에 내 위치가 들어가게)', async () => {
  await render(<MapBridge {...base} myLocation={{ lat: 37.51, lng: 126.95, accuracy: 10 }} course={{ stops: [{ lat: 37.5, lng: 127 }], route: null }} />);
  await send('{"type":"ready"}');
  const order = mockInject.mock.calls.map(([s]) => (s.includes('setMyLocation') ? 'me' : s.includes('setCourse') ? 'course' : null)).filter(Boolean);
  expect(order).toEqual(['me', 'course']);
});
