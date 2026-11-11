/* StationRocket — '떡상 지도' 레이어 (2026-11-12)
 *
 * 사이드바 '지도 레이어 → 🚀 떡상 지도' 를 켜면 역 점을 GTX 떡상 랭킹(rank.html)과 같은 등급 색으로 칠한다.
 *   색 = 지금 순위 → 개통 후 순위 변화 등급 (🚀 떡상 · 📈 상승 · ➖ 보합 · 📉 상대 하락 · ✨ 신규)
 *   크기 = 개통 후 점수 (100 − CBD·YBD·GBD 평균 분) — 클수록 업무지구에 가깝다
 *   글자(줌 11 이상) = ▲N (떡상·상승만)
 * 순위는 순위표 기본값과 같다: 평균 기준, 수도권(서울·경기·인천) 안에서. 업무지구 셋이 모두 서울이라
 * 지방 역의 순위 변화는 뜻이 없어 칠하지 않는다 (전국으로 칠하면 부산·대구가 모두 '상대 하락' 주황이 됐다).
 * 자료는 켤 때 한 번 받는다 (data/rank.json, 약 170KB). 계산은 js/rank.js(RankTable) 그대로.
 * 배경 지도를 바꾸면 레이어가 지워지므로 restore() 로 다시 단다 (app.js restoreCustomLayers).
 */
(function (global) {
  'use strict';
  var LAYER = 'rocket-tier';
  var COLORS = { rocket: '#0a8f4a', up: '#3aa76d', flat: '#9aa1a8', down: '#d9701a', new: '#7a3fd0' };
  var CAPITAL = { '서울': 1, '경기': 1, '인천': 1 };
  var mapRef = null, stationsRef = null, layerOn = false, feats = null, loading = null;

  function load() {
    if (loading) return loading;
    loading = fetch('data/rank.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (doc) {
      if (!doc || typeof RankTable === 'undefined') { feats = []; return false; }
      var cap = RankTable.compute(doc, { weight: 'avg', region: 'capital' });
      var byId = {};
      cap.rows.forEach(function (r) { byId[r.id] = r; });
      var coord = {};
      (stationsRef || []).forEach(function (f) { coord[f.properties.id] = f.geometry.coordinates; });
      feats = [];
      Object.keys(byId).forEach(function (id) {
        var r = byId[id];
        if (!coord[id]) return;
        var t = RankTable.tierOf(r);
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: coord[id] }, properties: {
          id: id, t: t, s: r.aft.score, c: r.change == null ? 0 : r.change,
          label: (t === 'rocket' || t === 'up') ? '▲' + r.change : (t === 'new' ? '신규' : ''),
          cap: CAPITAL[r.region] ? 1 : 0,
        } });
      });
      // 많이 오르는 역을 위에 그린다 (겹칠 때 떡상이 보이게)
      feats.sort(function (a, b) { return a.properties.c - b.properties.c; });
      return true;
    }).catch(function () { feats = []; return false; });
    return loading;
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
    } catch (e) { if (typeof console !== 'undefined') console.warn('떡상 지도 레이어', e && e.message); }
  }
  function removeLayer() {
    if (!mapRef) return;
    [LAYER + '-label', LAYER].forEach(function (id) { try { if (mapRef.getLayer(id)) mapRef.removeLayer(id); } catch (e) { /* 무시 */ } });
    try { if (mapRef.getSource(LAYER)) mapRef.removeSource(LAYER); } catch (e) { /* 무시 */ }
  }
  function setLayer(on) {
    layerOn = !!on;
    var lg = document.getElementById('rk-legend');
    if (lg) lg.hidden = !layerOn;
    if (!layerOn) { removeLayer(); return Promise.resolve(false); }
    return load().then(function () { addLayer(); return true; });
  }
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
    init: init, setLayer: setLayer, restore: restore,
    isOn: function () { return layerOn; },
    features: function () { return feats; },
    COLORS: COLORS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
