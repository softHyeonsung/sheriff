/* eslint-disable @typescript-eslint/no-explicit-any -- a fake Kakao SDK and DOM, loosely typed on purpose */
// Runs the real page script against a fake Kakao SDK: the cat/fog/zoom logic lives in the WebView, where
// a thrown error blanks the whole map.
import { GRADES } from '../grades';
import { buildMapHtml } from '../webview-template';

const markers = Object.fromEntries(GRADES.map((g) => [g, { uri: g, size: 36 }])) as Parameters<typeof buildMapHtml>[0]['markers'];
const W = 0.00113; // one cell's width in lng
const H = 0.0009; // one cell's height in lat
const cell = (col: number) => ({ sw: { lat: 37.5, lng: 126.9 + col * W }, ne: { lat: 37.5 + H, lng: 126.9 + (col + 1) * W } });

function boot() {
  const posted: any[] = [];
  const overlays: any[] = [];
  const lines: any[] = [];
  const fitted: any[] = [];
  const canvases: any[] = [];
  const imgs: any[] = [];
  const handlers: Record<string, () => void> = {};
  let sdk: any;
  let level = 0;
  const levelsSet: number[] = [];
  const ctx = (): any => ({
    ops: [] as any[],
    globalCompositeOperation: 'source-over',
    save() {},
    restore() {},
    translate() {},
    createPattern: () => 'pattern',
    fillRect(this: any, x: number, y: number, w: number, h: number) {
      this.ops.push({ op: this.globalCompositeOperation, x, y, w, h });
    },
    drawImage(this: any) {
      this.ops.push({ op: 'draw' });
    },
  });
  const el = (tag: string): any => {
    const e: any = {
      tag,
      style: {},
      children: [] as any[],
      listeners: {} as Record<string, () => void>,
      appendChild(c: any) {
        this.children.push(c);
      },
      addEventListener(t: string, f: () => void) {
        this.listeners[t] = f;
      },
    };
    if (tag === 'canvas') {
      e.ctx = ctx();
      e.getContext = () => e.ctx;
      canvases.push(e);
    }
    if (tag === 'img') imgs.push(e);
    return e;
  };
  const document = {
    getElementById: () => ({ clientWidth: 400, clientHeight: 800 }),
    createElement: el,
    head: { appendChild: (s: any) => (sdk = s) },
  };
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
      Map: function (this: any, _box: any, o: any) {
        level = o.level;
        this.getCenter = () => new (LatLng as any)(37.5, 126.9);
        this.getLevel = () => level;
        this.setLevel = (l: number) => {
          level = l;
          levelsSet.push(l);
          handlers.zoom_changed?.();
        };
        this.panTo = () => {};
        this.setBounds = (b: any) => fitted.push(b);
        // 1도 = 100000px, 화면 왼쪽 위 = (37.51, 126.9)
        this.getProjection = () => ({
          containerPointFromCoords: (p: any) => ({ x: (p.lng - 126.9) * 100000, y: (37.51 - p.lat) * 100000 }),
        });
      },
      CustomOverlay: function (this: any, o: any) {
        this.map = o.map ?? null;
        this.content = o.content;
        this.zIndex = o.zIndex;
        this.path = [o.position];
        this.setPosition = (p: any) => this.path.push(p);
        this.setMap = (m: any) => (this.map = m);
        overlays.push(this);
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
      event: { addListener: (_t: any, name: string, f: () => void) => (handlers[name] = f) },
    },
  };
  const window: any = { ReactNativeWebView: { postMessage: (s: string) => posted.push(JSON.parse(s)) } };
  const html = buildMapHtml({
    jsKey: 'k',
    markers,
    center: { lat: 37.5, lng: 126.9 },
    cat: { sit: 'CAT', walk: 'W', lie: 'L', happy: 'H', look: 'K' },
    ground: { meadow: 'MEADOW', fog: 'FOG', tile: 256 },
  });
  const body = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'kakao', 'requestAnimationFrame', body)(window, document, kakao, (f: () => void) => setTimeout(f, 16));
  sdk.onload();
  const at = (z: number) => overlays.filter((o) => o.zIndex === z);
  return {
    send: (m: unknown) => window.__onAppMessage(m),
    posted,
    overlays,
    lines,
    fitted,
    canvases,
    levelsSet,
    cats: () => at(5),
    stops: () => at(6),
    focus: () => at(7),
    hideouts: () => at(4),
    wishes: () => at(3),
    zoom: (l: number) => {
      level = l;
      handlers.zoom_changed();
    },
    // 바탕 그림 두 장이 다 불려 온 것처럼
    loadTiles: () => imgs.filter((i) => i.onload).forEach((i) => i.onload()),
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('걷힌 칸이 없어지면 고양이가 사라지고 페이지가 죽지 않는다', () => {
  const page = boot();
  page.send({ type: 'setFog', cells: [cell(0)] });
  expect(page.cats()).toHaveLength(1);
  page.send({ type: 'setFog', cells: [] });
  expect(() => jest.advanceTimersByTime(60000)).not.toThrow();
  expect(page.cats()[0].map).toBeNull();
});

test('고양이는 안개 낀 칸을 가로지르지 않는다(두 칸 떨어진 칸은 이웃이 아님)', () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.99); // always the far edge, always the last neighbour
  const page = boot();
  page.send({ type: 'setFog', cells: [cell(0), cell(2)] }); // cell(1) stays fogged
  jest.advanceTimersByTime(60000);
  const fogged = cell(1);
  const crossed = page.cats()[0].path.some((p: any) => p.lng > fogged.sw.lng && p.lng < fogged.ne.lng);
  expect(crossed).toBe(false);
});

test('줌 LOD: 처음(멀리)은 수채 세계가 불투명하고 아지트는 그림, 가까이 가면 걷히고 이름 달린 핀', () => {
  const page = boot();
  page.send({ type: 'setFog', cells: [cell(0)] });
  page.send({ type: 'setHideouts', hideouts: [{ id: 'a1', lat: 37.5, lng: 126.9, grade: 'hut', name: '단골 카페' }] });
  const [sprite, pin] = page.hideouts();
  const ground = page.canvases[0];
  const cat = page.cats()[0];
  expect(ground.style.opacity).toBe('1');
  expect(cat.content.style.opacity).toBe('1');
  expect(sprite.map).not.toBeNull();
  expect(pin.map).toBeNull();

  page.zoom(3); // 가까이: 실제 지도
  expect(ground.style.opacity).toBe('0');
  expect(cat.content.style.opacity).toBe('0');
  expect(cat.content.style.pointerEvents).toBe('none'); // 안 보이는 고양이가 눌리지 않게
  expect(sprite.map).toBeNull();
  expect(pin.map).not.toBeNull();

  page.zoom(7);
  expect(ground.style.opacity).toBe('1');
  expect(pin.map).toBeNull();
});

test('아지트 핀: 이름은 글자로만 넣고(HTML로 해석 안 됨), 그림과 핀 어느 쪽을 눌러도 그 아지트', () => {
  const page = boot();
  page.send({ type: 'setHideouts', hideouts: [{ id: 'a1', lat: 37.5, lng: 126.9, grade: 'box', name: '<img src=x onerror=alert(1)>' }] });
  const [sprite, pin] = page.hideouts();
  const label = pin.content.children[0];
  expect(label.textContent).toBe('<img src=x onerror=alert(1)>');
  expect(label.innerHTML).toBeUndefined();
  sprite.content.listeners.click();
  pin.content.listeners.click();
  expect(page.posted.filter((m) => m.type === 'hideoutTap')).toEqual([
    { type: 'hideoutTap', id: 'a1' },
    { type: 'hideoutTap', id: 'a1' },
  ]);
  // 다시 보내면 앞의 것은 지도에서 내려간다
  page.send({ type: 'setHideouts', hideouts: [] });
  expect(sprite.map).toBeNull();
  expect(pin.map).toBeNull();
});

test('찜 핀: 줌과 무관하게 보이고, 누르면 그 찜', () => {
  const page = boot();
  page.send({ type: 'setWishes', wishes: [{ placeId: '9', lat: 37.5, lng: 126.9 }] });
  const [wish] = page.wishes();
  expect(wish.map).not.toBeNull();
  page.zoom(2);
  expect(wish.map).not.toBeNull();
  wish.content.listeners.click();
  expect(page.posted).toContainEqual({ type: 'wishTap', placeId: '9' });
});

test('바탕: 초원을 깔고 안개를 덮은 뒤, 화면 안의 걷힌 칸만 지운다', () => {
  const page = boot();
  page.send({ type: 'setFog', cells: [cell(0), cell(1), cell(5000)] }); // 마지막 칸은 화면 밖
  page.loadTiles();
  const [ground, fogLayer] = page.canvases;
  fogLayer.ctx.ops.length = 0; // loading the tiles already drew once; look at one redraw
  jest.advanceTimersByTime(20);
  const erased = fogLayer.ctx.ops.filter((o: any) => o.op === 'destination-out');
  expect(erased).toHaveLength(2);
  // 캔버스는 화면(400x800)의 1.5배: 칸 자리는 넘치는 만큼(100, 200) 밀려 있다
  expect(Math.round(erased[0].x)).toBe(100);
  expect(Math.round(erased[0].y)).toBe(1110);
  expect(Math.round(erased[0].w)).toBe(113);
  expect(Math.round(erased[0].h)).toBe(90);
  expect(ground.ctx.ops.at(-1)).toEqual({ op: 'draw' }); // 안개 층을 초원 위에 얹는다
});

test('바탕 그림이 아직 안 왔으면 칠하지 않고 기다린다', () => {
  const page = boot();
  page.send({ type: 'setFog', cells: [cell(0)] });
  expect(() => jest.advanceTimersByTime(100)).not.toThrow();
  expect(page.canvases[0].ctx.ops).toHaveLength(0);
});

test('panTo: level이 오면 그만큼 가까이 당기고, 이미 더 가까우면 그대로', () => {
  const page = boot();
  page.send({ type: 'panTo', lat: 37.5, lng: 126.9, level: 3 });
  expect(page.levelsSet).toEqual([3]);
  page.send({ type: 'panTo', lat: 37.5, lng: 126.9, level: 3 });
  page.zoom(2);
  page.send({ type: 'panTo', lat: 37.5, lng: 126.9, level: 3 });
  page.send({ type: 'panTo', lat: 37.5, lng: 126.9 });
  expect(page.levelsSet).toEqual([3]);
});

test('코스: 번호 핀과 선을 그리고 범위를 맞춘다, null이면 지운다', () => {
  const page = boot();
  page.send({ type: 'setMyLocation', lat: 37.5, lng: 126.9, accuracy: 10 });
  page.send({ type: 'setCourse', course: { stops: [{ lat: 37.501, lng: 126.9 }, { lat: 37.502, lng: 126.9 }], route: [[37.5, 126.9], [37.502, 126.9]] } });
  expect(page.stops()).toHaveLength(2);
  expect(page.stops()[0].content.textContent).toBe('1');
  expect(page.lines).toHaveLength(1);
  expect(page.lines[0].path).toHaveLength(2);
  expect(page.fitted[0].points).toHaveLength(5); // 내 위치 + 경로 2 + 핀 2
  page.send({ type: 'setCourse', course: null });
  expect(page.stops().every((s: any) => s.map === null)).toBe(true);
  expect(page.lines[0].map).toBeNull();
});

test('코스: 경로가 없으면 핀만, 다시 보내면 앞의 것을 지운다', () => {
  const page = boot();
  page.send({ type: 'setCourse', course: { stops: [{ lat: 37.501, lng: 126.9 }], route: null } });
  expect(page.lines).toHaveLength(0);
  page.send({ type: 'setCourse', course: { stops: [{ lat: 37.6, lng: 127 }], route: null } });
  expect(page.stops()).toHaveLength(2);
  expect(page.stops()[0].map).toBeNull();
  expect(page.stops()[1].map).not.toBeNull();
});

test('코스: 그리다 오류가 나도 지도는 살아 있다', () => {
  const page = boot();
  expect(() => page.send({ type: 'setCourse', course: { stops: null, route: null } })).not.toThrow();
  expect(page.posted.some((m: any) => m.type === 'error')).toBe(false);
  page.send({ type: 'setCourse', course: { stops: [{ lat: 37.501, lng: 126.9 }], route: null } });
  expect(page.stops().filter((s: any) => s.map)).toHaveLength(1);
});

test('검색한 곳: 표시 하나를 찍고, 다시 보내면 옮기고, null이면 지운다', () => {
  const page = boot();
  page.send({ type: 'setFocus', at: { lat: 37.58, lng: 126.98 } });
  expect(page.focus()).toHaveLength(1);
  expect(page.focus()[0].map).not.toBeNull();
  page.send({ type: 'setFocus', at: { lat: 37.59, lng: 126.99 } });
  expect(page.focus()).toHaveLength(2);
  expect(page.focus()[0].map).toBeNull();
  page.send({ type: 'setFocus', at: null });
  expect(page.focus()[1].map).toBeNull();
});

test('코스를 보는 동안은 멀리서도 수채 세계가 걷힌다(선과 실제 길이 보이게), 닫으면 돌아온다', () => {
  const page = boot();
  page.send({ type: 'setFog', cells: [cell(0)] });
  const ground = page.canvases[0];
  expect(ground.style.opacity).toBe('1');
  page.send({ type: 'setCourse', course: { stops: [{ lat: 37.501, lng: 126.9 }], route: [[37.5, 126.9], [37.501, 126.9]] } });
  expect(ground.style.opacity).toBe('0');
  page.zoom(6);
  expect(ground.style.opacity).toBe('0');
  page.send({ type: 'setCourse', course: null });
  expect(ground.style.opacity).toBe('1');
});
