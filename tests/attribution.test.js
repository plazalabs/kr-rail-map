/* 출처 표기 — 실제 데이터 출처와 화면에 적힌 문구가 일치하는지
 *
 * 예전에는 72개 노선 페이지 전부가 '노선·역 데이터 © OpenStreetMap contributors
 * (ODbL)' 이라고 적혀 있었다. 사실이 아니었다. 노선·역 데이터는 미래철도DB와
 * 철도맘을 참고해 만든 것이고, OSM 에서 온 것은 출구 좌표뿐이다.
 *
 * 잘못된 출처 표기는 두 가지로 문제가 된다.
 *  1. 라이선스가 확인되지 않은 데이터를 'ODbL 이니 자유롭게 써도 된다' 고
 *     주장하는 셈이 된다. 유료화할 때 정면으로 걸린다.
 *  2. ODbL 은 출처 표기를 요구하므로, OSM 이 아닌 것을 OSM 이라 적으면
 *     그 요구조차 충족하지 못한다.
 *
 * 그래서 문구 존재 여부뿐 아니라 '숫자가 실제 데이터와 맞는지' 까지 본다.
 * data.html 에 적은 역·출구 개수가 데이터와 어긋나면 그 페이지는 거짓말이 된다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = p => JSON.parse(read(p));

const index = read('index.html');
const dataPage = read('data.html');
const sw = read('sw.js');
const sitemap = read('sitemap.xml');
const lineFiles = fs.readdirSync(path.join(ROOT, 'line'))
  .filter(f => f.endsWith('.html'));

section('메인 화면 출처');
check('미래철도DB 를 적는다', /미래철도DB/.test(index));
check('철도맘을 적는다', /철도맘/.test(index));
check('출구 좌표에 OSM 표기를 유지한다',
  /출구 좌표[^<]*OpenStreetMap contributors \(ODbL\)/.test(index));
check('배경지도 표기를 유지한다', /OpenFreeMap/.test(index) && /Esri/.test(index));
check('데이터 출처 페이지로 링크한다', /href="data\.html"/.test(index));

section('노선 페이지 72개');
check('노선 페이지가 있다', lineFiles.length === 72, lineFiles.length + '개');
{
  const wrong = lineFiles.filter(f => /노선·역 데이터 © OpenStreetMap/.test(read('line/' + f)));
  check('노선 데이터를 OSM 이라 적은 페이지가 없다', wrong.length === 0,
    wrong.length ? wrong.slice(0, 3).join(', ') : '0개');
}
{
  const noFrdb = lineFiles.filter(f => !/미래철도DB/.test(read('line/' + f)));
  check('모든 노선 페이지가 실제 출처를 적는다', noFrdb.length === 0,
    noFrdb.length ? noFrdb.slice(0, 3).join(', ') : '72/72');
}
{
  const noLink = lineFiles.filter(f => !/href="\.\.\/data\.html"/.test(read('line/' + f)));
  check('모든 노선 페이지가 출처 페이지로 링크한다', noLink.length === 0,
    noLink.length ? noLink.slice(0, 3).join(', ') : '72/72');
}
{
  const noOsm = lineFiles.filter(f => !/OpenStreetMap contributors \(ODbL\)/.test(read('line/' + f)));
  check('모든 노선 페이지가 출구 OSM 표기를 유지한다', noOsm.length === 0,
    noOsm.length ? noOsm.slice(0, 3).join(', ') : '72/72');
}

section('data.html 숫자가 실제 데이터와 일치');
const lines = readJson('data/lines.geojson');
const stations = readJson('data/stations.geojson');
const exits = readJson('data/exits.geojson');
const fmt = n => n.toLocaleString('en-US');
check('노선 수', dataPage.includes('<b>' + lines.features.length + '</b>노선'),
  lines.features.length + '개');
check('역 수', dataPage.includes('<b>' + fmt(stations.features.length) + '</b>역'),
  fmt(stations.features.length) + '개');
check('출구 수', dataPage.includes('<b>' + fmt(exits.features.length) + '</b>출구'),
  fmt(exits.features.length) + '개');
{
  // 출구 커버리지 — data.html 은 '역의 75%(938/1,246)' 이라고 적는다.
  const ids = new Set(exits.features.map(f => f.properties.station).filter(Boolean));
  const covered = stations.features.filter(f => ids.has(f.properties.id)).length;
  const pct = Math.round(covered / stations.features.length * 100);
  check('출구 커버리지 비율', dataPage.includes('역의 ' + pct + '%'),
    pct + '% (' + covered + '/' + stations.features.length + ')');
  check('커버리지 분수 표기', dataPage.includes('(' + covered + '/' + fmt(stations.features.length) + ')'));
}

section('한계를 숨기지 않는다');
check('KTX 개략선 오차를 적는다', /최대 6km/.test(dataPage));
check('인천공항철도 연장 초과를 적는다', /69\.5km[\s\S]{0,60}63\.8km/.test(dataPage));
check('미개통 노선 포함을 적는다', /미개통/.test(dataPage));
check('상업적 이용 미확인을 경고한다', /상업적 이용은 아직 확인되지 않았습니다/.test(dataPage));
check('공공데이터 전환 계획을 적는다', /data\.go\.kr/.test(dataPage));

section('배포·캐시');
check('서비스워커 앱 셸에 data.html', /'\.\/data\.html'/.test(sw));
{
  const v = (sw.match(/APP_CACHE = 'kr-rail-map-app-v(\d+)'/) || [])[1];
  check('앱 캐시 버전 20 이상', Number(v) >= 20, 'v' + v);
}
{
  const dv = (sw.match(/DATA_CACHE = 'kr-rail-map-data-v(\d+)'/) || [])[1];
  check('데이터 캐시 버전 일치', dv === (sw.match(/APP_CACHE = 'kr-rail-map-app-v(\d+)'/) || [])[1],
    'v' + dv);
}
check('사이트맵에 data.html', /kr-rail-map\/data\.html/.test(sitemap));

section('정적 페이지 기본 요건');
check('data.html 에 title', /<title>[^<]{4,}<\/title>/.test(dataPage));
check('data.html 에 meta description', /<meta name="description" content="[^"]{20,}"/.test(dataPage));
check('data.html 에 canonical', /rel="canonical"/.test(dataPage));
check('data.html 이 한국어로 선언됨', /<html lang="ko">/.test(dataPage));
check('data.html 에 h1 하나', (dataPage.match(/<h1>/g) || []).length === 1);
check('data.html 이 다크모드 대응', /prefers-color-scheme:dark/.test(dataPage));
check('data.html 이 루트로 돌아가는 링크', /href="\.\/"/.test(dataPage));

console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
