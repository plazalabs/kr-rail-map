/* StationRocket — '떡상 지도' 레이어 (2026-11-12, 디자인 개편 v109 에서 연도·기준 반영)
 *
 * 사이드바 '지도 레이어 → 떡상 지도' 또는 툴바 'GTX 떡상'(js/rocket-panel.js)을 켜면
 * 역 점을 GTX 떡상 랭킹과 같은 등급 색으로 칠한다.
 *   색 = 지금 순위 → 개통 후 순위 변화 등급 (떡상 · 상승 · 보합 · 상대 하락 · 신규)
 *   크기 = 개통 후 점수 (100 − CBD·YBD·GBD 평균 분) — 클수록 업무지구에 가깝다
 *   글자(줌 11 이상) = ▲N (떡상·상승만)
 * 기본은 순위표 기본값과 같다: 평균 기준, 수도권(서울·경기·인천), 모두 개통 후.
 * 떡상 패널이 기준·연도·배차를 바꾸면 setView() 로 같은 값을 받아 다시 칠한다.
 * 업무지구 셋이 모두 서울이라 지방 역의 순위 변화는 뜻이 없어 칠하지 않는다.
 * 자료는 켤 때 한 번 받는다 (data/rank.json). 계산은 js/rank.js(RankTable) 그대로.
 * 배경 지도를 바꾸면 레이어가 지워지므로 restore() 로 다시 단다 (app.js restoreCustomLayers).
 */
(function (global) {
  'use strict';
  var LAYER = 'rocket-tier';
  var SEL = 'rocket-sel';
  // 지도 점 색은 css/style.css 의 --map-* 토큰에서 읽는다 (없으면 기본값). MapLibre 는 CSS 변수를 못 읽어서 값으로 꺼내 넣는다.
  function tok(name, fb) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; }
  }
  var COLORS = { rocket: tok('--map-rocket', '#0a8f4a'), up: tok('--map-up', '#3aa76d'), flat: tok('--map-flat', '#9aa1a8'),
    down: tok('--map-down', '#d9701a'), new: tok('--map-new', '#7a3fd0') };
  var CAPITAL = { '서울': 1, '경기': 1, '인천': 1 };
  var mapRef = null, stationsRef = null, layerOn = false, feats = null, loading = null, doc = null;
  var view = { weight: 'avg', at: 'all', wait: false };
  var selId = null;
  var listeners = [];

  function coordOf(id) {
    var s = (stationsRef || []).find(function (f) { return f.properties.id === id; });
    return s ? s.geometry.coordinates : null;
  }

  // 지금 view 로 점 자료를 만든다
  function build() {
    if (!doc || typeof RankTable === 'undefined') { feats = []; return; }
    var cap = RankTable.compute(doc, { weight: view.weight, region: 'capital', at: view.at, wait: view.wait });
    var coord = {};
    (stationsRef || []).forEach(function (f) { coord[f.properties.id] = f.geometry.coordinates; });
    feats = [];
    cap.rows.forEach(function (r) {
      if (!coord[r.id]) return;
      var t = RankTable.tierOf(r);
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: coord[r.id] }, properties: {
        id: r.id, t: t, s: r.aft.score, c: r.change == null ? 0 : r.change,
        label: (t === 'rocket' || t === 'up') ? '▲' + r.change : (t === 'new' ? '신규' : ''),
        cap: CAPITAL[r.region] ? 1 : 0,
      } });
    });
    // 많이 오르는 역을 위에 그린다 (겹칠 때 떡상이 보이게)
    feats.sort(function (a, b) { return a.properties.c - b.properties.c; });
  }

  function load() {
    if (loading) return loading;
    loading = fetch('data/rank.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      doc = d || null;
      build();
      return !!doc;
    }).catch(function () { feats = []; return false; });
    return loading;
  }

  function selData() {
    var c = selId && coordOf(selId);
    return { type: 'FeatureCollection', features: c ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { id: selId } }] : [] };
  }

  function addLayer() {
    if (!mapRef || !layerOn || !feats || mapRef.getSource(LAYER)) return;
    try {
      mapRef.addSource(LAYER, { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
      mapRef.addLayer({ id: LAYER, type: 'circle', source: LAYER, paint: {
        // 줌 식은 맨 바깥에만 올 수 있다 (maplibre 규칙) — 줌 8·13 에서 각각 점수로 크기를 정한다
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          8, ['interpolate', ['linear'], ['get', 's'], 40, 2.2, 80, 3.6, 95, 6.6],
          13, ['interpolate', ['linear'], ['get', 's'], 40, 4.4, 80, 7.5, 95, 13.7]],
        'circle-color': ['match', ['get', 't'], 'rocket', COLORS.rocket, 'up', COLORS.up, 'down', COLORS.down, 'new', COLORS.new, COLORS.flat],
        'circle-opacity': ['match', ['get', 't'], 'flat', 0.55, 0.9],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['match', ['get', 't'], 'rocket', 2, 1] } });
      mapRef.addLayer({ id: LAYER + '-label', type: 'symbol', source: LAYER, minzoom: 11,
        filter: ['!=', ['get', 'label'], ''],
        layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, -1.5], 'text-font': ['Noto Sans Bold'],
          'text-allow-overlap': false, 'symbol-sort-key': ['-', 0, ['get', 'c']] },
        paint: { 'text-color': ['match', ['get', 't'], 'rocket', COLORS.rocket, 'up', COLORS.up, COLORS.new],
          'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
      // 고른 역 — 파란 고리
      mapRef.addSource(SEL, { type: 'geojson', data: selData() });
      mapRef.addLayer({ id: SEL, type: 'circle', source: SEL, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 9, 13, 17],
        'circle-color': 'rgba(49,130,246,0.14)', 'circle-stroke-color': '#3182f6', 'circle-stroke-width': 3 } });
    } catch (e) { if (typeof console !== 'undefined') console.warn('떡상 지도 레이어', e && e.message); }
  }
  function removeLayer() {
    if (!mapRef) return;
    [SEL, LAYER + '-label', LAYER].forEach(function (id) { try { if (mapRef.getLayer(id)) mapRef.removeLayer(id); } catch (e) { /* 무시 */ } });
    [SEL, LAYER].forEach(function (id) { try { if (mapRef.getSource(id)) mapRef.removeSource(id); } catch (e) { /* 무시 */ } });
  }
  function refresh() {
    if (!mapRef) return;
    var s = mapRef.getSource(LAYER);
    if (s) s.setData({ type: 'FeatureCollection', features: feats || [] });
    var t = mapRef.getSource(SEL);
    if (t) t.setData(selData());
  }
  function setLayer(on) {
    layerOn = !!on;
    var cb = document.getElementById('layer-rocket');
    if (cb && cb.checked !== layerOn) cb.checked = layerOn;
    var lg = document.getElementById('rk-legend');
    if (lg) lg.hidden = !layerOn;
    listeners.forEach(function (fn) { try { fn(layerOn); } catch (e) { /* 무시 */ } });
    if (!layerOn) { removeLayer(); return Promise.resolve(false); }
    return load().then(function () { addLayer(); return true; });
  }
  // 떡상 패널이 기준·연도·배차를 바꾸면 같은 값으로 다시 칠한다
  function setView(v) {
    view = { weight: (v && v.weight) || 'avg', at: (v && v.at) || 'all', wait: !!(v && v.wait) };
    if (doc) { build(); refresh(); }
  }
  function select(id) { selId = id || null; refresh(); }
  function init(map, stations) {
    mapRef = map; stationsRef = stations;
    var cb = document.getElementById('layer-rocket');
    if (cb && !cb.__rk) {
      cb.__rk = true;
      cb.addEventListener('change', function () { setLayer(cb.checked); });
      if (cb.checked) setLayer(true);
    }
  }
  function restore() { if (layerOn) addLayer(); }

  global.StationRocket = {
    init: init, setLayer: setLayer, restore: restore, load: load, setView: setView, select: select,
    isOn: function () { return layerOn; },
    onToggle: function (fn) { listeners.push(fn); },
    features: function () { return feats; },
    doc: function () { return doc; },
    view: function () { return view; },
    COLORS: COLORS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
