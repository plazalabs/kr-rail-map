// 회귀: 한 역 = 한 동네 목록 (실거래 7종).
// 7종은 그 역 동네 목록(station-dev.json 의 dongs) 안의 동만 쓴다. 리는 속한 읍·면과 같은 동네로 본다.
// 인천 28125 는 옛 동구와 옛 중구 원도심이 한 코드라, 7종만 이름표를 '동구'로 달면 인천역이 시세(중구 북성동1가)와 다른 동처럼 보였다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.env.KR_RAIL_ROOT || process.cwd(), 'data');
const load = n => JSON.parse(readFileSync(join(DATA, n), 'utf8'));
const market = load('station-market.json').stations;
const dev = load('station-dev.json').stations;
const price = load('station-price.json').stations;
const nameOf = Object.fromEntries(load('stations.geojson').features.map(f => [f.properties.id, f.properties.name_ko]));

// 역의 동네 목록. 개발 자료가 없으면 시세 동 하나가 목록이다.
function listOf(id) {
  const d = dev[id];
  if (d && Array.isArray(d.dongs) && d.dongs.length) return d.dongs.map(x => ({ sgg: x.sgg, dong: x.dong }));
  const p = price[id];
  return p ? [{ sgg: p.sgg, dong: p.dong }] : [];
}
const inside = (list, sgg, dong) => list.some(x => x.sgg === sgg && (x.dong === dong || dong.startsWith(x.dong + ' ')));

test('[R-market-dong] 실거래 7종의 동은 그 역 동네 목록 안에 있다', () => {
  const bad = [];
  for (const [id, kinds] of Object.entries(market)) {
    const list = listOf(id);
    for (const [k, c] of Object.entries(kinds)) {
      if (!list.length) { bad.push(`${nameOf[id] || id} ${k}: 동네 목록 없음인데 ${c.sgg} ${c.d}`); continue; }
      if (!inside(list, c.sgg, c.d)) bad.push(`${nameOf[id] || id} ${k}: ${c.sgg} ${c.d} (목록: ${list.map(x => x.sgg + ' ' + x.dong).join('·')})`);
    }
  }
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length}건`);
});

test('[R-market-dong] 인천·동인천 7종 이름표는 시세와 같은 중구', () => {
  const bad = [];
  for (const [id, kinds] of Object.entries(market)) {
    if (!['인천', '동인천'].includes(nameOf[id])) continue;
    for (const [k, c] of Object.entries(kinds)) if (c.sgg !== '중구' && !String(c.sgg).endsWith(' 중구')) bad.push(`${nameOf[id]} ${k}: ${c.sgg} ${c.d}`);
  }
  assert.deepEqual(bad, []);
});
