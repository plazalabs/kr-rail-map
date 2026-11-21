// 회귀(숙제 77): 개통 연도는 lines.geojson open_year 한 곳. 순위 자료·화면이 노선 설명 글(opened / rank.json o)에서 연도를 뽑지 않는다.
// 전: rank.html 카드에 GTX-G·H '2030년'(설명 '2030년대 목표'), GTX-A 평택 연장 '2028년'(설명 '2028년 착공 구상') — open_year 는 모두 null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const lines = JSON.parse(read('data/lines.geojson')).features.map(f => f.properties);
const byId = new Map(lines.map(p => [p.id, p]));
const rank = JSON.parse(read('data/rank.json'));

test('[R-77] rank.json 미개통 노선 y = lines.geojson open_year (null 포함)', () => {
  const bad = [];
  for (const [id, m] of Object.entries(rank.lines)) {
    if (m.s === 'open') continue;
    const p = byId.get(id);
    if (!p) continue;   // 정차 단계(삼성역 정차) — 아래 시험
    if (!('y' in m) || m.y !== (p.open_year == null ? null : +p.open_year)) bad.push(id + ' y=' + JSON.stringify(m.y) + ' open_year=' + JSON.stringify(p.open_year));
  }
  assert.deepEqual(bad, []);
});

test('[R-77] 정차 단계 y = year_stages 의 연도', () => {
  for (const [yr, ids] of Object.entries(rank.year_stages || {})) {
    for (const id of ids) if (rank.lines[id] && !byId.has(id)) assert.equal(rank.lines[id].y, +yr, id);
  }
});

test('[R-77] rank-top.json y = 그 노선의 rank.json y', () => {
  const top = JSON.parse(read('data/rank-top.json')).top;
  const nameToY = new Map(Object.values(rank.lines).map(m => [m.n, m.y]));
  for (const t of top) if (t.line) assert.equal(t.y, nameToY.get(t.line), t.n + ' ' + t.line);
});

test('[R-77] js/·data/build_rank.js 에서 노선 설명 글로 연도를 뽑는 곳 0', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['data/build_rank.js']);
  const yearRe = /yearOf\(|\\d\{4\}|20\\d|20\[0-9\]/;
  const textRe = /\.o\b|opened/;
  // timeline.js: 연도는 open_year, 설명 글은 같은 해일 때 '월'만 읽는다 (open_year 확인 뒤)
  const allow = l => /extractOpeningYear\(String\(p\.opened/.test(l);
  const hits = [];
  for (const f of files) read(f).split(/\r?\n/).forEach((l, i) => { if (yearRe.test(l) && textRe.test(l) && !allow(l)) hits.push(f + ':' + (i + 1) + ' ' + l.trim().slice(0, 120)); });
  assert.deepEqual(hits, []);
});
