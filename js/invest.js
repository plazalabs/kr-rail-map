/* 역세권 투자 분석기 — 지도 임의 지점의 역 접근성·GTX 수혜 분석 (추론 모델) */
(function () {
  'use strict';

  let map = null, ST = [], LN = [];
  let panel = null, marker = null, circleSrc = null;
  let clickMode = false;

  const GTX_RE = /gtx|great-train-express/i;
  const R_KM = 6371;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function hav(lng1, lat1, lng2, lat2) {
    const r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lng2 - lng1) * r;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return R_KM * 2 * Math.asin(Math.sqrt(h));
  }

  // 직선거리 → 실제 보행거리 보정. 도심 격자형 가로망에서 우회율은 대략 1.2~1.4다.
  // 1.25는 보수적인 중간값이다. 이걸 안 곱하면 '도보 4분'이 실제 5~6분이 된다.
  const DETOUR = 1.25;
  const WALK_KMH = 4;

  function fmtDist(km) {
    const m = km * 1000;
    return m < 1000 ? Math.round(m) + 'm' : (km).toFixed(2) + 'km';
  }
  function walkMin(km) { return Math.round(km / WALK_KMH * 60); } // km 는 보행거리
  function fmtWalk(km) {
    const m = walkMin(km);
    return m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : m + '분';
  }

  // 한 역까지의 보행거리. 출구 좌표가 있으면 '가장 가까운 출구'까지 잰다.
  // 역 중심점으로 재면 강남역처럼 긴 역에서 300m 넘게 틀린다.
  //   { km(보행), straightKm(직선), exitNo, kind: 'exit' | 'center' }
  function accessOf(feature, lng, lat) {
    let km = null, exitNo = '', kind = 'center';
    if (typeof StationExits !== 'undefined' && StationExits.isReady()) {
      const d = StationExits.distanceTo(feature, lng, lat);
      if (d) { km = d.km; exitNo = d.exitNo; kind = d.kind; }
    }
    if (km == null) {
      const c = feature.geometry.coordinates;
      km = hav(lng, lat, c[0], c[1]);
    }
    return { km: km * DETOUR, straightKm: km, exitNo: exitNo, kind: kind };
  }

  function isGtxLine(lid) { return GTX_RE.test(lid); }

  // 가장 가까운 역의 도심 접근성. 모듈이 없거나 그 역이 계산 대상이 아니면 null.
  // 0분을 '아주 좋음'으로 읽지 않도록, 값이 없으면 점수를 주지 않는다.
  // 이름 주의: 이 파일에는 이미 accessOf(역, lng, lat) = '역까지 보행거리' 가 있다.
  // 같은 이름을 쓰면 그쪽이 덮여서 최근접역 계산이 통째로 깨진다 (실제로 깨졌다).
  function stationAccess(top) {
    if (!top || typeof StationAccess === 'undefined' || !StationAccess.isReady()) return null;
    const a = StationAccess.of(top.feature.properties.id);
    return (a && a.score && a.score.after != null) ? a : null;
  }

  function lineStatus(lid) {
    const f = LN.find(l => l.properties.id === lid);
    return f ? (f.properties.status || 'open') : 'open';
  }
  function statusLabel(st) {
    return st === 'open' ? '운행중' : st === 'construction' ? '공사중'
      : st === 'planned' ? '계획중' : '구상중';
  }
  function lineName(lid) {
    const f = LN.find(l => l.properties.id === lid);
    return f ? (f.properties.name_ko || lid) : lid;
  }
  function lineColor(lid) {
    const f = LN.find(l => l.properties.id === lid);
    return f ? (f.properties.color || '#888') : '#888';
  }

  // 역명 기준 중복 제거 후 거리순 정렬
  function nearestStations(lng, lat, n) {
    const seen = new Map(); // name -> {feature, dist, exitNo, kind}
    for (const s of ST) {
      const p = s.properties;
      const nm = p.name_ko;
      if (!nm) continue;
      const a = accessOf(s, lng, lat);
      if (!seen.has(nm) || a.km < seen.get(nm).dist) {
        seen.set(nm, { feature: s, dist: a.km, straight: a.straightKm, exitNo: a.exitNo, kind: a.kind });
      }
    }
    return [...seen.values()].sort((a, b) => a.dist - b.dist).slice(0, n);
  }

  function nearestGtx(lng, lat) {
    const seen = new Map();
    for (const s of ST) {
      const lines = s.properties.lines || [];
      if (!lines.some(isGtxLine)) continue;
      const nm = s.properties.name_ko;
      const a = accessOf(s, lng, lat);
      if (!seen.has(nm) || a.km < seen.get(nm).dist) {
        seen.set(nm, { feature: s, dist: a.km, straight: a.straightKm, exitNo: a.exitNo, kind: a.kind });
      }
    }
    const arr = [...seen.values()].sort((a, b) => a.dist - b.dist);
    return arr.length ? arr[0] : null;
  }

  function stationsWithin(lng, lat, radiusKm) {
    const seen = new Map();
    for (const s of ST) {
      const nm = s.properties.name_ko;
      if (!nm || seen.has(nm)) continue;
      if (accessOf(s, lng, lat).km <= radiusKm) seen.set(nm, s);
    }
    return [...seen.values()];
  }

  // 교통 점수 (추론 모델) — 근거와 함께 반환
  function calcScore(lng, lat) {
    const parts = [];
    let score = 0;

    const top = nearestStations(lng, lat, 1)[0];
    if (top) {
      const wm = walkMin(top.dist);
      let p = 0;
      if (wm <= 5) p = 30; else if (wm <= 10) p = 20; else if (wm <= 15) p = 10;
      score += p;
      parts.push(`가장 가까운 역(${top.feature.properties.name_ko}` +
        (top.kind === 'exit' ? ` ${top.exitNo}번 출구` : '') + `) 도보 ${wm}분 (+${p})`);
    }

    const near = stationsWithin(lng, lat, 0.5);
    const sp = Math.min(near.length * 5, 15);
    score += sp;
    parts.push(`도보 500m 내 역 ${near.length}개 (+${sp})`);

    const lineSet = new Set();
    near.forEach(s => (s.properties.lines || []).forEach(l => lineSet.add(l)));
    const lp = Math.min(lineSet.size * 3, 9);
    score += lp;
    parts.push(`도보 500m 내 노선 ${lineSet.size}개 (+${lp})`);

    const g = nearestGtx(lng, lat);
    if (g) {
      const wm = walkMin(g.dist);
      let p = 0;
      if (wm <= 10) p = 25; else if (wm <= 15) p = 18; else if (wm <= 20) p = 12; else if (wm <= 30) p = 6;
      score += p;
      parts.push(`GTX역(${g.feature.properties.name_ko}) 도보 ${wm}분 (+${p})`);
      const gLines = (g.feature.properties.lines || []).filter(isGtxLine);
      const sts = gLines.map(lineStatus);
      const bonus = sts.some(s => s === 'open' || s === 'construction') ? 6 : 3;
      score += bonus;
      parts.push(`GTX 상태(${sts.map(statusLabel).join('/')}) (+${bonus})`);
    } else {
      parts.push('주변 GTX역 없음 (+0)');
    }

    // 도심 접근성 — 가장 가까운 역에서 3대 업무지구(도심·여의도·강남)까지
    // 평균 시간. 지금까지 이 점수는 '역이 몇 개 있나'만 봤는데, 부동산에서
    // 값을 만드는 것은 역의 개수가 아니라 '강남까지 몇 분'이다.
    const acc = stationAccess(top);
    if (acc) {
      const m = Math.round(acc.score.after);
      const p = m <= 20 ? 15 : m <= 30 ? 12 : m <= 40 ? 8 : m <= 50 ? 5 : m <= 70 ? 2 : 0;
      score += p;
      parts.push(`도심 3대 업무지구 평균 ${m}분 (+${p})`);
    }

    score = Math.min(100, Math.max(0, Math.round(score)));
    const grade = score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';
    return { score, grade, parts };
  }

  function injectCss() {
    if (document.getElementById('iv-style')) return;
    const st = document.createElement('style');
    st.id = 'iv-style';
    st.textContent = `
#iv-panel{position:absolute;top:70px;right:12px;width:320px;max-height:calc(100% - 140px);overflow-y:auto;
background:var(--panel-bg,#fff);color:var(--text,#222);border:1px solid var(--border,#ddd);border-radius:10px;
box-shadow:0 4px 18px rgba(0,0,0,.25);z-index:40;font-size:13px}
#iv-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;font-weight:700;
border-bottom:1px solid var(--border,#ddd)}
#iv-close{background:none;border:none;font-size:16px;cursor:pointer;color:var(--muted,#888)}
#iv-body{padding:10px 12px}
.iv-card{background:var(--bg,#f5f5f5);border-radius:8px;padding:8px 10px;margin-bottom:8px}
.iv-card h4{margin:0 0 6px;font-size:12px;color:var(--muted,#888)}
.iv-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0}
.iv-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:middle}
.iv-gtx{border:2px solid #c026d3}
.iv-score{font-size:34px;font-weight:800}
.iv-grade{display:inline-block;background:var(--accent,#3388ff);color:#fff;border-radius:6px;
padding:2px 10px;font-weight:700;margin-left:8px}
.iv-note{font-size:11px;color:var(--muted,#888);margin-top:6px;line-height:1.5}
.iv-reason{font-size:11px;color:var(--muted,#888);margin:2px 0}
@media(max-width:768px){#iv-panel{top:auto;bottom:12px;right:12px;left:12px;width:auto;max-height:55%}}
`;
    document.head.appendChild(st);
  }

  function ensurePanel() {
    injectCss();
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'iv-panel';
    panel.innerHTML = `
      <div id="iv-head">📊 역세권 투자 분석 <button id="iv-close" title="닫기">✕</button></div>
      <div id="iv-body"></div>`;
    document.getElementById('map').appendChild(panel);
    panel.querySelector('#iv-close').addEventListener('click', hide);
    return panel;
  }

  function ensureMarkerLayer() {
    if (!map.getSource('iv-point')) {
      map.addSource('iv-point', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'iv-point', type: 'circle', source: 'iv-point',
        paint: { 'circle-radius': 8, 'circle-color': '#c026d3', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 }
      });
      map.addSource('iv-circle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'iv-circle', type: 'line', source: 'iv-circle',
        paint: { 'line-color': '#c026d3', 'line-width': 2, 'line-dasharray': [4, 4] }
      });
    }
    // 가장 가까운 출구 — 이 지점에서 실제로 걸어갈 문이 어디인지 보여준다.
    if (!map.getSource('iv-exit')) {
      map.addSource('iv-exit', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'iv-exit-halo', type: 'circle', source: 'iv-exit',
        paint: { 'circle-radius': 18, 'circle-color': '#1a73e8', 'circle-opacity': 0.16 }
      });
      map.addLayer({
        id: 'iv-exit', type: 'circle', source: 'iv-exit',
        paint: {
          'circle-radius': 6, 'circle-color': '#1a73e8',
          'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5
        }
      });
    }
  }

  function circlePoly(lng, lat, radiusKm, steps) {
    steps = steps || 64;
    const coords = [], r = Math.PI / 180;
    for (let i = 0; i <= steps; i++) {
      const brng = (i / steps) * 2 * Math.PI;
      const la2 = Math.asin(Math.sin(lat * r) * Math.cos(radiusKm / R_KM) +
        Math.cos(lat * r) * Math.sin(radiusKm / R_KM) * Math.cos(brng));
      const lo2 = lng * r + Math.atan2(Math.sin(brng) * Math.sin(radiusKm / R_KM) * Math.cos(lat * r),
        Math.cos(radiusKm / R_KM) - Math.sin(lat * r) * Math.sin(la2));
      coords.push([lo2 / r, la2 / r]);
    }
    return coords;
  }

  function render(lng, lat) {
    const p = ensurePanel();
    const body = p.querySelector('#iv-body');

    const top3 = nearestStations(lng, lat, 3);
    const g = nearestGtx(lng, lat);
    const near = stationsWithin(lng, lat, 0.5);
    const lineSet = new Set();
    near.forEach(s => (s.properties.lines || []).forEach(l => lineSet.add(l)));
    const sc = calcScore(lng, lat);

    let h = '';

    // 교통 점수
    h += `<div class="iv-card"><h4>교통 점수 (추론)</h4>
      <div><span class="iv-score">${sc.score}</span><span class="iv-grade">${sc.grade}</span></div>
      ${sc.parts.map(x => `<div class="iv-reason">· ${esc(x)}</div>`).join('')}
    </div>`;

    // 도심 접근성 — 이 지점에서 걸어갈 수 있는 역 기준. 지도에서 아무 곳이나
    // 찍었을 때 '강남까지 몇 분'이 바로 나오는 것이 이 카드의 목적이다.
    const accTop = stationAccess(top3[0]);
    if (accTop) {
      h += `<div class="iv-card"><h4>🚇 도심까지 (${esc(top3[0].feature.properties.name_ko)}역 기준)</h4>` +
        StationAccess.sectionHtml(top3[0].feature.properties.id) + '</div>';
    }

    // GTX 강조
    if (g) {
      const nm = g.feature.properties.name_ko;
      const gLines = (g.feature.properties.lines || []).filter(isGtxLine);
      h += `<div class="iv-card iv-gtx"><h4>🚄 가장 가까운 GTX역</h4>
        <div class="iv-row"><b>${esc(nm)}</b><span>도보 ${fmtWalk(g.dist)}</span></div>
        <div class="iv-reason">${g.kind === 'exit'
          ? `${esc(g.exitNo)}번 출구까지 ${fmtDist(g.dist)}`
          : `역 중심점까지 ${fmtDist(g.dist)} (출구 좌표 없음)`}</div>
        <div class="iv-row"><span>${gLines.map(l =>
          `<span class="iv-dot" style="background:${esc(lineColor(l))}"></span>${esc(lineName(l))}(${statusLabel(lineStatus(l))})`
        ).join(' ')}</span></div>
      </div>`;
    } else {
      h += `<div class="iv-card"><h4>🚄 가장 가까운 GTX역</h4><div>주변에 GTX역이 없습니다</div></div>`;
    }

    // TOP3
    h += `<div class="iv-card"><h4>🚉 가장 가까운 역 TOP 3</h4>`;
    top3.forEach((t, i) => {
      const nm = t.feature.properties.name_ko;
      const lines = (t.feature.properties.lines || []);
      h += `<div class="iv-row"><span><b>${i + 1}. ${esc(nm)}</b><br>
        <span style="font-size:11px">${lines.map(l =>
          `<span class="iv-dot" style="background:${esc(lineColor(l))}"></span>${esc(lineName(l))}`
        ).join(' ')}</span></span>
        <span style="white-space:nowrap">도보 ${fmtWalk(t.dist)}<br>
        <span style="font-size:11px">${t.kind === 'exit'
          ? esc(t.exitNo) + '번 출구 ' + fmtDist(t.dist)
          : fmtDist(t.dist) + ' (중심점)'}</span></span></div>`;
    });
    h += `</div>`;

    // 반경 500m
    h += `<div class="iv-card"><h4>📍 도보 500m 내</h4>
      <div class="iv-row"><span>역 개수</span><b>${near.length}개</b></div>
      <div class="iv-row"><span>노선 수</span><b>${lineSet.size}개</b></div>
    </div>`;

    h += `<div class="iv-note">⚠️ 추론 기반 분석입니다. 거리는 가장 가까운 <b>출구</b>까지의 직선거리에
      우회계수 ${DETOUR}를 곱한 보행거리 추정치입니다. 실제 도보 경로·경사·신호 대기와 다를 수 있습니다.
      점수는 자체 가중치 모델로 산출한 참고용 수치입니다.</div>`;

    body.innerHTML = h;
    p.style.display = 'block';

    // 마커 + 500m 원 표시
    ensureMarkerLayer();
    map.getSource('iv-point').setData({
      type: 'FeatureCollection', features: [{
        type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] }
      }]
    });
    map.getSource('iv-circle').setData({
      type: 'FeatureCollection', features: [{
        type: 'Feature', properties: {},
        geometry: { type: 'Polygon', coordinates: [circlePoly(lng, lat, 0.5)] }
      }]
    });

    // 가장 가까운 출구에 표시 — '어느 문으로 나가야 가까운지' 를 지도에서 바로 본다
    let nearest = null;
    if (top3.length && typeof StationExits !== 'undefined' && StationExits.isReady()) {
      nearest = StationExits.nearestExit(top3[0].feature.properties.id, lng, lat);
    }
    map.getSource('iv-exit').setData({
      type: 'FeatureCollection',
      features: nearest ? [{
        type: 'Feature', properties: {},
        geometry: { type: 'Point', coordinates: nearest.exit.c }
      }] : []
    });
  }

  function onMapClick(e) {
    if (!clickMode) return;
    InvestAnalyzer.analyze(e.lngLat.lng, e.lngLat.lat);
  }

  const InvestAnalyzer = {
    init(m, stations, lines) {
      map = m; ST = stations || []; LN = lines || [];
      injectCss();
      map.on('click', onMapClick);
    },
    analyze(lng, lat) {
      if (!map) return;
      render(lng, lat);
    },
    hide() {
      if (panel) panel.style.display = 'none';
      if (map && map.getSource('iv-point')) {
        map.getSource('iv-point').setData({ type: 'FeatureCollection', features: [] });
        map.getSource('iv-circle').setData({ type: 'FeatureCollection', features: [] });
      }
      if (map && map.getSource('iv-exit')) {
        map.getSource('iv-exit').setData({ type: 'FeatureCollection', features: [] });
      }
      InvestAnalyzer.setMode(false);
    },
    setMode(on) {
      clickMode = !!on;
      if (map) map.getCanvas().style.cursor = clickMode ? 'crosshair' : '';
      const btn = document.getElementById('invest-btn');
      if (btn) btn.classList.toggle('active', clickMode);
    },
    isActive() { return clickMode; }
  };

  // 전역 노출
  window.InvestAnalyzer = InvestAnalyzer;

  function hide() { InvestAnalyzer.hide(); }
})();
