/* RAIL MARKET MAP 계산 시험 — 타일 배치(squarify)·묶기·색 (js/market-map.js Logic)
 * 실행: node tests/market-map.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const RT = require(path.join(ROOT, 'js/rank.js'));
const MM = require(path.join(ROOT, 'js/market-map.js'));
const L = MM.Logic;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rank.json'), 'utf8'));

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)}`); }
}
const area = r => r.w * r.h;
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

console.log('\n[squarify] 넓이 비례 · 판 안 · 겹침 없음');
{
  const vals = [6, 6, 4, 3, 2, 2, 1];
  const rs = L.squarify(vals, 0, 0, 600, 400);
  const tot = vals.reduce((a, b) => a + b, 0);
  check('넓이가 값에 비례 (오차 0.5%)', rs.every((r, i) => Math.abs(area(r) - vals[i] / tot * 240000) < 1200), rs.map(area));
  check('모두 판 안', rs.every(r => r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= 600 + 1e-6 && r.y + r.h <= 400 + 1e-6));
  let ov = 0; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) ov += overlap(rs[i], rs[j]);
  check('겹침 0', ov < 1e-6, ov);
  const worstRatio = Math.max(...rs.map(r => Math.max(r.w / r.h, r.h / r.w)));
  check('찌그러짐(가로세로비) 4 이하', worstRatio <= 4, worstRatio);
  check('값 0·빈 목록 안전', L.squarify([], 0, 0, 10, 10).length === 0 && L.squarify([0, 0], 0, 0, 10, 10).every(r => r.w === 0));
}

console.log('\n[묶기·색] 실제 rank.json');
{
  const out = RT.compute(doc, { weight: 'avg', region: 'capital' });
  const m = L.build(out.rows, doc.lines, { group: 'line', size: 'equal', color: 'gain', scope: 'affected' }, RT.tierOf);
  const names = m.groups.map(g => g.name);
  check('GTX-A·B·C 묶음이 있다', ['GTX-A', 'GTX-B', 'GTX-C'].every(n => names.includes(n)), names);
  check('GTX 묶음이 앞에 (A가 맨 앞)', names[0] === 'GTX-A', names.slice(0, 4));
  check("'변화 없음' 은 기본(영향 받는 역만)에서 빠짐", !names.includes(L.NONE), names);
  const gk = m.groups.find(g => g.name === 'GTX-C');
  const kwang = gk && gk.tiles.find(t => t.row.name === '광운대');
  check('광운대는 GTX-C 묶음', !!kwang);
  check('광운대 색 = 빨라지는 분 구간과 같음', kwang && kwang.color === L.colorOf(kwang.row, 'gain'), kwang && kwang.gain);
  const all = L.build(out.rows, doc.lines, { group: 'line', scope: 'all' }, RT.tierOf);
  check('전체 보기 타일 수 = 순위 역 수', all.total === out.rows.length, [all.total, out.rows.length]);
  check('영향 받는 역 < 전체', m.total < all.total && m.total > 100, [m.total, all.total]);
  const nw = L.build(out.rows, doc.lines, { group: 'line' }, RT.tierOf);
  check('기본(새 노선이 서는 역만): 환승으로 빨라지는 역·변화 없음 묶음 없음, 100역 안팎', !nw.groups.some(g => g.name === L.NO_NEW || g.name === L.NONE) && nw.total > 60 && nw.total < 250, [nw.total, nw.groups.map(g => g.name)]);
  // 색 구간 고정: 같은 개선 분은 언제나 같은 색
  const fake = g => ({ isNew: false, now: { min: 40 }, aft: { min: 40 - g } });
  check('개선 0분 → 회색 g0, 12분 → g3, 35분 → g5', L.colorOf(fake(0), 'gain').key === 'g0' && L.colorOf(fake(12), 'gain').key === 'g3' && L.colorOf(fake(35), 'gain').key === 'g5');
  check('신규 역 → 보라(신규), 자료 없음 → 빗금', L.colorOf({ isNew: true, now: {}, aft: {} }, 'gain').key === 'new' && L.colorOf({ isNew: false, now: { min: null }, aft: { min: 3 } }, 'gain').hatch === true);
  const tierM = L.build(out.rows, doc.lines, { color: 'tier' }, RT.tierOf);
  const anyRocket = tierM.groups.some(g => g.tiles.some(t => t.color.key === 'rocket'));
  check('순위 변화 색: 떡상 타일이 있다', anyRocket);
  const sgg = L.build(out.rows, doc.lines, { group: 'sgg', scope: 'all' }, RT.tierOf);
  check('시군구 묶기: 묶음 30개 넘음, 타일 = 전체', sgg.groups.length > 30 && sgg.total === out.rows.length, sgg.groups.length);
  // 연도: 2027 에는 GTX-B(2031)가 아직 없다 → GTX-B 역의 개선 분이 전체 보기보다 작거나 같다
  const y27 = RT.compute(doc, { weight: 'avg', region: 'capital', at: '2027' });
  const b27 = L.build(y27.rows, doc.lines, { group: 'line' }, RT.tierOf).groups.find(g => g.name === 'GTX-B');
  const bAll = m.groups.find(g => g.name === 'GTX-B');
  const sum = G => G ? G.tiles.reduce((s, t) => s + (t.gain || 0), 0) : 0;
  check('2027년 가정: GTX-B 묶음 개선 분 합 < 전체 가정', sum(b27) < sum(bAll), [sum(b27), sum(bAll)]);
  // 크기: 거래 건수
  const dm = L.build(out.rows, doc.lines, { size: 'deals', sizeOf: id => (id.length % 7) * 10 }, RT.tierOf);
  const t0 = dm.groups[0].tiles;
  check('크기=거래 건수: 값 0 은 크기 1 + sizeMissing', dm.groups.every(g => g.tiles.every(t => (t.v === 1) === t.sizeMissing || t.v > 1)));
  check('묶음 안 타일은 큰 것부터', t0.every((t, i) => i === 0 || t0[i - 1].v >= t.v));
  // 배치 전체
  L.layout(m, 900, 600, 18);
  const tiles = m.groups.flatMap(g => g.tiles);
  check('배치: 모든 타일이 자기 묶음 상자 안', m.groups.every(g => g.tiles.every(t => t.rect.x >= g.rect.x - 1e-6 && t.rect.y >= g.rect.y - 1e-6 && t.rect.x + t.rect.w <= g.rect.x + g.rect.w + 1e-6 && t.rect.y + t.rect.h <= g.rect.y + g.rect.h + 1e-6)));
  check('배치: 타일 넓이 모두 0보다 큼', tiles.every(t => t.rect.w > 0 && t.rect.h > 0));
}

console.log('\n[색 대비] 타일 글자');
{
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const pairs = L.GAIN_BINS.concat(L.JEONSE_BINS, L.PRICE_BINS).map(b => [b.key, b.bg, b.fg]).concat(Object.entries(L.TIER_COLORS).map(([k, c]) => [k, c.bg, c.fg]), [['new', L.NEW_COLOR.bg, L.NEW_COLOR.fg], ['na', L.NA_COLOR.bg, L.NA_COLOR.fg]]);
  const low = pairs.map(p => [p[0], Math.round(ratio(p[1], p[2]) * 100) / 100]).filter(p => p[1] < 4.5);
  check('타일 바탕·글자 대비 모두 4.5 이상', low.length === 0, low);
}

console.log('\n[투자 색] 전세가율·평당가 — 고정 구간, 자료 없음은 빗금');
{
  const row = { id: 'x', isNew: false, now: { min: 30 }, aft: { min: 20 } };
  check('전세가율 82% → 주의 색(j4)', L.colorOf(row, 'jeonse', null, () => 0.82).key === 'j4');
  check('전세가율 55% → j1', L.colorOf(row, 'jeonse', null, () => 0.55).key === 'j1');
  check('평당가 5,000만 → p3', L.colorOf(row, 'price', null, () => 5000).key === 'p3');
  check('값 없음 → 빗금(자료 없음)', L.colorOf(row, 'price', null, () => null).hatch === true);
}

console.log('\n[산점도 H1] 고정 기간·5건 미만 제외·신규 제외·사분면');
{
  const mk = (id, gain, isNew) => ({ row: { id, name: id, isNew: !!isNew }, gain, color: {} });
  const tr = { a: { dong: 'x', s: [['2024H1', 1000, 10], ['2026H1', 1200, 12]] },
    b: { dong: 'y', s: [['2024H1', 1000, 10], ['2026H1', null, 3]] },      // 끝 반기 5건 미만 → 제외
    c: { dong: 'z', s: [['2023H1', 500, 9], ['2026H1', 900, 9]] },           // 시작 반기 없음 → 제외(기간 고정)
    d: { dong: 'w', s: [['2024H1', 2000, 8], ['2026H1', 1900, 8]] } };
  const sc = L.scatterPoints([mk('a', 12), mk('b', 3), mk('c', 7), mk('d', 2), mk('n', null, true)], id => tr[id] || null);
  check('점 2개(a·d)', sc.pts.length === 2 && sc.pts.map(p => p.id).join() === 'a,d', sc.pts.map(p => p.id));
  check('가격 부족 2 · 신규 1 제외 수', sc.noPrice === 2 && sc.isNew === 1, sc);
  check('a 변화 +20%, d −5%', sc.pts[0].y === 20 && sc.pts[1].y === -5, sc.pts.map(p => p.y));
  check('중앙값 7.5 · 기간 2024H1→2026H1', sc.med === 7.5 && sc.from === '2024H1' && sc.to === '2026H1', sc.med);
  check('a = 개선 큼+가격 큼, d = 개선 작음+가격 작음', sc.pts[0].q === 'hiHi' && sc.pts[1].q === 'loLo');
  check("사분면 이름에 '저평가'·'매수' 없음", Object.values(L.QUAD_LABEL).every(s => !/저평가|매수|추천|떡상 확률/.test(s)));
  // 실자료: 수도권 행이 가격 흐름과 이어져 수백 역이 찍힌다
  const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/station-trend.json'), 'utf8'));
  const out = RT.compute(doc, { weight: 'avg', region: 'capital' });
  const m = L.build(out.rows, doc.lines, { group: 'line', size: 'equal', color: 'gain', scope: 'all' }, RT.tierOf);
  const tiles = []; m.groups.forEach(G => G.tiles.forEach(t => tiles.push(t)));
  const real = L.scatterPoints(tiles, id => T.stations[id] || null);
  check('실자료 점 300개 이상', real.pts.length >= 300, real.pts.length);
  check('실자료 사분면 합 = 점 수', Object.values(real.q).reduce((a, b) => a + b, 0) === real.pts.length, real.q);
}

console.log('\n[노선×빨라짐 구간 H8] 칸 = 역 수, 합 = 묶음 역 수');
{
  const mk = (gain, isNew) => ({ row: { isNew: !!isNew }, gain });
  check('구간 경계: 0→b0, 4.9→b1, 5→b2, 10→b3, 20→b4, 신규→bn', [mk(0), mk(4.9), mk(5), mk(10), mk(20), mk(null, true)].map(L.bandOf).join() === 'b0,b1,b2,b3,b4,bn');
  const out = RT.compute(doc, { weight: 'avg', region: 'capital' });
  const m = L.build(out.rows, doc.lines, { group: 'line', size: 'equal', color: 'gain', scope: 'new' }, RT.tierOf);
  const M = L.bandMatrix(m.groups);
  check('행 수 = 묶음 수', M.length === m.groups.length, M.length);
  const sums = M.map(r => Object.values(r.c).reduce((a, b) => a + b, 0) === r.n);
  check('행마다 칸 합 = 그 묶음 역 수 (빠지는 역 없음)', sums.every(Boolean), M.map(r => [r.name, r.n, r.c]));
  check('GTX-A 행에 20분+ 칸이 있음', (M.find(r => r.name === 'GTX-A') || { c: {} }).c.b4 > 0, M.find(r => r.name === 'GTX-A'));
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
