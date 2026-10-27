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
// 원천별로 상업적 이용 가능 여부가 다르다. 한 문장으로 '아직 확인 안 됨' 이라고
// 뭉뚱그리면, 실제로는 쓸 수 있는 OSM·공공데이터까지 못 쓴다고 읽힌다.
check('상업적 이용을 원천별로 나눠 적는다', /상업적 이용은 원천별로 다릅니다/.test(dataPage));
check('미확인 원천을 이름으로 짚는다',
  /미래철도DB/.test(dataPage) && /철도맘/.test(dataPage));
check('공공데이터 전환 계획을 적는다', /data\.go\.kr/.test(dataPage));

section('주변 시세 — 출처와 한계');
{
  const price = readJson('data/station-price.json');
  const nSt = Object.keys(price.stations).length;
  const nDong = price.districts.length;
  const nDeals = price.districts.reduce((a, d) => a + d.deals, 0);
  const nLinked = price.districts.reduce((a, d) => a + (d.stations.length ? d.deals : 0), 0);
  check('시세 역 수가 페이지와 일치', dataPage.includes('<b>' + nSt + '</b>역 시세'), nSt + '곳');
  check('법정동 수가 페이지와 일치', dataPage.includes('<b>' + nDong + '</b>개 법정동'), nDong + '곳');
  check('총 거래 수가 페이지와 일치',
    dataPage.includes('<b>' + fmt(nDeals) + '건</b>'), fmt(nDeals) + '건');
  check('역 연결 거래 수가 페이지와 일치',
    dataPage.includes('<b>' + fmt(nLinked) + '건</b>'), fmt(nLinked) + '건');
  // 부동산 판단에 쓰는 숫자다. 방법과 한계를 안 적으면 안 된다.
  check('법정동 단위임을 밝힌다', /법정동 단위/.test(dataPage));
  check('신고 지연을 밝힌다', /30일 내 신고/.test(dataPage));
  check('서울만 수집했음을 밝힌다', /서울 25개 구만/.test(dataPage));
  check('해제 거래 제외를 밝힌다', /해제된 거래는 뺐습니다/.test(dataPage));
  // 출처 표는 data/sources.json 에서 자동 생성된다. 시세 행에 라이선스가
  // 비어 있으면 '이용 조건이 뭔지 모르는 데이터' 를 배포하는 셈이다.
  const row = (dataPage.match(/<tr data-src="molit-rtms">([\s\S]*?)<\/tr>/) || [])[1] || '';
  check('시세 행에 국토교통부 출처가 있다', /국토교통부/.test(row));
  check('시세 행에 이용허락범위 제한 없음이 있다', /이용허락범위 제한 없음/.test(row));
}

section('배경 지도 제공자');
{
  // CARTO 는 키 없이 요청하면 HTTP 200 으로 'API KEY REQUIRED' 워터마크
  // 타일을 돌려준다. 상태코드가 200 이라 오류도 안 뜨고, 다크·이클립스·네온
  // 테마 사용자는 지도가 워터마크로 덮인 걸 봤다. 조용히 깨지는 유형이라
  // 네트워크 없이 잡을 수 있는 여기서 막는다.
  const appJs = read('js/app.js');
  check('키 필요 타일 제공자를 쓰지 않는다', !/cartocdn/.test(appJs));
  check('다크 베이스맵이 정의돼 있다', /dark:\s*'https?:\/\//.test(appJs));
  check('다크 테마가 그 스타일을 쓴다', /DARK_THEMES[\s\S]{0,200}STYLES\.dark/.test(appJs));
}

section('선형 출처 — OSM 선로에서 다시 그림');
{
  const osmLines = lines.features.filter(f => (f.properties || {}).coord_source === 'osm');
  check('OSM 선형 노선이 40개 이상', osmLines.length >= 40, osmLines.length + '개');
  check('data.html 에 OSM 선형 노선 수를 적는다',
    dataPage.includes(osmLines.length + '개 노선'), osmLines.length + '개 노선');
  check('선형 라이선스를 ODbL 로 적는다',
    /노선 선형[\s\S]{0,400}ODbL/.test(dataPage));
  check('상업적 이용이 허용된다는 점을 적는다', /상업적 이용이 허용/.test(dataPage));
  check('결과물(Produced Work) 임을 밝힌다', /Produced Work/.test(dataPage));
  // 철도맘 화면을 옮겨 그린 선형이 남아 있으면 그 노선은 출처를 OSM 이라
  // 적을 수 없다. 반영된 노선은 반드시 '어떻게 만들었는지' 가 남아 있어야 한다.
  const noSource = osmLines.filter(f => !f.properties.coord_method
    && !(f.properties.coord_relations || []).length);
  check('OSM 노선마다 만든 방법이 남아 있다', noSource.length === 0,
    noSource.length ? noSource.slice(0, 3).map(f => f.properties.id).join(', ') : '전부');
  const byMethod = {};
  osmLines.forEach(f => { byMethod[f.properties.coord_method] = (byMethod[f.properties.coord_method] || 0) + 1; });
  check('만든 방법이 relation / graph 둘 중 하나', Object.keys(byMethod).every(m => m === 'relation' || m === 'graph'),
    JSON.stringify(byMethod));
}

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
