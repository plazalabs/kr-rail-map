/* 실거래 1단계 7종 — 역 상세 '실거래 (7종)' 절 (투자 모드 전용)
 *
 * 자료: data/station-market.json (data/build_station_market.py). 역 ID 로 찾는다 — 이름으로 찾지 않는다.
 * 표시 원칙 (지어내기 금지)
 *   - 그 역에 그 종류 자료가 없으면 '자료 없음' (역에 붙일 근거가 없거나 거래가 없음)
 *   - 거래 5건 미만이면 '거래 적음 (N건)' — 중위값을 보여 주지 않는다
 *   - 수익률(월세 ÷ 집값)은 보여 주지 않는다 (1단계 결정, 2단계 과제)
 */
(function (global) {
  'use strict';
  var data = null, ready = false, loading = null;

  function load(url) {
    if (loading) return loading;
    loading = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      // 역 ID 키가 아니면 받지 않는다 (옛 이름 키 자료가 섞이면 동명역에 남의 자료가 뜬다 — IMPL12)
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
  // 만원 → '3억 2,000만원' / '8,500만원'
  function won(v) {
    if (v == null) return '—';
    var n = Math.round(v);
    if (n >= 10000) {
      var eok = Math.floor(n / 10000), man = n % 10000;
      return eok + '억' + (man ? ' ' + man.toLocaleString('ko-KR') + '만' : '');
    }
    return n.toLocaleString('ko-KR') + '만';
  }
  function num(v) { return Math.round(v).toLocaleString('ko-KR'); }

  var ROWS = [
    ['apt-rent', '아파트 전월세'],
    ['silv-trade', '아파트 분양권'],
    ['offi-trade', '오피스텔 매매'],
    ['offi-rent', '오피스텔 전월세'],
    ['rh-trade', '연립·다세대 매매'],
    ['land-trade', '토지 매매'],
    ['nrg-trade', '상가·사무실 매매']
  ];

  // 한 칸의 값 (HTML). s 는 build_station_market.summarize() 결과
  function cell(kind, s) {
    if (!s) return '<span class="mk-none">자료 없음</span>';
    var where = '<span class="mk-where">' + esc(s.d) + ' · ' + s.n + '건' + '</span>';
    if (/-rent$/.test(kind)) {
      var parts = [];
      parts.push(s.jd != null ? '전세 <b>' + won(s.jd) + '</b> (' + s.jn + '건)'
        : '전세 ' + (s.jn ? '거래 적음 (' + s.jn + '건)' : '없음'));
      parts.push(s.wr != null ? '월세 <b>' + won(s.wd) + ' / ' + num(s.wr) + '만</b> (' + s.wn + '건)'
        : '월세 ' + (s.wn ? '거래 적음 (' + s.wn + '건)' : '없음'));
      return parts.join('<br>') + '<br>' + where;
    }
    // 토지는 대지(지목 '대')만 (2026-11-09 결정). 도로 등 대지 아닌 거래·지분거래는 뺀 건수만 적는다 — 지목별로 나누지 않는다.
    var land = kind === 'land-trade';
    var dropped = [];
    if (land && s.ex) dropped.push('도로 등 ' + s.ex + '건');
    if (s.sh) dropped.push('지분거래 ' + s.sh + '건');
    var dropTxt = dropped.length ? '<br><span class="mk-where">' + (land ? '대지만 · ' : '') + dropped.join(' · ') + ' 제외</span>'
      : (land ? '<br><span class="mk-where">대지만 · 도로 등 제외</span>' : '');
    if (s.few) {
      return '<span class="mk-few">' + (land ? '대지 ' : '') + '거래 적음 (' + s.n + '건)</span>' +
        '<br><span class="mk-where">' + esc(s.d) + '</span>' + dropTxt;
    }
    var h;
    if (land) h = '대지 <b>' + num(s.m2) + '만</b>/㎡';
    else h = '<b>' + num(s.pp) + '만</b>/평 · 중위 ' + won(s.med);
    if (kind === 'nrg-trade' && s.top && s.top.length) {
      h += '<br><span class="mk-where">많이 거래된 용도: ' + s.top.map(function (t) { return esc(t[0]) + ' ' + t[1]; }).join(', ') + '</span>';
    }
    return h + '<br>' + where + dropTxt;
  }

  function sectionHtml(sid) {
    if (!ready) return '';
    var st = data.stations[sid] || {};
    var h = '<table class="mk-table"><tbody>';
    ROWS.forEach(function (r) {
      h += '<tr data-kind="' + r[0] + '"><th>' + r[1] + '</th><td>' + cell(r[0], st[r[0]]) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="sd-note">※ 국토교통부 실거래가 ' + esc(data.period[0]) + '~' + esc(data.period[1]) +
      ', 역이 있는 <b>법정동 단위</b> 중위값입니다. 거래 ' + data.minDeals + '건 미만은 값을 내지 않고, ' +
      '지분거래는 단가에서 뺐습니다. 토지는 대지만 셉니다(도로 등 제외). 월세 칸은 보증금 / 월세. 최근 1~2개월은 신고 지연으로 건수가 적습니다.</div>';
    return h;
  }

  global.StationMarket = {
    load: load,
    isReady: function () { return ready; },
    of: function (sid) { return ready ? (data.stations[sid] || null) : null; },
    meta: function () { return data; },
    sectionHtml: sectionHtml,
    _won: won
  };
})(typeof window !== 'undefined' ? window : this);
