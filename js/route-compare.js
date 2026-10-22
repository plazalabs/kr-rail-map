/* 대체 경로 3종 비교: 최단시간 / 최소환승 / 최소요금
 * - 최단시간: RouteFinder.findRoute (환승 페널티 8분)
 * - 최소환승: (역,노선) 상태 다익스트라, 비용=(환승횟수, 분) 사전식
 * - 최소요금: 거리 기준 다익스트라 (요금은 거리의 단조함수)
 *
 * 중요: 그래프는 RouteFinder가 만든 것을 그대로 쓴다.
 * 예전에는 여기서 그래프를 따로 만들었는데(상수까지 복사), 그 사본은
 *  (1) MultiLineString 조각을 이어붙여 평탄화 → GTX-D 분기(팔당↔삼성)에 없는 엣지 생성
 *  (2) GTX 속도 보정(110km/h) 누락 → 같은 구간인데 탭마다 소요시간이 다름
 *  (3) 순환선 폐합 누락 → 2호선이 한 곳에서 끊김
 * 같은 실수를 반복하지 않도록 '한 개의 그래프'만 존재하게 만든다.
 */
'use strict';

const RouteCompare = (() => {
  // '최단시간' 경로를 고를 때만 쓰는 환승 페널티 (표시 시간에는 영향 없음)
  const TIME_TRANSFER_PENALTY = 8;

  let RF = null;                 // RouteFinder — 그래프·시간모델의 유일한 출처
  let lineNameOf = new Map();

  function hav(ax, ay, bx, by) {
    const r = Math.PI / 180;
    const dLat = (by - ay) * r, dLon = (bx - ax) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  let stationNameOf = new Map();
  function sname(id) {
    return stationNameOf.get(id) || id;
  }

  // 시간 모델도 RouteFinder 것을 그대로 쓴다 (GTX 110km/h 보정 포함).
  function edgeMinutes(e) {
    return RF.edgeMinutes(e);
  }

  // 요금 (수도권 전철 기준, 2024년 인상 후)
  function calcFare(distKm) {
    let fare = 1400;
    if (distKm > 10) fare += Math.ceil(Math.min(distKm - 10, 40) / 5) * 100;
    if (distKm > 50) fare += Math.ceil((distKm - 50) / 8) * 100;
    return fare;
  }

  // KTX 는 거리비례 수도권 요금제가 아니다. 서울→부산 417km 에 수도권 공식을
  // 그대로 대면 6,800원이 나온다(실제 59,800원). KTX 구간은 따로 계산한다.
  const KTX_BASE = 8000;
  const KTX_PER_KM = 120;

  // legs 를 보면서 KTX 구간 거리를 뽑아 요금을 합산한다.
  function calcFareOfRoute(r, distKm) {
    let ktxKm = 0;
    (r.legs || []).forEach(l => {
      if (l.lineId && RF.categoryOf(l.lineId) === 'ktx') ktxKm += (l.distKm || 0);
    });
    const metroKm = Math.max(0, distKm - ktxKm);
    let fare = calcFare(metroKm);
    if (ktxKm > 0) fare += KTX_BASE + Math.round(KTX_PER_KM * ktxKm / 100) * 100;
    return fare;
  }
  function routeDistance(path) {
    // 선로를 따라간 실제 거리. 예전에는 역 좌표끼리 직선거리를 더해서
    // 곡선 구간이 실제보다 짧게 나왔다 (강남→원주 93km, 실제 107km).
    return RF.pathDistance(path);
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
    // leg 별 거리도 남긴다 — 요금 계산에서 KTX 구간만 따로 떼어내야 한다
    let km = 0;
    edges.forEach((e, i) => {
      minutes += edgeMinutes(e);
      if (e.lineId !== curLine) {
        legs.push({ lineId: curLine, from: stations[legStart], to: stations[i], walk: curLine === null, distKm: km });
        if (curLine !== null && e.lineId !== null) minutes += RF.TRANSFER_MIN;
        legStart = i; curLine = e.lineId; km = 0;
      }
      km += e.distKm;
    });
    legs.push({ lineId: curLine, from: stations[legStart], to: stations[stations.length - 1], walk: curLine === null, distKm: km });
    const transfers = Math.max(0, legs.filter(l => !l.walk && l.lineId !== null).length - 1);
    return { legs, minutes: Math.round(minutes), transfers };
  }

  // 최소환승: (역,노선) 상태 다익스트라, 비용=(환승,분) 사전식
  function findMinTransfer(fromId, toId) {
    if (!RF.hasStation(fromId) || !RF.hasStation(toId)) return null;
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
      for (const e of (RF.adjacency().get(u) || [])) {
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

  // 최소요금: (역,노선) 상태 다익스트라, 비용 = 거리 + 환승거리벌점
  //
  // 왜 상태를 (역,노선) 으로 두나: 환승을 '거리' 로 환산해야 하기 때문이다.
  // 예전엔 역 단위로만 돌아서, 100원(≈2km) 아끼자고 4번 갈아타는 경로가 나왔다
  // (강남→원주: 2호선→경의중앙선→… 로 팔당을 돌아가는 경로).
  // 환승 1회를 1.5km 로 매기면 '요금은 최소' 라는 성격은 유지하면서 그런 경로는 사라진다.
  const TRANSFER_KM = 1.5;
  function findMinFare(fromId, toId) {
    if (!RF.hasStation(fromId) || !RF.hasStation(toId)) return null;
    if (fromId === toId) return { path: [fromId], legs: [], minutes: 0, transfers: 0 };
    const skey = (s, l) => s + '|' + (l ?? '');
    const startK = skey(fromId, null);
    const dist = new Map([[startK, [0, 0]]]); // [km, min]
    const prev = new Map(); // key -> {pk, edge, station}
    const heap = makeHeap((a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]));
    heap.push([0, 0, fromId, null]);
    let bestK = null;
    while (heap.size()) {
      const [km, m, u, cl] = heap.pop();
      const uk = skey(u, cl);
      const d = dist.get(uk);
      if (!d || km !== d[0] || m !== d[1]) continue;
      if (u === toId) { bestK = uk; break; }
      for (const e of (RF.adjacency().get(u) || [])) {
        const nl = e.walk ? null : e.lineId;
        const transfer = !e.walk && cl !== null && cl !== nl;
        // KTX 는 km당 요금이 수도권 전철의 6배쯤 된다. 같은 거리라도 훨씬 비싸므로
        // '최소요금' 탐색에서는 KTX 구간을 6배로 세야 무궁화·ITX 경로가 이긴다.
        const w = (!e.walk && RF.categoryOf(nl) === 'ktx') ? 6 : 1;
        const nkm = km + e.distKm * w + (transfer ? TRANSFER_KM : 0);
        const nm = m + edgeMinutes(e);
        const vk = skey(e.to, nl);
        const vd = dist.get(vk);
        if (!vd || nkm < vd[0] - 1e-9 || (Math.abs(nkm - vd[0]) < 1e-9 && nm < vd[1])) {
          dist.set(vk, [nkm, nm]);
          prev.set(vk, { pk: uk, edge: e, station: e.to });
          heap.push([nkm, nm, e.to, nl]);
        }
      }
    }
    if (!bestK) return null;
    const chain = [];
    let ck = bestK;
    while (ck !== startK) { const p = prev.get(ck); chain.unshift(p); ck = p.pk; }
    const stations = [fromId];
    const edges = chain.map(p => p.edge);
    for (const p of chain) stations.push(p.station);
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
    return markUnopened({ ...r, distKm, fare: calcFareOfRoute(r, distKm) });
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
    // 그래프는 RouteFinder 것을 빌려 쓴다 (여기서 다시 만들지 않는다)
    stationNameOf = new Map(stations.map(s => [s.properties.id, s.properties.name_ko]));
    lineNameOf = new Map(lines.map(f => [f.properties.id, f.properties.name_ko]));
  }

  return { init, findAll, show, hide };
})();
