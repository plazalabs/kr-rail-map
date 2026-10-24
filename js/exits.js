/* 역 출구 좌표 — 부동산 거리 계산의 기준점
 *
 * 왜 중심점이 아니라 출구인가
 *   사람은 역 건물 중심까지 걷지 않는다. 출구까지 걷고 계단으로 내려간다.
 *   강남역은 중심점과 출구가 300m 넘게 벌어져 있어, 중심점으로 재면
 *   도보 시간이 4분씩 틀린다. 부동산에서 4분은 집값이다.
 *
 * 데이터: data/exits.geojson (OSM railway=subway_entrance, ODbL)
 *   출구가 없는 역(주로 KTX·일반철도)은 중심점으로 물러난다.
 *   물러났다는 사실을 kind:'center' 로 알려 화면에서 밝힌다.
 */
'use strict';

const StationExits = (() => {
  let byStation = new Map();   // stationId -> [{no, c:[lng,lat]}]
  let features = [];           // 지도 레이어용 원본 (GeoJSON Feature 배열)
  let loading = null;
  let ready = false;
  let failed = false;

  function hav(ax, ay, bx, by) {
    const r = Math.PI / 180;
    const dLat = (by - ay) * r, dLon = (bx - ax) * r;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  // 지도 로드 직후 백그라운드로 부른다. 실패해도 앱은 계속 돌아야 한다.
  function load(url) {
    if (loading) return loading;
    loading = fetch(url || 'data/exits.geojson', { cache: 'force-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(geo => {
        features = geo.features || [];
        features.forEach(f => {
          const p = f.properties || {};
          const sid = p.station;
          if (!sid) return;
          const c = f.geometry && f.geometry.coordinates;
          if (!c || c.length < 2) return;
          if (!byStation.has(sid)) byStation.set(sid, []);
          byStation.get(sid).push({ no: p.no || '', c: [c[0], c[1]] });
        });
        ready = true;
        return byStation;
      })
      .catch(() => { failed = true; ready = false; return new Map(); });
    return loading;
  }

  function isReady() { return ready; }
  function hasFailed() { return failed; }
  function exitsOf(stationId) { return byStation.get(stationId) || []; }
  function totalExits() {
    let n = 0;
    byStation.forEach(v => { n += v.length; });
    return n;
  }

  // 한 역에서 가장 가까운 출구. 출구가 없으면 null.
  function nearestExit(stationId, lng, lat) {
    const list = byStation.get(stationId);
    if (!list || !list.length) return null;
    let best = null;
    for (const e of list) {
      const km = hav(lng, lat, e.c[0], e.c[1]);
      if (!best || km < best.km) best = { exit: e, km };
    }
    return best;
  }

  // 임의 지점 → 역까지의 거리. 출구가 있으면 출구까지, 없으면 중심점까지.
  //   { km, exitNo, kind: 'exit' | 'center' }
  //   kind:'center' 는 "출구 정보가 없어 중심점으로 쟀다" 는 뜻이다.
  function distanceTo(stationFeature, lng, lat) {
    if (!stationFeature) return null;
    const p = stationFeature.properties || {};
    const c = stationFeature.geometry && stationFeature.geometry.coordinates;
    const near = nearestExit(p.id, lng, lat);
    if (near) return { km: near.km, exitNo: near.exit.no, kind: 'exit' };
    if (!c) return null;
    return { km: hav(lng, lat, c[0], c[1]), exitNo: '', kind: 'center' };
  }

  // 역 하나의 출구 요약 (역 상세 패널용)
  function summary(stationId) {
    const list = byStation.get(stationId) || [];
    if (!list.length) return { count: 0, spreadKm: 0, numbers: [] };
    const c0 = list[0].c;
    let far = 0;
    for (const e of list) {
      const d = hav(c0[0], c0[1], e.c[0], e.c[1]);
      if (d > far) far = d;
    }
    const numbers = list.map(e => e.no).filter(Boolean)
      .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    return { count: list.length, spreadKm: far, numbers };
  }

  // 지도 레이어에 그대로 넣을 수 있는 FeatureCollection
  function geojson() {
    return { type: 'FeatureCollection', features: features };
  }

  return {
    load, isReady, hasFailed, exitsOf, totalExits, nearestExit, distanceTo, summary, geojson,
    _debug: { hav },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StationExits;
