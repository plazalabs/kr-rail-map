/* 노선 이름(name_ko)을 유일하게 만든다 → data/lines.geojson (D-10)
 *
 * 왜: 같은 이름 '서해선' 노선이 2개(광역전철 대곡~원시, 일반철도 화성시청~서화성)라
 *     검색·랭킹·노선 페이지에서 어느 쪽인지 알 수 없었다. 노선도 고르기는 이미 '(광역전철)'·'(일반철도)'를 붙여 구분했다.
 * 무엇: 아래 표의 id 는 name_ko 를 표의 값으로 쓴다. 표에 없는 노선은 건드리지 않는다.
 *       다 고친 뒤 이름이 겹치는 노선이 남으면 멈춘다.
 * 실행: node data/fix_line_names.js   (같은 값이면 바뀌는 것 없음)
 *       그다음 node data/build_rank.js · python build_pages.py
 */
'use strict';
const fs = require('fs');
const path = require('path');
const LP = path.join(__dirname, 'lines.geojson');

const NAMES = {
  'seoul-metropolitan-subway-seohae-line': '서해선(광역전철)',
  'seohae-line-conv': '서해선(일반철도)',
};

const doc = JSON.parse(fs.readFileSync(LP, 'utf8'));
const changed = [];
for (const f of doc.features) {
  const want = NAMES[f.properties.id];
  if (want && f.properties.name_ko !== want) {
    changed.push(`${f.properties.id}: ${f.properties.name_ko} → ${want}`);
    f.properties.name_ko = want;
  }
}
const seen = {};
for (const f of doc.features) (seen[f.properties.name_ko] ||= []).push(f.properties.id);
const dup = Object.entries(seen).filter(([, a]) => a.length > 1);
if (dup.length) {
  console.error('이름이 겹치는 노선이 남음:', dup.map(([n, a]) => `${n}: ${a.join(', ')}`).join(' / '));
  process.exit(1);
}
if (changed.length) {
  fs.writeFileSync(LP, JSON.stringify(doc));
  console.log('이름 바꿈\n- ' + changed.join('\n- '));
} else console.log('그대로');
