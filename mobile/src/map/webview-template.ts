// mobile/src/map/webview-template.ts
import type { CatPose } from './catColors';
import type { Grade } from './grades';
import type { LatLng } from './protocol';

type Opts = { jsKey: string; markers: Record<Grade, { uri: string; size: number }>; center: LatLng; cat: Record<CatPose, string>; fogColor: string; wish: { uri: string; size: number } };

// JSON for embedding inside <script>: escaping "<" keeps "</script>" in any value from
// closing the block early.
const embed = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export function buildMapHtml({ jsKey, markers, center, cat, fogColor, wish }: Opts): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%}.me{width:16px;height:16px;border-radius:8px;background:#E6A552;border:3px solid #FFFFFF;box-shadow:0 0 0 6px rgba(230,165,82,0.25)}.cat{position:relative;width:48px;height:48px}.cat img{width:48px;height:48px;display:block}.bubble{position:absolute;bottom:54px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#FFFFFF;color:#4A3D30;border-radius:12px;padding:6px 10px;font:14px/1.3 sans-serif;box-shadow:0 2px 6px rgba(74,61,48,0.2);display:none}.stop{width:28px;height:28px;border-radius:14px;background:#F59E0B;border:2px solid #FFFFFF;color:#FFFFFF;font:bold 15px/28px sans-serif;text-align:center;box-shadow:0 2px 6px rgba(74,61,48,0.3)}</style>
</head><body>
<div id="map"></div>
<script>
(function () {
  var cfg = ${embed({ jsKey, markers, center, cat, fogColor, wish })};
  function post(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  window.onerror = function (msg) { post({ type: 'error', reason: String(msg) }); };
  var map = null, pins = [], me = null, meAt = null;
  var wishPins = [];
  var courseItems = [];
  var fog = null, cells = [], cat = null, catImg = null, bubble = null, catAt = null, catCell = null, bubbleTimer = null;
  var pose = 'sit', poseTimer = null, lieTimer = null, happyUntil = 0;
  // 한국 전체를 넉넉히 덮는 바깥 사각형(시계 방향). 구멍은 반대 방향이어야 채움 규칙과 무관하게 뚫린다.
  var KOREA = [[39.5, 124], [39.5, 132], [32, 132], [32, 124]];

  function latLng(p) { return new kakao.maps.LatLng(p.lat, p.lng); }

  function setHideouts(list) {
    pins.forEach(function (m) { m.setMap(null); });
    pins = list.map(function (h) {
      var mk = cfg.markers[h.grade];
      var marker = new kakao.maps.Marker({
        position: latLng(h),
        image: new kakao.maps.MarkerImage(mk.uri, new kakao.maps.Size(mk.size, mk.size)),
        map: map,
      });
      kakao.maps.event.addListener(marker, 'click', function () { post({ type: 'hideoutTap', id: h.id }); });
      return marker;
    });
  }

  function setWishes(list) {
    wishPins.forEach(function (m) { m.setMap(null); });
    wishPins = list.map(function (w) {
      var marker = new kakao.maps.Marker({
        position: latLng(w),
        image: new kakao.maps.MarkerImage(cfg.wish.uri, new kakao.maps.Size(cfg.wish.size, cfg.wish.size)),
        map: map,
      });
      kakao.maps.event.addListener(marker, 'click', function () { post({ type: 'wishTap', placeId: w.placeId }); });
      return marker;
    });
  }

  function setMyLocation(p) {
    meAt = p;
    if (!me) {
      var dot = document.createElement('div');
      dot.className = 'me';
      me = new kakao.maps.CustomOverlay({ content: dot, position: latLng(p), map: map, zIndex: 10 });
    } else {
      me.setPosition(latLng(p));
    }
  }

  function center(c) { return { lat: (c.sw.lat + c.ne.lat) / 2, lng: (c.sw.lng + c.ne.lng) / 2 }; }

  function setFog(list) {
    cells = list;
    if (fog) fog.setMap(null);
    var paths = [KOREA.map(function (p) { return new kakao.maps.LatLng(p[0], p[1]); })];
    list.forEach(function (c) {
      paths.push([
        new kakao.maps.LatLng(c.sw.lat, c.sw.lng), new kakao.maps.LatLng(c.sw.lat, c.ne.lng),
        new kakao.maps.LatLng(c.ne.lat, c.ne.lng), new kakao.maps.LatLng(c.ne.lat, c.sw.lng),
      ]);
    });
    // ponytail: 칸마다 구멍 하나 — 수천 칸에서 느리면 서버에서 인접 칸 합치기(ST_Union).
    fog = new kakao.maps.Polygon({ map: map, path: paths, strokeWeight: 0, fillColor: cfg.fogColor, fillOpacity: 0.6, zIndex: 1 });
    if (!list.length && cat) {
      cat.setMap(null); // no cleared ground, no cat — and the wander loop stops on !cat
      cat = catImg = bubble = catCell = null;
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
    var el = document.createElement('div');
    el.className = 'cat';
    bubble = document.createElement('div');
    bubble.className = 'bubble';
    catImg = document.createElement('img');
    pose = 'sit';
    catImg.src = cfg.cat.sit;
    el.appendChild(bubble);
    el.appendChild(catImg);
    el.addEventListener('click', function () { cheer(); post({ type: 'catTap' }); });
    cat = new kakao.maps.CustomOverlay({ content: el, position: latLng(catAt), map: map, yAnchor: 1, zIndex: 5, clickable: true });
    setTimeout(wander, 1500);
  }

  function catSay(text) {
    if (!bubble) return;
    bubble.textContent = text; // textContent: 문구가 HTML로 해석되지 않게
    bubble.style.display = 'block';
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.style.display = 'none'; }, 3000);
  }

  // 코스: 주황 선 + 번호 핀. 다시 부르면 앞의 것을 지우고, null이면 지우기만.
  function setCourse(c) {
    courseItems.forEach(function (o) { o.setMap(null); });
    courseItems = [];
    if (!c) return;
    var bounds = new kakao.maps.LatLngBounds();
    if (meAt) bounds.extend(latLng(meAt));
    if (c.route && c.route.length > 1) {
      var path = c.route.map(function (p) { return new kakao.maps.LatLng(p[0], p[1]); });
      path.forEach(function (p) { bounds.extend(p); });
      courseItems.push(new kakao.maps.Polyline({ map: map, path: path, strokeWeight: 5, strokeColor: '#F59E0B', strokeOpacity: 0.9, zIndex: 3 }));
    }
    c.stops.forEach(function (s, i) {
      var el = document.createElement('div');
      el.className = 'stop';
      el.textContent = String(i + 1);
      bounds.extend(latLng(s));
      courseItems.push(new kakao.maps.CustomOverlay({ content: el, position: latLng(s), map: map, zIndex: 6 }));
    });
    map.setBounds(bounds, 80, 40, 460, 40); // 아래는 코스 카드(네 줄 + 아래 여백)가 가린다
  }

  function init() {
    map = new kakao.maps.Map(document.getElementById('map'), { center: latLng(cfg.center), level: 4 });
    kakao.maps.event.addListener(map, 'idle', function () {
      var c = map.getCenter();
      post({ type: 'idle', center: { lat: c.getLat(), lng: c.getLng() } });
    });
    window.__onAppMessage = function (m) {
      if (m.type === 'setHideouts') setHideouts(m.hideouts);
      else if (m.type === 'setWishes') setWishes(m.wishes);
      else if (m.type === 'setMyLocation') setMyLocation(m);
      else if (m.type === 'panTo') map.panTo(latLng(m));
      else if (m.type === 'setFog') setFog(m.cells);
      else if (m.type === 'catSay') catSay(m.text);
      else if (m.type === 'setCat') { cfg.cat = m.poses; setPose(pose); }
      else if (m.type === 'setCourse') {
        // 코스는 덤: 그리다 실패해도 지도 전체(window.onerror → 실패 화면)를 잃지 않는다.
        try { setCourse(m.course); } catch (e) { try { setCourse(null); } catch (e2) {} }
      }
    };
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
