// mobile/src/map/webview-template.ts
//
// 지도 페이지(WebView 안에서 도는 HTML 한 장). 카카오맵 위에 우리 것을 얹는다.
// 줌 LOD(DESIGN.md §4.3) — 멀리: 수채 세계(초원·안개·아지트 그림·고양이)가 불투명 = 감상.
// 가까이: 그 층이 걷혀 실제 지도 = 목적지. 다녀온 곳은 이름 달린 아지트 핀, 가야 할 곳은 하늘색 핀.
import type { CatPose } from './catColors';
import type { Grade } from './grades';
import type { LatLng } from './protocol';

type Opts = {
  jsKey: string;
  markers: Record<Grade, { uri: string; size: number }>;
  center: LatLng;
  cat: Record<CatPose, string>;
  // 멀리 볼 때 지도 위에 칠하는 바탕: 걷힌 곳의 초원, 안 걷힌 곳의 안개. tile = 한 장의 한 변(css px).
  ground: { meadow: string; fog: string; tile: number };
};

// JSON for embedding inside <script>: escaping "<" keeps "</script>" in any value from
// closing the block early.
const embed = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

const CSS = [
  'html,body,#map{margin:0;padding:0;width:100%;height:100%}',
  '.me{width:16px;height:16px;border-radius:50%;background:#5BAFE6;border:3px solid #FFFFFF;box-shadow:0 0 0 6px rgba(91,175,230,0.25)}',
  '.ground{display:block;pointer-events:none;transition:opacity .25s ease-out}',
  '.cat{position:relative;width:48px;height:48px;transition:opacity .25s ease-out}.cat img{width:48px;height:48px;display:block}',
  '.bubble{position:absolute;bottom:54px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#FFFFFF;color:#333B31;border-radius:12px;padding:6px 10px;font:14px/1.3 sans-serif;box-shadow:0 2px 6px rgba(51,59,49,0.2);display:none}',
  // 아지트: 멀리선 그림(.spr), 가까이선 이름 달린 핀(.pin)
  '.spr{display:block;filter:drop-shadow(0 3px 4px rgba(51,59,49,0.25))}',
  '.pin{display:flex;flex-direction:column;align-items:center}',
  '.lbl{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 12px/1.3 sans-serif;color:#333B31;text-shadow:0 0 3px #FFFFFF,0 0 3px #FFFFFF,0 0 3px #FFFFFF;margin-bottom:3px}',
  '.pinb{width:38px;height:38px;border-radius:12px;background:#FFFFFF;border:2px solid #F6B13C;box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(51,59,49,0.25)}',
  '.pinb img{width:28px;height:28px;display:block}',
  '.tip{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #F6B13C;margin-top:-1px}',
  // 가야 할 곳(찜): 하늘색 테두리 핀
  '.goal{display:flex;flex-direction:column;align-items:center}',
  '.goalb{width:30px;height:30px;border-radius:15px;background:#FFFFFF;border:2px solid #5BAFE6;box-sizing:border-box;color:#2F86C6;font:16px/26px sans-serif;text-align:center;box-shadow:0 3px 8px rgba(51,59,49,0.22)}',
  '.goalt{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #5BAFE6;margin-top:-1px}',
  // 코스의 번호 핀, 검색한 곳
  '.stop{width:28px;height:28px;border-radius:14px;background:#FFFFFF;border:2px solid #5BAFE6;box-sizing:border-box;color:#1F6396;font:bold 14px/24px sans-serif;text-align:center;box-shadow:0 2px 6px rgba(51,59,49,0.3)}',
  '.focus{width:22px;height:22px;border-radius:11px;background:#2F86C6;border:4px solid #FFFFFF;box-shadow:0 2px 8px rgba(51,59,49,0.35)}',
].join('');

export function buildMapHtml({ jsKey, markers, center, cat, ground }: Opts): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${CSS}</style>
</head><body>
<div id="map"></div>
<script>
(function () {
  var cfg = ${embed({ jsKey, markers, center, cat, ground })};
  function post(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  window.onerror = function (msg) { post({ type: 'error', reason: String(msg) }); };
  var map = null, me = null, meAt = null;
  var hideoutItems = [], wishItems = [], courseItems = [], focusPin = null;
  var cells = [], cat = null, catEl = null, catImg = null, bubble = null, catAt = null, catCell = null, bubbleTimer = null;
  var pose = 'sit', poseTimer = null, lieTimer = null, happyUntil = 0;
  var ground = null, gcv = null, gctx = null, fcv = null, fctx = null, tiles = {}, gW = 0, gH = 0, groundQueued = false;

  // 줌 LOD. 카카오의 level은 작을수록 가까이. NEAR 이하면 실제 지도만, FAR 이상이면 수채 세계가 불투명.
  // 둘이 붙어 있다 = 중간 단계 없음: 반쯤 비치는 탁한 상태에 머물지 않고, 넘어갈 때만 잠깐 스르륵 바뀐다.
  // level 4(축척 100m)에서 걷힌 칸 하나가 아지트 그림 하나 크기, level 3(50m)에서 골목과 가게 이름이 읽힌다.
  var NEAR = 3, FAR = 4, START = 4;
  // 바탕 무늬를 붙들어 둘 자리(아무 고정 좌표): 지도를 끌면 무늬도 땅에 붙어 따라온다.
  var ANCHOR = [37.5, 127];

  function latLng(p) { return new kakao.maps.LatLng(p.lat, p.lng); }
  function el(cls, text) {
    var d = document.createElement('div');
    d.className = cls;
    if (text !== undefined) d.textContent = text; // textContent: 이름·문구가 HTML로 해석되지 않게
    return d;
  }
  // 수채 세계가 얼마나 덮는가: 0(가까이, 실제 지도) ~ 1(멀리).
  // 코스를 보는 동안은 줌과 무관하게 0: 가는 길(선)과 실제 길이 보여야 한다.
  function paint() {
    if (courseItems.length) return 0;
    var l = map.getLevel();
    return l <= NEAR ? 0 : l >= FAR ? 1 : (l - NEAR) / (FAR - NEAR);
  }

  // ---- 바탕(초원·안개): 캔버스 한 장을 지도에 얹고, 지도가 움직일 때마다 지금 보이는 만큼 다시 칠한다.
  function initGround() {
    gcv = document.createElement('canvas');
    if (!gcv.getContext) return;
    var box = document.getElementById('map');
    // 화면보다 넉넉히: 끄는 동안 가장자리로 맨 지도가 비치지 않게.
    gW = Math.ceil(box.clientWidth * 1.5);
    gH = Math.ceil(box.clientHeight * 1.5);
    gcv.width = gW; gcv.height = gH; gcv.className = 'ground';
    gctx = gcv.getContext('2d');
    fcv = document.createElement('canvas');
    fcv.width = gW; fcv.height = gH;
    fctx = fcv.getContext('2d');
    ground = new kakao.maps.CustomOverlay({ content: gcv, position: map.getCenter(), map: map, xAnchor: 0.5, yAnchor: 0.5, zIndex: 1 });
    ['meadow', 'fog'].forEach(function (k) {
      var im = document.createElement('img');
      im.onload = function () { tiles[k] = im; drawGround(); };
      im.src = cfg.ground[k];
    });
  }
  function queueGround() {
    if (groundQueued) return;
    groundQueued = true;
    requestAnimationFrame(function () { groundQueued = false; drawGround(); });
  }
  function drawGround() {
    if (!gctx || !tiles.meadow || !tiles.fog) return;
    var box = document.getElementById('map');
    var dx = (gW - box.clientWidth) / 2, dy = (gH - box.clientHeight) / 2; // 캔버스가 화면보다 넘치는 만큼
    var proj = map.getProjection();
    ground.setPosition(map.getCenter());
    var T = cfg.ground.tile;
    var o = proj.containerPointFromCoords(new kakao.maps.LatLng(ANCHOR[0], ANCHOR[1]));
    var ox = (((o.x + dx) % T) + T) % T - T, oy = (((o.y + dy) % T) + T) % T - T;
    function fill(ctx, img) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = ctx.createPattern(img, 'repeat');
      ctx.fillRect(0, 0, gW + T, gH + T);
      ctx.restore();
    }
    // 아래: 초원을 가득. 위: 안개를 가득 칠한 다음 걷힌 칸만 부드러운 가장자리로 지운다.
    gctx.globalCompositeOperation = 'source-over';
    fill(gctx, tiles.meadow);
    fctx.globalCompositeOperation = 'source-over';
    fctx.shadowBlur = 0;
    fill(fctx, tiles.fog);
    fctx.globalCompositeOperation = 'destination-out';
    fctx.fillStyle = '#000';
    fctx.shadowColor = '#000';
    fctx.shadowBlur = 22; // 걷힌 자리의 가장자리를 수채처럼 번지게
    cells.forEach(function (c) {
      var a = proj.containerPointFromCoords(new kakao.maps.LatLng(c.ne.lat, c.sw.lng));
      var b = proj.containerPointFromCoords(new kakao.maps.LatLng(c.sw.lat, c.ne.lng));
      var x = a.x + dx, y = a.y + dy, w = b.x - a.x, h = b.y - a.y;
      if (x > gW || y > gH || x + w < 0 || y + h < 0) return; // 화면 밖 칸은 건너뛴다
      fctx.fillRect(x, y, w, h);
    });
    fctx.shadowBlur = 0;
    gctx.drawImage(fcv, 0, 0);
  }

  // ---- 줌에 따라 층을 바꾼다.
  function applyLod() {
    var p = paint(), far = p >= 0.5;
    if (gcv && gcv.style) gcv.style.opacity = String(p);
    if (catEl) { catEl.style.opacity = String(p); catEl.style.pointerEvents = far ? 'auto' : 'none'; }
    hideoutItems.forEach(function (h) {
      h.sprite.setMap(far ? map : null);
      h.pin.setMap(far ? null : map);
    });
  }

  function setHideouts(list) {
    hideoutItems.forEach(function (h) { h.sprite.setMap(null); h.pin.setMap(null); });
    hideoutItems = list.map(function (h) {
      var mk = cfg.markers[h.grade];
      var tap = function () { post({ type: 'hideoutTap', id: h.id }); };
      // 멀리: 수채 그림 그대로(등급이 오를수록 크다).
      var spr = document.createElement('img');
      spr.className = 'spr';
      spr.src = mk.uri;
      spr.style.width = spr.style.height = Math.round(mk.size * 1.4) + 'px';
      spr.addEventListener('click', tap);
      // 가까이: 이름 + 햇살색 테두리 핀(다녀온 곳).
      var pin = el('pin');
      if (h.name) pin.appendChild(el('lbl', h.name));
      var body = el('pinb');
      var art = document.createElement('img');
      art.src = mk.uri;
      body.appendChild(art);
      pin.appendChild(body);
      pin.appendChild(el('tip'));
      pin.addEventListener('click', tap);
      return {
        sprite: new kakao.maps.CustomOverlay({ content: spr, position: latLng(h), yAnchor: 0.85, zIndex: 4, clickable: true }),
        pin: new kakao.maps.CustomOverlay({ content: pin, position: latLng(h), yAnchor: 1, zIndex: 4, clickable: true }),
      };
    });
    applyLod();
  }

  // 가야 할 곳(찜): 하늘색 테두리 핀. 줌과 무관하게 보인다.
  function setWishes(list) {
    wishItems.forEach(function (o) { o.setMap(null); });
    wishItems = list.map(function (w) {
      var pin = el('goal');
      pin.appendChild(el('goalb', '\\u2605'));
      pin.appendChild(el('goalt'));
      pin.addEventListener('click', function () { post({ type: 'wishTap', placeId: w.placeId }); });
      return new kakao.maps.CustomOverlay({ content: pin, position: latLng(w), map: map, yAnchor: 1, zIndex: 3, clickable: true });
    });
  }

  function setMyLocation(p) {
    meAt = p;
    if (!me) {
      me = new kakao.maps.CustomOverlay({ content: el('me'), position: latLng(p), map: map, zIndex: 10 });
    } else {
      me.setPosition(latLng(p));
    }
  }

  function center(c) { return { lat: (c.sw.lat + c.ne.lat) / 2, lng: (c.sw.lng + c.ne.lng) / 2 }; }

  function setFog(list) {
    cells = list;
    queueGround();
    if (!list.length && cat) {
      cat.setMap(null); // no cleared ground, no cat — and the wander loop stops on !cat
      cat = catEl = catImg = bubble = catCell = null;
    }
    showCat();
  }

  // 고양이는 걷힌 칸 안에서만: 다음 목적지는 지금 칸의 이웃(대각선 포함) 칸 중에서.
  // 칸 중심끼리 재야 한다 — 고양이 위치(칸 가장자리일 수 있음)로 재면 두 칸 건너 칸이 이웃으로 잡혀 안개를 가로지른다.
  function neighbours(from) {
    var at = center(from);
    return cells.filter(function (c) {
      var m = center(c);
      return Math.abs(m.lat - at.lat) < 0.0014 && Math.abs(m.lng - at.lng) < 0.0018;
    });
  }

  function randomIn(c) {
    return { lat: c.sw.lat + Math.random() * (c.ne.lat - c.sw.lat), lng: c.sw.lng + Math.random() * (c.ne.lng - c.sw.lng) };
  }

  function wander() {
    if (!cat) return;
    var near = neighbours(catCell);
    var next = near.length ? near[Math.floor(Math.random() * near.length)] : catCell;
    var to = randomIn(next);
    var from = catAt, t0 = Date.now(), dur = 4000;
    catImg.style.transform = to.lng < from.lng ? 'scaleX(-1)' : '';
    clearTimeout(lieTimer);
    setPose('walk');
    (function step() {
      if (!cat) return;
      var k = Math.min(1, (Date.now() - t0) / dur);
      catAt = { lat: from.lat + (to.lat - from.lat) * k, lng: from.lng + (to.lng - from.lng) * k };
      cat.setPosition(latLng(catAt));
      if (k < 1) requestAnimationFrame(step);
      else {
        catCell = next;
        setPose('sit');
        // 가끔은 오래 쉰다: 20초 앉아 있으면 엎드린다.
        var rest = Math.random() < 0.25 ? 30000 : 3000 + Math.random() * 5000;
        if (rest > 20000) lieTimer = setTimeout(function () { setPose('lie'); }, 20000);
        setTimeout(wander, rest);
      }
    })();
  }

  // 자세 바꾸기. 기뻐 뛰는 2초 동안은 다른 자세가 덮어쓰지 않는다(끝나면 원래 자세로).
  function setPose(p) {
    pose = p;
    if (catImg && Date.now() >= happyUntil) catImg.src = cfg.cat[p] || cfg.cat.sit;
  }
  function cheer() {
    if (!catImg) return;
    happyUntil = Date.now() + 2000;
    catImg.src = cfg.cat.happy || cfg.cat.sit;
    clearTimeout(poseTimer);
    poseTimer = setTimeout(function () { happyUntil = 0; setPose(pose); }, 2000);
  }

  function showCat() {
    if (cat || !cells.length) return;
    var start = cells[0];
    if (meAt) {
      start = cells.reduce(function (best, c) {
        var a = center(c), b = center(best);
        return Math.hypot(a.lat - meAt.lat, a.lng - meAt.lng) < Math.hypot(b.lat - meAt.lat, b.lng - meAt.lng) ? c : best;
      }, cells[0]);
    }
    catCell = start;
    catAt = center(start);
    catEl = document.createElement('div');
    catEl.className = 'cat';
    bubble = document.createElement('div');
    bubble.className = 'bubble';
    catImg = document.createElement('img');
    pose = 'sit';
    catImg.src = cfg.cat.sit;
    catEl.appendChild(bubble);
    catEl.appendChild(catImg);
    catEl.addEventListener('click', function () { cheer(); post({ type: 'catTap' }); });
    cat = new kakao.maps.CustomOverlay({ content: catEl, position: latLng(catAt), map: map, yAnchor: 1, zIndex: 5, clickable: true });
    applyLod(); // 고양이는 수채 세계의 주민: 가까이 볼 땐 같이 물러난다
    setTimeout(wander, 1500);
  }

  function catSay(text) {
    if (!bubble) return;
    bubble.textContent = text; // textContent: 문구가 HTML로 해석되지 않게
    bubble.style.display = 'block';
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.style.display = 'none'; }, 3000);
  }

  // 코스: 하늘색 선 + 번호 핀(가야 할 곳). 다시 부르면 앞의 것을 지우고, null이면 지우기만.
  function setCourse(c) {
    courseItems.forEach(function (o) { o.setMap(null); });
    courseItems = [];
    if (!c) { applyLod(); return; }
    var bounds = new kakao.maps.LatLngBounds();
    if (meAt) bounds.extend(latLng(meAt));
    if (c.route && c.route.length > 1) {
      var path = c.route.map(function (p) { return new kakao.maps.LatLng(p[0], p[1]); });
      path.forEach(function (p) { bounds.extend(p); });
      courseItems.push(new kakao.maps.Polyline({ map: map, path: path, strokeWeight: 5, strokeColor: '#2F86C6', strokeOpacity: 0.9, zIndex: 3 }));
    }
    c.stops.forEach(function (s, i) {
      bounds.extend(latLng(s));
      courseItems.push(new kakao.maps.CustomOverlay({ content: el('stop', String(i + 1)), position: latLng(s), map: map, zIndex: 6 }));
    });
    map.setBounds(bounds, 80, 40, 460, 40); // 아래는 코스 카드(네 줄 + 아래 여백)가 가린다
    applyLod();
  }

  // 검색해서 고른 곳: 하늘색 표시 하나. 다시 부르면 옮기고, null이면 지운다.
  function setFocus(at) {
    if (focusPin) focusPin.setMap(null);
    focusPin = null;
    if (!at) return;
    focusPin = new kakao.maps.CustomOverlay({ content: el('focus'), position: latLng(at), map: map, zIndex: 7 });
  }

  // level이 오면 그만큼 가까이 당긴다(이미 더 가까우면 그대로): 길을 찾으러 가는 이동.
  function panTo(m) {
    if (m.level && map.getLevel() > m.level) map.setLevel(m.level, { anchor: latLng(m) });
    map.panTo(latLng(m));
  }

  function init() {
    map = new kakao.maps.Map(document.getElementById('map'), { center: latLng(cfg.center), level: START });
    initGround();
    kakao.maps.event.addListener(map, 'idle', function () {
      var c = map.getCenter();
      post({ type: 'idle', center: { lat: c.getLat(), lng: c.getLng() } });
      queueGround();
    });
    kakao.maps.event.addListener(map, 'center_changed', queueGround);
    kakao.maps.event.addListener(map, 'zoom_changed', function () { applyLod(); queueGround(); });
    window.__onAppMessage = function (m) {
      if (m.type === 'setHideouts') setHideouts(m.hideouts);
      else if (m.type === 'setWishes') setWishes(m.wishes);
      else if (m.type === 'setMyLocation') setMyLocation(m);
      else if (m.type === 'panTo') panTo(m);
      else if (m.type === 'setFog') setFog(m.cells);
      else if (m.type === 'catSay') catSay(m.text);
      else if (m.type === 'setCat') { cfg.cat = m.poses; setPose(pose); }
      else if (m.type === 'setFocus') setFocus(m.at);
      else if (m.type === 'setCourse') {
        // 코스는 덤: 그리다 실패해도 지도 전체(window.onerror → 실패 화면)를 잃지 않는다.
        try { setCourse(m.course); } catch (e) { try { setCourse(null); } catch (e2) {} }
      }
    };
    applyLod();
    post({ type: 'ready' });
  }

  var s = document.createElement('script');
  s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=' + encodeURIComponent(cfg.jsKey);
  s.onload = function () { kakao.maps.load(init); };
  s.onerror = function () { post({ type: 'error', reason: 'sdk_load_failed' }); };
  document.head.appendChild(s);
})();
</script>
</body></html>`;
}
