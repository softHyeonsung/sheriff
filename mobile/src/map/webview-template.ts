// mobile/src/map/webview-template.ts
import type { Grade } from './grades';
import type { LatLng } from './protocol';

type Opts = { jsKey: string; markers: Record<Grade, { uri: string; size: number }>; center: LatLng };

// JSON for embedding inside <script>: escaping "<" keeps "</script>" in any value from
// closing the block early.
const embed = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export function buildMapHtml({ jsKey, markers, center }: Opts): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%}.me{width:16px;height:16px;border-radius:8px;background:#E6A552;border:3px solid #FFFFFF;box-shadow:0 0 0 6px rgba(230,165,82,0.25)}</style>
</head><body>
<div id="map"></div>
<script>
(function () {
  var cfg = ${embed({ jsKey, markers, center })};
  function post(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  window.onerror = function (msg) { post({ type: 'error', reason: String(msg) }); };
  var map = null, pins = [], me = null;

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

  function setMyLocation(p) {
    if (!me) {
      var dot = document.createElement('div');
      dot.className = 'me';
      me = new kakao.maps.CustomOverlay({ content: dot, position: latLng(p), map: map, zIndex: 10 });
    } else {
      me.setPosition(latLng(p));
    }
  }

  function init() {
    map = new kakao.maps.Map(document.getElementById('map'), { center: latLng(cfg.center), level: 4 });
    window.__onAppMessage = function (m) {
      if (m.type === 'setHideouts') setHideouts(m.hideouts);
      else if (m.type === 'setMyLocation') setMyLocation(m);
      else if (m.type === 'panTo') map.panTo(latLng(m));
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
