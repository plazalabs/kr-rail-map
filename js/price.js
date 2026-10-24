/* 역 주변 시세 — 국토교통부 아파트 매매 실거래가 집계
 *
 * 무엇을 보여주는가:
 *   역이 속한 법정동의 최근 6개월 아파트 매매 실거래 중위 평당가.
 *   '이 단지가 역에서 300m' 같은 값은 아니다. 실거래가 API 가 좌표를 주지
 *   않고, 지오코더 API 는 좌표 저장을 금지하기 때문에 법정동 단위로 묶었다.
 *   그 한계를 화면에도 적어 둔다 — 부동산 판단에 쓰는 숫자라서.
 *
 * 데이터는 data/station-price.json (build_station_price.py 가 만든다).
 * 파일이 없거나 실패하면 조용히 아무것도 안 보여준다. 앱은 계속 돈다.
 */
(function () {
  'use strict';

  var byName = {};
  var meta = null;
  var loading = null;
  var ready = false;
  var failed = false;

  // '잠실(송파구청)' 처럼 괄호 부기가 붙은 이름을 지도 이름('잠실')과 맞춘다.
  function norm(n) {
    return String(n || '').replace(/\s*\(.*?\)\s*/g, '').trim();
  }

  function load(url) {
    if (loading) return loading;
    loading = fetch(url || 'data/station-price.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        meta = {
          updated: d.updated || null,
          source: d.source || '',
          note: d.note || ''
        };
        byName = d.stations || {};
        ready = true;
        return true;
      })
      .catch(function () {
        failed = true;
        return false;
      });
    return loading;
  }

  function of(stationName) {
    if (!ready) return null;
    var n = String(stationName || '');
    return byName[n] || byName[norm(n)] || null;
  }

  function isReady() { return ready; }
  function hasFailed() { return failed; }
  function getMeta() { return meta; }

  // 만원 단위 숫자를 한국식으로. 1억 이상이면 '1억 7,130만원'.
  function won(v) {
    if (v == null) return '—';
    var n = Math.round(v);
    if (n >= 10000) {
      var eok = Math.floor(n / 10000);
      var man = n % 10000;
      return eok + '억' + (man ? ' ' + man.toLocaleString('ko-KR') + '만원' : '원');
    }
    return n.toLocaleString('ko-KR') + '만원';
  }

  window.StationPrice = {
    load: load,
    of: of,
    isReady: isReady,
    hasFailed: hasFailed,
    meta: getMeta,
    won: won,
    _norm: norm
  };
})();
