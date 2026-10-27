/* 역 데이터 중복 검사 — 같은 역이 두 번 들어 있으면 지도에 점이 두 개 찍힌다.
 *
 * 실제로 두 쌍이 있다.
 *   이수 / 총신대입구(이수)   148m — 2024년 개명 전후 이름이 둘 다 남았다
 *   고한 / 갈래호 승강장      191m — 태백선 개량 때 쓴 임시 승강장
 *
 * 지금은 지우지 않는다. 지우면 되돌릴 수 없고, 시세는 두 이름 모두에 붙여
 * 두었기 때문이다. 대신 **새 중복이 생기면 여기서 걸리게** 한다.
 * 목록에 없는 쌍이 나타나면 데이터를 손대다 뭔가를 잘못 만든 것이다.
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

const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));
const F = stations.features;

// 알려진 중복. 여기 없는 쌍이 나오면 실패한다.
const KNOWN = [
  ['이수', '총신대입구(이수)'],
  ['고한', '갈래호 승강장'],
];

const R = 6371000, D = Math.PI / 180;
function hav(a, b) {
  const dLat = (b[1] - a[1]) * D, dLon = (b[0] - a[0]) * D;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D) * Math.cos(b[1] * D) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

section('가까이 붙은 역 쌍');
const pairs = [];
for (let i = 0; i < F.length; i++) {
  for (let j = i + 1; j < F.length; j++) {
    const A = F[i], B = F[j];
    const d = hav(A.geometry.coordinates, B.geometry.coordinates);
    if (d > 260) continue;
    const la = new Set(A.properties.lines || []);
    const shared = (B.properties.lines || []).filter(x => la.has(x));
    if (!shared.length) continue;
    pairs.push({
      a: A.properties.name_ko, b: B.properties.name_ko,
      m: Math.round(d), lines: shared,
    });
  }
}
pairs.sort((x, y) => x.m - y.m);

check('260m 안에 같은 노선 역이 3쌍 이상 없다', pairs.length <= KNOWN.length,
  pairs.length + '쌍');

const isKnown = p => KNOWN.some(([a, b]) =>
  (p.a === a && p.b === b) || (p.a === b && p.b === a));
const unknown = pairs.filter(p => !isKnown(p));
check('목록에 없는 중복이 없다', unknown.length === 0,
  unknown.length ? unknown.map(p => p.a + '/' + p.b + ' ' + p.m + 'm').join(', ') : '전부 알려진 쌍');

section('알려진 중복의 정체');
for (const [a, b] of KNOWN) {
  const A = F.find(f => f.properties.name_ko === a);
  const B = F.find(f => f.properties.name_ko === b);
  check(a + ' / ' + b + ' 이 둘 다 있다', !!A && !!B,
    A && B ? Math.round(hav(A.geometry.coordinates, B.geometry.coordinates)) + 'm' : '없음');
}

section('이름이 비어 있지 않다');
{
  const empty = F.filter(f => !String(f.properties.name_ko || '').trim());
  check('이름 없는 역이 없다', empty.length === 0, empty.length + '개');
  const dupId = F.length - new Set(F.map(f => f.properties.id)).size;
  check('역 id 가 유일하다', dupId === 0, dupId + '개 중복');
}

console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
