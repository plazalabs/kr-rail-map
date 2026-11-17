/* stations.geojson 에 '역 수'의 정의를 적는다 (D-04)
 *
 * 역 = stations.geojson 의 feature 1개(id 기준). 같은 이름이라도 도시가 다르면 다른 역이다.
 * 이름 기준 개수(예: 1,208)는 화면에 쓰지 않는다 — 헤더·상태줄·철도망 통계·역 상세 각주가 모두 id 개수를 쓴다.
 * 순위(rank.json)는 그중 철도로 거점에 닿는 역만 매기고, 나머지는 access.json excluded 에 이유와 함께 둔다.
 * 실행: node data/set_count_definition.js   (같은 값이면 바뀌는 것 없음)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'stations.geojson');
const DEF = {
  unit: 'id',
  note: '역 = feature 1개(id). 같은 이름이라도 도시가 다르면 다른 역. 이름 기준 개수는 화면에 쓰지 않는다. 순위 밖 역은 access.json excluded.',
};
const doc = JSON.parse(fs.readFileSync(P, 'utf8'));
if (JSON.stringify(doc.count_definition) !== JSON.stringify(DEF)) {
  // type 다음에 두어 파일 앞에서 바로 보이게
  const out = { type: doc.type, count_definition: DEF, features: doc.features };
  fs.writeFileSync(P, JSON.stringify(out));
  console.log('count_definition 적음 · 역', doc.features.length);
} else console.log('그대로 · 역', doc.features.length);
