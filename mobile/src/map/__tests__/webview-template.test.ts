// mobile/src/map/__tests__/webview-template.test.ts
import { GRADES } from '../grades';
import { buildMapHtml } from '../webview-template';

const markers = Object.fromEntries(GRADES.map((g, i) => [g, { uri: `data:image/png;base64,${g}`, size: 36 + i * 8 }])) as Parameters<
  typeof buildMapHtml
>[0]['markers'];

test('카카오 SDK를 JS 키로 불러오고 설정을 싣는다', () => {
  const html = buildMapHtml({ jsKey: 'abc123', markers, center: { lat: 37.5665, lng: 126.978 }, cat: { sit: 'data:image/png;base64,CAT', walk: 'W', lie: 'L', happy: 'H', look: 'K' }, fogColor: '#CFC8BA', wish: { uri: 'data:image/svg+xml,WISH', size: 36 } });
  expect(html).toContain('<div id="map"');
  expect(html).toContain('dapi.kakao.com/v2/maps/sdk.js');
  expect(html).toContain('abc123');
  expect(html).toContain('data:image/png;base64,palace');
  expect(html).toContain('data:image/png;base64,CAT');
  expect(html).toContain("addListener(map, 'idle'");
  expect(html).toContain('setFog');
  expect(html).toContain('data:image/svg+xml,WISH');
  expect(html).toContain('setWishes');
  expect(html).toContain("type: 'wishTap'");
  expect(html).toContain('setPose');
  expect(html).toContain("m.type === 'setCat'");
  expect(html).toContain("m.type === 'setCourse'");
  expect(html).toContain('#F59E0B');
});

test('설정 값이 </script>를 품어도 스크립트 블록이 깨지지 않는다', () => {
  const html = buildMapHtml({ jsKey: '</script><script>alert(1)</script>', markers, center: { lat: 37.5, lng: 126.9 }, cat: { sit: 'data:image/png;base64,CAT', walk: 'W', lie: 'L', happy: 'H', look: 'K' }, fogColor: '#CFC8BA', wish: { uri: 'data:image/svg+xml,WISH', size: 36 } });
  expect(html.match(/<\/script>/g)?.length).toBe(html.match(/<script>/g)?.length);
  expect(html).not.toContain('<script>alert(1)');
});

test('페이지 스크립트는 문법 오류가 없다', () => {
  const html = buildMapHtml({ jsKey: 'k', markers, center: { lat: 37.5, lng: 126.9 }, cat: { sit: 'data:image/png;base64,CAT', walk: 'W', lie: 'L', happy: 'H', look: 'K' }, fogColor: '#CFC8BA', wish: { uri: 'data:image/svg+xml,WISH', size: 36 } });
  const body = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  expect(() => new Function(body)).not.toThrow();
});
