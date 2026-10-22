/* 대체 경로 3종 비교: 최단시간 / 최소환승 / 최소요금
 * - 최단시간: 기존 RouteFinder.findRoute 그대로 사용
 * - 최소환승: (역,노선) 상태 다익스트라, 비용=(환승횟수, 분) 사전식
 * - 최소요금: 거리 기준 다익스트라 (요금은 거리의 단조함수)
 * 주의: js/route.js의 상수(SPEEDS/TRANSFER_MIN/GTX_TIMES)를 복사함. route.js 변경 시 동기화 필요.
 */
'use strict';

const RouteCompare = (() => {
  // ---- route.js와 동일한 상수 (복사본) ----
  const SPEEDS = { ktx: 180, metro: 32, urban: 45, conventional: 55, etc: 40 };
  const TRANSFER_MIN = 4;
  const WALK_KMH = 4;
  // '최단시간' 경로를 고를 때만 쓰는 환승 페널티 (표시 시간에는 영향 없음)
  const TIME_TRANSFER_PENALTY = 8;

  // GTX 공식 역간 소요시간 (route.js의 GTX_TIMES와 동일 — 복사본)
  const GTX_TIMES = {
    'great-train-express-line-a': [
      ['운정중앙',4],['킨텍스',5],['대곡',4],['창릉',3],['연신내',6],
      ['서울역',6],['삼성',3],['수서',7],['성남',7],['구성',7],['동탄',null]],
    'gtx-b': [
      ['인천대입구',6],['인천시청',4],['부평',5],['부천종합운동장',5],['신도림',4],
      ['여의도',3],['용산',3],['서울역',5],['청량리',4],['상봉',5],
      ['별내',4],['왕숙',5],['평내호평',5],['마석',null]],
    'gtx-c': [
      ['덕정',9],['의정부',8],['창동',3],['광운대',4],['청량리',3],
      ['왕십리',2],['삼성',3],['양재',5],['과천청사',3],['인덕원',4],
      ['금정',6],['의왕',6],['수원',null]],
  };
  const GTX_NAME_ALIAS = { '과천청사': '정부과천청사' };

  let RF = null;                 // RouteFinder (최단시간용)
  let adj = new Map();           // stationId -> [{to, lineId, distKm, walk, officialMin}]
  let lineCat = new Map();
  let stationsById = new Map();
  let lineNameOf = new Map();

  function hav(ax, ay, bx, by) {
    const r = Math.PI / 180;
    const dLat = (by - ay) * r, dLon = (bx - ax) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  function flatCoords(geom) {
    if (geom.type === 'LineString') return geom.coordinates;
    return geom.coordinates.flat(1);
  }
  function project(p, coords) {
    let best = { alongKm: 0, distKm: Infinity };
    let acc = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const [ax, ay] = coords[i], [bx, by] = coords[i + 1];
      const segLen = hav(ax, ay, bx, by);
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = hav(p[0], p[1], ax + t * dx, ay + t * dy);
      if (d < best.distKm) best = { alongKm: acc + t * segLen, distKm: d };
      acc += segLen;
    }
    return best;
  }

  // route.js buildGraph와 동일한 그래프 구축 (단, GTX 공식 엣지의 distKm은 역 좌표로 추정)
  function buildAdj(lines, stations) {
    adj = new Map(); lineCat = new Map(); stationsById = new Map();
    const lineGeom = new Map();
    // route.js buildGraph 와 같은 기준: 미개통 노선도 포함한다.
    // (여기서만 걸러내면 '최단시간'은 GTX-B 를 쓰고 '최소환승'은 못 쓰는 모순이 생긴다)
    const activeLines = lines;
    activeLines.forEach(f => {
      lineCat.set(f.properties.id, f.properties.category || 'etc');
      lineGeom.set(f.properties.id, flatCoords(f.geometry));
    });
    stations.forEach(s => stationsById.set(s.properties.id, s));
    const nameOf = new Map();
    stations.forEach(s => nameOf.set(s.properties.id, s.properties.name_ko));
    lineNameOf = new Map();
    lines.forEach(f => lineNameOf.set(f.properties.id, f.properties.name_ko));

    const addEdge = (a, b, lineId, walk, officialMin) => {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      let distKm;
      if (officialMin != null) {
        // GTX 공식 엣지: 역 좌표 기반 거리 추정 (요금 계산용)
        const ca = stationsById.get(a).geometry.coordinates;
        const cb = stationsById.get(b).geometry.coordinates;
        distKm = hav(ca[0], ca[1], cb[0], cb[1]);
      } else {
        const ca = stationsById.get(a).geometry.coordinates;
        const cb = stationsById.get(b).geometry.coordinates;
        distKm = hav(ca[0], ca[1], cb[0], cb[1]);
      }
      adj.get(a).push({ to: b, lineId, distKm, walk: !!walk, officialMin: officialMin ?? null });
      adj.get(b).push({ to: a, lineId, distKm, walk: !!walk, officialMin: officialMin ?? null });
    };

    const perLine = new Map();
    stations.forEach(s => {
      const p = s.geometry.coordinates;
      (s.properties.lines || []).forEach(lid => {
        const coords = lineGeom.get(lid);
        if (!coords || coords.length < 2) return;
        const pr = project(p, coords);
        if (pr.distKm > 1.5) return;
        if (!perLine.has(lid)) perLine.set(lid, []);
        perLine.get(lid).push({ id: s.properties.id, along: pr.alongKm });
      });
    });
    perLine.forEach((list, lid) => {
      list.sort((a, b) => a.along - b.along);
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].id === list[i + 1].id) continue;
        addEdge(list[i].id, list[i + 1].id, lid, false, null);
      }
    });

    const byName = new Map();
    stations.forEach(s => {
      const n = s.properties.name_ko;
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push(s.properties.id);
    });
    byName.forEach(ids => {
      if (ids.length < 2) return;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          // 데이터 오류 방지: 동명이역이 2km 넘게 떨어져 있으면 도보 연결 제외
          // (예: 서울 '종합운동장' ↔ 부산 '종합운동장' 325km 오연결)
          const ca = stationsById.get(ids[i]).geometry.coordinates;
          const cb = stationsById.get(ids[j]).geometry.coordinates;
          if (hav(ca[0], ca[1], cb[0], cb[1]) > 2) continue;
          addEdge(ids[i], ids[j], null, true, null);
        }
    });

    // GTX 공식 엣지
    const nameToId = new Map();
    stationsById.forEach((s, id) => {
      const n = s.properties.name_ko;
      if (!nameToId.has(n)) nameToId.set(n, id);
    });
    const resolve = n => nameToId.get(n) || nameToId.get(GTX_NAME_ALIAS[n]);
    Object.entries(GTX_TIMES).forEach(([lid, seq]) => {
      for (let i = 0; i < seq.length - 1; i++) {
        const a = resolve(seq[i][0]), b = resolve(seq[i + 1][0]);
        const min = seq[i][1];
        if (!a || !b || min == null) continue;
        addEdge(a, b, lid, false, min);
      }
    });

    return nameOf;
  }

  let stationNameOf = new Map();
  function sname(id) {
    return stationNameOf.get(id) || id;
  }

  function edgeMinutes(e) {
    if (e.walk) return e.distKm / WALK_KMH * 60 + 2;
    if (e.officialMin != null) return e.officialMin;
    const v = SPEEDS[lineCat.get(e.lineId)] || 40;
    return e.distKm / v * 60;
  }

  // 요금 (app.js와 동일 공식: 수도권 전철, 2024년 인상 후)
  function calcFare(distKm) {
    let fare = 1400;
    if (distKm > 10) fare += Math.ceil(Math.min(distKm - 10, 40) / 5) * 100;
    if (distKm > 50) fare += Math.ceil((distKm - 50) / 8) * 100;
    return fare;
  }
  function routeDistance(path) {
    let km = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const c1 = stationsById.get(path[i])?.geometry.coordinates;
      const c2 = stationsById.get(path[i + 1])?.geometry.coordinates;
      if (!c1 || !c2) continue;
      km += hav(c1[0], c1[1], c2[0], c2[1]);
    }
    return km;
  }

  // 이진 힙 (비용 비교함수 주입)
  function makeHeap(less) {
    const a = [];
    return {
      size: () => a.length,
      push(x) {
        a.push(x);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (less(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p; }
          else break;
        }
      },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = i * 2 + 1, r = l + 1;
            let m = i;
            if (l < a.length && less(a[l], a[m])) m = l;
            if (r < a.length && less(a[r], a[m])) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]]; i = m;
          }
        }
        return top;
      }
    };
  }

  // 경로 → legs 분해 (route.js findRoute와 동일 로직)
  function buildLegs(stations, edges) {
    if (stations.length <= 1) return { legs: [], minutes: 0, transfers: 0 };
    const legs = [];
    let legStart = 0, curLine = edges[0].lineId;
    let minutes = 0;
    edges.forEach((e, i) => {
      minutes += edgeMinutes(e);
      if (e.lineId !== curLine) {
        legs.push({ lineId: curLine, from: stations[legStart], to: stations[i], walk: curLine === null });
        if (curLine !== null && e.lineId !== null) minutes += TRANSFER_MIN;
        legStart = i; curLine = e.lineId;
      }
    });
    legs.push({ lineId: curLine, from: stations[legStart], to: stations[stations.length - 1], walk: curLine === null });
    const transfers = Math.max(0, legs.filter(l => !l.walk && l.lineId !== null).length - 1);
    return { legs, minutes: Math.round(minutes), transfers };
  }

  // 최소환승: (역,노선) 상태 다익스트라, 비용=(환승,분) 사전식
  function findMinTransfer(fromId, toId) {
    if (!stationsById.has(fromId) || !stationsById.has(toId)) return null;
    if (fromId === toId) return { path: [fromId], legs: [], minutes: 0, transfers: 0 };
    const skey = (s, l) => s + '|' + (l ?? '');
    const startK = skey(fromId, null);
    const dist = new Map([[startK, [0, 0]]]);
    const prev = new Map(); // key -> {pk, edge, station}
    const heap = makeHeap((a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]));
    heap.push([0, 0, fromId, null]);
    let bestK = null;
    while (heap.size()) {
      const [t, m, u, cl] = heap.pop();
      const uk = skey(u, cl);
      const d = dist.get(uk);
      if (!d || t !== d[0] || m !== d[1]) continue;
      if (u === toId) { bestK = uk; break; }
      for (const e of (adj.get(u) || [])) {
        let nt, nl;
        if (e.walk) { nt = t + 1; nl = null; }
        else if (cl === null || cl === e.lineId) { nt = t; nl = e.lineId; }
        else { nt = t + 1; nl = e.lineId; }
        const nm = m + edgeMinutes(e);
        const vk = skey(e.to, nl);
        const vd = dist.get(vk);
        if (!vd || nt < vd[0] || (nt === vd[0] && nm < vd[1])) {
          dist.set(vk, [nt, nm]);
          prev.set(vk, { pk: uk, edge: e, station: e.to });
          heap.push([nt, nm, e.to, nl]);
        }
      }
    }
    if (!bestK) return null;
    // prev 체인을 따라가며 역 순서와 간선 순서 복원
    const chain = [];
    let ck = bestK;
    while (ck !== startK) { const p = prev.get(ck); chain.unshift(p); ck = p.pk; }
    const stations = [fromId];
    const edges = chain.map(p => p.edge);
    for (const p of chain) stations.push(p.station); // chain[i].station = i번째 간선의 도착역
    const { legs, minutes, transfers } = buildLegs(stations, edges);
    return { path: stations, legs, minutes, transfers };
  }

  // 최소요금: 거리 기준 다익스트라 (타이브레이커: 시간)
  function findMinFare(fromId, toId) {
    if (!stationsById.has(fromId) || !stationsById.has(toId)) return null;
    if (fromId === toId) return { path: [fromId], legs: [], minutes: 0, transfers: 0 };
    const dist = new Map([[fromId, [0, 0]]]); // [km, min]
    const prev = new Map(); // id -> {from, edge}
    const heap = makeHeap((a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]));
    heap.push([0, 0, fromId]);
    while (heap.size()) {
      const [km, m, u] = heap.pop();
      const d = dist.get(u);
      if (!d || km !== d[0] || m !== d[1]) continue;
      if (u === toId) break;
      for (const e of (adj.get(u) || [])) {
        const nkm = km + e.distKm;
        const nm = m + edgeMinutes(e);
        const vd = dist.get(e.to);
        if (!vd || nkm < vd[0] - 1e-9 || (Math.abs(nkm - vd[0]) < 1e-9 && nm < vd[1])) {
          dist.set(e.to, [nkm, nm]);
          prev.set(e.to, { from: u, edge: e });
          heap.push([nkm, nm, e.to]);
        }
      }
    }
    if (!prev.has(toId)) return null;
    const stations = [toId], edges = [];
    let cur = toId;
    while (cur !== fromId) {
      const p = prev.get(cur);
      edges.unshift(p.edge);
      stations.unshift(p.from);
      cur = p.from;
    }
    const { legs, minutes, transfers } = buildLegs(stations, edges);
    return { path: stations, legs, minutes, transfers };
  }

  // 최소환승·최소요금 경로는 자체 탐색을 쓰므로 leg 에 개통 상태가 없다.
  // 화면에 '미개통' 배지를 붙이려면 여기서 한 번 채워준다.
  function markUnopened(r) {
    if (!r) return r;
    const un = [];
    (r.legs || []).forEach(l => {
      if (!l.lineId) { l.unopened = false; return; }
      l.unopened = !!(RF && RF.lineIsUnopened && RF.lineIsUnopened(l.lineId));
      if (l.unopened) un.push(l.lineId);
    });
    r.unopenedLines = Array.from(new Set(un));
    return r;
  }

  function enrich(r) {
    if (!r) return null;
    const distKm = routeDistance(r.path);
    return markUnopened({ ...r, distKm, fare: calcFare(distKm) });
  }

  function findAll(fromId, toId) {
    // 최단시간 탐색에는 환승 페널티를 더 세게 준다.
    // 표시 시간은 route.js가 TRANSFER_MIN(4분) 기준으로 다시 계산하므로 그대로다.
    // (환승 3회로 2분 아끼는 경로가 '최단시간'으로 뽑히던 문제)
    const time = RF ? enrich(RF.findRoute(fromId, toId, { transferPenalty: TIME_TRANSFER_PENALTY })) : null;
    const transfer = enrich(findMinTransfer(fromId, toId));
    const fare = enrich(findMinFare(fromId, toId));
    return { time, transfer, fare };
  }

  // ---------- UI ----------
  function ensureStyle() {
    if (document.getElementById('rc-style')) return;
    const st = document.createElement('style');
    st.id = 'rc-style';
    st.textContent = `
      .rc-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
      .rc-tab { flex: 1; padding: 8px 4px; border: 1px solid var(--border, #ddd); background: var(--panel-bg, #fff);
        color: var(--text, #222); border-radius: 8px; cursor: pointer; font-size: 13px; }
      .rc-tab.active { background: var(--accent, #3388ff); color: #fff; border-color: var(--accent, #3388ff); font-weight: bold; }
      .rc-badge { display: inline-block; font-size: 11px; background: var(--accent, #3388ff); color: #fff;
        border-radius: 4px; padding: 1px 6px; margin-right: 6px; }
      .rc-insight { font-size: 12px; color: var(--muted, #666); margin: 8px 0; line-height: 1.6; }
    `;
    document.head.appendChild(st);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function variantHtml(r, tabId, badge) {
    let html = `<div class="total">${badge ? `<span class="rc-badge">${badge}</span>` : ''}총 약 ${r.minutes}분 · 환승 ${r.transfers}회 · 예상 요금 ${r.fare.toLocaleString()}원 · ${r.distKm.toFixed(1)}km</div>`;
    // 미개통 노선을 지나는 경로는 명시한다.
    // 이 지도는 착공·계획 노선까지 그리므로 '지금 갈 수 있는 길'로 오해하면 안 된다.
    if (r.unopenedLines && r.unopenedLines.length) {
      const names = r.unopenedLines.map(id => lineNameOf.get(id) || id).join(', ');
      html += `<div class="unopened-notice">⚠ 미개통 구간 포함 — ${escapeHtml(names)}` +
        `<span class="unopened-sub">개통 전이므로 실제로는 이용할 수 없습니다.</span></div>`;
    }
    r.legs.forEach(leg => {
      const a = escapeHtml(sname(leg.from)), b = escapeHtml(sname(leg.to));
      const i1 = r.path.indexOf(leg.from), i2 = r.path.indexOf(leg.to);
      const n = Math.abs(i2 - i1);
      if (leg.walk || !leg.lineId) {
        html += a === b
          ? `<div class="leg">🚶 ${a}역 내 환승 (도보 이동)</div>`
          : `<div class="leg">🚶 ${a} → ${b} (도보 이동)</div>`;
      } else {
        const ln = escapeHtml(lineNameOf.get(leg.lineId) || leg.lineId);
        const segStations = [];
        const step = i2 > i1 ? 1 : -1;
        for (let i = i1; i !== i2; i += step) segStations.push(escapeHtml(sname(r.path[i])));
        segStations.push(escapeHtml(sname(r.path[i2])));
        const viaId = `rc-via-${tabId}-${leg.from}-${leg.to}`;
        const un = leg.unopened ? ` <span class="badge-unopened">미개통</span>` : '';
        html += `<div class="leg${leg.unopened ? ' leg-unopened' : ''}">${a} → <b>${ln}</b>${un} <button class="via-toggle" data-target="${viaId}">${n}개역</button> → ${b}\n` +
          `<div class="via-list" id="${viaId}" hidden>${segStations.join(' → ')}</div></div>`;
      }
    });
    return html;
  }

  function show(fromId, toId) {
    ensureStyle();
    const box = document.getElementById('route-result');
    if (!box) return;
    const all = findAll(fromId, toId);
    if (!all.time && !all.transfer && !all.fare) {
      box.innerHTML = '경로를 찾을 수 없습니다.';
      return;
    }
    const tabs = [
      { id: 'time', label: '⚡ 최단시간', r: all.time },
      { id: 'transfer', label: '🔄 최소환승', r: all.transfer },
      { id: 'fare', label: '💰 최소요금', r: all.fare },
    ].filter(t => t.r);

    // 인사이트: 각 기준의 장점 요약
    let insight = '';
    if (all.time && all.transfer && all.transfer.transfers < all.time.transfers) {
      const dm = all.transfer.minutes - all.time.minutes;
      insight += `🔄 최소환승은 ${dm > 0 ? dm + '분 더 걸리지만' : '시간도 비슷하고'} 환승 ${all.time.transfers - all.transfer.transfers}회 절약<br>`;
    }
    if (all.time && all.fare && all.fare.fare < all.time.fare) {
      const dm = all.fare.minutes - all.time.minutes;
      insight += `💰 최소요금은 ${(all.time.fare - all.fare.fare).toLocaleString()}원 절약${dm > 0 ? ` (${dm}분 더 소요)` : ''}`;
    }

    let html = `<div class="rc-tabs">` + tabs.map((t, i) =>
      `<button class="rc-tab${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('') + `</div>`;
    if (insight) html += `<div class="rc-insight">${insight}</div>`;
    html += tabs.map((t, i) => {
      const isBest =
        (t.id === 'time' && all.time && (!all.transfer || all.time.minutes <= all.transfer.minutes) && (!all.fare || all.time.minutes <= all.fare.minutes)) ? '가장 빠름' :
        (t.id === 'transfer' && all.transfer && (!all.time || all.transfer.transfers < all.time.transfers)) ? '환승 최소' :
        (t.id === 'fare' && all.fare && all.time && all.fare.fare < all.time.fare) ? '요금 최소' : '';
      return `<div class="rc-panel" id="rc-panel-${t.id}"${i === 0 ? '' : ' hidden'}>${variantHtml(t.r, t.id, isBest)}</div>`;
    }).join('');
    box.innerHTML = html;

    box.querySelectorAll('.rc-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        box.querySelectorAll('.rc-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        box.querySelectorAll('.rc-panel').forEach(p => p.hidden = true);
        document.getElementById('rc-panel-' + btn.dataset.tab).hidden = false;
        // 탭별 경로 하이라이트
        const tab = tabs.find(t => t.id === btn.dataset.tab);
        if (tab && tab.r && typeof highlightRoute === 'function') highlightRoute(tab.r.path, tab.r.legs);
      });
    });
    // 첫 번째 탭 경로 하이라이트
    if (tabs[0] && tabs[0].r && typeof highlightRoute === 'function') {
      highlightRoute(tabs[0].r.path, tabs[0].r.legs);
    }
    box.querySelectorAll('.via-toggle').forEach(btn => {
      const orig = btn.textContent;
      btn.addEventListener('click', () => {
        const t = document.getElementById(btn.dataset.target);
        if (!t) return;
        t.hidden = !t.hidden;
        btn.textContent = t.hidden ? orig : '접기';
      });
    });
  }

  function hide() {
    const box = document.getElementById('route-result');
    if (box) box.innerHTML = '';
  }

  function init(routeFinder, stations, lines) {
    RF = routeFinder;
    stationNameOf = buildAdj(lines, stations);
  }

  return { init, findAll, show, hide };
})();
