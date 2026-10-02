// mobile/src/map/__tests__/protocol.test.ts
import { parseMapMessage, toMapScript, type AppToMap } from '../protocol';

test('정상 메시지는 통과한다', () => {
  expect(parseMapMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
  expect(parseMapMessage('{"type":"hideoutTap","id":"a1"}')).toEqual({ type: 'hideoutTap', id: 'a1' });
  expect(parseMapMessage('{"type":"error","reason":"sdk_load_failed"}')).toEqual({ type: 'error', reason: 'sdk_load_failed' });
  expect(parseMapMessage('{"type":"idle","center":{"lat":37.5,"lng":126.9}}')).toEqual({ type: 'idle', center: { lat: 37.5, lng: 126.9 } });
  expect(parseMapMessage('{"type":"catTap"}')).toEqual({ type: 'catTap' });
});

test('이상한 메시지는 버린다', () => {
  for (const raw of [
    'not json',
    'null',
    '42',
    '{"type":"navigate","url":"https://evil.example"}',
    '{"type":"hideoutTap"}',
    '{"type":"hideoutTap","id":7}',
    '{"type":"error"}',
    '{"type":"idle"}',
    '{"type":"idle","center":null}',
    '{"type":"idle","center":{"lat":"37.5","lng":126.9}}',
    '{"type":"idle","center":{"lat":95,"lng":126.9}}',
    '{"type":"idle","center":{"lat":37.5,"lng":-181}}',
  ]) {
    expect(parseMapMessage(raw)).toBeNull();
  }
});

test('주입 스크립트는 값을 데이터로만 전달한다(따옴표·스크립트 문자가 실행되지 않음)', () => {
  const msg: AppToMap = {
    type: 'setHideouts',
    hideouts: [{ id: `x");alert(1);//</script>`, lat: 37.5, lng: 126.9, grade: 'hut', name: '단골 카페' }],
  };
  const received: unknown[] = [];
  const fakeWindow = { __onAppMessage: (m: unknown) => received.push(m) };
  // eslint-disable-next-line no-new-func
  new Function('window', toMapScript(msg))(fakeWindow);
  expect(received).toEqual([msg]);
});

test('wishTap을 읽는다(모양이 틀리면 버린다)', () => {
  expect(parseMapMessage(JSON.stringify({ type: 'wishTap', placeId: '123' }))).toEqual({ type: 'wishTap', placeId: '123' });
  expect(parseMapMessage(JSON.stringify({ type: 'wishTap', placeId: 5 }))).toBeNull();
});

test('setCat은 자세 묶음을 싣는다', () => {
  expect(toMapScript({ type: 'setCat', poses: { sit: 'a', walk: 'b', lie: 'c', happy: 'd', look: 'e' } })).toContain('setCat');
});

test('setCourse는 좌표를 문자열 안에 실어 보낸다', () => {
  const script = toMapScript({ type: 'setCourse', course: { stops: [{ lat: 37.5, lng: 127 }], route: [[37.5, 127]] } });
  expect(script).toContain('setCourse');
  expect(script.startsWith('window.__onAppMessage(JSON.parse(')).toBe(true);
});
