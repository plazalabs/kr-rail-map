/* GTX 역간 소요시간 자체 산출 — 실행: node data/build_gtx_times.js
 * 결과(역간 분)를 보여 주고 data/_gtx_own.json 에 남긴다. js/route.js GTX_TIMES 는 이 값(소수 첫째 자리)이다.
 * AG 는 예전(2026-11-11까지) 사이트 값 — 바뀐 폭을 보려고만 둔다. */
// GTX 역간 시간 자체 산출: 국토부 발표 구간 시간 + 우리 선형 거리
// 모델: 구간 시간 T = a × (거리 합) + b × (역간 수)  ← 6개 발표 구간으로 a, b 를 최소제곱 추정
// 그 다음 발표 구간 안에서는 (거리 + b/a) 비율로 나눠 합계를 발표값과 정확히 맞춘다.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = require('path').join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const stations = read('data/stations.geojson').features;
const lines = read('data/lines.geojson').features;
const byName = new Map();
stations.forEach(f => { (byName.get(f.properties.name_ko) || byName.set(f.properties.name_ko, []).get(f.properties.name_ko)).push(f); });
const alias = { '서울역': '서울', '과천청사': '정부과천청사' };

// 선형 위 거리: 그 노선 선형(MultiLineString)에 두 역을 투영해 선을 따라 잰 길이
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b[1] - a[1]) * r / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin((b[0] - a[0]) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
function chainOf(lineIds) {
  const parts = [];
  lines.filter(l => lineIds.includes(l.properties.id)).forEach(l => {
    const g = l.geometry; (g.type === 'LineString' ? [g.coordinates] : g.coordinates).forEach(c => parts.push(c));
  });
  return parts;
}
function project(parts, p) { // 가장 가까운 조각·누적거리
  let best = null;
  parts.forEach((c, pi) => {
    let acc = 0;
    for (let i = 0; i < c.length - 1; i++) {
      const seg = hav(c[i], c[i + 1]);
      // 선분 위 최근접 (평면 근사)
      const ax = c[i][0], ay = c[i][1], bx = c[i + 1][0], by = c[i + 1][1];
      const k = Math.cos(ay * Math.PI / 180);
      const dx = (bx - ax) * k, dy = by - ay, px = (p[0] - ax) * k, py = p[1] - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / ((dx * dx + dy * dy) || 1)));
      const q = [ax + (bx - ax) * t, ay + (by - ay) * t];
      const d = hav(p, q);
      if (!best || d < best.d) best = { d, pi, s: acc + seg * t };
      acc += seg;
    }
  });
  return best;
}
const LINES = {
  A: { ids: ['great-train-express-line-a', 'gtx-a-seoul-suseo'], st: ['운정중앙','킨텍스','대곡','연신내','서울역','삼성','수서','성남','구성','동탄'] },
  B: { ids: ['gtx-b'], st: ['인천대입구','인천시청','부평','부천종합운동장','신도림','여의도','용산','서울역','청량리','상봉','별내','왕숙','평내호평','마석'] },
  C: { ids: ['gtx-c'], st: ['덕정','의정부','창동','광운대','청량리','왕십리','삼성','양재','과천청사','인덕원','금정','의왕','수원'] },
};
function stationPt(name, parts) {
  const c = byName.get(alias[name] || name) || [];
  let best = null;
  c.forEach(f => { const pr = project(parts, f.geometry.coordinates); if (!best || pr.d < best.d) best = Object.assign({ f }, pr); });
  return best;
}
const KM = {};
for (const [k, L] of Object.entries(LINES)) {
  const parts = chainOf(L.ids);
  const pts = L.st.map(n => stationPt(n, parts));
  KM[k] = L.st.slice(1).map((n, i) => {
    const a = pts[i], b = pts[i + 1];
    // 같은 조각 위면 선을 따라, 아니면 직선 × 1.08
    const along = (a && b && a.pi === b.pi && a.d < 0.6 && b.d < 0.6) ? Math.abs(b.s - a.s) : null;
    const straight = hav(a.f.geometry.coordinates, b.f.geometry.coordinates);
    return { km: along != null && along > straight * 0.98 && along < straight * 1.6 ? along : straight * 1.08, how: along != null ? '선형' : '직선×1.08' };
  });
}
// 국토부 발표 (언론 인용) — [노선, 시작, 끝, 분, 출처]
const OFFICIAL = [
  ['A', '운정중앙', '서울역', 20, '국토부: 운정~서울역 20분 (SBS Biz)'],
  ['A', '수서', '동탄', 19, '국토부: 수서~동탄 19분'],
  ['B', '인천대입구', '서울역', 30, '국토부 2022.3: 인천대입구→서울역 약 30분'],
  ['B', '서울역', '마석', 27, '국토부 2022.3: 마석→서울역 약 27분'],
  ['C', '덕정', '삼성', 27, '국토부 2020: 덕정~삼성 27분'],
  ['C', '삼성', '수원', 26, '국토부 2020: 수원~삼성 26분'],
  ['C', '광운대', '삼성', 9, '노원구 GTX-C 착공식(2024-04-16 뉴스핌): 광운대~삼성 9분, 광운대~수원 33분'],
];
// 최소제곱: T = a·D + b·n
let sDD = 0, sDn = 0, snn = 0, sDT = 0, snT = 0;
const spans = OFFICIAL.map(([k, a, b, T]) => {
  const st = LINES[k].st, i = st.indexOf(a), j = st.indexOf(b);
  const D = KM[k].slice(i, j).reduce((x, y) => x + y.km, 0), n = j - i;
  sDD += D * D; sDn += D * n; snn += n * n; sDT += D * T; snT += n * T;
  return { k, i, j, D, n, T };
});
const det = sDD * snn - sDn * sDn;
const a = (sDT * snn - snT * sDn) / det, b = (snT * sDD - sDT * sDn) / det;
console.log(`a = ${a.toFixed(3)}분/km (${(60 / a).toFixed(0)}km/h 순수 주행), b = ${b.toFixed(2)}분/역 (정차·가감속)`);
spans.forEach(s => console.log(`  ${s.k} ${LINES[s.k].st[s.i]}→${LINES[s.k].st[s.j]} ${s.D.toFixed(1)}km ${s.n}구간 발표 ${s.T} 모델 ${(a * s.D + b * s.n).toFixed(1)}`));
// 나누기
const OUT = {};
for (const k of Object.keys(LINES)) {
  const segs = KM[k];
  const t = segs.map(s => a * s.km + b);   // 발표 구간 밖(A 서울역~수서)은 모델값
  // 짧은 발표 구간부터 고정한다 (광운대~삼성 9분이 덕정~삼성 27분 안에 들어 있다 — 안쪽을 먼저 맞추고 바깥은 남은 역간만 늘리거나 줄인다)
  const fixed = new Set();
  spans.filter(s => s.k === k).sort((x, y) => (x.j - x.i) - (y.j - y.i)).forEach(s => {
    let fx = 0, free = 0;
    for (let q = s.i; q < s.j; q++) { if (fixed.has(q)) fx += t[q]; else free += t[q]; }
    for (let q = s.i; q < s.j; q++) if (!fixed.has(q)) { t[q] = t[q] * (s.T - fx) / free; fixed.add(q); }
  });
  OUT[k] = t;
}
const AG = { A: [4,5,7,6,6,3,7,7,7], B: [6,4,5,5,4,3,3,5,4,5,4,5,5], C: [9,8,3,4,3,2,3,5,3,4,6,6] };
let maxd = 0, n1 = 0, tot = 0;
for (const k of Object.keys(LINES)) {
  console.log(`\nGTX-${k}`);
  LINES[k].st.slice(1).forEach((nm, i) => {
    const v = OUT[k][i], d = Math.round(v * 2) / 2 - AG[k][i];
    maxd = Math.max(maxd, Math.abs(d)); tot++; if (Math.abs(v - AG[k][i]) <= 1) n1++;
    console.log(`  ${LINES[k].st[i]}→${nm}  ${KM[k][i].km.toFixed(1)}km(${KM[k][i].how})  우리 ${v.toFixed(1)}  예전 ${AG[k][i]}`);
  });
}
console.log(`\n역간 ${tot}개 중 ±1분 안 ${n1}개, 최대 차이 ${maxd}분`);
// 주요 구간
const sumv = (k, x, y) => { const st = LINES[k].st, i = st.indexOf(x), j = st.indexOf(y); return OUT[k].slice(Math.min(i, j), Math.max(i, j)).reduce((p, q) => p + q, 0); };
console.log('광운대→청량리', sumv('C', '광운대', '청량리').toFixed(1), '청량리→서울역', sumv('B', '청량리', '서울역').toFixed(1), '청량리→여의도', sumv('B', '청량리', '여의도').toFixed(1), '광운대→삼성', sumv('C', '광운대', '삼성').toFixed(1));
if (process.argv.includes('--json')) fs.writeFileSync(path.join(ROOT, 'data/_gtx_own.json'), JSON.stringify({ a, b, OUT, KM, OFFICIAL }, null, 1));
