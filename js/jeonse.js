/* StationJeonse — 역 주변 아파트 전세가율 (전세 ÷ 매매), 같은 집끼리 짝지어 낸 값
 *
 * 자료: data/station-jeonse.json (data/build_station_jeonse.py). 역 ID 로 찾는다.
 * 짝짓기: 같은 단지(시군구·법정동·지번)·같은 전용면적(1㎡)의 매매와 신규 전세. 짝마다 전세 중위 ÷ 매매 중위,
 *         역 값은 그 법정동 짝들의 중위값. 짝 3개 미만이면 비율을 보여 주지 않는다 (지어내기 금지).
 * 읽는 법: 높을수록 적은 돈으로 살 수 있지만(갭이 작음), 80% 를 넘으면 집값이 조금만 내려도 보증금을
 *          돌려받기 어려운 '깡통전세' 위험이 커진다 — 그래서 80% 이상 짝 수를 함께 보여 준다.
 */
(function (global) {
  'use strict';
  var data = null, ready = false, loading = null;

  function load(url) {
    if (loading) return loading;
    loading = fetch(url || 'data/station-jeonse.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      if (!d || d.keyed_by !== 'station_id' || !d.stations) throw new Error('station_id 키가 아님');
      data = d; ready = true; return true;
    }).catch(function () { return false; });
    return loading;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function of(sid) { return ready ? (data.stations[sid] || null) : null; }
  // 단지 하나의 전세가율 — [비율, 짝(면적) 수]. 열쇠는 단지 목록과 같은 '시군구코드|법정동' + 지번
  function complexOf(districtKey, jibun) {
    if (!ready || !data.cx || !districtKey || !jibun) return null;
    var d = data.cx[districtKey];
    return (d && d[String(jibun).trim()]) || null;
  }

  function sectionHtml(sid) {
    if (!ready) return '';
    var s = data.stations[sid];
    var h;
    if (!s) {
      h = '<span class="mk-none">자료 없음</span> <span class="mk-where">이 역 법정동에 같은 집끼리 짝지을 매매·전세 거래가 없습니다</span>';
    } else if (s.r == null) {
      h = '<span class="mk-none">짝이 적음 (' + s.n + '쌍)</span> <span class="mk-where">' + esc(s.d) +
        ' · ' + data.minPairs + '쌍 미만이라 비율을 내지 않습니다</span>';
    } else {
      var pct = Math.round(s.r * 100);
      var risk = s.r >= data.risk;
      var bar = Math.max(2, Math.min(100, pct));
      h = '<div class="jn-row"><b class="jn-pct' + (risk ? ' jn-risk' : '') + '">' + pct + '%</b>' +
        '<span class="jn-bar" aria-hidden="true"><i style="width:' + bar + '%"></i><em style="left:' + Math.round(data.risk * 100) + '%"></em></span></div>' +
        '<div class="mk-where">' + esc(s.sgg) + ' ' + esc(s.d) + ' · 같은 단지·같은 면적 <b>' + s.n + '쌍</b>의 중위값 ' +
        '(매매 ' + s.sn + '건 · 전세 ' + s.jn + '건)</div>' +
        '<div class="mk-where">' + (s.hi ? '80% 이상인 짝 <b>' + s.hi + '쌍</b> — 깡통전세 주의' : '80% 이상인 짝 없음') +
        (risk ? ' · <b>이 동네 중위값이 80% 이상</b>' : '') + '</div>';
    }
    return h + '<div class="sd-note">※ 국토교통부 아파트 매매·전월세 실거래 ' + esc(data.period[0]) + '~' + esc(data.period[1]) +
      '. 같은 단지(지번)·같은 전용면적의 매매와 <b>신규 전세</b>만 짝지어 짝마다 전세 중위 ÷ 매매 중위를 내고, 역 법정동 짝들의 중위값을 보여 줍니다. ' +
      '갱신 계약(인상 상한 5%)과 월세는 뺐습니다. 80% 이상이면 집값이 조금만 내려도 보증금을 돌려받기 어려울 수 있습니다. <b>법정동 집계상 주의 지표</b>일 뿐, 80% 미만이라고 안전하다는 뜻이 아니며 개별 집의 보증금 안전(선순위 권리 등)은 판단하지 않습니다. <a href="data.html" target="_blank" rel="noopener">출처</a></div>';
  }

  /* 지도 색칠 레이어 — 역마다 전세가율로 색을 칠한다 (짝 3쌍 이상인 역만). 사이드바 '전세가율 색칠' 체크칸.
   * 배경 지도를 바꾸면 레이어가 지워지므로 restore() 로 다시 단다 (app.js restoreCustomLayers). */
  var layerOn = false, mapRef = null, stationsRef = null;
  var LAYER = 'jeonse-ratio';
  function geojson() {
    var feats = [];
    (stationsRef || []).forEach(function (f) {
      var s = data && data.stations[f.properties.id];
      if (!s || s.r == null) return;
      feats.push({ type: 'Feature', geometry: f.geometry,
        properties: { r: s.r, label: Math.round(s.r * 100) + '%', name: f.properties.name_ko } });
    });
    return { type: 'FeatureCollection', features: feats };
  }
  function addLayer() {
    if (!mapRef || !ready || !layerOn || mapRef.getSource(LAYER)) return;
    try {
      mapRef.addSource(LAYER, { type: 'geojson', data: geojson() });
      mapRef.addLayer({ id: LAYER, type: 'circle', source: LAYER, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 13, 10],
        'circle-color': ['step', ['get', 'r'], '#1e63d6', 0.5, '#2e9e4f', 0.7, '#f59e0b', 0.8, '#c62828'],
        'circle-opacity': 0.85, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
      mapRef.addLayer({ id: LAYER + '-label', type: 'symbol', source: LAYER, minzoom: 11.5,
        layout: { 'text-field': ['get', 'label'], 'text-size': 10.5, 'text-offset': [0, -1.4], 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': '#1f2328', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } });
    } catch (e) { /* 스타일 교체 중이면 restore() 에서 다시 */ }
  }
  function removeLayer() {
    if (!mapRef) return;
    [LAYER + '-label', LAYER].forEach(function (id) { try { if (mapRef.getLayer(id)) mapRef.removeLayer(id); } catch (e) { /* 무시 */ } });
    try { if (mapRef.getSource(LAYER)) mapRef.removeSource(LAYER); } catch (e) { /* 무시 */ }
  }
  function setLayer(on) {
    layerOn = !!on;
    var lg = document.getElementById('jn-legend');
    if (lg) lg.hidden = !layerOn;
    if (!layerOn) { removeLayer(); return; }
    load().then(function () { addLayer(); });
  }
  function initLayer(map, stations) {
    mapRef = map; stationsRef = stations;
    var cb = document.getElementById('layer-jeonse');
    if (cb && !cb.__jn) {
      cb.__jn = true;
      cb.addEventListener('change', function () { if (cb.checked && global.leaveRouteMode) global.leaveRouteMode(); setLayer(cb.checked); });   // K10: 시세 색칠로 바꾸면 길찾기 경로를 지운다
    }
  }
  function restore() { if (layerOn) addLayer(); }

  global.StationJeonse = {
    initLayer: initLayer, setLayer: setLayer, restore: restore, isLayerOn: function () { return layerOn; },
    load: load,
    isReady: function () { return ready; },
    of: of,
    meta: function () { return data; },
    sectionHtml: sectionHtml,
    complexOf: complexOf
  };
})(typeof window !== 'undefined' ? window : this);
