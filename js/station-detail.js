/* StationDetail — 역 상세 패널 (완전 독립 모듈)
 *
 * 다른 파일 수정 없이 이 파일 하나로 동작한다. 전역 StationDetail 객체로 노출.
 * 사용법:
 *   <script src="js/station-detail.js"></script>
 *   StationDetail.init(map, LINES, STATIONS);
 *   StationDetail.show(stationFeature);   // properties: id, name_ko, name_en, lines
 *   StationDetail.hide();
 *
 * option: StationDetail.onAction = (action, stationName) => {...}
 *   action: 'from' | 'to' | 'fav' — 패널 내 출발지/도착지/즐겨찾기 버튼 클릭 시 호출.
 *   onAction이 없으면 기본 동작으로 DOM(id: route-from/route-to/route-panel)을 직접 건드린다.
 */
(function (global) {
  'use strict';

  var map = null;
  var LINES = [];
  var STATIONS = [];
  var panel = null;
  var orderCache = {};   // lineId -> { chains: [[역명...], ...] }

  var STATUS_LABEL = { open: '운행중', construction: '공사중', proposed: '계획' };

  /* ---------- CSS (동적 삽입) ---------- */
  var CSS =
    '#sd-panel{position:fixed;top:0;right:0;width:340px;max-width:92vw;height:100%;' +
    'background:var(--panel-bg,#fff);box-shadow:var(--shadow-lg,-2px 0 12px rgba(0,0,0,.18));z-index:1000;' +
    'transform:translateX(105%);transition:transform .25s ease;overflow-y:auto;' +
    'font-family:inherit;color:var(--text,#222)}' +
    '#sd-panel.sd-open{transform:translateX(0)}' +
    '#sd-head{display:flex;align-items:center;justify-content:space-between;' +
    'padding:14px 16px;border-bottom:1px solid var(--border,#eee);position:sticky;top:0;background:var(--panel-bg,#fff);z-index:2}' +
    '#sd-head h2{margin:0;font-size:18px}' +
    '#sd-close{border:none;background:none;font-size:20px;cursor:pointer;color:var(--muted,#6b7280);padding:4px 8px;border-radius:6px}' +
    '#sd-close:hover{color:var(--text,#222);background:var(--hover,#f2f2f2)}' +
    '#sd-body{padding:14px 16px}' +
    '.sd-en{color:var(--muted,#6b7280);font-size:13px;margin-top:2px}' +
    '.sd-sec{margin-top:16px}' +
    '.sd-sec h3{font-size:13px;color:var(--muted,#6b7280);margin:0 0 8px;font-weight:600}' +
    '.sd-line{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border,#f4f4f4);font-size:14px}' +
    '.sd-dot{width:12px;height:12px;border-radius:50%;flex:none}' +
    '.sd-badge{margin-left:auto;font-size:11px;padding:2px 8px;border-radius:10px;flex:none}' +
    '.sd-badge.open{background:#e6f4ea;color:#137333}' +
    '.sd-badge.construction{background:#fef7e0;color:#b06000}' +
    '.sd-badge.proposed{background:#f1f3f4;color:#5f6368}' +
    '.sd-adj{display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--border,#f4f4f4);font-size:13px}' +
    '.sd-adj .sd-lname{font-weight:600;white-space:nowrap}' +
    '.sd-st{cursor:pointer;color:var(--accent,#1a73e8);text-decoration:underline;text-underline-offset:2px}' +
    '.sd-st.sd-none{color:var(--muted,#6b7280);text-decoration:none;cursor:default}' +
    '.sd-arrow{color:var(--muted,#6b7280)}' +
    '.sd-note{font-size:12px;color:var(--muted,#6b7280);margin-top:4px}' +
    '.sd-btns{display:flex;gap:8px;margin-top:16px}' +
    '.sd-btns button{flex:1;padding:9px 0;border:1px solid var(--border-strong,#ddd);border-radius:6px;' +
    'background:var(--btn-bg,#fff);color:var(--btn-text,#222);cursor:pointer;font-size:14px}' +
    '.sd-btns button:hover{background:var(--hover,#f6f6f6)}' +
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
      '<button id="sd-close" title="닫기">✕</button></div>' +
      '<div id="sd-body"></div>';
    document.body.appendChild(panel);
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

  function adjRow(lid, stationId) {
    var line = lineById(lid);
    var nm = line ? (line.properties.name_ko || lid) : lid;
    var col = line ? (line.properties.color || '#888') : '#888';
    var a = adjacent(lid, stationId);
    function cell(name) {
      if (!name) return '<span class="sd-st sd-none">—</span>';
      return '<span class="sd-st" data-st="' + esc(name) + '">' + esc(name) + '</span>';
    }
    return '<div class="sd-adj"><span class="sd-dot" style="background:' + esc(col) + '"></span>' +
      '<span class="sd-lname">' + esc(nm) + '</span>' +
      cell(a.prev) + '<span class="sd-arrow">←</span>' +
      '<b>현재역</b>' + '<span class="sd-arrow">→</span>' + cell(a.next) + '</div>';
  }

  function show(feature) {
    if (!feature || !feature.properties) return;
    var p = feature.properties;
    var st = stationById(p.id) || feature;   // 원본 우선 (lines 배열 문자열화 방지)
    var sp = st.properties;
    var nameKo = sp.name_ko || p.name_ko || '';
    var nameEn = sp.name_en || p.name_en || '';
    var lineIds = parseLines(sp);
    var sid = sp.id || p.id;

    var html = '<div><b style="font-size:17px">' + esc(nameKo) + '</b>' +
      (nameEn ? '<div class="sd-en">' + esc(nameEn) + '</div>' : '') + '</div>';

    // 경유 노선
    html += '<div class="sd-sec"><h3>경유 노선 · ' + lineIds.length + '개 (환승 ' +
      lineIds.length + '개 노선 가능)</h3>';
    html += lineIds.length ? lineIds.map(lineRow).join('') : '<div class="sd-note">노선 정보 없음</div>';
    html += '</div>';

    // 인접역 (노선별)
    html += '<div class="sd-sec"><h3>인접역 (노선별)</h3>';
    html += lineIds.length ? lineIds.map(function (lid) { return adjRow(lid, sid); }).join('')
      : '<div class="sd-note">노선 정보 없음</div>';
    html += '<div class="sd-note">※ 인접역 순서는 역 좌표 간 거리로 추론한 것으로, 실제 운행 순서와 다를 수 있습니다.</div></div>';

    // 시간표
    html += '<div class="sd-sec"><h3>첫차 / 막차</h3><div class="sd-note">시간표 데이터 없음</div></div>';

    // 액션 버튼
    html += '<div class="sd-btns">' +
      '<button data-act="from">출발지</button>' +
      '<button data-act="to">도착지</button>' +
      '<button data-act="fav">⭐ 즐겨찾기</button></div>';

    var body = panel.querySelector('#sd-body');
    body.innerHTML = html;

    // 인접역 클릭 → 해당 역 상세로 이동
    body.querySelectorAll('.sd-st[data-st]').forEach(function (el) {
      el.addEventListener('click', function () {
        var target = null;
        for (var i = 0; i < STATIONS.length; i++) {
          if (STATIONS[i].properties.name_ko === el.getAttribute('data-st')) { target = STATIONS[i]; break; }
        }
        if (target) show(target);
      });
    });

    // 액션 버튼
    body.querySelectorAll('.sd-btns button').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (typeof api.onAction === 'function') {
          api.onAction(act, nameKo);
          return;
        }
        // 기본 동작: 기존 페이지 DOM 활용 (없으면 무시)
        try {
          if (act === 'fav') {
            var ev = new CustomEvent('stationdetail:fav', { detail: { name: nameKo } });
            document.dispatchEvent(ev);
          } else {
            var input = document.getElementById(act === 'from' ? 'route-from' : 'route-to');
            var rp = document.getElementById('route-panel');
            if (input) input.value = nameKo;
            if (rp) rp.hidden = false;
          }
        } catch (e) { /* 독립 모듈: 실패해도 조용히 */ }
      });
    });

    panel.classList.add('sd-open');
  }

  function hide() {
    if (panel) panel.classList.remove('sd-open');
  }

  function init(m, lines, stations) {
    map = m || null;
    LINES = lines || [];
    STATIONS = stations || [];
    orderCache = {};
    injectCSS();
    buildPanel();
  }

  var api = {
    init: init,
    show: show,
    hide: hide,
    onAction: null,   // (action, stationName) => void — 호스트가 주입 가능
    // 테스트/디버깅용
    _lineOrder: lineOrder,
    _adjacent: adjacent
  };

  global.StationDetail = api;
})(typeof window !== 'undefined' ? window : this);
