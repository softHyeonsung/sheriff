// mobile/src/map/__tests__/webview-template.test.ts
import { GRADES } from '../grades';
import { buildMapHtml } from '../webview-template';

const markers = Object.fromEntries(GRADES.map((g, i) => [g, { uri: `data:image/png;base64,${g}`, size: 36 + i * 8 }])) as Parameters<
  typeof buildMapHtml
>[0]['markers'];

test('카카오 SDK를 JS 키로 불러오고 설정을 싣는다', () => {
  const html = buildMapHtml({ jsKey: 'abc123', markers, center: { lat: 37.5665, lng: 126.978 } });
  expect(html).toContain('<div id="map"');
  expect(html).toContain('dapi.kakao.com/v2/maps/sdk.js');
  expect(html).toContain('abc123');
  expect(html).toContain('data:image/png;base64,palace');
});

test('설정 값이 </script>를 품어도 스크립트 블록이 깨지지 않는다', () => {
  const html = buildMapHtml({ jsKey: '</script><script>alert(1)</script>', markers, center: { lat: 37.5, lng: 126.9 } });
  expect(html.match(/<\/script>/g)?.length).toBe(html.match(/<script>/g)?.length);
  expect(html).not.toContain('<script>alert(1)');
});
