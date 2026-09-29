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
      },
      event: { addListener() {} },
    },
  };
  const window: any = { ReactNativeWebView: { postMessage: (s: string) => posted.push(JSON.parse(s)) } };
  const html = buildMapHtml({ jsKey: 'k', markers, center: { lat: 37.5, lng: 126.9 }, cat: 'CAT', fogColor: '#CFC8BA' });
  const body = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'kakao', 'requestAnimationFrame', body)(window, document, kakao, (f: () => void) => setTimeout(f, 16));
  sdk.onload();
  return { send: (m: unknown) => window.__onAppMessage(m), posted, cats };
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
