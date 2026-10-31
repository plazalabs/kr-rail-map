/* 도심 접근성 테스트 — 의존성 없이 실행: node tests/access.test.js
 *
 * data/access.json 은 route.js 로 만든 파생 데이터다. 원본(선형·역·환승시간)이
 * 바뀌면 조용히 낡는다. 그래서 여기서 '지금 계산한 값'과 '파일에 적힌 값'을
 * 대조한다 — 이게 이 파일의 핵심이다.
 *
 * 그리고 순위·단축폭이 말이 되는지, 실제 공표 소요시간과 크게 어긋나지 않는지도
 * 함께 고정한다. 시간 모델은 추정이므로 ±45% 를 허용하되, 그보다 벌어지면
 * 표정속도 표가 망가진 것으로 본다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8'));
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));
const transfers = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/transfer-times.json'), 'utf8'));
const access = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/access.json'), 'utf8'));

const rsrc = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8')
  .replace('const RouteFinder', 'globalThis.RouteFinder');
const rctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(rsrc, rctx);
const RF = rctx.RouteFinder;
RF.buildGraph(lines.features, stations.features);
RF.loadTransfers(transfers);

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fail++; fails.push(name + (detail ? '  (' + detail + ')' : ''));
}
function section(t) { console.log('\n[' + t + ']'); }

function hav(lng1, lat1, lng2, lat2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lng2 - lng1) * r;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
// 이름 + 기준 좌표로 역을 고른다. '시청' 은 서울에도 부산에도 있다.
function idAt(name, lat, lng) {
  let best = null, bd = Infinity;
  for (const f of stations.features) {
    if (f.properties.name_ko !== name) continue;
    const [x, y] = f.geometry.coordinates;
    const d = hav(lng, lat, x, y);
    if (d < bd) { bd = d; best = f; }
  }
  return best ? best.properties.id : null;
}

// ── 1. 파일 모양 ────────────────────────────────────────────────
section('access.json 모양');
check('거점이 5곳', access.destinations.length === 5, String(access.destinations.length));
check('거점 id 가 겹치지 않는다',
  new Set(access.destinations.map(d => d.id)).size === access.destinations.length);
check('수록 역이 1,000개 이상', Object.keys(access.stations).length > 1000,
  String(Object.keys(access.stations).length));
check('기준(updated)이 적혀 있다', /^\d{4}-\d{2}-\d{2}$/.test(access.updated || ''), access.updated);
check('추정값이라는 설명이 있다', /추정/.test(access.basis || ''));

// 거점 역이 엉뚱한 도시로 잡히지 않았는지. '시청' 오매칭이 실제로 있었다.
const byId = new Map(stations.features.map(f => [f.properties.id, f]));
const EXPECT_CITY = { cbd: [37.56, 126.97], ybd: [37.52, 126.92], gbd: [37.49, 127.02],
  seoul: [37.55, 126.97], pangyo: [37.39, 127.11] };
for (const d of access.destinations) {
  const f = byId.get(d.station_id);
  check('거점 "' + d.id + '" 의 역이 데이터에 있다', !!f);
  if (!f) continue;
  const [x, y] = f.geometry.coordinates;
  const e = EXPECT_CITY[d.id];
  check('거점 "' + d.id + '" 이 수도권에 있다', hav(x, y, e[1], e[0]) < 15,
    hav(x, y, e[1], e[0]).toFixed(0) + 'km');
}

// ── 2. 값의 범위 ────────────────────────────────────────────────
section('값의 범위');
let neg = 0, weird = 0, worse = 0, allNull = 0, n = 0;
for (const id of Object.keys(access.stations)) {
  const r = access.stations[id];
  if (!Array.isArray(r.now) || !Array.isArray(r.after)) { weird++; continue; }
  if (r.now.length !== 5 || r.after.length !== 5) { weird++; continue; }
  if (r.after.every(v => v == null)) { allNull++; continue; }
  for (let i = 0; i < 5; i++) {
    const a = r.now[i], b = r.after[i];
    if ((a != null && (a < 0 || a > 600)) || (b != null && (b < 0 || b > 600))) neg++;
    // 개통으로 느려지는 일은 없어야 한다. 있으면 선형·속도표가 깨진 신호다.
    if (a != null && b != null && b > a + 1) worse++;
    if (a != null && !Number.isInteger(a)) weird++;
    n++;
  }
}
check('배열 길이가 5로 맞는다', weird === 0, weird + '건');
check('값이 0~600분 정수다', neg === 0, neg + '건');
check('도달 불가(null)만 있는 역은 싣지 않는다', allNull === 0, allNull + '건');
check('개통 후가 지금보다 느린 역이 없다', worse === 0, worse + '건');

// ── 3. 원본과 같은가 (낡음 방지) ────────────────────────────────
section('route.js 로 다시 계산한 값과 같은가');
// 표본 24역 — 무작위 대신 전국에 고루 퍼지도록 손으로 고른다.
const SAMPLE = [
  ['강남', 37.4979, 127.0276], ['여의도', 37.5219, 126.9245], ['시청', 37.5657, 126.9770],
  ['서울', 37.5547, 126.9707], ['판교', 37.3948, 127.1112], ['수원', 37.2660, 127.0000],
  ['인천', 37.4700, 126.7000], ['부산', 35.1160, 129.0400], ['동탄', 37.2000, 127.0960],
  ['일산', 37.6600, 126.7700], ['노원', 37.6550, 127.0610], ['춘천', 37.8850, 127.7170],
  ['강릉', 37.7650, 128.8990], ['대구', 35.8760, 128.5960], ['광주송정', 35.1370, 126.7900],
  ['대전', 36.3320, 127.4340], ['청량리', 37.5800, 127.0470], ['영등포', 37.5150, 126.9070],
  ['김포공항', 37.5620, 126.8010], ['의정부', 37.7380, 127.0460], ['평택', 36.9910, 127.0850],
  ['천안', 36.8100, 127.1470], ['원주', 37.3160, 127.9230], ['목포', 34.7920, 126.3880],
];
let stale = 0, checked = 0;
for (const [name, lat, lng] of SAMPLE) {
  const id = idAt(name, lat, lng);
  if (!id || !access.stations[id]) continue;
  const nowMap = RF.allTimesFrom(id, { openOnly: true });
  const aftMap = RF.allTimesFrom(id, { openOnly: false });
  access.destinations.forEach((d, i) => {
    const wantNow = nowMap.has(d.station_id) ? nowMap.get(d.station_id) : null;
    const wantAft = aftMap.has(d.station_id) ? aftMap.get(d.station_id) : null;
    const got = access.stations[id];
    if (got.now[i] !== wantNow || got.after[i] !== wantAft) {
      stale++;
      if (stale <= 3) {
        console.log('    불일치 ' + name + ' → ' + d.id +
          ': 파일 ' + got.now[i] + '/' + got.after[i] +
          ' vs 계산 ' + wantNow + '/' + wantAft);
      }
    }
    checked++;
  });
}
check('표본 ' + checked + '쌍이 모두 일치', stale === 0,
  stale + '건 — node data/build_access.js 로 다시 만들 것');

// ── 4. 실제 공표 소요시간과의 오차 ──────────────────────────────
section('공표 소요시간과의 오차 (±45% 이내)');
// [출발, 도착, 공표 소요시간(분)] — 수도권 통근 + KTX 장거리
const TRUTH = [
  ['강남', 37.4979, 127.0276, '시청', 37.5657, 126.9770, 25],
  ['수원', 37.2660, 127.0000, '강남', 37.4979, 127.0276, 48],
  ['춘천', 37.8850, 127.7170, '서울', 37.5547, 126.9707, 78],
  ['강릉', 37.7650, 128.8990, '서울', 37.5547, 126.9707, 114],
  ['부산', 35.1160, 129.0400, '서울', 37.5547, 126.9707, 160],
  ['목포', 34.7920, 126.3880, '서울', 37.5547, 126.9707, 145],
  ['인천', 37.4700, 126.7000, '서울', 37.5547, 126.9707, 68],
  ['동탄', 37.2000, 127.0960, '강남', 37.4979, 127.0276, 35],
  ['판교', 37.3948, 127.1112, '강남', 37.4979, 127.0276, 17],
  ['천안', 36.8100, 127.1470, '서울', 37.5547, 126.9707, 95],
  ['노원', 37.6550, 127.0610, '시청', 37.5657, 126.9770, 32],
];
let worst = 0, worstName = '';
for (const [an, alat, alng, bn, blat, blng, truth] of TRUTH) {
  const a = idAt(an, alat, alng), b = idAt(bn, blat, blng);
  if (!a || !b) { check(an + '→' + bn + ' 역을 찾음', false); continue; }
  const r = RF.findRoute(a, b, { openOnly: true });
  const m = r ? r.minutes : null;
  const err = m == null ? 1 : Math.abs(m / truth - 1);
  if (err > worst) { worst = err; worstName = an + '→' + bn; }
  check(an + '→' + bn + ' 오차 45% 이내 (' + m + '분 / 실제 ' + truth + '분)', err <= 0.45,
    Math.round(err * 100) + '%');
}
console.log('    최대 오차 ' + Math.round(worst * 100) + '% (' + worstName + ')');

// ── 5. 순위·단축 계산 (js/access.js) ────────────────────────────
section('js/access.js 계산');
const asrc = fs.readFileSync(path.join(ROOT, 'js/access.js'), 'utf8')
  .replace('const StationAccess', 'globalThis.StationAccess');
const actx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(asrc, actx);
const SA = actx.StationAccess;
check('파일을 읽어들인다', SA.setDoc(access) === true);

const gangnam = idAt('강남', 37.4979, 127.0276);
const g = SA.of(gangnam);
check('강남 기록이 나온다', !!g);
check('강남→강남은 0분', g && g.rows.find(r => r.id === 'gbd').after === 0);
check('순위가 매겨진다', !!(g && g.rank.after), g && JSON.stringify(g.rank));
check('순위는 전체 수보다 작거나 같다',
  g && g.rank.after && g.rank.after.rank <= g.rank.after.total);
check('강남이 상위 5% 안에 든다', g && g.rank.after.rank / g.rank.after.total <= 0.05,
  g && g.rank.after.rank + '/' + g.rank.after.total);
check('3대 업무지구 평균이 계산된다', g && g.score.after != null && g.score.after < 40,
  g && g.score.after);

// 강남은 개통 후에도 크게 안 줄어야 한다(이미 최고 접근성).
check('강남의 개통 단축폭은 작다', g && g.score.now - g.score.after <= 8,
  g && (g.score.now - g.score.after).toFixed(1) + '분');
// 수원은 GTX-C 로 크게 줄어야 한다.
const suwon = idAt('수원', 37.2660, 127.0000);
const s = SA.of(suwon);
check('수원의 개통 단축폭은 크다', s && s.score.now - s.score.after >= 10,
  s && (s.score.now - s.score.after).toFixed(1) + '분');
check('수원 순위가 개통 후 올라간다', s && s.rank.now && s.rank.after &&
  s.rank.after.rank < s.rank.now.rank,
  s && s.rank.now.rank + ' → ' + s.rank.after.rank);

// 단축폭 순위 — '개통으로 얼마나 좋아지나'. 수원은 GTX-C 수혜라 상위여야 한다.
check('수원의 개통 단축 순위가 상위 20%', s && s.rank.gain &&
  s.rank.gain.rank / s.rank.gain.total <= 0.2,
  s && s.rank.gain && s.rank.gain.rank + '/' + s.rank.gain.total);
// 단축폭이 0인 역은 단축 순위에서 빠진다 — 그래서 대상 수가 접근성 순위보다 적다.
// 0분을 '개선'으로 세면 이미 좋은 역이 개선 순위에 끼어든다.
check('단축 순위는 개선이 있는 역만 센다',
  s && s.rank.gain && s.rank.after && s.rank.gain.total < s.rank.after.total,
  s && s.rank.gain && (s.rank.gain.total + ' < ' + s.rank.after.total));
// 강남은 이미 최고 접근성이라 개통으로 줄어들 여지가 거의 없다.
check('강남은 개통 단축 순위가 하위권', g && g.rank.gain &&
  g.rank.gain.rank / g.rank.gain.total > 0.8,
  g && g.rank.gain && g.rank.gain.rank + '/' + g.rank.gain.total);

// 자료 없는 역은 null — 0분으로 보이면 안 된다.
check('수록되지 않은 역은 null', SA.of('st-does-not-exist') === null);

// 가장 크게 좋아지는 방향을 한 곳만 짚는다.
const gain = SA.biggestGain(suwon);
check('단축폭 최대 거점을 고른다', gain && gain.save >= 10, gain && gain.label + ' ' + gain.save);

// HTML: 표·요약·면책이 다 들어가고, 값이 없으면 없다고 말한다.
const html = SA.sectionHtml(gangnam);
check('표 머리에 지금/개통 후가 있다', /지금/.test(html) && /개통 후/.test(html));
check('추정값이라고 밝힌다', /추정/.test(html));
check('자료 없는 역은 그렇다고 말한다', /계산하지 못했습니다/.test(SA.sectionHtml('st-nope')));

console.log('\n결과: ' + pass + '개 통과, ' + fail + '개 실패');
if (fail) {
  console.log('\n실패 목록');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
