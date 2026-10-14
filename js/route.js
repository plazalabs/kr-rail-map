/* 길찾기: 역-노선 그래프 + 다익스트라 최단경로 + 노선별 평균속도 시간 추정 */
'use strict';

const RouteFinder = (() => {
  // 노선별 평균 속도 (km/h) — 실측 시각표가 아닌 어림 추정치 (추론)
  const SPEEDS = { ktx: 180, metro: 32, urban: 45, conventional: 55, etc: 40 };
  const TRANSFER_MIN = 4;   // 환승 1회당 추가 시간 (추론)
  const WALK_KMH = 4;

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
  let stationsById = new Map();

  function hav(ax, ay, bx, by) {
    const r = Math.PI / 180;
    const dLat = (by - ay) * r, dLon = (bx - ax) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  // 선형 좌표열을 평탄화
  function flatCoords(geom) {
    if (geom.type === 'LineString') return geom.coordinates;
    return geom.coordinates.flat(1);
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

  function addEdge(a, b, lineId, walk) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    const distKm = hav(
      stationsById.get(a).geometry.coordinates[0], stationsById.get(a).geometry.coordinates[1],
      stationsById.get(b).geometry.coordinates[0], stationsById.get(b).geometry.coordinates[1]);
    adj.get(a).push({ to: b, lineId, distKm, walk: !!walk });
    adj.get(b).push({ to: a, lineId, distKm, walk: !!walk });
  }

  function buildGraph(lines, stations) {
    adj = new Map(); lineCat = new Map(); stationsById = new Map();
    const lineGeom = new Map();
    // 공사중/계획 노선은 길찾기에서 제외 (운행 중인 노선만)
    const activeLines = lines.filter(f => {
      const st = (f.properties.status || '').toLowerCase();
      return st !== 'construction' && st !== 'planned' && st !== 'proposed';
    });
    activeLines.forEach(f => {
      lineCat.set(f.properties.id, f.properties.category || 'etc');
      lineGeom.set(f.properties.id, flatCoords(f.geometry));
    });
    stations.forEach(s => stationsById.set(s.properties.id, s));

    // 노선별: 역을 선형 위에 투영 → along 순 정렬 → 연속역 연결
    const perLine = new Map();
    stations.forEach(s => {
      const p = s.geometry.coordinates;
      (s.properties.lines || []).forEach(lid => {
        const coords = lineGeom.get(lid);
        if (!coords || coords.length < 2) return;
        const pr = project(p, coords);
        if (pr.distKm > 1.5) return; // 엉뚱한 귀속 방지
        if (!perLine.has(lid)) perLine.set(lid, []);
        perLine.get(lid).push({ id: s.properties.id, along: pr.alongKm });
      });
    });
    let edgeCount = 0;
    perLine.forEach((list, lid) => {
      list.sort((a, b) => a.along - b.along);
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].id === list[i + 1].id) continue;
        addEdge(list[i].id, list[i + 1].id, lid, false);
        edgeCount++;
      }
    });

    // 동명역 도보 환승 연결 (이격 유지된 38그룹 등)
    const byName = new Map();
    stations.forEach(s => {
      const n = s.properties.name_ko;
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push(s.properties.id);
    });
    byName.forEach(ids => {
      if (ids.length < 2) return;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          addEdge(ids[i], ids[j], null, true);
    });

    addGtxOfficialEdges();

    return { stations: stationsById.size, edges: edgeCount };
  }

  // GTX 공식 소요시간 엣지 추가: 공식 역 순서대로 인접역 연결
  function addGtxOfficialEdges() {
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
        // 공식 시간 엣지 (기하 기반 엣지보다 우선)
        const edge = { to: b, lineId: lid, distKm: 0, officialMin: min };
        const rev = { to: a, lineId: lid, distKm: 0, officialMin: min };
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push(edge);
        adj.get(b).push(rev);
      }
    });
  }

  function edgeMinutes(e) {
    if (e.walk) return e.distKm / WALK_KMH * 60 + 2;
    if (e.officialMin != null) return e.officialMin;  // GTX 공식 소요시간 우선
    const v = SPEEDS[lineCat.get(e.lineId)] || 40;
    return e.distKm / v * 60;
  }

  function findRoute(fromId, toId) {
    if (!stationsById.has(fromId) || !stationsById.has(toId)) return null;
    if (fromId === toId) return { path: [fromId], legs: [], minutes: 0, transfers: 0 };

    const dist = new Map([[fromId, 0]]);
    const prev = new Map(); // id -> {from, edge}
    const visited = new Set();
    // 단순 우선순위 큐 (역 1200개 규모에 충분)
    const pq = [[0, fromId]];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift();
      if (visited.has(u)) continue;
      visited.add(u);
      if (u === toId) break;
      for (const e of (adj.get(u) || [])) {
        const nd = d + edgeMinutes(e);
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, { from: u, edge: e });
          pq.push([nd, e.to]);
        }
      }
    }
    if (!prev.has(toId)) return null;

    // 경로 복원
    const path = [toId];
    let cur = toId;
    while (cur !== fromId) { cur = prev.get(cur).from; path.unshift(cur); }

    // leg 분해 (노선 바뀌면 환승)
    const legs = [];
    let legStart = 0, curLine = prev.get(path[1]).edge.lineId;
    let minutes = 0;
    for (let i = 1; i < path.length; i++) {
      const e = prev.get(path[i]).edge;
      minutes += edgeMinutes(e);
      const lid = e.lineId;
      if (lid !== curLine) {
        legs.push({ lineId: curLine, from: path[legStart], to: path[i - 1], walk: curLine === null });
        if (curLine !== null && lid !== null) minutes += TRANSFER_MIN;
        legStart = i - 1; curLine = lid;
      }
    }
    legs.push({ lineId: curLine, from: path[legStart], to: path[path.length - 1], walk: curLine === null });
    const transfers = legs.filter(l => !l.walk && l.lineId !== null).length - 1;

    return { path, legs, minutes: Math.round(minutes), transfers: Math.max(0, transfers) };
  }

  return { buildGraph, findRoute };
})();
