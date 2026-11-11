/* GTX-A 창릉역 추가 (2026-11-12) — 한 번 돌리는 자료 정리 스크립트
 *
 * 창릉역: 고양 창릉신도시, 덕양구 용두동 761-23(화랑교차로 일대) — 2021년 8월 신설 승인(LH 비용 부담),
 * 개통 2030년 예정(LH 광역교통개선대책 변경). 출처: 고양신문.
 * 지금 운행하는 GTX-A 는 창릉에 서지 않으므로 '지금' 길찾기에 넣으면 안 된다.
 * 그래서 삼성 정차(gtx-a-seoul-suseo)처럼 '대곡~창릉~연신내' 를 따로 계획 노선(gtx-a-changneung)으로 두고,
 * route.js THROUGH 로 GTX-A 와 같은 열차(갈아타기 아님)로 묶는다.
 *
 * 역 좌표: OSM '화랑교차로'(37.62229, 126.87980)에서 GTX-A 선형 위 가장 가까운 점 — 역 위치 미확정(근사).
 * 실행: node data/add_changneung.js   (이미 있으면 아무것도 안 한다)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LP = path.join(ROOT, 'data/lines.geojson'), SP = path.join(ROOT, 'data/stations.geojson');
const lines = JSON.parse(fs.readFileSync(LP, 'utf8'));
const stations = JSON.parse(fs.readFileSync(SP, 'utf8'));
if (lines.features.some(f => f.properties.id === 'gtx-a-changneung')) { console.log('이미 있음'); process.exit(0); }

const A = lines.features.find(f => f.properties.id === 'great-train-express-line-a');
const parts = A.geometry.type === 'LineString' ? [A.geometry.coordinates] : A.geometry.coordinates;
const byName = n => stations.features.filter(f => f.properties.name_ko === n && f.properties.lines.includes('great-train-express-line-a'))[0];
const daegok = byName('대곡'), yeonsin = byName('연신내');
const HWARANG = [126.8798019, 37.6222907];

// 선형 위 투영 (평면 근사 — 수 km 구간이라 충분)
const k = Math.cos(37.63 * Math.PI / 180);
function proj(p) {
  let best = null;
  parts.forEach((c, pi) => {
    for (let i = 0; i < c.length - 1; i++) {
      const [ax, ay] = c[i], [bx, by] = c[i + 1];
      const dx = (bx - ax) * k, dy = by - ay, px = (p[0] - ax) * k, py = p[1] - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / ((dx * dx + dy * dy) || 1)));
      const q = [ax + (bx - ax) * t, ay + (by - ay) * t];
      const d = Math.hypot((p[0] - q[0]) * k, p[1] - q[1]) * 111;
      if (!best || d < best.d) best = { d, pi, i, t, q };
    }
  });
  return best;
}
const pd = proj(daegok.geometry.coordinates), py = proj(yeonsin.geometry.coordinates), pc = proj(HWARANG);
if (pd.pi !== py.pi || pc.pi !== pd.pi) throw new Error('대곡·창릉·연신내가 같은 선형 조각 위에 없다');
const [s, e] = pd.i <= py.i ? [pd, py] : [py, pd];
const c = parts[pd.pi];
const seg = [s.q].concat(c.slice(s.i + 1, e.i + 1)).concat([e.q]).map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
if (pd.i > py.i) seg.reverse();
const at = [+pc.q[0].toFixed(5), +pc.q[1].toFixed(5)];
console.log(`창릉 좌표 ${at} (화랑교차로에서 ${(pc.d * 1000).toFixed(0)}m), 대곡 투영 ${(pd.d * 1000).toFixed(0)}m, 연신내 ${(py.d * 1000).toFixed(0)}m, 선형 점 ${seg.length}개`);

const line = {
  type: 'Feature',
  properties: {
    id: 'gtx-a-changneung', name_ko: 'GTX-A 창릉 정차', name_en: 'GTX-A Changneung stop',
    status: 'planned', variants: 1,
    note: '계획 — 운행 중인 GTX-A 선로(대곡~연신내)에 창릉역을 새로 짓는다. 2021년 8월 신설 승인(LH 비용 부담), 개통 2030년 예정. ' +
      "'지금' 길찾기는 창릉에 서지 않고, '개통 후' 만 정차한다 · 선형: GTX-A 선로(OpenStreetMap, ODbL)를 그대로 씀 — 역 위치는 발표 주소(화랑교차로 일대) 근사",
    opened: '2030년 예정', stops: ['대곡', '창릉', '연신내'],
    stops_source: 'LH·국토교통부 발표 기준 자체 정리 (고양신문 보도)',
    color: A.properties.color, category: 'urban', provisional: true,
    plan_source: '국가·지자체 계획 발표', operator: '-', coord_source: 'osm', coord_method: 'own-align',
  },
  geometry: { type: 'LineString', coordinates: seg },
};
// GTX-A 바로 뒤에 넣는다 (목록에서 같이 보이게)
const ai = lines.features.indexOf(A);
lines.features.splice(ai + 1, 0, line);
stations.features.push({
  type: 'Feature', geometry: { type: 'Point', coordinates: at },
  properties: {
    id: 'st-gtx-a-changneung', name_ko: '창릉', name_en: 'Changneung', line_id: 'gtx-a-changneung', lines: ['gtx-a-changneung'],
    source: '계획 발표 기준 자체 정리',
    coord_source: '지명 위치: 덕양구 용두동 761-23 화랑교차로 일대(고양신문) → GTX-A 선형 위 가장 가까운 점 (OpenStreetMap) — 역 위치 미확정',
  },
});
// 대곡·연신내 역에도 이 계획 노선을 붙인다 (역 상세·노선 목록에서 보이게)
for (const st of [daegok, yeonsin]) if (!st.properties.lines.includes('gtx-a-changneung')) st.properties.lines.push('gtx-a-changneung');

// 원래 파일 형식(한 줄 JSON) 그대로
fs.writeFileSync(LP, JSON.stringify(lines));
fs.writeFileSync(SP, JSON.stringify(stations));
console.log(`노선 ${lines.features.length}개, 역 ${stations.features.length}개`);
