/* StationTrend — 역 주변 아파트 가격 흐름 (반기별 평당 중위, G2 · 2026-11-13)
 *
 * 자료: data/station-trend.json (data/build_station_trend.py ← 국토부 아파트 매매 실거래 2023-01~2026-09 달 캐시).
 *   stations[역 ID] = { dong, lawd, s: [[반기, 중위 평당가(만원) 또는 null(거래 5건 미만), 건수], …] }
 * 읽는 법: 역이 있는 법정동의 반기별 매매 중위 평당가(전용). '관측된 흐름'일 뿐 철도 개통 효과(인과)가 아니다.
 *   거래 5건 미만 반기는 값을 지어내지 않고 '적음'으로 비운다. 마감 안 된 반기(예: 2026 하반기 7~9월)는 흐리게.
 * 화면: 역 상세 '시세' 탭(js/station-detail.js)의 막대 8개 + 처음→마지막 온전한 반기 변화율.
 */
(function (global) {
  'use strict';
  var data = null, ready = false, loading = null;

  function load(url) {
    if (loading) return loading;
    loading = fetch(url || 'data/station-trend.json').then(function (r) {
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

  var Logic = {
    // '2026H2' + 마감월 '202609' → { label: '26 하', partial: '7~9월' 또는 null }
    half: function (h, lastClosed) {
      var y = h.slice(0, 4), H = h.slice(4) === 'H1' ? 1 : 2;
      var from = H === 1 ? 1 : 7, to = H === 1 ? 6 : 12;
      var lc = String(lastClosed || '');
      var partial = null;
      if (lc && lc.slice(0, 4) === y) {
        var m = +lc.slice(4);
        if (m >= from && m < to) partial = from + '~' + m + '월';
      }
      return { label: y.slice(2) + ' ' + (H === 1 ? '상' : '하'), partial: partial };
    },
    // 처음 값이 있는 반기 → 마지막 '온전한'(마감된) 값이 있는 반기의 변화율(%). 둘 다 없거나 같은 반기면 null
    change: function (s, lastClosed) {
      var full = s.filter(function (x) { return x[1] != null && !Logic.half(x[0], lastClosed).partial; });
      if (full.length < 2) return null;
      var a = full[0], b = full[full.length - 1];
      return { from: a[0], to: b[0], pct: Math.round((b[1] / a[1] - 1) * 1000) / 10 };
    },
    fmt: function (v) { return v == null ? '' : Math.round(v).toLocaleString('ko-KR'); },
    // 막대 위 짧은 글자 — 1만(만원) 이상은 '1.17억' (좁은 칸에 12px 로 들어가게). 정확한 값은 낭독 이름·툴팁에
    short: function (v) { return v == null ? '' : v >= 10000 ? (Math.round(v / 100) / 100).toFixed(2) + '억' : Math.round(v).toLocaleString('ko-KR'); }
  };

  function of(sid) { return ready ? (data.stations[sid] || null) : null; }

  function sectionHtml(sid) {
    if (!ready) return '';
    var st = data.stations[sid];
    if (!st || !st.s || !st.s.some(function (x) { return x[1] != null; })) return '';
    var lc = data.lastClosed;
    var max = Math.max.apply(null, st.s.map(function (x) { return x[1] || 0; }));
    var ch = Logic.change(st.s, lc);
    var bars = st.s.map(function (x) {
      var hf = Logic.half(x[0], lc);
      var v = x[1], n = x[2] || 0;
      var hPct = v != null && max > 0 ? Math.max(4, Math.round(v / max * 100)) : 0;
      var aria = hf.label + '반기' + (hf.partial ? '(' + hf.partial + '만)' : '') + ' ' +
        (v != null ? Logic.fmt(v) + '만원/평, ' + n + '건' : '거래 ' + n + '건 — 적어서 값 없음');
      return '<li class="pt-col' + (hf.partial ? ' pt-partial' : '') + (v == null ? ' pt-none' : '') + '" aria-label="' + esc(aria) + '" title="' + esc(aria) + '">' +
        '<span class="pt-v" aria-hidden="true">' + (v != null ? Logic.short(v) : '적음') + '</span>' +
        '<span class="pt-bar" aria-hidden="true"><i style="height:' + hPct + '%"></i></span>' +
        '<span class="pt-h" aria-hidden="true">' + esc(hf.label) + (hf.partial ? '*' : '') + '</span></li>';
    }).join('');
    var sum = ch
      ? '<p class="pt-sum"><b>' + (ch.pct > 0 ? '+' : '') + ch.pct + '%</b> · ' + esc(Logic.half(ch.from, lc).label) + ' → ' + esc(Logic.half(ch.to, lc).label) + ' (평당 중위)</p>'
      : '';
    var partial = st.s.map(function (x) { return Logic.half(x[0], lc).partial; }).filter(Boolean)[0];
    return '<div class="sd-sec sd-trend-sec"><h3>가격 흐름 · ' + esc(st.dong) + ' (반기별 평당 중위, 만원)</h3>' + sum +
      '<ol class="pt-chart" aria-label="반기별 평당 중위 매매가">' + bars + '</ol>' +
      '<p class="pt-note">' + esc(st.dong) + ' 아파트 매매 실거래(전용면적 기준) 반기 중위값. 거래 ' + (data.minDeals || 5) + '건 미만 반기는 비움' +
      (partial ? ' · * 표시는 ' + esc(partial) + '만(마감 전, 신고 지연 반영 전)' : '') +
      '. 관측된 흐름이며 철도 개통의 효과를 뜻하지 않습니다.</p></div>';
  }

  var CSS =
    '.pt-sum{margin:0 0 6px;font-size:var(--fs-sm)}' +
    '.pt-chart{list-style:none;margin:0;padding:0;display:flex;gap:4px;align-items:flex-end;height:118px}' +
    '.pt-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;min-width:0}' +
    '.pt-v{font-size:var(--fs-xs);letter-spacing:-.3px;color:var(--muted,#5b6470);font-variant-numeric:tabular-nums;white-space:nowrap;line-height:1.3}' +
    '.pt-bar{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}' +
    '.pt-bar i{display:block;width:70%;max-width:22px;background:var(--accent,#1a73e8);border-radius:3px 3px 0 0}' +
    '.pt-partial .pt-bar i{opacity:.4}' +
    '.pt-none .pt-bar{border-bottom:1px dashed var(--border-strong,#bbb)}' +
    '.pt-h{font-size:var(--fs-xs);letter-spacing:-.3px;color:var(--muted,#5b6470);white-space:nowrap;margin-top:3px}' +
    '.pt-note{margin:6px 0 0;font-size:var(--fs-xs);color:var(--muted,#5b6470);line-height:1.45}';
  if (typeof document !== 'undefined' && !document.getElementById('pt-style')) {
    var st = document.createElement('style'); st.id = 'pt-style'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  global.StationTrend = {
    Logic: Logic,
    load: load,
    isReady: function () { return ready; },
    of: of,
    meta: function () { return data; },
    sectionHtml: sectionHtml
  };
})(typeof window !== 'undefined' ? window : this);
