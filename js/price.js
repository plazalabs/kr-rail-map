/* 역 주변 시세 — 국토교통부 아파트 매매 실거래가 집계
 *
 * 무엇을 보여주는가:
 *   1) 역이 속한 법정동의 최근 6개월 아파트 매매 실거래 중위 평당가.
 *   2) 그 법정동의 **단지별** 평당가·준공연도·평형대.
 *
 *   '이 단지가 역에서 300m' 같은 값은 아니다. 실거래가 API 가 좌표를 주지
 *   않고, 지오코더 API 는 좌표 저장을 금지하기 때문에 법정동 단위로 묶었다.
 *   그 한계를 화면에도 적어 둔다 — 부동산 판단에 쓰는 숫자라서.
 *
 *   법정동 하나에 평당가 하나만 주면 판단이 안 된다. 같은 잠실동에서도
 *   1979년 5층과 2008년 33층이 같은 값을 받을 리 없다. 그래서 단지 단위
 *   목록을 함께 준다. 실거래가 응답에 단지명·지번·건축년도·층·전용면적이
 *   다 들어 있으므로 좌표 없이도 여기까지는 갈 수 있다.
 *
 * 데이터:
 *   data/station-price.json    — 법정동 중위값 (build_station_price.py)
 *   data/station-complex.json  — 단지 목록      (build_station_complex.py)
 *   파일이 없거나 실패하면 조용히 아무것도 안 보여준다. 앱은 계속 돈다.
 */
(function () {
  'use strict';

  var byName = {};
  var meta = null;
  var loading = null;
  var ready = false;
  var failed = false;

  var cxDistricts = {};
  var cxByStation = {};
  var cxReady = false;

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

  // 단지 목록은 따로 받는다. 780KB 라 시세 요약(80KB)보다 10배 크다.
  // 요약이 먼저 뜨고 목록이 나중에 붙는다 — 목록이 늦어도 화면은 산다.
  function loadComplexes(url) {
    if (loadComplexes.p) return loadComplexes.p;
    loadComplexes.p = fetch(url || 'data/station-complex.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        cxDistricts = d.districts || {};
        cxByStation = d.stations || {};
        if (meta) meta.complexUpdated = d.updated || null;
        cxReady = true;
        return true;
      })
      .catch(function () {
        return false;
      });
    return loadComplexes.p;
  }

  function of(stationName) {
    if (!ready) return null;
    var n = String(stationName || '');
    return byName[n] || byName[norm(n)] || null;
  }

  /* 역이 속한 법정동의 단지 목록. 좌표가 없으므로 '역 근처'라고 말하지 않는다. */
  function complexes(stationName, limit) {
    if (!cxReady) return null;
    var n = String(stationName || '');
    var key = cxByStation[n] || cxByStation[norm(n)];
    if (!key) return null;
    var d = cxDistricts[key];
    if (!d || !d.complexes || !d.complexes.length) return null;
    var list = d.complexes;
    return {
      dong: key.split('|')[1] || '',
      sgg: key.split('|')[0] || '',
      deals: d.deals,
      total: list.length,
      items: limit ? list.slice(0, limit) : list
    };
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

  /* 평당가는 '억'으로 바꾸지 않는다.
   *
   * 15,504만원/평을 won() 으로 쓰면 '1억 5,504만원/평' 이 된다. 맞는 말이지만
   * 읽는 사람이 순간 멈춘다 — 평당가를 억으로 말하는 사람은 없다. 거래금액만
   * 억을 쓰고, 평당가는 만원 그대로 둔다.
   */
  function pp(v) {
    if (v == null) return '—';
    return Math.round(v).toLocaleString('ko-KR') + '만원';
  }

  window.StationPrice = {
    load: load,
    loadComplexes: loadComplexes,
    of: of,
    complexes: complexes,
    isReady: isReady,
    isComplexReady: function () { return cxReady; },
    hasFailed: hasFailed,
    meta: getMeta,
    won: won,
    pp: pp,
    _norm: norm
  };
})();

