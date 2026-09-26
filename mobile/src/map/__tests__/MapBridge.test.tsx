// mobile/src/map/__tests__/MapBridge.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles for native components */
import { createRef } from 'react';
import { act, render } from '@testing-library/react-native';
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
const base = { hideouts: pins, myLocation: null, center: { lat: 37.5665, lng: 126.978 }, onHideoutTap: jest.fn(), onError: jest.fn() };
const send = async (data: string) => act(async () => mockWebProps.onMessage({ nativeEvent: { data } }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_KAKAO_JS_KEY = 'test-key';
});

test('지도 준비 전엔 보내지 않고, ready 이후에 보낸다', async () => {
  await render(<MapBridge {...base} />);
  expect(mockInject).not.toHaveBeenCalled();
  await send('{"type":"ready"}');
  expect(mockInject).toHaveBeenCalledTimes(1);
  expect(mockInject.mock.calls[0][0]).toContain('setHideouts');
  expect(mockInject.mock.calls[0][0]).toContain('a1');
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
