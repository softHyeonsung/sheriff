/* eslint-disable @typescript-eslint/no-explicit-any -- a fake Kakao SDK, loosely typed on purpose */
// Runs the real page script against a fake Kakao SDK: the cat/fog logic lives in the WebView, where
// a thrown error blanks the whole map.
import { GRADES } from '../grades';
import { buildMapHtml } from '../webview-template';

const markers = Object.fromEntries(GRADES.map((g) => [g, { uri: g, size: 36 }])) as Parameters<typeof buildMapHtml>[0]['markers'];
const W = 0.00113; // one cell's width in lng
const H = 0.0009; // one cell's height in lat
const cell = (col: number) => ({ sw: { lat: 37.5, lng: 126.9 + col * W }, ne: { lat: 37.5 + H, lng: 126.9 + (col + 1) * W } });

function boot() {
  const posted: any[] = [];
  const cats: any[] = [];
  const stops: any[] = [];
  const lines: any[] = [];
  const fitted: any[] = [];
  const el = (): any => ({ style: {}, appendChild() {}, addEventListener() {} });
  let sdk: any;
  const document = { getElementById: () => ({}), createElement: el, head: { appendChild: (s: any) => (sdk = s) } };
  function LatLng(this: any, lat: number, lng: number) {
    this.lat = lat;
    this.lng = lng;
    this.getLat = () => lat;
    this.getLng = () => lng;
  }
  const kakao = {
    maps: {
      load: (cb: () => void) => cb(),
      LatLng,
      Map: function (this: any) {
        this.getCenter = () => new (LatLng as any)(37.5, 126.9);
        this.setBounds = (b: any) => fitted.push(b);
      },
      Polygon: function (this: any) {
        this.setMap = () => {};
      },
      CustomOverlay: function (this: any, o: any) {
        this.map = o.map;
        this.path = [o.position];
        this.setPosition = (p: any) => this.path.push(p);
        this.setMap = (m: any) => (this.map = m);
        if (o.zIndex === 5) cats.push(this);
        if (o.zIndex === 6) stops.push(this);
      },
      Polyline: function (this: any, o: any) {
        this.map = o.map;
        this.path = o.path;
        this.setMap = (m: any) => (this.map = m);
        lines.push(this);
      },
      LatLngBounds: function (this: any) {
        this.points = [];
        this.extend = (p: any) => this.points.push(p);
      },
      event: { addListener() {} },
    },
  };
  const window: any = { ReactNativeWebView: { postMessage: (s: string) => posted.push(JSON.parse(s)) } };
  const html = buildMapHtml({ jsKey: 'k', markers, center: { lat: 37.5, lng: 126.9 }, cat: { sit: 'CAT', walk: 'W', lie: 'L', happy: 'H', look: 'K' }, fogColor: '#CFC8BA', wish: { uri: 'data:image/svg+xml,WISH', size: 36 } });
  const body = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'kakao', 'requestAnimationFrame', body)(window, document, kakao, (f: () => void) => setTimeout(f, 16));
  sdk.onload();
  return { send: (m: unknown) => window.__onAppMessage(m), posted, cats, stops, lines, fitted };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('걷힌 칸이 없어지면 고양이가 사라지고 페이지가 죽지 않는다', () => {
  const page = boot();
  page.send({ type: 'setFog', cells: [cell(0)] });
  expect(page.cats).toHaveLength(1);
  page.send({ type: 'setFog', cells: [] });
  expect(() => jest.advanceTimersByTime(60000)).not.toThrow();
  expect(page.cats[0].map).toBeNull();
});

test('고양이는 안개 낀 칸을 가로지르지 않는다(두 칸 떨어진 칸은 이웃이 아님)', () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.99); // always the far edge, always the last neighbour
  const page = boot();
  page.send({ type: 'setFog', cells: [cell(0), cell(2)] }); // cell(1) stays fogged
  jest.advanceTimersByTime(60000);
  const fogged = cell(1);
  const crossed = page.cats[0].path.some((p: any) => p.lng > fogged.sw.lng && p.lng < fogged.ne.lng);
  expect(crossed).toBe(false);
});

test('코스: 번호 핀과 선을 그리고 범위를 맞춘다, null이면 지운다', () => {
  const page = boot();
  page.send({ type: 'setMyLocation', lat: 37.5, lng: 126.9, accuracy: 10 });
  page.send({ type: 'setCourse', course: { stops: [{ lat: 37.501, lng: 126.9 }, { lat: 37.502, lng: 126.9 }], route: [[37.5, 126.9], [37.502, 126.9]] } });
  expect(page.stops).toHaveLength(2);
  expect(page.lines).toHaveLength(1);
  expect(page.lines[0].path).toHaveLength(2);
  expect(page.fitted[0].points).toHaveLength(5); // 내 위치 + 경로 2 + 핀 2
  page.send({ type: 'setCourse', course: null });
  expect(page.stops.every((s: any) => s.map === null)).toBe(true);
  expect(page.lines[0].map).toBeNull();
});

test('코스: 경로가 없으면 핀만, 다시 보내면 앞의 것을 지운다', () => {
  const page = boot();
  page.send({ type: 'setCourse', course: { stops: [{ lat: 37.501, lng: 126.9 }], route: null } });
  expect(page.lines).toHaveLength(0);
  page.send({ type: 'setCourse', course: { stops: [{ lat: 37.6, lng: 127 }], route: null } });
  expect(page.stops).toHaveLength(2);
  expect(page.stops[0].map).toBeNull();
  expect(page.stops[1].map).not.toBeNull();
});
