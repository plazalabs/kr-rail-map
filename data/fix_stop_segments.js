/* 노선 stops 를 운행 구간별로 나눈다 → data/lines.geojson
 *
 * 왜: 인접역은 stops 순서에서만 만든다 (CLAUDE.md 2장). 구간이 나뉜 노선(variants > 1)의 stops 가 한 줄이면
 *     운행하지 않는 두 역이 이웃이 된다 — 서울역 GTX-A 인접역이 '수서 ← 현재역 → 연신내'로 나왔다.
 *     또 KTX stops 에 역 이름이 아닌 '서울역'·'부산역'(역 이름은 '서울'·'부산')과 그 노선 역이 아닌 이름이 섞여 있었다.
 * 무엇: 아래 표의 노선은 stops 를 구간 배열 [[…],[…]] 로 쓴다(구간이 하나여도 variants > 1 이면 배열).
 *       표의 모든 이름은 그 노선 소속 역이어야 한다 — 아니면 멈춘다.
 *       stops 는 서울 쪽 끝에서 바깥쪽으로 적는다(역 상세의 '← 앞 역 · 다음 역 →' 방향).
 * 실행: node data/fix_stop_segments.js   (같은 값이면 바뀌는 것 없음)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const LP = path.join(__dirname, 'lines.geojson');
const SP = path.join(__dirname, 'stations.geojson');

const SEGMENTS = {
  // 운정중앙~서울역 · 수서~동탄 두 구간이 따로 운행 (서울역~수서 미개통 — gtx-a-seoul-suseo)
  'great-train-express-line-a': [
    ['운정중앙', '킨텍스', '대곡', '연신내', '서울'],
    ['수서', '성남', '구성', '동탄'],
  ],
  // 서울~부산 본선 · 서울~영등포(영등포 경유 열차, 그다음 수원은 이 노선 역이 아님). 서대구는 김천(구미)~동대구 사이 정차
  'gyeongbu-line-ktx': [
    ['서울', '광명', '천안아산', '오송', '대전', '김천(구미)', '서대구', '동대구', '경주', '울산', '부산'],
    ['서울', '영등포'],
  ],
  // 전라선 KTX 는 용산 출발 (서울은 이 노선 역이 아님)
  'ktx': [
    ['용산', '광명', '천안아산', '오송', '익산', '전주', '남원', '곡성', '구례구', '순천', '여수엑스포'],
  ],
  // 강릉선: 양평 → 서원주 → 만종 순 (서원주는 원강선 분기). 동해는 이 노선 역이 아님
  'gangneung-line-ktx': ['서울', '청량리', '양평', '서원주', '만종', '횡성', '평창', '진부', '강릉'],
  'ktx-jungbunaeryuk-line': [
    ['가남', '감곡장호원', '앙성온천', '충주', '살미', '수안보온천', '연풍', '문경'],
  ],
  'honam-line-ktx': [
    ['용산', '광명', '천안아산', '오송', '공주', '익산', '김제', '정읍', '광주송정', '나주', '목포'],
  ],
  // 구상안 — 본선(인천공항~원주) · 김포 갈래(장기~대장) · 동쪽 갈래(삼성~팔당). 한 줄로 적혀 원주→계양, 장기→잠실이 이웃이었다
  'gtx-d': [
    ['인천공항2터미널', '인천공항1터미널', '영종국제도시', '청라국제업무단지', '가정', '작전', '대장', '부천종합운동장', '광명시흥',
      '가산디지털단지', '신림', '사당', '강남', '삼성', '수서', '모란', '경기광주', '곤지암', '이천', '부발', '여주', '서원주', '원주'],
    ['장기', '신검단중앙', '계양', '대장'],
    ['삼성', '잠실', '강동', '교산', '팔당'],
  ],
};

const doc = JSON.parse(fs.readFileSync(LP, 'utf8'));
const st = JSON.parse(fs.readFileSync(SP, 'utf8')).features;
let changed = 0;
const bad = [];
for (const [lid, want] of Object.entries(SEGMENTS)) {
  const f = doc.features.find(x => x.properties.id === lid);
  if (!f) { bad.push(lid + ': 노선 없음'); continue; }
  const onLine = new Set(st.filter(s => (s.properties.lines || []).includes(lid)).map(s => s.properties.name_ko));
  const names = Array.isArray(want[0]) ? want.flat() : want;
  for (const n of names) if (!onLine.has(n)) bad.push(`${f.properties.name_ko}: "${n}" 는 이 노선 역이 아님`);
  if ((f.properties.variants || 1) > 1 && !Array.isArray(want[0])) bad.push(`${f.properties.name_ko}: variants>1 인데 구간 배열이 아님`);
  if (JSON.stringify(f.properties.stops) !== JSON.stringify(want)) { f.properties.stops = want; changed++; }
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
if (changed) fs.writeFileSync(LP, JSON.stringify(doc));
console.log('stops 구간 정리: 바꾼 노선', changed, '/', Object.keys(SEGMENTS).length);
