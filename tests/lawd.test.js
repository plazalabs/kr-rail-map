#!/usr/bin/env node
/* 시군구 키 — '중구'가 서울에도 인천에도 있는 문제
 *
 * 왜 필요한가:
 *   실거래가는 법정동 이름만 준다. 그래서 처음엔 (구 이름, 법정동) 으로
 *   묶었다. 서울만 받을 때는 문제가 없었다. 경기·인천을 넣는 순간
 *   '중구'가 둘이 되고 '서구'는 네 곳이 된다. 이름으로 묶으면 서울 중구
 *   아파트가 인천 중구 역에 붙는다.
 *
 *   그래서 키를 (시도, 시군구코드, 법정동) 으로 바꿨다. 이 테스트는 그
 *   키가 실제로 자료에 남아 있는지, 충돌하는 이름이 실제로 분리됐는지
 *   확인한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
const fails = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
  } else {
    fails.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''));
  }
}
function section(t) { console.log('\n' + t); }

const price = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/station-price.json'), 'utf8'));
const cx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/station-complex.json'), 'utf8'));
const districts = price.districts || [];
const stPrice = price.stations || {};
const METRO = new Set(['서울', '경기', '인천']);

// ── 1. 모든 법정동에 시군구 코드가 있다 ────────────────────────
section('법정동마다 시도·시군구코드가 있다');
check('법정동이 500곳 이상', districts.length >= 500, districts.length + '곳');
const noCode = districts.filter((d) => !d.lawd || !/^\d{5}$/.test(d.lawd));
check('법정동코드가 5자리 숫자', noCode.length === 0,
  noCode.slice(0, 3).map((d) => d.dong).join(', '));
const noSido = districts.filter((d) => !d.sido || !d.sgg);
check('시도·시군구 이름이 있다', noSido.length === 0,
  noSido.slice(0, 3).map((d) => d.dong).join(', '));
const outOfScope = districts.filter((d) => !METRO.has(d.sido));
check('수도권 밖 법정동이 섞이지 않았다', outOfScope.length === 0,
  outOfScope.slice(0, 3).map((d) => d.sido + ' ' + d.dong).join(', '));

// ── 2. 같은 이름이 두 번 나오지 않는다 ─────────────────────────
section('같은 법정동이 두 번 집계되지 않았다');
const keys = districts.map((d) => d.lawd + '|' + d.dong);
check('(코드, 법정동) 키가 유일하다', new Set(keys).size === keys.length,
  keys.filter((v, i) => keys.indexOf(v) !== i).slice(0, 3).join(', '));
// 이름만으로는 겹치는 게 정상이다. 그게 이 키를 만든 이유니까.
const byName = {};
for (const d of districts) (byName[d.dong] = byName[d.dong] || []).push(d);
const dupName = Object.keys(byName).filter((n) => byName[n].length > 1);
check('이름이 겹치는 법정동이 실제로 있다', dupName.length > 0, dupName.length + '개 이름');

// ── 3. 중구 충돌이 실제로 분리됐다 ─────────────────────────────
section('중구 — 서울과 인천이 분리됐다');
const bySgg = {};
for (const d of districts) (bySgg[d.sgg] = bySgg[d.sgg] || []).push(d);
const jg = bySgg['중구'] || [];
const jgSido = new Set(jg.map((d) => d.sido));
check('중구가 서울·인천 양쪽에 있다', jgSido.has('서울') && jgSido.has('인천'),
  [...jgSido].join(', '));
const jgCodes = new Set(jg.map((d) => d.lawd));
check('중구의 코드가 서로 다르다', jgCodes.size >= 2, [...jgCodes].join(', '));
check('서울 중구 = 11140',
  jg.some((d) => d.sido === '서울' && d.lawd === '11140'), [...jgCodes].join(', '));
check('인천 중구 = 28155',
  jg.some((d) => d.sido === '인천' && d.lawd === '28155'), [...jgCodes].join(', '));
// 같은 '중구'라도 시도가 다르면 다른 값이어야 한다. 같으면 어딘가에서
// 합쳐진 것이다.
const jgPrices = jg.map((d) => d.medianPerPyeong).filter(Boolean);
check('중구 값이 한 덩어리로 합쳐지지 않았다',
  jgPrices.length >= 2 && new Set(jgPrices).size === jgPrices.length,
  jgPrices.join(' / '));

// ── 4. 역 시세에도 키가 남아 있다 ──────────────────────────────
section('역 시세에 시도·시군구가 남아 있다');
const names = Object.keys(stPrice);
check('시세 역이 300곳 이상', names.length >= 300, names.length + '곳');
const badSt = names.filter((n) => {
  const s = stPrice[n];
  return !s.lawd || !/^\d{5}$/.test(s.lawd) || !s.sido || !s.sgg;
});
check('역마다 시도·시군구·코드가 있다', badSt.length === 0, badSt.slice(0, 5).join(', '));
const badScope = names.filter((n) => !METRO.has(stPrice[n].sido));
check('수도권 밖 역이 섞이지 않았다', badScope.length === 0, badScope.slice(0, 5).join(', '));
// 역의 코드가 실제로 그 법정동 집계에 있어야 한다.
const dset = new Set(districts.map((d) => d.lawd + '|' + d.dong));
const orphan = names.filter((n) => !dset.has(stPrice[n].lawd + '|' + stPrice[n].dong));
check('역이 가리키는 법정동이 집계에 있다', orphan.length === 0, orphan.slice(0, 5).join(', '));

// ── 5. 시군구 이름이 시도 안에서 유일하다 ─────────────────────
section('시군구 이름이 시도 안에서 유일하다');
// 예외: 시가 여러 구로 쪼개졌는데 우리가 구 이름을 확인하지 못한 경우.
// 이름을 지어내면 그게 더 큰 거짓말이라 상위 이름을 그대로 쓴다. 대신
// 어느 코드가 그런지 여기 적어 둔다 — 새로 생기면 이 검사가 실패한다.
const SPLIT_UNKNOWN = {
  '경기 화성시': ['41591', '41593', '41595', '41597'],
  '인천 서구': ['28275', '28290'],
};
const pair = {};
for (const d of districts) {
  const k = d.sido + ' ' + d.sgg;
  (pair[k] = pair[k] || new Set()).add(d.lawd);
}
const conflict = Object.keys(pair).filter((k) => pair[k].size > 1);
const known = Object.keys(SPLIT_UNKNOWN);
const unexpected = conflict.filter((k) => !known.includes(k));
check('(시도, 시군구) 가 한 코드만 가리킨다', unexpected.length === 0,
  unexpected.map((k) => k + '(' + [...pair[k]].join('+') + ')').join(', '));
check('목록에 적힌 분할이 실제로 그 코드들이다',
  known.every((k) => {
    const codes = [...(pair[k] || [])].sort().join(',');
    return codes === SPLIT_UNKNOWN[k].slice().sort().join(',');
  }),
  known.map((k) => k + '=' + [...(pair[k] || [])].join('+')).join(' / '));

// ── 6. 단지 자료의 키도 코드다 ────────────────────────────────
section('단지 자료도 같은 키를 쓴다');
const cxKeys = Object.keys(cx.districts || {});
check('단지 법정동이 200곳 이상', cxKeys.length >= 200, cxKeys.length + '곳');
const badKey = cxKeys.filter((k) => !/^\d{5}\|/.test(k));
check('단지 키가 (코드|법정동)', badKey.length === 0, badKey.slice(0, 3).join(', '));
const noLabel = cxKeys.filter((k) => {
  const d = cx.districts[k];
  return !d.sido || !d.sgg;
});
check('단지 법정동에 시도·시군구 이름이 있다', noLabel.length === 0,
  noLabel.slice(0, 3).join(', '));
const cxSt = Object.keys(cx.stations || {});
const dangling = cxSt.filter((n) => !cx.districts[cx.stations[n]]);
check('단지 자료의 역이 없는 법정동을 가리키지 않는다', dangling.length === 0,
  dangling.slice(0, 5).join(', '));
// 역이 없는 법정동은 파일에서 뺐다 — 2MB 가 넘어서. 다시 들어오면 잡는다.
const reachable = new Set(Object.values(cx.stations));
const dead = cxKeys.filter((k) => !reachable.has(k));
check('역과 이어지지 않는 법정동은 뺐다', dead.length === 0, dead.length + '곳 남음');

console.log('\n결과: ' + pass + '개 통과, ' + fails.length + '개 실패');
if (fails.length) process.exit(1);
