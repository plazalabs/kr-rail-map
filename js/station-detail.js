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
    '.sd-badge.planned{background:#f3e8fd;color:#6b21a8}' +
    '.sd-badge.proposed{background:#f1f3f4;color:#5f6368}' +
    '.sd-adj{display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--border,#f4f4f4);font-size:13px}' +
    '.sd-adj .sd-lname{font-weight:600;white-space:nowrap}' +
    '.sd-st{cursor:pointer;color:var(--accent,#1a73e8);text-decoration:underline;text-underline-offset:2px}' +
    '.sd-st.sd-none{color:var(--muted,#6b7280);text-decoration:none;cursor:default}' +
    '.sd-arrow{color:var(--muted,#6b7280)}' +
    '.sd-note{font-size:12px;color:var(--muted,#6b7280);margin-top:4px}' +
    // 시세는 이 패널에서 유일하게 '돈'을 말하는 숫자라 크게 보여준다.
    '.sd-price{display:flex;align-items:baseline;gap:3px;margin-top:2px}' +
    '.sd-price b{font-size:24px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}' +
    '.sd-price span{font-size:12px;color:var(--muted,#6b7280)}' +
    '.sd-price-sub{font-weight:400;font-size:11px;color:var(--muted,#6b7280)}' +
    // 시세는 패널 맨 위에 온다. 배경색 대신 테두리로 구분해 테마 7종에서
    // 색이 깨지지 않게 한다 (다크 테마에서 흰 카드가 뜨는 사고를 피한다).
    '.sd-price-sec{margin-top:12px;padding:10px 0 12px;' +
    'border-top:1px solid var(--border,#eee);border-bottom:1px solid var(--border,#eee)}' +
    '.sd-price-sec h3{margin-bottom:2px}' +
    // 단지 목록 — 법정동 중위값 아래에 붙는다. 표(table) 대신 목록을 쓰는 건
    // 좁은 패널에서 열이 뭉개지지 않게 하기 위해서다.
    '.sd-cx-wrap{margin-top:10px;padding-top:8px;border-top:1px dashed var(--border,#eee)}' +
    '.sd-cx-wrap h4{font-size:12px;font-weight:600;margin-bottom:4px}' +
    '.sd-cx-list{list-style:none;margin:0;padding:0}' +
    '.sd-cx{display:grid;grid-template-columns:1fr auto;gap:0 8px;padding:5px 0;' +
    'border-bottom:1px solid var(--border,#eee)}' +
    '.sd-cx:last-child{border-bottom:0}' +
    '.sd-cx-n{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.sd-cx-p{font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.sd-cx-m{grid-column:1/-1;font-size:11px;color:var(--muted,#6b7280);' +
    'font-variant-numeric:tabular-nums}' +
    // 세대수·공급면적은 K-apt 에서 온 값이라 실거래가 줄과 구분해 둔다.
    // 색을 살짝 다르게 해서 '이건 다른 자료에서 왔다'가 눈에 보이게 한다.
    '.sd-cx-u{grid-column:1/-1;font-size:11px;color:var(--fg-2,#374151);' +
    'font-variant-numeric:tabular-nums;margin-top:1px}' +
    // 평형 구성은 한 단계 더 흐리게. 읽고 싶은 사람만 읽는 줄이다.
    '.sd-cx-b{grid-column:1/-1;font-size:10px;color:var(--muted,#6b7280);' +
    'font-variant-numeric:tabular-nums;margin-top:1px;letter-spacing:-.1px}' +
    '.sd-cx-more{margin-top:6px;width:100%;padding:6px 0;border:1px solid var(--border-strong,#ddd);' +
    'border-radius:6px;background:var(--btn-bg,#fff);color:var(--btn-text,#222);' +
    'cursor:pointer;font-size:12px}' +
    '.sd-cx-more:hover{background:var(--hover,#f6f6f6)}' +
    '.sd-exits{display:flex;flex-wrap:wrap;gap:6px}' +
    '.sd-exit{min-width:38px;padding:6px 8px;border:1px solid var(--border-strong,#ddd);border-radius:6px;' +
    'background:var(--btn-bg,#fff);color:var(--btn-text,#222);cursor:pointer;font-size:12px;font-weight:600}' +
    '.sd-exit:hover{background:var(--hover,#f6f6f6);border-color:var(--accent,#1a73e8)}' +
    '.sd-exit.sd-exit-center{border-style:dashed;font-weight:400;color:var(--muted,#6b7280)}' +
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
  function priceSection(nameKo) {
    var price = (typeof StationPrice !== 'undefined' && StationPrice.isReady())
      ? StationPrice.of(nameKo) : null;
    if (!price || !price.medianPerPyeong) return '';

    var pm = StationPrice.meta() || {};
    // '강남구 역삼동' 처럼 시군구를 같이 적는다. 동 이름만으로는 '중구'
    // 처럼 여러 시도에 있는 곳을 구분할 수 없다.
    var where = [price.sido, price.sgg].filter(Boolean).join(' ');
    var h = '<div class="sd-sec sd-price-sec"><h3>주변 시세 · ' + esc(price.dong) +
      ' <span class="sd-price-sub">' + (where ? '· ' + esc(where) + ' · ' : '') +
      '최근 6개월 ' + price.deals + '건</span></h3>';
    h += '<div class="sd-price"><b>' + StationPrice.pp(price.medianPerPyeong) +
      '</b><span>/평</span></div>';
    if (price.medianPrice) {
      h += '<div class="sd-note">중위 거래금액 ' + StationPrice.won(price.medianPrice) + '</div>';
    }
    h += '<div class="sd-note">※ 아파트 매매 실거래 중위값입니다. ' +
      '실거래가는 좌표를 주지 않아 <b>법정동 단위</b>로 묶었습니다 — ' +
      '같은 법정동이라도 단지·층·연식에 따라 차이가 큽니다.' +
      (pm.updated ? ' (기준 ' + esc(pm.updated) + ')' : '') + '</div>';
    h += complexBlock(nameKo);
    return h + '</div>';
  }

  /* 단지 목록 — 법정동 하나에 평당가 하나로는 판단이 안 된다.
   *
   * 같은 잠실동에서도 1979년 5층과 2008년 33층이 같은 값을 받지 않는다.
   * 실거래가 응답에 단지명·지번·건축년도·전용면적이 다 들어 있으므로,
   * 좌표 없이도 단지 단위까지는 갈 수 있다. 기본 3곳만 보이고 나머지는
   * 펼친다 — 패널 첫 화면을 목록으로 채우면 시세가 안 보인다.
   */
  function complexBlock(nameKo) {
    if (typeof StationPrice === 'undefined' || !StationPrice.isComplexReady) return '';
    var c = StationPrice.complexes(nameKo, 3);
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
      meta.push(x.n_deals + '건');

      // 전용·공급 두 면적을 같이 보여줘야 대화가 된다. 사람들이 보는 시세표는
      // 대개 공급면적 기준인데 실거래가는 전용면적만 준다. 전용률은 두 값을
      // 나누면 나오므로 따로 적지 않는다.
      var extra = [];
      if (x.ea) extra.push('전용 ' + Math.round(x.ea) + '㎡');
      if (x.ba) extra.push('공급* ' + Math.round(x.ba) + '㎡');
      if (x.d) extra.push(x.d + '개동');
      var bands = bandText(x.bd);

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

    var html = '<div><b style="font-size:17px">' + esc(nameKo) + '</b>' +
      (nameEn ? '<div class="sd-en">' + esc(nameEn) + '</div>' : '') + '</div>';

    // 시세를 먼저. 없으면 빈 문자열이라 자연스럽게 노선부터 시작한다.
    html += priceSection(nameKo);

    // 도심 접근성 — 시세 다음으로 중요한 값. '이 집에서 강남까지 몇 분'은
    // 부동산에서 실제로 비교하는 축이고, 개통으로 얼마나 줄어드는지까지 보여준다.
    // 자료(access.json)가 아직 없으면 이 절을 통째로 건너뛴다.
    if (typeof StationAccess !== 'undefined' && StationAccess.isReady()) {
      html += '<div class="sd-sec"><h3>도심 접근성</h3>' +
        StationAccess.sectionHtml(sid) + '</div>';
    }

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

    // 출구 — 부동산에서 '역까지 몇 분'은 중심점이 아니라 출구까지의 거리다.
    // 출구 좌표가 없는 역(주로 KTX·일반철도)은 없다고 밝히고 중심점으로 물러난다.
    var exits = (typeof StationExits !== 'undefined' && StationExits.isReady())
      ? StationExits.exitsOf(sid) : [];
    html += '<div class="sd-sec"><h3>';
    if (exits.length) {
      var sm = StationExits.summary(sid);
      var nums = exits.map(function (e) { return parseInt(e.no, 10) || 0; })
        .filter(function (n) { return n > 0; });
      var maxNo = nums.length ? Math.max.apply(null, nums) : 0;
      html += '출구 · ' + exits.length + '개';
      if (sm.spreadKm > 0.05) html += ' (최대 ' + Math.round(sm.spreadKm * 1000) + 'm 떨어짐)';
      html += '</h3><div class="sd-exits">';
      html += exits.slice().sort(function (a, b) {
        return (parseInt(a.no, 10) || 999) - (parseInt(b.no, 10) || 999);
      }).map(function (e) {
        return '<button class="sd-exit" data-lng="' + e.c[0] + '" data-lat="' + e.c[1] +
          '" title="' + esc(nameKo) + ' ' + esc(e.no || '') + '번 출구로 이동">' +
          esc(e.no || '·') + '</button>';
      }).join('');
      html += '</div>';
      // 번호가 중간에 비면(공사·폐쇄) 그 사실을 적어 둔다. 조용히 넘기면
      // '출구가 12개인데 왜 8번이 없지' 로 오해받는다.
      if (maxNo && exits.length < maxNo) {
        html += '<div class="sd-note">1~' + maxNo + '번 중 ' + exits.length +
          '개만 확인됨 (나머지는 미개설·미등록)</div>';
      }
      html += '<div class="sd-note">출구를 누르면 지도가 그 출구로 이동합니다. ' +
        '출구 좌표 © OpenStreetMap (ODbL)</div>';
    } else {
      html += '출구</h3><div class="sd-note">이 역은 출구 좌표가 없어 역 중심점으로 거리를 잽니다.</div>';
    }
    html += '</div>';

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
        var full = StationPrice.complexes(nameKo);
        if (!full) return;
        var ul = btn.parentNode.querySelector('.sd-cx-list');
        ul.innerHTML = full.items.map(function (x) {
          var m = [];
          if (x.y) m.push(x.y + '년');
          if (x.a) m.push(Math.round(x.a) + '㎡');
          m.push(x.n_deals + '건');
          return '<li class="sd-cx"><span class="sd-cx-n">' + esc(x.n) + '</span>' +
            '<span class="sd-cx-p">' + StationPrice.pp(x.pp) + '/평</span>' +
            '<span class="sd-cx-m">' + esc(m.join(' · ')) + '</span></li>';
        }).join('');
        btn.remove();
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
    hide: hide,
    refresh: refresh,
    onAction: null,   // (action, stationName) => void — 호스트가 주입 가능
    // 테스트/디버깅용
    _lineOrder: lineOrder,
    _adjacent: adjacent
  };

  global.StationDetail = api;
})(typeof window !== 'undefined' ? window : this);
