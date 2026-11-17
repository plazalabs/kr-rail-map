// 회귀: 한 역 = 한 동네 목록.
// 개발(공급) 탭은 역이 걸친 동 전체 물량을 합치고, 어떤 동들인지 목록(dongs)으로 낸다.
// 시세 동 하나로 줄이면 역 옆 공급이 0세대로 숨는다 (모란·부발·공덕·합정이 그랬다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.env.KR_RAIL_ROOT || process.cwd(), 'data');
const load = n => JSON.parse(readFileSync(join(DATA, n), 'utf8'));
const dev = load('station-dev.json').stations;
const price = load('station-price.json').stations;

const CASES = {
  'st-5927397045': { name: '모란', must: ['성남동', '수진동'] },
  'st-5930638324': { name: '부발', must: ['부발읍'] },
  'st-6039313661': { name: '공덕', must: ['도화동', '공덕동'] },
  'st-5916874391': { name: '합정', must: ['서교동'] },
};

test('[REG dong-list] 여러 동에 걸친 역의 공급이 시세 동 하나로 줄어 0세대가 되지 않는다', () => {
  const bad = [];
  for (const [id, c] of Object.entries(CASES)) {
    const d = dev[id];
    if (!d) { bad.push(`${c.name}: 개발 자료 없음`); continue; }
    if (!(d.hh > 0)) bad.push(`${c.name}: ${d.hh}세대`);
    const names = (d.dongs || []).map(x => x.dong);
    for (const m of c.must) if (!names.includes(m)) bad.push(`${c.name}: 목록에 ${m} 없음 (${names.join('·') || '목록 없음'})`);
  }
  assert.deepEqual(bad, []);
});

test('[REG dong-list] 개발 목록의 동별 세대 합 = 역 합계, 대표 동은 시세 동', () => {
  const bad = [];
  for (const [id, d] of Object.entries(dev)) {
    if (!Array.isArray(d.dongs) || !d.dongs.length) { bad.push(`${id}: dongs 없음`); continue; }
    const sum = d.dongs.reduce((s, x) => s + x.hh, 0);
    if (sum !== d.hh) bad.push(`${id}: 동별 합 ${sum} ≠ ${d.hh}`);
    const p = price[id];
    if (p && (p.lawd !== d.lawd || p.dong !== d.dong)) bad.push(`${id}: 대표 동 ${d.dong} ≠ 시세 ${p.dong}`);
    if (d.dongs[0].lawd !== d.lawd || d.dongs[0].dong !== d.dong) {
      const p0 = p && d.dongs[0].lawd === p.lawd && p.dong.startsWith(d.dongs[0].dong + ' ');
      if (!p0) bad.push(`${id}: 목록 첫 동(${d.dongs[0].dong})이 대표 동(${d.dong})이 아님`);
    }
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length}건`);
});
