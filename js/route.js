/* 길찾기: 역-노선 그래프 + 다익스트라 최단경로 + 노선별 평균속도 시간 추정 */
'use strict';

const RouteFinder = (() => {
  // 노선별 평균 속도 (km/h) — 실측 시각표가 아닌 어림 추정치 (추론)
  const SPEEDS = { ktx: 180, metro: 32, urban: 45, conventional: 55, etc: 40 };
  const TRANSFER_MIN = 4;   // 환승 1회당 추가 시간 (추론)
  // 경로를 '고를 때' 매기는 환승 비용. 표시 시간(TRANSFER_MIN)보다 비싸다.
  // 실제 여행자는 2분 아끼자고 3번 갈아타지 않는다.
  const TRANSFER_DECISION_MIN = 8;
  const WALK_KMH = 4;
  // KTX 탑승 1회당 붙는 접근 시간 (분). 좌석 지정·개찰·승강장 이동.
  //
  // 왜 필요한가: 이 값이 없으면 '상봉→청량리 3.8km 를 KTX 로' 같은 경로가
  // 최단시간으로 뽑힌다. 3.8km 구간이 1분이라 도시철도(6분)를 이기기 때문이다.
  // 실제로는 그렇게 타는 사람이 없고, 요금도 8,250원부터 시작한다.
  // 도시철도·GTX 는 바로 타므로 0 이다.
  const RAIL_ACCESS_MIN = 12;

  // --- 그래프 구성 상수 -------------------------------------------------
  const ATTACH_MAX_KM = 1.5;   // 역을 선형에 귀속시키는 최대 거리
  const WALK_MAX_KM = 0.5;     // 도보 환승으로 인정하는 최대 거리 (같은 이름이라도 이보다 멀면 별개 역)
  const CLOSED_TOL_KM = 0.05;  // 순환선 폐합 판정 (조각의 시작점과 끝점이 사실상 동일)

  // GTX 공식 역간 소요시간 (분) — 국토부 공시 자료 기반 (apt84rank.com/gtx 정리값)
  // 형식: [역명, 다음역까지 분]. 마지막역은 null.
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
  // 과천청사 = 정부과천청사 (우리 데이터 역명)
  const GTX_NAME_ALIAS = { '과천청사': '정부과천청사' };

  let adj = new Map();      // stationId -> [{to, lineId, distKm, walk}]
  let lineCat = new Map();  // lineId -> category
  let lineStatus = new Map(); // lineId -> status (open / construction / planned / proposed)
  let stationsById = new Map();
  let geomAdjacent = new Set(); // '노선:역A|역B' — 선형에서 바로 이웃한 역 쌍
  let orderByLine = new Map();  // lineId -> [{id, piece, along}] 선형 순서

  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  // 공식 소요시간표의 두 역 사이에 '다른 정차역'이 끼어 있는지.
  // 끼어 있으면 그 공식값은 더 이상 이 구간의 시간이 아니다 (예: GTX-B 청학 신설).
  function hasStationBetween(lid, a, b) {
    const list = orderByLine.get(lid);
    if (!list) return false;
    const ea = list.find(x => x.id === a);
    const eb = list.find(x => x.id === b);
    if (!ea || !eb || ea.piece !== eb.piece) return false;
    const lo = Math.min(ea.along, eb.along), hi = Math.max(ea.along, eb.along);
    return list.some(x => x.piece === ea.piece && x.id !== a && x.id !== b &&
      x.along > lo + 1e-9 && x.along < hi - 1e-9);
  }

  // 미개통 = 운행 중이 아닌 모든 노선. 결과 화면에서 '미개통' 배지로 알린다.
  const UNOPENED = new Set(['construction', 'planned', 'proposed']);
  function isUnopened(lineId) {
    return UNOPENED.has(lineStatus.get(lineId) || 'open');
  }

  function hav(ax, ay, bx, by) {
    const r = Math.PI / 180;
    const dLat = (by - ay) * r, dLon = (bx - ax) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  // 점 p를 선형 위에 투영 → {alongKm, distKm}
  function project(p, coords) {
    let best = { alongKm: 0, distKm: Infinity };
    let acc = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const [ax, ay] = coords[i], [bx, by] = coords[i + 1];
      const segLen = hav(ax, ay, bx, by);
      // 간이 투영 (위경도를 평면 근사)
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

  // distKm 를 넘기지 않으면 두 역의 직선거리를 쓴다(도보 환승).
  // 선로 엣지는 '선형을 따라간 거리'를 넘긴다 — 직선거리는 곡선 구간에서 실제보다
  // 짧아서, 요금·거리 계산이 지그재그 우회를 싸게 착각했다.
  function addEdge(a, b, lineId, walk, distKm) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    if (distKm == null) {
      distKm = hav(
        stationsById.get(a).geometry.coordinates[0], stationsById.get(a).geometry.coordinates[1],
        stationsById.get(b).geometry.coordinates[0], stationsById.get(b).geometry.coordinates[1]);
    }
    // 지금 다닐 수 있는 간선인지. '현재 vs 개통 후' 비교에서 이 값으로 걸러낸다.
    // 도보 환승은 노선이 없으니 언제나 가능하다.
    const open = walk ? true : !isUnopened(lineId);
    adj.get(a).push({ to: b, lineId, distKm, walk: !!walk, open });
    adj.get(b).push({ to: a, lineId, distKm, walk: !!walk, open });
  }

  function buildGraph(lines, stations) {
    adj = new Map(); lineCat = new Map(); stationsById = new Map();
    lineStatus = new Map(); geomAdjacent = new Set(); orderByLine = new Map();
    const activeIds = new Set();
    // 미개통(착공·계획·구상) 노선도 전부 그래프에 넣는다.
    // 이 지도는 '지금 운행 중인 노선'이 아니라 '앞으로 존재할 노선'을 그리는 지도다.
    // 다만 결과 화면에서 미개통 구간을 명시적으로 표시해 오해를 막는다.
    const activeLines = lines;
    activeLines.forEach(f => {
      lineCat.set(f.properties.id, f.properties.category || 'etc');
      lineStatus.set(f.properties.id, (f.properties.status || 'open').toLowerCase());
      activeIds.add(f.properties.id);
    });
    stations.forEach(s => stationsById.set(s.properties.id, s));

    // 노선 → 그 노선에 귀속된 역
    const stationsByLine = new Map();
    stations.forEach(s => {
      (s.properties.lines || []).forEach(lid => {
        if (!activeIds.has(lid)) return;
        if (!stationsByLine.has(lid)) stationsByLine.set(lid, []);
        stationsByLine.get(lid).push(s);
      });
    });

    let edgeCount = 0, loopEdges = 0;

    // 조각(LineString) 단위로 투영한다.
    // 조각을 이어붙여 평탄화하면 (a) 순환선이 한 곳에서 끊기고
    // (b) 분기 경계에서 서로 다른 지선의 역이 '인접역'으로 잘못 연결된다.
    activeLines.forEach(f => {
      const lid = f.properties.id;
      const sts = stationsByLine.get(lid);
      if (!sts || sts.length < 2) return;
      const pieces = f.geometry.type === 'LineString'
        ? [f.geometry.coordinates]
        : (f.geometry.coordinates || []);

      pieces.forEach((coords, pieceIdx) => {
        if (!coords || coords.length < 2) return;
        const seq = [];
        sts.forEach(s => {
          const pr = project(s.geometry.coordinates, coords);
          if (pr.distKm > ATTACH_MAX_KM) return;   // 엉뚱한 귀속 방지
          seq.push({ id: s.properties.id, along: pr.alongKm });
        });
        if (seq.length < 2) return;
        seq.sort((a, b) => a.along - b.along);
        if (!orderByLine.has(lid)) orderByLine.set(lid, []);
        const ord = orderByLine.get(lid);
        seq.forEach(s => ord.push({ id: s.id, piece: pieceIdx, along: s.along }));
        for (let i = 0; i < seq.length - 1; i++) {
          if (seq[i].id === seq[i + 1].id) continue;
          // 선형을 따라간 거리 (직선거리가 아님)
          addEdge(seq[i].id, seq[i + 1].id, lid, false, seq[i + 1].along - seq[i].along);
          geomAdjacent.add(lid + ':' + pairKey(seq[i].id, seq[i + 1].id));
          edgeCount++;
        }
        // 순환선 폐합: 조각의 시작점과 끝점이 사실상 같으면 마지막 역 → 첫 역을 잇는다.
        // (2호선이 당산에서 끊겨 당산→합정이 29분/3회환승으로 계산되던 원인)
        const a = coords[0], b = coords[coords.length - 1];
        if (seq.length > 2 && seq[0].id !== seq[seq.length - 1].id &&
            hav(a[0], a[1], b[0], b[1]) <= CLOSED_TOL_KM) {
          let total = 0;
          for (let i = 0; i < coords.length - 1; i++) total += hav(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
          addEdge(seq[seq.length - 1].id, seq[0].id, lid, false,
            Math.max(0.01, total - seq[seq.length - 1].along + seq[0].along));
          geomAdjacent.add(lid + ':' + pairKey(seq[0].id, seq[seq.length - 1].id));
          edgeCount++; loopEdges++;
        }
      });
    });

    // 동명역 도보 환승: 이름이 같아도 실제로 걸어갈 수 있는 거리만 연결한다.
    // (서울 '시청'과 부산 '시청'을 잇던 325km 도보 엣지 제거)
    const byName = new Map();
    stations.forEach(s => {
      const n = s.properties.name_ko;
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push(s);
    });
    let walkEdges = 0, walkRejected = 0;
    byName.forEach(list => {
      if (list.length < 2) return;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const pa = list[i].geometry.coordinates, pb = list[j].geometry.coordinates;
          if (hav(pa[0], pa[1], pb[0], pb[1]) > WALK_MAX_KM) { walkRejected++; continue; }
          addEdge(list[i].properties.id, list[j].properties.id, null, true);
          walkEdges++;
        }
      }
    });

    addGtxOfficialEdges(activeIds);

    return { stations: stationsById.size, edges: edgeCount, loopEdges, walkEdges, walkRejected };
  }

  // GTX 공식 소요시간 엣지 추가: 공식 역 순서대로 인접역 연결.
  // 미개통 노선(GTX-B/C 등)도 포함한다 — 이 지도는 개통 예정 노선까지 그린다.
  function addGtxOfficialEdges(activeIds) {
    const nameToId = new Map();
    stationsById.forEach((s, id) => {
      const n = s.properties.name_ko;
      if (!nameToId.has(n)) nameToId.set(n, id);
    });
    const resolve = n => nameToId.get(n) || nameToId.get(GTX_NAME_ALIAS[n]);
    Object.entries(GTX_TIMES).forEach(([lid, seq]) => {
      if (activeIds && !activeIds.has(lid)) return;   // 데이터에 없는 노선만 건너뜀
      for (let i = 0; i < seq.length - 1; i++) {
        const a = resolve(seq[i][0]), b = resolve(seq[i + 1][0]);
        const min = seq[i][1];
        if (!a || !b || min == null) continue;
        // 공식 소요시간은 '표에 적힌 두 역 사이' 시간이다.
        // 그 사이에 역이 새로 끼어들었으면(예: GTX-B 청학) 그 구간은 공식값을 쓰면 안 된다.
        // 아니면 역을 건너뛰는 지름길이 생겨 경유역 목록과 소요시간이 어긋난다.
        if (hasStationBetween(lid, a, b)) continue;
        // 기하 기반 엣지가 같은 역 쌍에 이미 있으면 걷어낸다.
        // 남겨두면 다익스트라가 '직선거리÷110km/h' 로 계산한 더 짧은 값을 골라
        // 공식 소요시간이 무시된다 (광운대→삼성이 9분이 아니라 6분으로 나오던 원인).
        const strip = (from, to) => {
          const list = adj.get(from);
          if (!list) return;
          adj.set(from, list.filter(e => !(e.to === to && e.lineId === lid && e.officialMin == null)));
        };
        strip(a, b); strip(b, a);
        // 공식 시간 엣지 (기하 기반 엣지보다 우선)
        // distKm 을 0 으로 두면 '최소요금' 탐색에서 GTX 구간이 공짜가 되어
        // 요금 계산이 엉터리가 된다. 두 역 사이 직선거리라도 넣어둔다.
        const gkm = hav(
          stationsById.get(a).geometry.coordinates[0], stationsById.get(a).geometry.coordinates[1],
          stationsById.get(b).geometry.coordinates[0], stationsById.get(b).geometry.coordinates[1]);
        const edge = { to: b, lineId: lid, distKm: gkm, officialMin: min, open: !isUnopened(lid) };
        const rev = { to: a, lineId: lid, distKm: gkm, officialMin: min, open: !isUnopened(lid) };
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push(edge);
        adj.get(b).push(rev);
      }
    });
  }

  // GTX·고속 계통은 category 가 urban 이라 표의 속도(45km/h)를 쓰면
  // 일반철도(55km/h)보다 느려져 엉뚱한 우회 경로가 잡힌다. 따로 처리한다.
  function speedOf(lineId) {
    const cat = lineCat.get(lineId);
    if (cat === 'ktx') return SPEEDS.ktx;
    if (/^gtx|great-train-express/.test(lineId || '')) return 110;
    return SPEEDS[cat] || 40;
  }

  function edgeMinutes(e) {
    if (e.walk) return e.distKm / WALK_KMH * 60 + 2;
    if (e.officialMin != null) return e.officialMin;  // GTX 공식 소요시간 우선
    return e.distKm / speedOf(e.lineId) * 60;
  }

  // 이 노선에 '탈 때' 붙는 접근 시간. KTX 만 해당한다.
  // route-compare.js 가 같은 값을 쓰도록 노출한다 (두 탭의 소요시간이 갈라지면 안 된다).
  function accessMinutes(lineId) {
    return lineId && lineCat.get(lineId) === 'ktx' ? RAIL_ACCESS_MIN : 0;
  }

  // 최소 힙 (다익스트라용)
  function heapPush(h, item) {
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  function heapPop(h) {
    const top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }

  // 상태 = (역, 현재 노선). 환승 비용을 탐색 '안에서' 지불해야
  // 반환된 경로가 실제로 보고하는 지표 기준 최적이 된다.
  const START = '\u0000start';
  const skey = (id, line) => id + '\u0001' + (line || '');

  // opts.transferPenalty : 탐색 비용에만 쓰는 환승 페널티.
  // 표시되는 소요시간은 실제 TRANSFER_MIN 기준으로 다시 계산한다.
  //
  // 왜 필요한가: 환승 3회 우회가 직통보다 2분 빠르다는 이유로 선택되면
  // 사용자 입장에서는 '더 나쁜 경로'다 (강남→원주: GTX-C+KTX 3회환승 49분
  // vs GTX-D 직통 0회환승 56분). 실제 여행자는 2분 때문에 3번 갈아타지 않는다.
  // 그래서 경로 선택에서만 환승을 비싸게 매기고, 표시 시간은 그대로 둔다.
  function findRoute(fromId, toId, opts) {
    if (!stationsById.has(fromId) || !stationsById.has(toId)) return null;
    if (fromId === toId) return { path: [fromId], legs: [], minutes: 0, transfers: 0 };
    const penalty = (opts && opts.transferPenalty != null) ? opts.transferPenalty : TRANSFER_DECISION_MIN;
    // openOnly: 지금 운행 중인 노선만 쓴다. '지금 vs 개통 후' 비교의 '지금' 쪽.
    const openOnly = !!(opts && opts.openOnly);

    const dist = new Map([[skey(fromId, START), 0]]);
    const prev = new Map();      // key -> {fromKey, fromId, edge}
    const pq = [];
    heapPush(pq, [0, fromId, START]);

    let endKey = null;
    while (pq.length) {
      const [d, u, line] = heapPop(pq);
      const k = skey(u, line);
      if (d > (dist.get(k) ?? Infinity)) continue;   // 낡은 항목
      if (u === toId) { endKey = k; break; }

      for (const e of (adj.get(u) || [])) {
        // 미개통 노선은 지금 탈 수 없다. 도보 환승은 언제나 열려 있다.
        if (openOnly && !e.open) continue;
        const nl = e.lineId || null;
        let cost = edgeMinutes(e);
        // 환승 비용: 앞뒤 모두 노선이 있고 서로 다를 때만
        if (line !== START && line !== null && nl !== null && nl !== line) cost += penalty;
        // KTX 로 새로 탈 때는 접근 시간이 든다. 탐색 비용에도 넣어야
        // '3.8km KTX' 같은 경로가 애초에 후보로 뽑히지 않는다.
        if (nl !== line) cost += accessMinutes(nl);
        const nk = skey(e.to, nl);
        const nd = d + cost;
        if (nd < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nd);
          prev.set(nk, { fromKey: k, fromId: u, edge: e });
          heapPush(pq, [nd, e.to, nl]);
        }
      }
    }
    if (!endKey) return null;

    // 경로 복원
    const revPath = [toId], revEdges = [];
    let cur = endKey;
    const startKey = skey(fromId, START);
    while (cur !== startKey) {
      const p = prev.get(cur);
      revPath.push(p.fromId);
      revEdges.push(p.edge);
      cur = p.fromKey;
    }
    const path = revPath.reverse();
    const edges = revEdges.reverse();   // edges[i] : path[i] → path[i+1]

    // leg 분해 (노선 바뀌면 환승)
    const legs = [];
    let legStart = 0, curLine = edges[0] ? (edges[0].lineId || null) : null;
    let minutes = 0, legKm = 0;
    // 첫 구간부터 KTX 면 접근 시간을 붙인다
    minutes += accessMinutes(curLine);
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      minutes += edgeMinutes(e);
      const lid = e.lineId || null;
      if (lid !== curLine) {
        legs.push({ lineId: curLine, from: path[legStart], to: path[i], walk: curLine === null, distKm: legKm });
        if (curLine !== null && lid !== null) minutes += TRANSFER_MIN;
        minutes += accessMinutes(lid);
        legStart = i; curLine = lid; legKm = 0;
      }
      legKm += e.distKm;
    }
    legs.push({ lineId: curLine, from: path[legStart], to: path[path.length - 1], walk: curLine === null, distKm: legKm });

    // 각 leg 에 개통 상태를 실어 보낸다 → 화면에서 '미개통' 배지로 표시.
    const unopenedNames = [];
    legs.forEach(l => {
      if (!l.lineId) return;
      l.status = lineStatus.get(l.lineId) || 'open';
      l.unopened = isUnopened(l.lineId);
      if (l.unopened) unopenedNames.push(l.lineId);
    });

    const transfers = legs.filter(l => !l.walk && l.lineId !== null).length - 1;

    return {
      path, legs,
      minutes: Math.round(minutes),
      transfers: Math.max(0, transfers),
      unopenedLines: Array.from(new Set(unopenedNames)),
    };
  }

  // 이 노선이 미개통인지 (UI 에서 노선 범례·상세에 배지로 쓴다)
  function lineIsUnopened(lineId) { return isUnopened(lineId); }
  function statusOf(lineId) { return lineStatus.get(lineId) || 'open'; }

  // 경로의 실제 이동거리(km) — 역 사이 간선의 distKm 을 더한다.
  // 역 좌표끼리 직선거리를 더하면 곡선 구간에서 실제보다 짧게 나온다.
  function pathDistance(path) {
    let km = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const list = adj.get(path[i]) || [];
      let best = null;
      for (const e of list) {
        if (e.to !== path[i + 1]) continue;
        if (!best || e.distKm > best.distKm) best = e;   // 같은 쌍에 여러 노선이면 긴 쪽(보수적)
      }
      if (best) km += best.distKm;
    }
    return km;
  }

  return {
    buildGraph, findRoute, lineIsUnopened, statusOf, pathDistance,
    // route-compare.js 가 '같은 그래프'를 쓰도록 노출한다.
    // 예전에는 route-compare 가 그래프를 따로 만들었는데, 그쪽은 선형 조각을 이어붙여
    // 평탄화하는 바람에 GTX-D 분기(팔당 ↔ 삼성)에 없는 엣지가 생겼다.
    // 게다가 GTX 속도 보정(110km/h)이 빠져 두 탭의 소요시간이 서로 달랐다.
    adjacency: () => adj,
    stationById: (id) => stationsById.get(id),
    hasStation: (id) => stationsById.has(id),
    edgeMinutes,
    accessMinutes,
    categoryOf: (lineId) => lineCat.get(lineId),
    TRANSFER_MIN,
    WALK_KMH,
  };
})();

