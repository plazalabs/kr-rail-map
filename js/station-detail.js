/* StationDetail — 역 상세 패널 (완전 독립 모듈)
 *
 * 다른 파일 수정 없이 이 파일 하나로 동작한다. 전역 StationDetail 객체로 노출.
 * 사용법:
 *   <script src="js/station-detail.js"></script>
 *   StationDetail.init(map, LINES, STATIONS);
 *   StationDetail.show(stationFeature);   // properties: id, name_ko, name_en, lines
 *   StationDetail.hide();
 *
 * option: StationDetail.onAction = (action, stationName, stationId) => {...}
 *   action: 'from' | 'to' | 'fav' — 패널 내 출발지/도착지/즐겨찾기 버튼 클릭 시 호출.
 *   onAction이 없으면 기본 동작으로 DOM(id: route-from/route-to/route-panel)을 직접 건드린다.
 */
(function (global) {
  'use strict';

  var map = null;
  var LINES = [];
  var STATIONS = [];
  var panel = null;
  var lastTab = 't';     // 역 상세 탭 기억 (F3): t 교통 · p 시세 · d 개발 · k 이야기
  var orderCache = {};   // lineId -> { chains: [[역명...], ...] }

  // 앱 전체 표기와 맞춘다 (compare/stats/timeline 과 같은 낱말).
  // 'planned' 를 빼먹어서 배지에 영어 원문이 그대로 나온 적이 있다.
  var STATUS_LABEL = { open: '운행중', construction: '공사중', planned: '계획중', proposed: '구상중' };

  /* ---------- CSS (동적 삽입) ---------- */
  var CSS =
    '#sd-panel{position:fixed;top:0;right:0;width:340px;max-width:92vw;height:100%;' +
    'background:var(--panel-bg,#fff);box-shadow:var(--shadow-lg,-2px 0 12px rgba(0,0,0,.18));z-index:1000;' +
    'transform:translateX(105%);transition:transform .25s ease;overflow-y:auto;' +
    'font-family:inherit;color:var(--text,#222)}' +
    '#sd-panel.sd-open{transform:translateX(0)}' +
    '#sd-head{display:flex;align-items:center;justify-content:space-between;' +
    'padding:14px 16px;border-bottom:1px solid var(--border,#eee);position:sticky;top:0;background:var(--panel-bg,#fff);z-index:2}' +
    '#sd-head h2{margin:0;font-size:var(--fs-lg)}' +
    '#sd-close{border:none;background:none;font-size:var(--fs-xl);cursor:pointer;color:var(--muted,#5b6470);padding:4px 8px;border-radius:6px}' +
    '#sd-close:hover{color:var(--text,#222);background:var(--hover,#f2f2f2)}' +
    '#sd-body{padding:14px 16px}' +
    '.sd-en{color:var(--muted,#5b6470);font-size:var(--fs-sm);margin-top:2px}' +
    '.sd-sec{margin-top:16px}' +
    '.mk-table{width:100%;border-collapse:collapse;font-size:var(--fs-sm)}' +
    '.mk-table th{text-align:left;font-weight:500;color:var(--text-2,#4b5563);padding:6px 8px 6px 0;vertical-align:top;white-space:nowrap;width:1%}' +
    '.mk-table td{padding:6px 0;border-bottom:1px solid var(--border,#e5e7eb);line-height:1.45}' +
    '.mk-table th{border-bottom:1px solid var(--border,#e5e7eb)}' +
    '.mk-table b{font-variant-numeric:tabular-nums}' +
    '.mk-where{font-size:var(--fs-xs);color:var(--muted,#5b6470)}' +
    '.mk-none,.mk-few{color:var(--muted,#5b6470)}' +
    '.sd-mode-hint{margin-top:18px;padding-top:12px;border-top:1px solid var(--border,#e5e7eb)}' +
    '.sd-mode-on{width:100%;text-align:left;padding:9px 12px;border-radius:8px;cursor:pointer;' +
      'border:1px dashed var(--border,#d1d5db);background:var(--surface-2,transparent);color:var(--text,inherit);font-size:var(--fs-sm)}' +
    '.sd-mode-on:hover{background:var(--hover,#f3f4f6)}' +
    '.sd-sec h3{font-size:var(--fs-sm);color:var(--muted,#5b6470);margin:0 0 8px;font-weight:600}' +
    '.sd-line{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border,#f4f4f4);font-size:var(--fs-md)}' +
    '.sd-dot{width:12px;height:12px;border-radius:50%;flex:none}' +
    '.sd-badge{margin-left:auto;font-size:var(--fs-xs);padding:2px 8px;border-radius:10px;flex:none}' +
    '.sd-badge.open{background:#e6f4ea;color:#137333}' +
    '.sd-badge.construction{background:#fef7e0;color:#b06000}' +
    '.sd-badge.planned{background:#f3e8fd;color:#6b21a8}' +
    '.sd-badge.proposed{background:#f1f3f4;color:#5f6368}' +
    '.sd-adj{display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--border,#f4f4f4);font-size:var(--fs-sm)}' +
    '.sd-adj .sd-lname{font-weight:600;white-space:nowrap}' +
    '.sd-st{cursor:pointer;color:var(--accent,#1a73e8);text-decoration:underline;text-underline-offset:2px}' +
    '.sd-st.sd-none{color:var(--muted,#5b6470);text-decoration:none;cursor:default}' +
    '.sd-arrow{color:var(--muted,#5b6470)}' +
    '.sd-note{font-size:var(--fs-xs);color:var(--muted,#5b6470);margin-top:4px}' +
    // 시세는 이 패널에서 유일하게 '돈'을 말하는 숫자라 크게 보여준다.
    '.sd-price{display:flex;align-items:baseline;gap:3px;margin-top:2px}' +
    '.sd-price b{font-size:var(--fs-2xl);letter-spacing:-.02em;font-variant-numeric:tabular-nums}' +
    '.sd-price span{font-size:var(--fs-xs);color:var(--muted,#5b6470)}' +
    '.sd-price-sub{font-weight:400;font-size:var(--fs-xs);color:var(--muted,#5b6470)}' +
    // 시세는 패널 맨 위에 온다. 배경색 대신 테두리로 구분해 테마 7종에서
    // 색이 깨지지 않게 한다 (다크 테마에서 흰 카드가 뜨는 사고를 피한다).
    '.sd-price-sec{margin-top:12px;padding:10px 0 12px;' +
    'border-top:1px solid var(--border,#eee);border-bottom:1px solid var(--border,#eee)}' +
    '.sd-price-sec h3{margin-bottom:2px}' +
    // 단지 목록 — 법정동 중위값 아래에 붙는다. 표(table) 대신 목록을 쓰는 건
    // 좁은 패널에서 열이 뭉개지지 않게 하기 위해서다.
    '.sd-cx-wrap{margin-top:10px;padding-top:8px;border-top:1px dashed var(--border,#eee)}' +
    '.sd-glance{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px}' +
    '.sd-glance-note{margin:2px 0 6px;font-size:var(--fs-xs);color:var(--muted,#5b6470);line-height:1.5}' +
    '.sd-chip{display:flex;flex-direction:column;gap:1px;padding:6px 10px;border:1px solid var(--border,#e3e6ea);border-radius:10px;background:var(--bg,#f7f8fa);min-width:0}' +
    '.sd-chip small{font-size:var(--fs-xs);color:var(--muted,#5b6470)}' +
    '.sd-chip b{font-size:var(--fs-md);font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.sd-cx-wrap h4{font-size:var(--fs-xs);font-weight:600;margin-bottom:4px}' +
    '.sd-cx-list{list-style:none;margin:0;padding:0}' +
    '.sd-cx{display:grid;grid-template-columns:1fr auto;gap:0 8px;padding:5px 0;' +
    'border-bottom:1px solid var(--border,#eee)}' +
    '.sd-cx:last-child{border-bottom:0}' +
    '.sd-cx-n{font-size:var(--fs-sm);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.sd-cx-p{font-size:var(--fs-sm);font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.sd-cx-m{grid-column:1/-1;font-size:var(--fs-xs);color:var(--muted,#5b6470);' +
    'font-variant-numeric:tabular-nums}' +
    // 세대수·공급면적은 K-apt 에서 온 값이라 실거래가 줄과 구분해 둔다.
    // 색을 살짝 다르게 해서 '이건 다른 자료에서 왔다'가 눈에 보이게 한다.
    '.sd-cx-u{grid-column:1/-1;font-size:var(--fs-xs);color:var(--fg-2,#374151);' +
    'font-variant-numeric:tabular-nums;margin-top:1px}' +
    // 평형 구성은 한 단계 더 흐리게. 읽고 싶은 사람만 읽는 줄이다.
    '.sd-cx-b{grid-column:1/-1;font-size:var(--fs-xs);color:var(--muted,#5b6470);' +
    'font-variant-numeric:tabular-nums;margin-top:1px;letter-spacing:-.1px}' +
    '.sd-cx-more{margin-top:6px;width:100%;padding:6px 0;border:1px solid var(--border-strong,#ddd);' +
    'border-radius:6px;background:var(--btn-bg,#fff);color:var(--btn-text,#222);' +
    'cursor:pointer;font-size:var(--fs-xs)}' +
    '.sd-cx-more:hover{background:var(--hover,#f6f6f6)}' +
    '.sd-exits{display:flex;flex-wrap:wrap;gap:6px}' +
    '.sd-exit{min-width:38px;padding:6px 8px;border:1px solid var(--border-strong,#ddd);border-radius:6px;' +
    'background:var(--btn-bg,#fff);color:var(--btn-text,#222);cursor:pointer;font-size:var(--fs-xs);font-weight:600}' +
    '.sd-exit:hover{background:var(--hover,#f6f6f6);border-color:var(--accent,#1a73e8)}' +
    '.sd-exit.sd-exit-center{border-style:dashed;font-weight:400;color:var(--muted,#5b6470)}' +
    '.sd-btns{display:flex;gap:8px;margin-top:16px}' +
    '.sd-btns button{flex:1;padding:9px 0;border:1px solid var(--border-strong,#ddd);border-radius:6px;' +
    'background:var(--btn-bg,#fff);color:var(--btn-text,#222);cursor:pointer;font-size:var(--fs-md)}' +
    '.sd-btns button:hover{background:var(--hover,#f6f6f6)}' +
    // 역을 눌렀을 때 가장 먼저 하고 싶은 일은 '여기서 어디로 가지' 다.
    // 예전에는 이 버튼이 패널 맨 아래(출구·시간표 다음)에 있어서 스크롤하지
    // 않으면 존재조차 보이지 않았다. 이제 이름 바로 아래에 둔다.
    '.sd-actions{display:flex;gap:6px;margin:12px 0 2px}' +
    '.sd-actions button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;' +
    'padding:9px 4px;border:1px solid var(--border-strong,#ddd);border-radius:9px;' +
    'background:var(--btn-bg,#fff);color:var(--btn-text,#222);cursor:pointer;' +
    'font-size:var(--fs-sm);font-weight:600;line-height:1.15}' +
    '.sd-actions button:hover{background:var(--hover,#f6f6f6);border-color:var(--accent,#1a73e8)}' +
    '.sd-actions button.sd-primary{background:var(--accent,#1a73e8);color:var(--accent-text,#fff);' +
    'border-color:var(--accent,#1a73e8)}' +
    '.sd-actions button.sd-primary:hover{filter:brightness(1.06)}' +
    '.sd-actions button.sd-fav{flex:0 0 54px}' +
    '.sd-actions .sd-ico{font-size:var(--fs-md);line-height:1}' +
    // 접었다 펴는 절 — 인접역·출구는 늘 필요하지 않다. 첫 화면을 짧게 유지한다.
    '.sd-det{margin-top:14px;border-top:1px solid var(--border,#eee);padding-top:9px}' +
    '.sd-det>summary{cursor:pointer;font-size:var(--fs-sm);font-weight:600;color:var(--muted,#5b6470);' +
    'list-style:none;display:flex;align-items:center;gap:6px;padding:2px 0}' +
    '.sd-det>summary::-webkit-details-marker{display:none}' +
    '.sd-det>summary::before{content:"\\25B8";font-size:var(--fs-xs);transition:transform .15s;display:inline-block}' +
    '.sd-det[open]>summary::before{transform:rotate(90deg)}' +
    '.sd-det>summary:hover{color:var(--text,#222)}' +
    // 탭 4개 (F3, 시안 C — 2026-11-13): 교통 | 시세 | 개발 | 이야기. 절이 길게 이어지던 패널을 주제별로 나눈다.
    // 탭 줄은 스크롤해도 머리 밑에 붙어 있고, 출발·도착 단추는 맨 아래에 붙는다.
    '.sd-tabs{display:flex;gap:2px;margin:14px -16px 0;padding:0 12px;border-bottom:1px solid var(--border,#e5e7eb);' +
      'position:sticky;top:var(--sd-head-h,57px);background:var(--panel-bg,#fff);z-index:1}' +
    '.sd-tab{flex:1;padding:9px 4px 8px;border:0;border-bottom:2px solid transparent;background:none;cursor:pointer;' +
      'font:inherit;font-size:var(--fs-sm);font-weight:600;color:var(--muted,#5b6470);margin-bottom:-1px}' +
    '.sd-tab:hover{color:var(--text,#222)}' +
    '.sd-tab[aria-selected="true"]{color:var(--accent,#1a73e8);border-bottom-color:var(--accent,#1a73e8)}' +
    '.sd-tab:focus-visible{outline:2px solid var(--accent,#1a73e8);outline-offset:-2px;border-radius:4px}' +
    '.sd-pane>.sd-sec:first-child,.sd-pane>.sd-det:first-child,.sd-pane>div:first-child{margin-top:12px}' +
    '.sd-empty{margin-top:14px;color:var(--muted,#5b6470);font-size:var(--fs-sm)}' +
    '#sd-body .sd-actions.sd-foot{position:sticky;bottom:0;margin:16px -16px -14px;padding:10px 16px 12px;' +
      'background:var(--panel-bg,#fff);border-top:1px solid var(--border,#e5e7eb);z-index:1}' +
    '@media (max-width:768px){' +
    '#sd-panel{top:auto;bottom:0;left:0;right:0;width:100%;max-width:100%;height:auto;' +
    'max-height:62vh;border-radius:14px 14px 0 0;box-shadow:var(--shadow-lg,0 -2px 12px rgba(0,0,0,.18));' +
    'transform:translateY(105%)}' +
    '#sd-panel.sd-open{transform:translateY(0)}' +
    '}';

  function injectCSS() {
    if (document.getElementById('sd-style')) return;
    var st = document.createElement('style');
    st.id = 'sd-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 데이터 유틸 ---------- */
  function lineById(id) {
    for (var i = 0; i < LINES.length; i++) {
      if (LINES[i].properties && LINES[i].properties.id === id) return LINES[i];
    }
    return null;
  }

  function stationById(id) {
    for (var i = 0; i < STATIONS.length; i++) {
      if (STATIONS[i].properties && STATIONS[i].properties.id === id) return STATIONS[i];
    }
    return null;
  }

  function parseLines(p) {
    var ls = p.lines;
    if (typeof ls === 'string') {
      try { ls = JSON.parse(ls); } catch (e) { ls = []; }
    }
    return Array.isArray(ls) ? ls : [];
  }

  // 하버사인 거리 (km)
  function havKm(ax, ay, bx, by) {
    var r = Math.PI / 180;
    var dLat = (by - ay) * r, dLon = (bx - ax) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  // 노선별 역 순서 추론: 탐욕적 최근접 연결 (greedy nearest-neighbor chaining)
  // - 선형 geometry의 MultiLineString 파트가 순서 없이 겹쳐 있어 투영 방식이 오동작하므로
  //   역 좌표 간 거리만으로 순서를 복원한다.
  // - 반환: { chains: [[역명...], ...] } (분기/단절 구간은 별도 체인)
  // - 데이터의 역 좌표가 추정치인 노선(공사중/계획)은 인접역이 틀릴 수 있음 → UI에 추론 표시
  var MAX_GAP_KM = 8;   // 기본 단절 기준. 노선 전체의 중앙 최근접거리에 따라 적응적으로 완화
  function lineGapLimit(trip, coords) {
    // 노선 내 각 역의 최근접역 거리 중앙값 → 한계 = max(8km, 중앙값*2.5)
    var nns = [];
    for (var i = 0; i < trip.length; i++) {
      var a = trip[i], best = Infinity;
      for (var j = 0; j < trip.length; j++) {
        if (i === j) continue;
        var b = trip[j];
        var d = havKm(a.lng, a.lat, b.lng, b.lat);
        if (d < best) best = d;
      }
      if (best < Infinity) nns.push(best);
    }
    if (!nns.length) return MAX_GAP_KM;
    nns.sort(function (x, y) { return x - y; });
    var med = nns[Math.floor(nns.length / 2)];
    return Math.max(MAX_GAP_KM, med * 2.5);
  }
  function lineOrder(lineId) {
    if (orderCache[lineId]) return orderCache[lineId];
    var seen = {}, trip = [];
    for (var i = 0; i < STATIONS.length; i++) {
      var s = STATIONS[i];
      if (!s.geometry || !s.geometry.coordinates) continue;
      if (parseLines(s.properties).indexOf(lineId) < 0) continue;
      var nm = s.properties.name_ko || s.properties.id;
      if (!seen[nm]) {
        seen[nm] = 1;
        trip.push({ name: nm, lng: s.geometry.coordinates[0], lat: s.geometry.coordinates[1] });
      }
    }
    var coords = {};
    trip.forEach(function (t) { coords[t.name] = t; });
    var rem = {};
    trip.forEach(function (t) { rem[t.name] = 1; });
    var LIMIT = lineGapLimit(trip, coords);
    var chains = [];
    for (;;) {
      var names = Object.keys(rem);
      if (!names.length) break;
      if (names.length === 1) { chains.push(names); break; }
      // 끝점 추정: 다른 모든 역까지의 평균 거리가 가장 큰 역
      var start = names[0], bestMean = -1, a, b;
      for (a = 0; a < names.length; a++) {
        var sa = coords[names[a]], sum = 0;
        for (b = 0; b < names.length; b++) {
          if (a === b) continue;
          var sb = coords[names[b]];
          sum += havKm(sa.lng, sa.lat, sb.lng, sb.lat);
        }
        var mean = sum / (names.length - 1);
        if (mean > bestMean) { bestMean = mean; start = names[a]; }
      }
      var chain = [start];
      delete rem[start];
      for (;;) {
        var last = coords[chain[chain.length - 1]];
        var nn = null, nd = Infinity, k, rn = Object.keys(rem);
        for (k = 0; k < rn.length; k++) {
          var c = coords[rn[k]];
          var d = havKm(last.lng, last.lat, c.lng, c.lat);
          if (d < nd) { nd = d; nn = rn[k]; }
        }
        if (nn === null || nd > LIMIT) break;
        chain.push(nn);
        delete rem[nn];
      }
      chains.push(chain);
    }
    orderCache[lineId] = { chains: chains };
    return orderCache[lineId];
  }

  function adjacent(lineId, stationId) {
    var st = stationById(stationId);
    var nm = st ? (st.properties.name_ko || stationId) : stationId;
    var chains = lineOrder(lineId).chains;
    for (var i = 0; i < chains.length; i++) {
      var idx = chains[i].indexOf(nm);
      if (idx >= 0) {
        return {
          prev: idx > 0 ? chains[i][idx - 1] : null,
          next: idx < chains[i].length - 1 ? chains[i][idx + 1] : null
        };
      }
    }
    return { prev: null, next: null };
  }

  /* ---------- 패널 DOM ---------- */
  function buildPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'sd-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '역 상세 정보');
    panel.innerHTML =
      '<div id="sd-head"><h2>역 정보</h2>' +
      '<button id="sd-close" title="닫기" aria-label="닫기"><i data-ic="close"></i></button></div>' +
      '<div id="sd-body"></div>';
    document.body.appendChild(panel);
    // 닫힌 패널은 화면 밖으로 밀어 둘 뿐이라, inert 가 없으면 화면 낭독기·Tab 이 안의 버튼·입력칸을 그대로 잡는다 (68점 감사 4번, 2026-11-13)
    setOpen(false);
    panel.querySelector('#sd-close').addEventListener('click', hide);
  }

  function lineRow(lid) {
    var line = lineById(lid);
    var nm = line ? (line.properties.name_ko || lid) : lid;
    var col = line ? (line.properties.color || '#888') : '#888';
    var st = line ? (line.properties.status || 'open') : 'open';
    var label = STATUS_LABEL[st] || st;
    return '<div class="sd-line"><span class="sd-dot" style="background:' + esc(col) + '"></span>' +
      '<span>' + esc(nm) + '</span>' +
      '<span class="sd-badge ' + esc(st) + '">' + esc(label) + '</span></div>';
  }

  // 노선 lid 위에 있는 이름 nm 의 역 ID. 같은 노선에 같은 이름이 둘이면 현재 역에서 가까운 쪽.
  function idOnLine(nm, lid, fromId) {
    var from = stationById(fromId), best = null, bd = Infinity;
    for (var i = 0; i < STATIONS.length; i++) {
      var s = STATIONS[i];
      if (s.properties.name_ko !== nm || parseLines(s.properties).indexOf(lid) < 0) continue;
      var d = (from && from.geometry && s.geometry)
        ? havKm(from.geometry.coordinates[0], from.geometry.coordinates[1], s.geometry.coordinates[0], s.geometry.coordinates[1]) : 0;
      if (d < bd) { bd = d; best = s.properties.id; }
    }
    return best;
  }

  function adjRow(lid, stationId) {
    var line = lineById(lid);
    var nm = line ? (line.properties.name_ko || lid) : lid;
    var col = line ? (line.properties.color || '#888') : '#888';
    var a = adjacent(lid, stationId);
    // 인접역은 '이 노선 위의' 그 이름 역 ID 로 잇는다 (IMPL12 — 이름으로 전체를 찾으면 교대가 부산 교대로 갔다)
    function cell(name) {
      if (!name) return '<span class="sd-st sd-none">—</span>';
      var tid = idOnLine(name, lid, stationId);
      return '<span class="sd-st"' + (tid ? ' data-sid="' + esc(tid) + '"' : '') + ' data-st="' + esc(name) + '">' + esc(name) + '</span>';
    }
    return '<div class="sd-adj"><span class="sd-dot" style="background:' + esc(col) + '"></span>' +
      '<span class="sd-lname">' + esc(nm) + '</span>' +
      cell(a.prev) + '<span class="sd-arrow">←</span>' +
      '<b>현재역</b>' + '<span class="sd-arrow">→</span>' + cell(a.next) + '</div>';
  }

  // 출구 하나를 지도에 찍는다. 레이어는 한 번만 만들고 데이터만 갈아 끼운다.
  function showExitPin(lng, lat) {
    if (!map) return;
    try {
      if (!map.getSource('sd-exit-pt')) {
        map.addSource('sd-exit-pt', {
          type: 'geojson', data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
          id: 'sd-exit-halo', type: 'circle', source: 'sd-exit-pt',
          paint: {
            'circle-radius': 16, 'circle-color': '#1a73e8', 'circle-opacity': 0.18
          }
        });
        map.addLayer({
          id: 'sd-exit-dot', type: 'circle', source: 'sd-exit-pt',
          paint: {
            'circle-radius': 6, 'circle-color': '#1a73e8',
            'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5
          }
        });
      }
      map.getSource('sd-exit-pt').setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } }]
      });
    } catch (e) { /* 스타일 로드 전이면 무시 */ }
  }

  // 주변 시세 — 국토교통부 아파트 매매 실거래가를 법정동 단위로 묶은 값.
  // 단지 단위가 아니라 법정동 단위라는 사실을 화면에 밝힌다. 부동산 판단에
  // 쓰는 숫자라서, 무엇을 근거로 한 값인지 숨기면 안 된다.
  //
  // 패널 맨 위에 놓는다. 이 앱을 부동산 판단에 쓰기 때문에, 출구 12개와
  // 인접역을 지나 스크롤해야 시세가 나오면 순서가 거꾸로다.
  function priceSection(sid) {
    // 역 ID 로 찾는다 (IMPL12 — 이름으로 찾으면 부산 시청에 서울 시청 시세가 떴다)
    var price = (typeof StationPrice !== 'undefined' && StationPrice.isReady())
      ? StationPrice.of(sid) : null;
    if (!price || !price.medianPerPyeong) return '';

    var pm = StationPrice.meta() || {};
    // '강남구 역삼동' 처럼 시군구를 같이 적는다. 동 이름만으로는 '중구'
    // 처럼 여러 시도에 있는 곳을 구분할 수 없다.
    var where = [price.sido, price.sgg].filter(Boolean).join(' ');
    var h = '<div class="sd-sec sd-price-sec"><h3>법정동 실거래 · ' + esc(price.dong) +
      ' <span class="sd-price-sub">' + (where ? '· ' + esc(where) + ' · ' : '') +
      '최근 6개월 ' + price.deals + '건</span></h3>';
    h += '<div class="sd-price"><b>' + StationPrice.pp(price.medianPerPyeong) +
      '</b><span>/평 (전용면적)</span></div>';
    if (price.medianPrice) {
      h += '<div class="sd-note">중위 거래금액 ' + StationPrice.won(price.medianPrice) + '</div>';
    }
    h += '<div class="sd-note">※ 아파트 매매 실거래 중위값입니다. ' +
      '실거래가는 좌표를 주지 않아 <b>법정동 단위</b>로 묶었습니다 — ' +
      '같은 법정동이라도 단지·층·연식에 따라 차이가 큽니다. 평당가는 <b>전용면적</b> 기준이라 공급면적 기준 시세표보다 높게 보입니다.' +
      (pm.updated ? ' (기준 ' + esc(pm.updated) + ')' : '') + '</div>';
    h += complexBlock(sid);
    return h + '</div>';
  }

  /* 단지 목록 — 법정동 하나에 평당가 하나로는 판단이 안 된다.
   *
   * 같은 잠실동에서도 1979년 5층과 2008년 33층이 같은 값을 받지 않는다.
   * 실거래가 응답에 단지명·지번·건축년도·전용면적이 다 들어 있으므로,
   * 좌표 없이도 단지 단위까지는 갈 수 있다. 기본 3곳만 보이고 나머지는
   * 펼친다 — 패널 첫 화면을 목록으로 채우면 시세가 안 보인다.
   */
  function complexBlock(sid) {
    if (typeof StationPrice === 'undefined' || !StationPrice.isComplexReady) return '';
    var c = StationPrice.complexes(sid, 3);
    if (!c) return '';

    // 전용면적 구간별 세대수. K-apt 가 이걸 준다 — 합이 세대수와 정확히 맞는다.
    // 3,000세대라도 전부 59㎡면 성격이 전혀 다르고, 전부 135㎡면 또 다르다.
    // 평균 하나로는 그 차이가 안 보여서 구성을 같이 적는다.
    var BAND_LABEL = ['~60㎡', '60~85㎡', '85~135㎡', '135㎡~'];
    function bandText(bd) {
      if (!bd || !bd.length) return '';
      var parts = [];
      for (var i = 0; i < bd.length; i++) {
        if (bd[i]) parts.push(BAND_LABEL[i] + ' ' + bd[i].toLocaleString('ko-KR'));
      }
      return parts.join(' · ');
    }

    function row(x, i) {
      var meta = [];
      if (x.y) meta.push(x.y + '년');
      // 세대수는 규모를 말해 준다. 12세대 소형과 3,000세대 대단지는 같은
      // 평당가라도 전혀 다른 자산이다. 없으면 그냥 빼고 그린다.
      if (x.h) meta.push(x.h.toLocaleString('ko-KR') + '세대');
      if (!x.ea && x.a) meta.push(Math.round(x.a) + '㎡');
      meta.push(x.n_deals + '건' + (x.n_deals < 5 ? '(적음)' : ''));   // 작은 표본은 같은 무게로 보이지 않게 (68점 감사 11번)

      // 전용·공급 두 면적을 같이 보여줘야 대화가 된다. 사람들이 보는 시세표는
      // 대개 공급면적 기준인데 실거래가는 전용면적만 준다. 전용률은 두 값을
      // 나누면 나오므로 따로 적지 않는다.
      var extra = [];
      if (x.ea) extra.push('전용 ' + Math.round(x.ea) + '㎡');
      if (x.ba) extra.push('공급* ' + Math.round(x.ba) + '㎡');
      if (x.d) extra.push(x.d + '개동');
      var bands = bandText(x.bd);

      // 단지별 전세가율 (같은 단지·같은 면적 매매·신규 전세 짝 — js/jeonse.js). 짝이 없으면 적지 않는다
      var jr = (typeof StationJeonse !== 'undefined' && StationJeonse.complexOf) ? StationJeonse.complexOf(c.key, x.j) : null;
      if (jr) meta.push('전세가율 ' + Math.round(jr[0] * 100) + '%' + (jr[1] > 1 ? ' (' + jr[1] + '개 면적)' : '') + (jr[0] >= 0.8 ? ' (주의)' : ''));
      return '<li class="sd-cx"><span class="sd-cx-n">' + esc(x.n) + '</span>' +
        '<span class="sd-cx-p">' + StationPrice.pp(x.pp) + '/평</span>' +
        '<span class="sd-cx-m">' + esc(meta.join(' · ')) + '</span>' +
        (extra.length ? '<span class="sd-cx-u">' + esc(extra.join(' · ')) + '</span>' : '') +
        (bands ? '<span class="sd-cx-b">' + esc(bands) + '</span>' : '') +
        '</li>';
    }

    var h = '<div class="sd-cx-wrap"><h4>이 법정동 단지 ' + c.total + '곳' +
      '<span class="sd-price-sub"> 평당가 높은 순</span></h4><ul class="sd-cx-list">';
    h += c.items.map(row).join('');
    h += '</ul>';
    if (c.total > c.items.length) {
      h += '<button type="button" class="sd-cx-more" data-more="1">' +
        '나머지 ' + (c.total - c.items.length) + '곳 보기</button>';
    }
    // 세대수·면적은 다른 자료에서 온 값이라 출처를 밝힌다. 이게 없으면
    // 실거래가로 계산한 줄과 섞여 보인다.
    var hasUnits = c.items.some(function (x) { return !!x.h; });
    var hasBa = c.items.some(function (x) { return !!x.ba; });
    h += '<div class="sd-note">※ 단지 좌표가 없어 <b>역에서의 거리는 알 수 없습니다.</b> ' +
      '역이 속한 법정동에 있는 단지 목록입니다. 거래 2건 미만 단지는 뺐습니다.' +
      (hasUnits ? ' 세대수·면적·평형 구성은 국토교통부 공동주택 기본정보(K-apt)를 ' +
        '단지명으로 이은 값이고, 면적은 <b>단지 평균</b>이라 세대별 값이 아닙니다.' : '') +
      (hasBa ? ' <b>*</b> 공급면적은 K-apt의 <b>관리비부과면적</b>을 세대수로 나눈 값입니다. ' +
        '대부분 단지에서 공급면적과 같지만, 전용면적에 관리비를 부과하는 단지는 다릅니다.' : '') +
      '</div></div>';
    return h;
  }

  function show(feature) {
    if (!feature || !feature.properties) return;
    // 호스트가 '패널을 처음 열 때 받을 데이터' 를 걸어 둘 수 있다 (app.js loadDetailData — 지연 로딩)
    if (typeof api.beforeShow === 'function') { try { api.beforeShow(feature); } catch (e) { /* 조용히 */ } }
    // 지도 load 전에 클릭이 들어올 수 있다. 패널이 없으면 여기서 만든다.
    if (!panel) { injectCSS(); buildPanel(); }
    current = feature;
    var p = feature.properties;
    var st = stationById(p.id) || feature;   // 원본 우선 (lines 배열 문자열화 방지)
    var sp = st.properties;
    var nameKo = sp.name_ko || p.name_ko || '';
    var nameEn = sp.name_en || p.name_en || '';
    var lineIds = parseLines(sp);
    var sid = sp.id || p.id;

    var html = '<div><b style="font-size:var(--fs-lg)">' + esc(nameKo) + '</b>' +
      (nameEn ? '<div class="sd-en">' + esc(nameEn) + '</div>' : '') + '</div>';

    // 액션은 패널 맨 아래에 붙는다(sticky, F3) — 어느 탭에서 얼마나 내려도 스크롤 없이 보인다.
    // (예전엔 맨 아래 '흐르는' 자리라 안 보였고, 그다음엔 이름 바로 아래였다.)
    var actionsHtml = '<div class="sd-actions sd-foot">' +
      '<button class="sd-primary" data-act="from" title="' + esc(nameKo) + '에서 출발하는 경로 찾기">' +
      '<span class="sd-ico"><i data-ic="depart"></i></span>여기서 출발</button>' +
      '<button data-act="to" title="' + esc(nameKo) + '으로 가는 경로 찾기">' +
      '<span class="sd-ico"><i data-ic="flag"></i></span>여기로 도착</button>' +
      '<button class="sd-fav" data-act="fav" title="즐겨찾기" aria-label="즐겨찾기">' +
      '<span class="sd-ico"><i data-ic="star"></i></span></button>' +
      '</div>';

    // 투자 모드(js/mode.js)가 꺼져 있으면 시세·단지·공급을 그리지 않는다 — 자료를 이미 받았더라도.
    // KR_MODE 가 없으면(모듈 없음) 예전처럼 그린다.
    var invest = typeof KR_MODE === 'undefined' || KR_MODE.isInvest();

    // 한눈에 (2026-11-11 사용성 점검): 투자 모드에서는 절이 많아 핵심 숫자를 찾으려면 한참 내려야 했다.
    // 맨 위에 세 가지 — 평당 시세 · 전세가율 · 강남까지(지금) — 를 칩으로. 자료가 없는 칩은 빼고, 다 없으면 줄을 안 그린다.
    var chips = [];
    if (invest && typeof StationPrice !== 'undefined' && StationPrice.isReady()) {
      var pr = StationPrice.of(sid);
      // 칩만 잘라 봐도 무엇의 값인지 알게 — 법정동·건수·전용면적 (68점 감사 11번)
      if (pr && pr.medianPerPyeong != null) { chips.push(['평당(전용)', StationPrice.pp(pr.medianPerPyeong)]); var priceScope = pr.dong + ' 아파트 매매 중위 · 최근 6개월 ' + pr.deals + '건'; }
    }
    if (invest && typeof StationJeonse !== 'undefined' && StationJeonse.isReady()) {
      var jn = StationJeonse.of(sid);
      if (jn && jn.r != null) chips.push(['전세가율', Math.round(jn.r * 100) + '%' + (jn.r >= 0.8 ? ' (주의)' : '')]);
    }
    var glanceNote = '';
    if (typeof StationAccess !== 'undefined' && StationAccess.isReady()) {
      var ac = StationAccess.of(sid);
      var gb = ac && ac.rows.find(function (r) { return r.id === 'gbd'; });
      // '강남까지'라고 쓰면 강남역으로 읽힌다 — 실제 값은 강남·역삼·선릉·삼성 중 가장 빠른 역이라 '강남권'으로 쓰고 기준 역을 밝힌다 (감사 이전1, 2026-11-13)
      if (gb && gb.now != null && gb.now > 0) {
        chips.push(['강남권까지', gb.now + '분' + (gb.save > 0 ? ' → ' + gb.after + '분' : '')]);
        var vn = function (k) { var id = gb.via && gb.members && gb.members[gb.via[k]]; var f = id && typeof STATIONS !== 'undefined' && STATIONS.find(function (x) { return x.properties.id === id; }); return f ? f.properties.name_ko + '역' : null; };
        var v0 = vn(0), v1 = vn(1);
        glanceNote = '강남권 = 강남·역삼·선릉·삼성 중 가장 빠른 역' + (v0 ? ' · 지금 ' + v0 + (gb.save > 0 && v1 && v1 !== v0 ? ' → 개통 후 ' + v1 : '') : '');
      }
    }
    if (chips.length) {
      html += '<div class="sd-glance" role="list" aria-label="한눈에">' + chips.map(function (c) {
        return '<span class="sd-chip" role="listitem"><small>' + esc(c[0]) + '</small><b>' + esc(c[1]) + '</b></span>';
      }).join('') + '</div>';
      if (typeof priceScope !== 'undefined' && priceScope) glanceNote = '평당 = ' + priceScope + (glanceNote ? ' · ' + glanceNote : '');
      if (glanceNote) html += '<p class="sd-glance-note">' + esc(glanceNote) + '</p>';
    }

    // ---- 탭 4개 (F3) ---- 교통(T) · 시세(P) · 개발(D) · 이야기(K). 탭 패널은 모두 DOM 에 두고 고르지 않은 것은 hidden.
    var T = '', P = '', D = '', K = '';

    // 시세 탭: 매매 시세·단지 → 전세가율 → 실거래 7종
    if (invest) P += priceSection(sid);

    // 도심 접근성 — '이 집에서 강남까지 몇 분'. 개통으로 얼마나 줄어드는지까지. 교통 탭 맨 위.
    // 자료(access.json)가 아직 없으면 이 절을 통째로 건너뛴다.
    if (typeof StationAccess !== 'undefined' && StationAccess.isReady()) {
      T += '<div class="sd-sec"><h3>도심 접근성</h3>' +
        StationAccess.sectionHtml(sid) +
        // 통근권 찾기(js/commute.js)로 — '이 역이 직장이면 어디서 다닐 수 있나'
        (typeof CommuteMap !== 'undefined'
          ? '<button type="button" class="sd-commute" style="margin-top:8px;padding:0;border:0;background:none;color:var(--accent,#1a73e8);font:inherit;font-size:var(--fs-sm);cursor:pointer;text-decoration:underline">이 역까지 통근권 보기 →</button>'
          : '') + '</div>';
    }

    // 공급 — '앞으로 이 동네에 몇 세대가 들어오나'. 시세(지금)·접근성(시간)에
    // 이어 세 번째 축이다. 자료가 없으면 절을 건너뛴다.
    if (invest && typeof StationDev !== 'undefined' && StationDev.isReady()) {
      var dv = StationDev.of(sid);
      if (dv) {
        D += '<div class="sd-sec"><h3>앞으로 들어올 세대</h3>' +
          StationDev.sectionHtml(sid) + '</div>';
      }
    }

    // 전세가율 (2026-11-11) — 같은 단지·같은 면적 매매·신규 전세 짝의 중위값. 투자 모드에서만.
    if (invest && typeof StationJeonse !== 'undefined' && StationJeonse.isReady()) {
      P += '<div class="sd-sec sd-jeonse-sec"><h3>전세가율 (전세 ÷ 매매)</h3>' + StationJeonse.sectionHtml(sid) + '</div>';
    }

    // 실거래 7종 (1단계, 2026-11-09) — 투자 모드에서만. 자료 없는 종류는 '자료 없음', 5건 미만은 '거래 적음'.
    if (invest && typeof StationMarket !== 'undefined' && StationMarket.isReady()) {
      P += '<div class="sd-sec sd-market-sec"><h3>실거래 (7종)</h3>' + StationMarket.sectionHtml(sid) + '</div>';
    }

    // 역세권 범위(근사) — 1차 250m 안 출구·다른 역 수. 모듈이 없으면 건너뛴다.
    if (typeof StationArea !== 'undefined' && StationArea.panelHtml) {
      T += StationArea.panelHtml(sid);
    }

    // 경유 노선
    T += '<div class="sd-sec"><h3>경유 노선 ' + lineIds.length + '개</h3>';
    T += lineIds.length ? lineIds.map(lineRow).join('') : '<div class="sd-note">노선 정보 없음</div>';
    T += '</div>';

    // 이 역 이야기 (커뮤니티, js/station-talk.js) — 게시판 설정이 없으면 '준비 중' 한 줄
    if (typeof StationTalk !== 'undefined') K += StationTalk.sectionHtml(sid, nameKo);

    // 인접역 (노선별) — 접어 둔다. 역 하나 열 때마다 노선 수만큼 줄이 늘어나서
    // 패널이 길어지는 주범이었다. 필요할 때만 펴 본다.
    T += '<details class="sd-det"><summary>인접역 (노선별)</summary>';
    T += lineIds.length ? lineIds.map(function (lid) { return adjRow(lid, sid); }).join('')
      : '<div class="sd-note">노선 정보 없음</div>';
    T += '<div class="sd-note">※ 인접역 순서는 역 좌표 간 거리로 추론한 것으로, 실제 운행 순서와 다를 수 있습니다.</div></details>';

    // 출구 — 부동산에서 '역까지 몇 분'은 중심점이 아니라 출구까지의 거리다.
    // 출구 좌표가 없는 역(주로 KTX·일반철도)은 없다고 밝히고 중심점으로 물러난다.
    var exits = (typeof StationExits !== 'undefined' && StationExits.isReady())
      ? StationExits.exitsOf(sid) : [];
    // 출구도 접어 둔다. 12개짜리 역은 버튼만 열두 줄이라 첫 화면을 다 먹었다.
    // 제목에 개수와 최대 이격거리를 적어 두면, 펴지 않아도 판단은 된다.
    var exTitle = '출구';
    var maxNo = 0;
    if (exits.length) {
      var sm = StationExits.summary(sid);
      var nums = exits.map(function (e) { return parseInt(e.no, 10) || 0; })
        .filter(function (n) { return n > 0; });
      maxNo = nums.length ? Math.max.apply(null, nums) : 0;
      exTitle += ' · ' + exits.length + '개';
      if (sm.spreadKm > 0.05) exTitle += ' (최대 ' + Math.round(sm.spreadKm * 1000) + 'm 떨어짐)';
    }
    T += '<details class="sd-det"><summary>' + esc(exTitle) + '</summary>';
    if (exits.length) {
      T += '<div class="sd-exits">';
      T += exits.slice().sort(function (a, b) {
        return (parseInt(a.no, 10) || 999) - (parseInt(b.no, 10) || 999);
      }).map(function (e) {
        return '<button class="sd-exit" data-lng="' + e.c[0] + '" data-lat="' + e.c[1] +
          '" title="' + esc(nameKo) + ' ' + esc(e.no || '') + '번 출구로 이동">' +
          esc(e.no || '·') + '</button>';
      }).join('');
      T += '</div>';
      // 번호가 중간에 비면(공사·폐쇄) 그 사실을 적어 둔다. 조용히 넘기면
      // '출구가 12개인데 왜 8번이 없지' 로 오해받는다.
      if (maxNo && exits.length < maxNo) {
        T += '<div class="sd-note">1~' + maxNo + '번 중 ' + exits.length +
          '개만 확인됨 (나머지는 미개설·미등록)</div>';
      }
      T += '<div class="sd-note">출구를 누르면 지도가 그 출구로 이동합니다. ' +
        '출구 좌표 © OpenStreetMap (ODbL)</div>';
    } else {
      T += '<div class="sd-note">이 역은 출구 좌표가 없어 역 중심점으로 거리를 잽니다.</div>';
    }
    T += '</details>';

    // 철도 모드에서는 맨 아래에 투자 모드 안내 한 줄 (2026-11-09 회장님 결정).
    // 철도만 보는 사람은 지나치면 되고, 집값을 찾는 사람은 여기서 바로 켠다.
    // 탭이 생긴 뒤(F3)엔 시세·개발 탭이 숨으므로 교통 탭 맨 아래에 둔다.
    if (!invest) {
      T += '<div class="sd-mode-hint"><button type="button" class="sd-mode-on" ' +
        'title="역 상세에 시세·단지·공급을 보여 줍니다"><i data-ic="home"></i> 이 역의 집값·공급 보기 → 투자 모드 켜기</button></div>';
    }

    // '첫차 / 막차' 칸은 없앴다. 자료가 없어서 '시간표 데이터 없음' 한 줄만
    // 남는 빈 칸이었고, 그 빈 칸이 액션 버튼을 화면 밖으로 밀어내고 있었다.

    // 빈 탭은 '왜 비었는지' 한 줄 — 조용히 빈 화면이면 고장으로 읽힌다.
    if (invest && !P) P = '<p class="sd-empty">이 역 주변 아파트 실거래 자료가 아직 없습니다.</p>';
    if (invest && !D) D = '<p class="sd-empty">이 역 주변에 잡힌 공급(입주·정비) 자료가 없습니다.</p>';
    if (!K) K = '<p class="sd-empty">이야기 기능을 불러오지 못했습니다.</p>';

    var tabs = [['t', '교통', T]];
    if (invest) tabs.push(['p', '시세', P], ['d', '개발', D]);
    tabs.push(['k', '이야기', K]);
    // 마지막으로 고른 탭을 기억한다 — 역을 옮겨 다니며 시세만 비교하는 사람이 매번 탭을 다시 누르지 않게.
    // 투자 모드가 꺼져 시세·개발 탭이 없어지면 교통으로.
    var sel = tabs.some(function (t) { return t[0] === lastTab; }) ? lastTab : 't';
    html += '<div class="sd-tabs" role="tablist" aria-label="역 정보 분류">' + tabs.map(function (t) {
      var on = t[0] === sel;
      return '<button type="button" role="tab" class="sd-tab" id="sd-tab-' + t[0] + '" data-tab="' + t[0] + '"' +
        ' aria-controls="sd-pane-' + t[0] + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    html += tabs.map(function (t) {
      return '<div class="sd-pane" role="tabpanel" id="sd-pane-' + t[0] + '" data-pane="' + t[0] + '"' +
        ' aria-labelledby="sd-tab-' + t[0] + '"' + (t[0] === sel ? '' : ' hidden') + '>' + t[2] + '</div>';
    }).join('');
    html += actionsHtml;

    var body = panel.querySelector('#sd-body');
    body.innerHTML = html;

    // 탭 전환: 누르기 + ←/→/Home/End (WAI-ARIA 탭 패턴, 자동 활성화)
    var tabBtns = Array.prototype.slice.call(body.querySelectorAll('.sd-tab'));
    function pick(key, focus) {
      lastTab = key;
      tabBtns.forEach(function (b) {
        var on = b.getAttribute('data-tab') === key;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      body.querySelectorAll('.sd-pane').forEach(function (pn) { pn.hidden = pn.getAttribute('data-pane') !== key; });
      // 탭을 바꾸면 내용 맨 위부터 (탭 줄은 붙어 있으므로 탭 줄 바로 아래로)
      var tl = body.querySelector('.sd-tabs');
      if (tl && panel.scrollTop > tl.offsetTop) panel.scrollTop = tl.offsetTop;
    }
    tabBtns.forEach(function (b, i) {
      b.addEventListener('click', function () { pick(b.getAttribute('data-tab'), false); });
      b.addEventListener('keydown', function (e) {
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabBtns.length - 1 : null;
        if (j == null) return;
        e.preventDefault();
        j = (j + tabBtns.length) % tabBtns.length;
        pick(tabBtns[j].getAttribute('data-tab'), true);
      });
    });
    if (typeof StationTalk !== 'undefined') StationTalk.mount(body, sid, nameKo);

    // 인접역 클릭 → 해당 역 상세로 이동
    body.querySelectorAll('.sd-st[data-sid]').forEach(function (el) {
      el.addEventListener('click', function () {
        var target = stationById(el.getAttribute('data-sid'));   // 역 ID 로 (이름 검색 아님)
        if (target) show(target);
      });
    });

    // 출구 클릭 → 그 출구로 지도 이동. 역 상세는 열어 둔 채로 둔다.
    // (닫으면 사용자가 방금 누른 출구를 어디서 봤는지 잃는다)
    body.querySelectorAll('.sd-exit[data-lng]').forEach(function (el) {
      el.addEventListener('click', function () {
        var lng = parseFloat(el.getAttribute('data-lng'));
        var lat = parseFloat(el.getAttribute('data-lat'));
        if (!map || !isFinite(lng) || !isFinite(lat)) return;
        try {
          map.flyTo({ center: [lng, lat], zoom: 18, duration: 700 });
          showExitPin(lng, lat);
        } catch (e) { /* 지도 준비 전이면 무시 */ }
      });
    });

    // 단지 목록 펼치기. 처음 3곳만 보여주고 나머지는 눌렀을 때 그린다 —
    // 역을 눌러볼 때마다 30줄짜리 목록이 먼저 뜨면 시세가 안 보인다.
    body.querySelectorAll('.sd-cx-more[data-more]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var full = StationPrice.complexes(sid);
        if (!full) return;
        var ul = btn.parentNode.querySelector('.sd-cx-list');
        ul.innerHTML = full.items.map(function (x) {
          var m = [];
          if (x.y) m.push(x.y + '년');
          if (x.a) m.push(Math.round(x.a) + '㎡');
          m.push(x.n_deals + '건' + (x.n_deals < 5 ? '(적음)' : ''));
          var jr = (typeof StationJeonse !== 'undefined' && StationJeonse.complexOf) ? StationJeonse.complexOf(full.key, x.j) : null;
          if (jr) m.push('전세가율 ' + Math.round(jr[0] * 100) + '%' + (jr[0] >= 0.8 ? ' (주의)' : ''));
          return '<li class="sd-cx"><span class="sd-cx-n">' + esc(x.n) + '</span>' +
            '<span class="sd-cx-p">' + StationPrice.pp(x.pp) + '/평</span>' +
            '<span class="sd-cx-m">' + esc(m.join(' · ')) + '</span></li>';
        }).join('');
        btn.remove();
      });
    });

    // 투자 모드 켜기 (안내 줄) — 켜면 KR_MODE 구독자(app.js)가 자료를 받고 패널을 다시 그린다
    var modeOn = body.querySelector('.sd-mode-on');
    if (modeOn) modeOn.addEventListener('click', function () {
      if (typeof KR_MODE !== 'undefined') KR_MODE.set('invest');
    });

    var cmBtn = body.querySelector('.sd-commute');
    if (cmBtn) cmBtn.addEventListener('click', function () {
      hide();
      if (typeof CommuteMap !== 'undefined') CommuteMap.show(sid);
    });

    // 액션 버튼
    body.querySelectorAll('.sd-actions button').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (typeof api.onAction === 'function') {
          api.onAction(act, nameKo, sid);   // 동명역 구분용 역 ID (3번째 인자)
          return;
        }
        // 기본 동작: 기존 페이지 DOM 활용 (없으면 무시)
        try {
          if (act === 'fav') {
            var ev = new CustomEvent('stationdetail:fav', { detail: { name: nameKo } });
            document.dispatchEvent(ev);
          } else {
            // 역 패널이 길찾기 패널을 덮으므로 먼저 닫는다 (app.js 주석 참고).
            hide();
            var input = document.getElementById(act === 'from' ? 'route-from' : 'route-to');
            var rp = document.getElementById('route-panel');
            if (input) { input.value = nameKo; input.dataset.sid = sid; }
            if (rp) rp.hidden = false;
          }
        } catch (e) { /* 독립 모듈: 실패해도 조용히 */ }
      });
    });

    // 다른 역을 열었는데 이전에 스크롤한 위치가 남아 있으면, 새 역의 이름과
    // 액션 버튼이 화면 밖에서 시작한다. 항상 맨 위부터 보여준다.
    panel.scrollTop = 0;
    setOpen(true);
  }

  // 열림/닫힘 한 곳: 클래스(밀어 넣기 애니메이션) + inert(보조기술·키보드에서 빼기) + aria-hidden(inert 모르는 옛 브라우저)
  // 포커스가 안에 있을 때 닫으면 inert 가 포커스를 body 로 빼고, ui.js 가 연 자리로 돌려준다.
  function setOpen(v) {
    if (!panel) return;
    panel.classList.toggle('sd-open', v);
    panel.inert = !v;
    if (v) panel.removeAttribute('aria-hidden'); else panel.setAttribute('aria-hidden', 'true');
  }
  function hide() {
    setOpen(false);
  }

  // 시세처럼 '나중에 도착하는' 데이터가 있다. 사용자가 데이터보다 먼저 역을
  // 열면 시세 칸이 없는 패널이 뜨고, 그 뒤로는 다시 그릴 계기가 없다.
  // 마지막으로 연 역을 기억해 두고, 데이터가 도착하면 스스로 다시 그린다.
  var current = null;

  function refresh() {
    if (current && panel && panel.classList.contains('sd-open')) show(current);
  }

  function init(m, lines, stations) {
    map = m || null;
    LINES = lines || [];
    STATIONS = stations || [];
    orderCache = {};
    injectCSS();
    buildPanel();
    // init 은 지도 스타일이 다 뜬 뒤에 불린다. 그 전에 검색으로 역을 열면
    // LINES/STATIONS 가 비어 있어 노선 이름이 'seoul-subway-line-2' 같은
    // 원본 id 로 나오고 인접역이 '—' 가 된다. 느린 회선에서 실제로 그랬다.
    // 데이터가 갖춰졌으니 열려 있는 패널을 다시 그린다.
    refresh();
  }

  var api = {
    init: init,
    show: show,
    // 탭 고르기 (F3) — t 교통 · p 시세 · d 개발 · k 이야기. 없는 탭이면 false
    selectTab: function (k) { var b = panel && panel.querySelector('.sd-tab[data-tab="' + k + '"]'); if (!b) return false; b.click(); return true; },
    hide: hide,
    refresh: refresh,
    onAction: null,   // (action, stationName, stationId) => void — 호스트가 주입 가능
    beforeShow: null, // (feature) => void — 패널을 열기 직전 호출 (데이터 지연 로딩)
    // 테스트/디버깅용
    _lineOrder: lineOrder,
    _adjacent: adjacent,
    _idOnLine: idOnLine
  };

  global.StationDetail = api;
})(typeof window !== 'undefined' ? window : this);
