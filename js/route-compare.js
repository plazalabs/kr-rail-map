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
  // '최단시간' 경로의 환승 페널티는 route.js 가 정한다
  // (역의 실제 도보 시간 + 4분). 여기서 따로 상수를 두지 않는다 —
  // 예전에 8분 고정을 따로 두었더니 표시 시간(실제 값)과 어긋났다.

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
  // 길찾기 결과의 역 이름 = 누르면 그 역의 역 정보 (2026-11-11 사용성 점검 B). 역 ID 로 넘겨 동명역도 정확히
  function stLink(id) {
    return `<button type="button" class="rc-st" data-sid="${escapeHtml(String(id))}" title="역 정보 보기">${escapeHtml(sname(id))}</button>`;
  }

  // 시간 모델도 RouteFinder 것을 그대로 쓴다 (GTX 110km/h 보정 포함).
  function edgeMinutes(e) {
    return RF.edgeMinutes(e);
  }

  // 요금 (수도권 전철, 성인 교통카드). 기본 1,550원(10km) — 2025-06-28 첫차부터 1,400 → 1,550원 (서울시 발표, 인천·경기·코레일 수도권 전철 동일).
  // 거리 추가운임은 그대로: 10~50km 5km마다 100원, 50km 초과 8km마다 100원.
  const METRO_BASE = 1550;
  function calcFare(distKm) {
    if (distKm <= 0) return 0;
    let fare = METRO_BASE;
    if (distKm > 10) fare += Math.ceil(Math.min(distKm - 10, 40) / 5) * 100;
    if (distKm > 50) fare += Math.ceil((distKm - 50) / 8) * 100;
    return fare;
  }

  // KTX 는 거리비례 수도권 요금제가 아니다. 서울→부산 417km 에 수도권 공식을
  // 그대로 대면 6,800원이 나온다(실제 59,800원). KTX 구간은 따로 계산한다.
  // KTX 요금은 km당 단가가 일정하지 않다. 고속선 사용 비중이 커질수록 비싸진다.
  //   서울→강릉  215km  27,600원  (km당 91원)
  //   서울→부산  423.8km 59,800원  (km당 122원)
  // 두 실측값을 지나는 2구간 직선: 기본 8,250원 + 250km까지 90원/km + 그 이후 163원/km
  //   215km → 8,250 + 19,350 = 27,600원
  //   428km → 8,250 + 22,500 + 29,014 = 59,764원
  const KTX_BASE = 8250;
  const KTX_KM1 = 250, KTX_R1 = 90, KTX_R2 = 163;
  function calcKtxFare(distKm) {
    if (distKm <= 0) return 0;
    const tier1 = Math.min(distKm, KTX_KM1);
    const tier2 = Math.max(0, distKm - KTX_KM1);
    return KTX_BASE + Math.round((KTX_R1 * tier1 + KTX_R2 * tier2) / 100) * 100;
  }

  // 일반철도(무궁화·ITX-새마을)도 수도권 요금제가 아니다.
  // 서울→부산 무궁화는 441.7km 에 28,600원인데, 수도권 공식으로는 7,200원이 나왔다.
  // 기본 2,600원 + 10km 초과분 60원/km 로 맞춘다 → 2,600 + 60×431.7 ≈ 28,500원.
  // 2026-11-13 바로잡음: 공식 운임 두 점(서울→수원 41.5km 2,700원 · 서울→부산 441.7km 28,600원)이 모두
  // '1km 64.8원, 최저 2,600원' 에 맞는다. 예전 '2,600 + 10km 넘는 1km 60원' 은 수원을 4,500원으로 냈다.
  const CONV_BASE = 2600;
  const CONV_PER_KM = 64.8;
  function calcConvFare(distKm) {
    if (distKm <= 0) return 0;
    return Math.max(CONV_BASE, Math.round(CONV_PER_KM * distKm / 100) * 100);
  }

  // KTX 공식 운임 (2026-09-01 KTX·SRT 통합 운임표, data/ktx-fares.json — build_ktx_fares.py).
  // 노선별 '역 쌍 → 일반실 운임'. 표에 있는 쌍은 그 값을 그대로 쓰고(공식), 없는 쌍만 위 공식으로 추정한다.
  // 위 공식(calcKtxFare)은 통합 전 실측 두 개(서울→부산 59,800원·서울→강릉 27,600원)에 맞춘 것이라,
  // 추정에는 통합 인하율(평균 10%, 공정위·국토부 2026-08-02)을 곱한다 — 화면에 '추정'이라고 적는다.
  const KTX_CUT = 0.9;
  let ktxFares = null;           // { lines: { lineId: { pairs: { '가|나': 원 } } }, meta }
  function loadKtxFares(doc) { ktxFares = (doc && doc.lines) ? doc : null; }

  // ── 노선별 별도 운임 (감사 N1~N3, 2026-11-13) ─────────────────────────────
  // 신분당선·GTX-A·공항철도 독립구간은 수도권 통합요금(1,550원+거리)에 운영사 별도 운임이 더 붙는다.
  // 예전엔 전부 일반 전철 공식 하나로 계산해 수천 원 낮게 보였다. 값·출처는 data/fares-special.json (못 읽으면 아래 같은 값).
  let SPECIAL = {
    'seoul-metropolitan-subway-shinbundang-line': { name: '신분당선', kind: 'sections',
      sections: [{ id: 'A', label: '신사~강남', stations: ['신사', '논현', '신논현', '강남'] },
        { id: 'B', label: '강남~정자', stations: ['강남', '양재', '양재시민의숲', '청계산입구', '판교', '정자'] },
        { id: 'C', label: '정자~광교', stations: ['정자', '미금', '동천', '수지구청', '성복', '상현', '광교중앙', '광교'] }],
      fare: { A: 700, B: 1000, C: 1000, BC: 1500, AB: 1700, AC: 1700, ABC: 2200 } },
    'great-train-express-line-a': { name: 'GTX-A', kind: 'distance', base: 1650, base_km: 10, per_step: 150, step_km: 5, weekend_base: 1300 },
    'arex': { name: '공항철도', kind: 'independent', independent: ['청라국제도시', '영종', '운서', '공항화물청사', '인천공항1터미널'],
      terminal_link: ['인천공항1터미널', '인천공항2터미널'], base: 1200, base_km: 10, per_km: 130, terminal_per_km: 108.02, round_down: 10 },
  };
  function loadSpecialFares(doc) { if (doc && doc.lines) SPECIAL = Object.assign({}, SPECIAL, doc.lines); }
  // GTX-A 의 미개통 구간(서울역~수서·창릉)은 개통하면 같은 요금제일 것 — 다만 공식 발표 전이라 '추정'
  const GTXA_FAMILY = ['great-train-express-line-a', 'gtx-a-seoul-suseo', 'gtx-a-changneung'];
  const isFutureGtx = id => /^gtx-|great-train-express/.test(id || '') && !GTXA_FAMILY.includes(id);
  const segName = id => String(sname(id) || '').replace(/역$/, '');
  // 신분당선: 지난 구간(A·B·C)을 역 순서로 판정. 경계 역(강남·정자)에만 닿은 것은 그 구간을 지난 것이 아니다
  function shinbundangSections(legs, rule) {
    const order = [];
    rule.sections.forEach(sec => sec.stations.forEach(n => { if (!order.includes(n)) order.push(n); }));
    const bound = rule.sections.map(sec => [order.indexOf(sec.stations[0]), order.indexOf(sec.stations[sec.stations.length - 1])]);
    const hit = new Set();
    legs.forEach(l => {
      const i = order.indexOf(segName(l.from)), j = order.indexOf(segName(l.to));
      if (i < 0 || j < 0 || i === j) return;
      const lo = Math.min(i, j), hi = Math.max(i, j);
      rule.sections.forEach((sec, k) => { if (lo < bound[k][1] && hi > bound[k][0]) hit.add(sec.id); });
    });
    return Array.from(hit).sort().join('');
  }
  const fareNorm = s => String(s || '').trim().replace(/[()]/g, '').replace(/역$/, '').replace(/\s/g, '');
  function officialKtxFare(lineId, fromId, toId) {
    const t = ktxFares && ktxFares.lines[lineId];
    if (!t) return null;
    const k = [fareNorm(sname(fromId)), fareNorm(sname(toId))].sort().join('|');
    return Object.prototype.hasOwnProperty.call(t.pairs, k) ? t.pairs[k] : null;
  }
  function estimatedKtxFare(km) { return Math.round(calcKtxFare(km) * KTX_CUT / 100) * 100; }

  // legs 를 보면서 구간 종류별 요금을 합산하고, 어디서 나온 값인지(공식표·계산·추정)를 함께 돌려준다.
  // 수도권 전철은 거리비례, 일반철도는 맞춘 공식(추정), KTX 는 탄 구간마다 공식 운임표 → 없으면 추정.
  function calcFareDetail(r, distKm) {
    let convKm = 0, ktxKm = 0, metroLegKm = 0, legKmKnown = false;
    const ktxParts = [];
    const order = [];   // 내역을 타는 순서대로 — 전철·일반철도는 합산 요금이라 처음 탄 자리에 한 줄
    (r.legs || []).forEach(l => {
      if (typeof l.distKm === 'number') legKmKnown = true;
      const cat = l.lineId && RF.categoryOf(l.lineId);
      if (l.lineId && cat !== 'ktx' && cat !== 'conventional') {
        metroLegKm += (l.distKm || 0);
        if (!order.includes('metro')) order.push('metro');
      }
      if (cat === 'conventional' && !order.includes('conventional')) order.push('conventional');
      if (cat === 'ktx') {
        order.push(ktxParts.length);
        ktxKm += (l.distKm || 0);
        const off = officialKtxFare(l.lineId, l.from, l.to);
        ktxParts.push(off !== null
          ? { kind: 'ktx', from: l.from, to: l.to, fare: off, basis: 'official' }
          : { kind: 'ktx', from: l.from, to: l.to, fare: estimatedKtxFare(l.distKm || 0), basis: 'estimate' });
      } else if (cat === 'conventional') convKm += (l.distKm || 0);
    });
    // 전철 거리는 실제로 탄 전철 구간(legs)만 더한다. 예전에는 '전체 거리 − KTX − 일반철도' 의 나머지로 셌는데,
    // 전체 거리(선형을 따라 잰 값)와 구간 거리 합이 몇 km 어긋나서 KTX 만 탄 서울→부산에도 전철 1,400원이 붙었다.
    // 구간 거리가 없는 옛 모양의 결과에서만 예전 방식으로 물러난다.
    // 별도 운임 (신분당선·GTX-A·공항철도 독립구간). 공항철도 독립구간 거리는 수도권 거리에서 뺀다
    const extraParts = [];
    const legsOn = id => (r.legs || []).filter(l => !l.walk && l.lineId === id);
    const sb = SPECIAL['seoul-metropolitan-subway-shinbundang-line'];
    const sbLegs = legsOn('seoul-metropolitan-subway-shinbundang-line');
    if (sb && sbLegs.length) {
      const key = shinbundangSections(sbLegs, sb);
      const fee = key ? (sb.fare[key] != null ? sb.fare[key] : key.split('').reduce((a, k) => a + (sb.fare[k] || 0), 0)) : 0;
      if (fee > 0) extraParts.push({ kind: 'extra', line: '신분당선', detail: key.split('').map(k => (sb.sections.find(x => x.id === k) || {}).label).join('·'), fare: fee, basis: 'official' });
    }
    const ga = SPECIAL['great-train-express-line-a'];
    const gaLegs = (r.legs || []).filter(l => !l.walk && GTXA_FAMILY.includes(l.lineId));
    if (ga && gaLegs.length) {
      const km = gaLegs.reduce((a, l) => a + (l.distKm || 0), 0);
      const fee = ga.base + ga.per_step * Math.ceil(Math.max(0, km - ga.base_km) / ga.step_km);
      const future = gaLegs.some(l => l.lineId !== 'great-train-express-line-a');
      extraParts.push({ kind: 'extra', line: 'GTX-A', detail: '평일 기준 · 주말은 ' + (ga.base - ga.weekend_base).toLocaleString() + '원 낮음', fare: fee, basis: future ? 'estimate' : 'official' });
    }
    const ax = SPECIAL['arex'];
    let arexIndepKm = 0;
    if (ax) {
      let ind = 0, term = 0;
      legsOn('arex').forEach(l => (l.segs || []).forEach(sg => {
        const a = segName(sg.a), b = segName(sg.b);
        if (ax.terminal_link.includes(a) && ax.terminal_link.includes(b)) term += sg.km;
        else if (ax.independent.includes(a) && ax.independent.includes(b)) ind += sg.km;
      }));
      if (ind > 0 || term > 0) {
        arexIndepKm = ind + term;
        let fee = ind > 0
          ? ax.base + ax.per_km * Math.max(0, ind - ax.base_km) + ax.terminal_per_km * term
          : ax.base + ax.terminal_per_km * Math.max(0, term - ax.base_km);
        fee = Math.floor(fee / ax.round_down) * ax.round_down;
        extraParts.push({ kind: 'extra', line: '공항철도', detail: '청라~공항 구간', fare: fee, basis: term > 0 ? 'formula' : 'official' });
      }
    }
    // 개통 전 GTX(B·C 등) — 공식 요금이 없다. 일반 전철 요금으로만 셈했다는 사실을 밝힌다
    const futureGtx = Array.from(new Set((r.legs || []).filter(l => !l.walk && isFutureGtx(l.lineId)).map(l => lineNameOf.get(l.lineId) || l.lineId)));
    if (futureGtx.length) extraParts.push({ kind: 'pending', line: futureGtx.join('·'), fare: 0, basis: 'estimate' });
    if (arexIndepKm > 0) metroLegKm = Math.max(0, metroLegKm - arexIndepKm);
    const metroKm = legKmKnown ? metroLegKm : Math.max(0, distKm - ktxKm - convKm);
    const metroPart = metroKm > 0 ? { kind: 'metro', fare: calcFare(metroKm), basis: 'formula' } : null;
    const convPart = convKm > 0 ? { kind: 'conventional', fare: calcConvFare(convKm), basis: 'estimate' } : null;
    if (metroPart && !order.includes('metro')) order.unshift('metro');   // 옛 모양(구간 거리 없음)
    const parts = order.map(o => o === 'metro' ? metroPart : o === 'conventional' ? convPart : ktxParts[o]).filter(Boolean).concat(extraParts);
    const total = parts.reduce((a, p) => a + p.fare, 0);
    return { total, parts, estimated: parts.some(p => p.basis === 'estimate') };
  }
  function calcFareOfRoute(r, distKm) { return calcFareDetail(r, distKm).total; }
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
    let minutes = RF.accessMinutes(curLine);   // 첫 구간이 KTX 면 접근 시간
    // leg 별 거리도 남긴다 — 요금 계산에서 KTX 구간만 따로 떼어내야 한다
    let km = 0, segs = [];   // segs: 이 구간에서 지난 역 쌍과 거리 — 공항철도 독립구간 요금에 쓴다 (2026-11-13)
    edges.forEach((e, i) => {
      minutes += edgeMinutes(e);
      if (e.lineId !== curLine) {
        // 환승은 지금 역(stations[i])에서. 역·노선쌍마다 실제 도보 시간이 다르다.
        const tm = (curLine !== null && e.lineId !== null)
          ? RF.transferMinutes(stations[i], curLine, e.lineId, stations[i - 1], stations[i + 1]) : 0;
        // 갈아탈 때 기다리는 시간 — findRoute(route.js)와 같은 정의. 예전엔 여기만 빠져 같은 경로가 탭마다 31분/28분으로 달랐다 (감사1, 2026-11-14)
        const wt = (curLine !== null && e.lineId !== null && RF.transferWait) ? RF.transferWait(e.lineId, curLine, stations[i], stations[i - 1], stations[i + 1]) : 0;
        legs.push({ lineId: curLine, from: stations[legStart], to: stations[i],
                    walk: curLine === null, distKm: km, transferAfter: tm, waitAfter: wt, segs,
                    platform: !!(curLine && e.lineId && RF.isPlatformTransfer(stations[i], curLine, e.lineId, stations[i - 1], stations[i + 1])) });
        if (tm) minutes += tm;
        minutes += wt;
        minutes += RF.accessMinutes(e.lineId);
        legStart = i; curLine = e.lineId; km = 0; segs = [];
      }
      km += e.distKm;
      segs.push({ a: stations[i], b: stations[i + 1], km: e.distKm || 0 });
    });
    legs.push({ lineId: curLine, from: stations[legStart], to: stations[stations.length - 1],
                walk: curLine === null, distKm: km, transferAfter: 0, segs });
    const transfers = RF.countTransfers(legs);   // 이어 달리는 구간(GTX-A 미개통 구간)은 환승이 아니다
    return { legs, minutes: Math.round(minutes), transfers };
  }

  // 최소환승: (역,노선) 상태 다익스트라, 비용=(환승,분) 사전식
  // openOnly 면 미개통 노선 간선을 건너뛴다 ('지금' 경로).
  function findMinTransfer(fromId, toId, openOnly) {
    // init 전에 호출되면(지도 로드 실패 등) 조용히 '경로 없음' 으로 둔다.
    // 여기서 던지면 경로 패널 전체가 죽는다.
    if (!RF || !RF.hasStation(fromId) || !RF.hasStation(toId)) return null;
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
        if (openOnly && !e.open) continue;
        if (!openOnly && e.nowOnly) continue;   // 개통 후엔 새 역에 선다 (route.js NOW_ONLY_SPANS)
        let nt, nl;
        if (e.walk) { nt = t + 1; nl = null; }
        else if (cl === null || RF.sameService(cl, e.lineId)) { nt = t; nl = e.lineId; }
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
  function findMinFare(fromId, toId, openOnly, metroOnly) {
    // init 전에 호출되면(지도 로드 실패 등) 조용히 '경로 없음' 으로 둔다.
    // 여기서 던지면 경로 패널 전체가 죽는다.
    if (!RF || !RF.hasStation(fromId) || !RF.hasStation(toId)) return null;
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
        if (openOnly && !e.open) continue;
        if (!openOnly && e.nowOnly) continue;   // 개통 후엔 새 역에 선다 (route.js NOW_ONLY_SPANS)
        const nl = e.walk ? null : e.lineId;
        // metroOnly: 별도 운임(신분당·GTX-A·공항철도)·일반철도·KTX 를 안 타는 '순수 전철' 후보 (pickCheapest 참고)
        if (metroOnly && !e.walk && (SPECIAL[e.lineId] || ['ktx', 'conventional'].includes(RF.categoryOf(e.lineId)))) continue;
        const transfer = !e.walk && cl !== null && !RF.sameService(cl, nl);
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
    const fd = calcFareDetail(r, distKm);
    return markUnopened({ ...r, distKm, fare: fd.total, fareDetail: fd });
  }

  // '최소요금' 은 화면에 함께 나오는 어느 후보보다 비싸면 안 된다 (68점 감사 8번, 2026-11-13).
  // 탐색은 거리로 고르는 근사라서(별도 운임·일반철도 기본요금을 모른다) 수도권 552쌍 중 41쌍에서
  // 최소요금 탭이 다른 탭보다 비쌌다(예: 동작→서현 신분당선 3,550원 > 9호선·수인분당 1,950원).
  // 그래서 후보(거리 최소·순수 전철·최적·최소환승)의 실제 계산 요금을 비교해 가장 싼 것을 고른다. 같으면 빠른 쪽.
  function pickCheapest(cands) {
    let best = null;
    for (const r of cands) {
      if (!r || typeof r.fare !== 'number') continue;
      if (!best || r.fare < best.fare || (r.fare === best.fare && r.minutes < best.minutes)) best = r;
    }
    return best;
  }

  // 운행 중인 노선만 쓰는 3종 (길찾기 기본 — 2026-11-09 결정 1: 미개통은 켠 사람에게만).
  // future 는 '개통 예정 노선까지 쓰면' 의 최단시간 — 결과에 '켜면 몇 분' 한 줄을 붙이는 데만 쓴다.
  function findAllOpen(fromId, toId) {
    if (!RF) return { time: null, transfer: null, fare: null, now: null, future: null, openOnly: true };
    const time = enrich(RF.findRoute(fromId, toId, { openOnly: true }));
    const transfer = enrich(findMinTransfer(fromId, toId, true));
    const fare = pickCheapest([enrich(findMinFare(fromId, toId, true)), enrich(findMinFare(fromId, toId, true, true)), time, transfer]);
    const future = enrich(RF.findRoute(fromId, toId));
    return { time, transfer, fare, now: time, future, openOnly: true };
  }

  function findAll(fromId, toId, opts) {
    if (opts && opts.openOnly) return findAllOpen(fromId, toId);
    if (!RF) return { time: null, transfer: null, fare: null, now: null };
    // 최단시간 탐색에는 환승 페널티를 더 세게 준다 — route.js 기본값이
    // '역의 실제 도보 시간 + 4분' 이므로, 표시 시간과 같은 잣대로 고른다.
    // (예전에는 8분 고정이었는데, 표시는 실제 값이라 둘이 어긋났다)
    // (환승 3회로 2분 아끼는 경로가 '최단시간'으로 뽑히던 문제)
    const time = RF ? enrich(RF.findRoute(fromId, toId)) : null;
    const transfer = enrich(findMinTransfer(fromId, toId));
    const now = RF ? enrich(RF.findRoute(fromId, toId, { openOnly: true })) : null;
    const fare = pickCheapest([enrich(findMinFare(fromId, toId)), enrich(findMinFare(fromId, toId, false, true)), time, transfer, now]);   // '지금 바로' 길도 후보 (2026-11-13)
    // '지금' — 미개통 노선을 한 개도 쓰지 않는 가장 빠른 경로.
    // 부동산에서 이게 핵심이다: 개통 전에 그 집에 살면 실제로 몇 분 걸리는가.
    // 목적지가 미개통 노선에만 있는 역이면 null 이 된다 (지금은 갈 수 없다).
    return { time, transfer, fare, now };
  }

  // 탭 위 한 줄 요약. '최적' 보다 다른 길이 빠르면 그 대가(환승)를 같이 적는다 — 숨기면 '최적' 이 거짓말처럼 보인다.
  function insightOf(all) {
    const out = [];
    const t = all.time;
    const trade = (r) => {
      const dm = r.minutes - t.minutes;
      const dx = r.transfers - t.transfers;
      if (dm > 0) return `${dm}분 더 걸림`;
      if (dm < 0) return `${-dm}분 빠르지만 환승 ${r.transfers}회` + (dx > 0 ? ` (${dx}회 더)` : '');
      return '시간은 같음';
    };
    if (t && all.transfer && all.transfer.transfers < t.transfers) {
      const dm = all.transfer.minutes - t.minutes;
      out.push(`최소환승은 ${dm > 0 ? dm + '분 더 걸리지만' : '시간도 비슷하고'} 환승 ${t.transfers - all.transfer.transfers}회 절약`);
    }
    if (t && all.fare && all.fare.fare < t.fare) {
      out.push(`최소요금은 ${(t.fare - all.fare.fare).toLocaleString()}원 절약 · ${trade(all.fare)}`);
    } else if (t && all.fare && all.fare.minutes < t.minutes) {
      out.push(`최소요금 길은 ${trade(all.fare)}`);
    }
    return out.join('<br>');
  }

  // 표시 시간이 가장 짧은 탭 — '최적'(시간+환승 벌점)보다 다른 탭이 더 빠르면 그 탭 id, 아니면 null.
  // (2차 감사 R6, 2026-11-13: 수원→강남 최소요금 55분 < 최적 61분 인데 '최적' 만 보면 더 빠른 줄 안다)
  // 동점이면 '최적' 우선 → null. 탭 이름 옆 '가장 빠름' 표시와 패널 배지가 이 값 하나를 쓴다.
  function fastestTabId(all) {
    const t = all && all.time;
    if (!t) return null;
    let best = null, bm = t.minutes;
    for (const id of ['transfer', 'fare']) {
      const r = all[id];
      if (r && r.minutes < bm) { best = id; bm = r.minutes; }
    }
    return best;
  }

  // '지금 vs 개통 후' 요약. 화면과 테스트가 같은 판단을 쓰도록 여기 한 곳에 모은다.
  //   status: 'same'      — 개통 예정 노선이 도움 안 됨 (지금 경로가 이미 최선)
  //           'better'    — 개통 후 더 빨라짐
  //           'new'       — 지금은 갈 수 없고 개통 후에만 갈 수 있음
  //           'worse'     — 개통 후가 오히려 느림(데이터 이상 신호)
  function compareNowFuture(fromId, toId, pre) {
    const all = pre || findAll(fromId, toId);
    const fut = all.time;
    const now = all.now;
    if (!fut) return { status: 'none', now: null, future: null, savedMin: 0, lines: [] };
    const lines = (fut.unopenedLines || []);
    if (!now) {
      return { status: 'new', now: null, future: fut, savedMin: 0, lines };
    }
    const saved = now.minutes - fut.minutes;
    let status = 'same';
    if (saved > 0) status = 'better';
    else if (saved < 0) status = 'worse';
    // 개통 후 경로가 미개통 노선을 안 쓰면 '달라진 게 없다' 로 본다.
    if (status === 'better' && lines.length === 0) status = 'same';
    return { status, now, future: fut, savedMin: saved, lines };
  }

  // ---------- UI ----------
  function ensureStyle() {
    if (document.getElementById('rc-style')) return;
    const st = document.createElement('style');
    st.id = 'rc-style';
    st.textContent = `
      .rc-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
      .rc-st { background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer;
        text-decoration: underline dotted; text-underline-offset: 3px; text-decoration-color: var(--muted, #888); }
      .rc-st:hover, .rc-st:focus-visible { color: var(--accent, #1565c0); text-decoration-style: solid; }
      /* 탭이 4개(지금 탭 포함)면 한 줄에 넣을 때 글자가 잘린다.
         그때만 2x2 로 접어 이름이 온전히 보이게 한다. */
      .rc-tabs.four { display: grid; grid-template-columns: 1fr 1fr; }
      .rc-tab { flex: 1 1 0; min-width: 0; padding: 8px 4px; border: 1px solid var(--border, #ddd);
        background: var(--panel-bg, #fff); color: var(--text, #222); border-radius: 8px;
        cursor: pointer; font-size: var(--fs-xs); line-height: 1.25; letter-spacing: -.01em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rc-tab.active { background: var(--accent, #3388ff); color: #fff; border-color: var(--accent, #3388ff); font-weight: bold; }
      /* 2차 감사 R6: '최적' 보다 빠른 탭에 붙는 짧은 표시 (탭이 좁아 두 글자) */
      .rc-fast { display: inline-block; margin-left: 3px; padding: 0 4px; border-radius: 4px; font-size: var(--fs-xs); font-weight: bold;
        background: rgba(234, 179, 8, 0.14); color: var(--warn-text, #8a5300); vertical-align: 1px; }
      .rc-tab.active .rc-fast { background: #fff; color: var(--accent, #3388ff); }
      .rc-def { font-size: var(--fs-xs); color: var(--muted, #666); font-weight: normal; margin-left: 2px; }
      .rc-badge { display: inline-block; font-size: var(--fs-xs); background: var(--accent, #3388ff); color: #fff;
        border-radius: 4px; padding: 1px 6px; margin-right: 6px; }
      .rc-insight { font-size: var(--fs-xs); color: var(--muted, #666); margin: 8px 0; line-height: 1.6; }
      /* 기본(운행 중인 노선만) 결과 위의 '개통 예정 노선 포함' 안내 한 줄 */
      .rc-noroute { padding: 8px 2px; line-height: 1.6; } .rc-noroute .rc-nr-why { margin: 4px 0 8px; font-size: var(--fs-sm); color: var(--muted, #5b6470); }
      .rc-oo-hint { font-size: var(--fs-xs); line-height: 1.6; margin: 0 0 8px; padding: 6px 10px; border-radius: 8px;
        border: 1px dashed var(--border, #c9ced6); color: var(--text, #222); background: var(--surface, #f6f7f9); }
      .rc-oo-how { display: block; color: var(--muted, #666); }
      /* 요금 내역 — 줄마다 출처(공식 운임표·계산·추정) */
      .rc-fare { list-style: none; margin: -2px 0 8px; padding: 6px 10px; font-size: var(--fs-xs); line-height: 1.6;
        border-left: 3px solid var(--border, #d6dae0); color: var(--text, #222); }
      .rc-src { color: var(--muted, #666); font-size: var(--fs-xs); }
      .rc-est { color: var(--warn-text, #8a5300); font-size: var(--fs-xs); }
      /* '지금 vs 개통 후' 비교 */
      .rc-nf { border: 1px solid var(--border, #e3e6ea); border-radius: 10px; padding: 10px 12px;
        margin-bottom: 10px; background: var(--surface, #f6f7f9); }
      .rc-nf.hot { border-color: var(--accent, #1b64da); background: var(--accent-weak, #e8f0fe); }
      .rc-nf-row { display: flex; align-items: flex-end; gap: 8px; }
      .rc-nf-col { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .rc-nf-label { font-size: var(--fs-xs); color: var(--muted, #5b6470); letter-spacing: .02em; }
      .rc-nf-time { font-size: var(--fs-xl); font-weight: 700; line-height: 1.1; color: var(--text, #16191d);
        font-variant-numeric: tabular-nums; }
      .rc-nf-time small { font-size: var(--fs-xs); font-weight: 600; margin-left: 1px; }
      .rc-nf-sub { font-size: var(--fs-xs); color: var(--muted, #5b6470); }
      .rc-nf-arrow { font-size: var(--fs-md); color: var(--muted, #5b6470); padding-bottom: 14px; }
      .rc-nf-delta { margin-left: auto; text-align: right; font-size: var(--fs-sm); font-weight: 700;
        color: var(--accent, #1b64da); padding-bottom: 2px; white-space: nowrap; }
      .rc-nf-why { font-size: var(--fs-xs); color: var(--muted, #5b6470); margin-top: 7px; line-height: 1.5; }
      .rc-nf-why b { color: var(--text, #16191d); font-weight: 600; }
      .rc-nf.flat .rc-nf-time { font-size: var(--fs-md); font-weight: 600; }
    `;
    document.head.appendChild(st);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 요금 내역 — 공식 운임표 값과 계산·추정 값을 섞어 하나의 확정 금액처럼 보이지 않게 줄마다 출처를 적는다.
  // 수도권 전철만 탄 경로는 내역을 생략한다(한 줄짜리 거리 요금이라 위 합계와 같다).
  function fareBreakdownHtml(fd) {
    if (!fd || !fd.parts || !fd.parts.some(p => p.kind !== 'metro')) return '';
    const eff = ktxFares && ktxFares.meta && ktxFares.meta.effective ? ktxFares.meta.effective.replace(/-/g, '.').replace(/\.0/g, '.') : '';
    const rows = fd.parts.map(p => {
      const won = p.fare.toLocaleString() + '원';
      if (p.kind === 'ktx') {
        const seg = `KTX ${escapeHtml(sname(p.from))}→${escapeHtml(sname(p.to))}`;
        return p.basis === 'official'
          ? `<li>${seg} <b>${won}</b> <span class="rc-src">공식 운임표${eff ? ' (' + eff + ' 기준)' : ''}</span></li>`
          : `<li>${seg} 약 ${won} <span class="rc-est">추정 — 공식 운임표에 없는 구간이라 통합 전 요금에 인하율 10%를 적용</span></li>`;
      }
      if (p.kind === 'conventional') return `<li>일반철도 약 ${won} <span class="rc-est">추정 — 거리로 계산</span></li>`;
      if (p.kind === 'extra') {
        const what = `${escapeHtml(p.line)} 별도 운임${p.detail ? ' (' + escapeHtml(p.detail) + ')' : ''}`;
        if (p.basis === 'official') return `<li>${what} <b>+${won}</b> <span class="rc-src">운영사 공식 요금</span></li>`;
        if (p.basis === 'formula') return `<li>${what} <b>+${won}</b> <span class="rc-src">공식 계산식 · 거리는 지도 기준이라 수십 원 다를 수 있음</span></li>`;
        return `<li>${what} 약 +${won} <span class="rc-est">추정 — 개통 전이라 공식 요금 없음, 지금 운행 구간 요금제로 셈</span></li>`;
      }
      if (p.kind === 'pending') return `<li>${escapeHtml(p.line)} 요금 미정 <span class="rc-est">추정 — 개통 전, 더 비쌀 수 있음</span></li>`;
      return `<li>수도권 전철 ${won} <span class="rc-src">거리 기준 계산</span></li>`;
    }).join('');
    return `<ul class="rc-fare">${rows}</ul>`;
  }

  // '지금 vs 개통 후' 비교 카드.
  // 부동산에서 실제로 묻는 것은 "지금 사면 몇 분이냐" 이고, 그 다음이
  // "개통되면 얼마나 좋아지냐" 다. 두 값을 나란히 놓고 차이를 숫자로 보여준다.
  function nowFutureHtml(cmp) {
    if (!cmp || cmp.status === 'none' || !cmp.future) return '';
    const names = (cmp.lines || []).map(id => lineNameOf.get(id) || id);
    const lineTxt = names.length ? `<b>${escapeHtml(names.join(' · '))}</b> ` : '';
    const f = cmp.future;

    if (cmp.status === 'new') {
      return `<div class="rc-nf hot"><div class="rc-nf-row">` +
        `<div class="rc-nf-col"><span class="rc-nf-label">지금</span>` +
        `<span class="rc-nf-time">갈 수 없음</span>` +
        `<span class="rc-nf-sub">운행 중인 노선 없음</span></div>` +
        `<div class="rc-nf-arrow">→</div>` +
        `<div class="rc-nf-col"><span class="rc-nf-label">개통 후</span>` +
        `<span class="rc-nf-time">${f.minutes}<small>분</small></span>` +
        `<span class="rc-nf-sub">환승 ${f.transfers}회</span></div>` +
        `<div class="rc-nf-delta">신규 연결</div></div>` +
        `<div class="rc-nf-why">${lineTxt}개통 전에는 이 역에 철도로 닿을 수 없습니다.</div></div>`;
    }

    const now = cmp.now;
    if (cmp.status === 'better') {
      const pct = now.minutes > 0 ? Math.round(cmp.savedMin / now.minutes * 100) : 0;
      const dTrans = now.transfers - f.transfers;
      const transTxt = dTrans > 0 ? ` · 환승 ${dTrans}회 감소` : (dTrans < 0 ? ` · 환승 ${-dTrans}회 증가` : '');
      return `<div class="rc-nf hot"><div class="rc-nf-row">` +
        `<div class="rc-nf-col"><span class="rc-nf-label">지금</span>` +
        `<span class="rc-nf-time">${now.minutes}<small>분</small></span>` +
        `<span class="rc-nf-sub">환승 ${now.transfers}회</span></div>` +
        `<div class="rc-nf-arrow">→</div>` +
        `<div class="rc-nf-col"><span class="rc-nf-label">개통 후</span>` +
        `<span class="rc-nf-time">${f.minutes}<small>분</small></span>` +
        `<span class="rc-nf-sub">환승 ${f.transfers}회</span></div>` +
        `<div class="rc-nf-delta">−${cmp.savedMin}분</div></div>` +
        `<div class="rc-nf-why">${lineTxt}개통으로 <b>${cmp.savedMin}분(${pct}%)</b> 단축${transTxt}</div></div>`;
    }

    // 변화 없음(또는 개통 후가 더 느림) — 이득이 없다고 솔직히 말한다.
    // 부동산 도구에서 '조용히 넘어가기'는 곧 잘못된 판단으로 이어진다.
    const dTrans = now.transfers - f.transfers;
    const note = dTrans > 0
      ? `시간은 그대로지만 환승이 ${dTrans}회 줄어듭니다.`
      : '이 구간은 개통 예정 노선으로 얻는 이득이 없습니다.';
    return `<div class="rc-nf flat"><div class="rc-nf-row">` +
      `<div class="rc-nf-col"><span class="rc-nf-label">지금 = 개통 후</span>` +
      `<span class="rc-nf-time">${now.minutes}<small>분</small></span>` +
      `<span class="rc-nf-sub">환승 ${now.transfers}회</span></div>` +
      `<div class="rc-nf-delta">변화 없음</div></div>` +
      `<div class="rc-nf-why">${note}</div></div>`;
  }

  function variantHtml(r, tabId, badge) {
    const fd = r.fareDetail;
    // 미정 운임(개통 전 GTX 등)이 있으면 합계가 확정처럼 보이지 않게 '+ ○○ 요금 미정' 을 합계 옆에 직접 적는다 (68점 감사 7번)
    const pend = fd && fd.parts ? fd.parts.filter(p => p.kind === 'pending').map(p => p.line) : [];
    const fareTxt = pend.length
      ? `예상 요금 ${r.fare.toLocaleString()}원 <span class="rc-est">+ ${escapeHtml(pend.join('·'))} 요금 미정</span>`
      : `예상 요금 ${r.fare.toLocaleString()}원${fd && fd.estimated ? ' <span class="rc-est">(일부 추정)</span>' : ''}`;
    let html = `<div class="total">${badge ? `<span class="rc-badge">${badge}</span>` : ''}총 약 ${r.minutes}분<span class="rc-def" title="운행 속도로 어림한 시간 — 갈아탈 때 기다리는 시간은 넣고, 처음 열차를 기다리는 시간은 뺐습니다">(환승 대기 포함)</span> · 환승 ${r.transfers}회 · ${fareTxt} · ${r.distKm.toFixed(1)}km</div>`;
    html += fareBreakdownHtml(fd);
    // 미개통 노선을 지나는 경로는 명시한다.
    // 이 지도는 착공·계획 노선까지 그리므로 '지금 갈 수 있는 길'로 오해하면 안 된다.
    if (r.unopenedLines && r.unopenedLines.length) {
      const names = r.unopenedLines.map(id => lineNameOf.get(id) || id).join(', ');
      html += `<div class="unopened-notice"><i data-ic="alert"></i> 미개통 구간 포함 — ${escapeHtml(names)}` +
        `<span class="unopened-sub">개통 전이므로 실제로는 이용할 수 없습니다.</span></div>`;
    }
    r.legs.forEach((leg, idx) => {
      const a = stLink(leg.from), b = stLink(leg.to);
      const i1 = r.path.indexOf(leg.from), i2 = r.path.indexOf(leg.to);
      const n = Math.abs(i2 - i1);
      if (leg.walk || !leg.lineId) {
        html += leg.from === leg.to || sname(leg.from) === sname(leg.to)
          ? `<div class="leg"><i data-ic="walk"></i> ${a}역 내 환승 (도보 이동)</div>`
          : `<div class="leg"><i data-ic="walk"></i> ${a} → ${b} (도보 이동)</div>`;
      } else {
        const ln = escapeHtml(lineNameOf.get(leg.lineId) || leg.lineId);
        const segStations = [];
        const step = i2 > i1 ? 1 : -1;
        for (let i = i1; i !== i2; i += step) segStations.push(stLink(r.path[i]));
        segStations.push(stLink(r.path[i2]));
        const viaId = `rc-via-${tabId}-${leg.from}-${leg.to}`;
        const un = leg.unopened ? ` <span class="badge-unopened">미개통</span>` : '';
        html += `<div class="leg${leg.unopened ? ' leg-unopened' : ''}">${a} → <b>${ln}</b>${un} <button class="via-toggle" data-target="${viaId}">${n}개역</button> → ${b}\n` +
          `<div class="via-list" id="${viaId}" hidden>${segStations.join(' → ')}</div></div>`;
      }
      // 이 구간을 내린 뒤 갈아타는 시간 (역마다 다르다)
      if (leg.transferAfter > 0) {
        html += leg.platform
        ? `<div class="leg leg-transfer leg-platform"><i data-ic="transfer"></i> <b>${b}</b>역 같은 승강장 평면환승 · 약 10초</div>`
        : `<div class="leg leg-transfer"><i data-ic="walk"></i> <b>${b}</b>역 내 환승 · 도보 약 ${leg.transferAfter}분</div>`;
      }
    });
    return html;
  }

  // 기본(운행 중인 노선만)일 때, 개통 예정 노선을 켜면 달라지는 점을 한 줄로 알린다.
  function openOnlyHintHtml(all) {
    const f = all.future;
    if (!f || !(f.unopenedLines || []).length) return '';
    const names = escapeHtml(f.unopenedLines.map(id => lineNameOf.get(id) || id).join(' · '));
    const how = `<span class="rc-oo-how">위 <b>개통 예정 노선 포함</b>을 켜면 개통 후 경로를 볼 수 있습니다.</span>`;
    if (!all.time) return `<div class="rc-oo-hint"><i data-ic="clock"></i> 개통 예정 <b>${names}</b> 개통 후에는 약 ${f.minutes}분 (지금은 갈 수 없음). ${how}</div>`;
    const saved = all.time.minutes - f.minutes;
    if (saved <= 0) return '';
    return `<div class="rc-oo-hint"><i data-ic="clock"></i> 개통 예정 <b>${names}</b> 개통 후에는 약 ${f.minutes}분 (${saved}분 단축 예상). ${how}</div>`;
  }

  // opts.includeUnopened: true 면 개통 예정 노선까지 쓴 경로(예전 동작), 아니면 운행 중인 노선만.
  function show(fromId, toId, opts) {
    ensureStyle();
    const box = document.getElementById('route-result');
    if (!box) return;
    const include = !!(opts && opts.includeUnopened);
    const all = include ? findAll(fromId, toId) : findAllOpen(fromId, toId);
    if (!all.time && !all.transfer && !all.fare) {
      // H10 (2026-11-14): 왜 못 가는지까지 — 이 지도에 그린 철도망 안에서 두 역이 이어지지 않는다(버스·배·지도에 없는 노선은 안 셈)
      const why = '<p class="rc-nr-why">이 지도에 그린 철도 노선만으로는 두 역이 이어지지 않습니다. ' +
        '버스·배·지도에 없는 노선은 계산하지 않습니다. 다른 역(예: 큰 환승역·KTX역)으로 바꿔 보세요.</p>';
      box.innerHTML = '<div class="rc-noroute"><b>' + (include ? '경로를 찾을 수 없습니다.' : '지금 운행 중인 노선으로는 갈 수 없습니다.') + '</b>' +
        why + (include ? '' : openOnlyHintHtml(all)) + '</div>';
      return false;
    }
    // 기본(운행 중만)에서는 '지금 vs 개통 후' 상자를 그리지 않는다 — 대신 한 줄 안내.
    const cmp = include ? compareNowFuture(fromId, toId, all) : { status: 'none' };
    const tabs = [
      // '최적' — 시간 + 갈아타는 부담(환승마다 몇 분 벌점)으로 고른 길. 표시 시간만 보면 다른 탭이 1~2분 빠를 수 있어
      // '최단시간' 이라 부르면 틀린 말이 된다 (홍대입구→강남: 최소요금 37분·환승 2 < 이 길 38분·환승 0, 2026-11-12)
      { id: 'time', label: '<i data-ic="zap"></i> 최적', r: all.time },
      // 개통 예정 노선을 안 쓰는 경로가 따로 있을 때만 '지금' 탭을 붙인다.
      // 늘 붙이면 최단시간 탭과 같은 내용이 두 번 나와 헷갈린다.
      ...(cmp.status === 'better' ? [{ id: 'now', label: '<i data-ic="clock"></i> 지금 바로', r: all.now }] : []),
      { id: 'transfer', label: '<i data-ic="repeat"></i> 최소환승', r: all.transfer },
      { id: 'fare', label: '<i data-ic="won"></i> 최소요금', r: all.fare },
    ].filter(t => t.r);

    // 인사이트: 각 기준의 장점 요약 (insightOf — 시험용으로 따로)
    const insight = insightOf(all);
    const fastId = fastestTabId(all);

    let html = include ? nowFutureHtml(cmp) : openOnlyHintHtml(all);
    html += `<div class="rc-tabs${tabs.length > 3 ? ' four' : ''}">` + tabs.map((t, i) =>
      `<button class="rc-tab${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}${t.id === fastId ? '<span class="rc-fast" title="표시 시간이 가장 짧은 길">최단</span>' : ''}</button>`).join('') + `</div>`;
    if (insight) html += `<div class="rc-insight">${insight}</div>`;
    html += tabs.map((t, i) => {
      const isBest =
        (t.id === 'now') ? '지금 이용 가능' :
        (t.id === 'time' && !fastId) ? '가장 빠름' :
        (t.id === fastId) ? '가장 빠름' :
        (t.id === 'transfer' && all.transfer && (!all.time || all.transfer.transfers < all.time.transfers)) ? '환승 최소' :
        (t.id === 'fare' && all.fare && all.time && all.fare.fare < all.time.fare) ? '요금 최소' : '';
      return `<div class="rc-panel" id="rc-panel-${t.id}"${i === 0 ? '' : ' hidden'}>${variantHtml(t.r, t.id, isBest)}</div>`;
    }).join('');
    box.innerHTML = html;
    if (!box.dataset.rcStBound) {
      box.dataset.rcStBound = '1';
      box.addEventListener('click', e => {
        const b = e.target.closest('.rc-st');
        if (!b || typeof window.showStation !== 'function' || typeof STATIONS === 'undefined') return;
        const s = STATIONS.find(x => x.properties.id === b.dataset.sid);
        if (s) window.showStation(s, s.geometry.coordinates);
      });
    }

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
    if (RF.extraLines) RF.extraLines().forEach(x => lineNameOf.set(x.id, x.name_ko));   // ITX-청춘 등 급행 계통
  }

  // 테스트에서 요금표를 직접 검증할 수 있도록 노출한다.
  // (UI 없이 calcFareOfRoute 만 호출하려면 legs 모양의 객체만 있으면 된다)
  return { init, findAll, findAllOpen, show, hide, calcFare, calcConvFare, calcKtxFare, calcFareOfRoute, calcFareDetail, loadKtxFares, loadSpecialFares, fareBreakdownHtml,
    // '지금 vs 개통 후' 비교 — UI 없이 검증할 수 있도록 노출
    compareNowFuture, nowFutureHtml, openOnlyHintHtml, insightOf, fastestTabId, pickCheapest,
    _debug: { findMinTransfer, findMinFare, buildLegs, markUnopened, enrich } };
})();
