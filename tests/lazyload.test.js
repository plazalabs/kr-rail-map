/* 출구 지연 로딩·상세 JSON 압축 회귀 시험 (IMPL12 건 4)
 * 실행: node tests/lazyload.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : detail}`); }
}
const app = read('js/app.js');
const sa = read('js/station-area.js');

console.log('[출구] 첫 화면에서 받지 않음');
const a = app.indexOf('const extra = [];'), z = app.indexOf('return Promise.all(extra);', a);
check('첫 화면(dataPromise) 구간에 exits.geojson 로드 없음', a > 0 && z > a && !/StationExits\.load|exits\.geojson'\)/.test(app.slice(a, z).replace(/\/\/.*$/gm, '')));
check('loadExits() 가 한 번만 받음 (exitsRequested)', /function loadExits\(\) \{\s*if \(exitsRequested/.test(app) && /StationExits\.load\('data\/exits\.geojson'\)/.test(app));
check('출구 표시 줌(16) 직전(15.5)에 받기 시작', /EXITS_PRELOAD_ZOOM = 15\.5/.test(app) && /map\.on\('zoomend', exitsByZoom\)/.test(app));
check('역 상세·투자분석(loadDetailData)에서 받음, 쉬는 동안 미리 받기(prefetch)는 제외',
  /if \(!\(opts && opts\.prefetch\)\) loadExits\(\);\s*loadInvestData\(\);[^\n]*\n\s*if \(detailDataRequested\) return;/.test(app) && /loadDetailData\(\{ prefetch: true \}\)/.test(app));
check('도착하면 출구 레이어 추가 + 열린 패널·결과 다시 그림', /then\(\(\) => \{\s*addExitLayers\(\);/.test(app) && /StationDetail\.refresh\(\)/.test(app));
check('역세권을 켜면 출구를 받음 (KR_loadExits)', /window\.KR_loadExits = loadExits/.test(app) && /window\.KR_loadExits\(\)/.test(sa));

console.log('\n[상세 JSON] 압축 저장');
for (const f of ['data/station-price.json', 'data/station-complex.json', 'data/station-dev.json']) {
  const s = read(f);
  check(`${f} 공백 없이 저장 (줄바꿈 들여쓰기 없음)`, !/\n\s+"/.test(s.slice(0, 20000)), (s.length / 1024).toFixed(0) + 'KB');
}
check('시세 생성 스크립트가 압축 저장 (재생성해도 유지)', /separators=\(",", ":"\)/.test(read('data/build_station_price.py')) && !/indent=1/.test(read('data/build_station_price.py')));

// 2026-11-12 첫 화면 속도 — 노선은 배경 지도 '설계도'가 오면 바로 그린다 (map 'load' 를 기다리면 6~9초)
{
  const idx = read('index.html');
  check('노선·역 자료를 HTML 에서 미리 받기 (preload, crossorigin)',
    /<link rel="preload" href="data\/lines\.geojson" as="fetch" crossorigin>/.test(idx) &&
    /<link rel="preload" href="data\/stations\.geojson" as="fetch" crossorigin>/.test(idx));
  check("첫 준비는 style.load + 자료 (map 'load' 를 기다리지 않음)",
    /Promise\.all\(\[styleReadyP, dataPromise\]\)/.test(app) && !/map\.on\('load', async/.test(app));
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
