// 회귀: 주소 자료의 '새절(신사)'처럼 괄호 안 이름이 다른 역(강남 신사)으로 새면 안 된다.
// 괄호 앞 이름이 지도에 있는 역이면, 괄호 안 이름의 역은 그 행의 법정동을 받지 않는다
// (그 역 자신의 주소 행이 같은 시군구에 있을 때만 예외).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.env.KR_RAIL_ROOT || process.cwd(), 'data');
const load = n => JSON.parse(readFileSync(join(DATA, n), 'utf8'));
const rows = load('_station_dong.json');
const ST = load('stations.geojson').features.map(f => f.properties);
const idsByName = {};
for (const p of ST) (idsByName[p.name_ko] ||= []).push(p.id);
const base = n => String(n || '').replace(/\s*\(.*?\)\s*/g, '').replace(/역$/, '').trim();
const ownLawds = {};
for (const r of rows) if (r.lawd) (ownLawds[base(r.name)] ||= new Set()).add(r.lawd);

const leaks = [];
for (const [label, file] of [['시세', 'station-price.json'], ['개발', 'station-dev.json'], ['단지', 'station-complex.json']]) {
  const S = load(file).stations || {};
  for (const r of rows) {
    const m = /\(([^)]+)\)/.exec(r.name || '');
    if (!m || !r.lawd) continue;
    const head = base(r.name), alias = m[1].trim();
    if (!idsByName[head] || alias === head) continue;
    if (ownLawds[alias]?.has(r.lawd)) continue;
    for (const id of idsByName[alias] || []) {
      const v = S[id];
      if (v && v.lawd === r.lawd && v.dong === r.dong) leaks.push(`[${label}] ${alias}(${id}) ← '${r.name}' ${r.sgg} ${r.dong}`);
    }
  }
}
// 전세가율·실거래 7종은 lawd 없이 시군구 이름(sgg)과 법정동(d)으로 적는다
const sameSgg = (a, b) => a === b || String(a || '').endsWith(' ' + b) || String(b || '').endsWith(' ' + a);
for (const [label, file] of [['전세가율', 'station-jeonse.json'], ['실거래7종', 'station-market.json']]) {
  const S = load(file).stations || {};
  for (const r of rows) {
    const m = /\(([^)]+)\)/.exec(r.name || '');
    if (!m || !r.lawd) continue;
    const head = base(r.name), alias = m[1].trim();
    if (!idsByName[head] || alias === head) continue;
    if (ownLawds[alias]?.has(r.lawd)) continue;
    for (const id of idsByName[alias] || []) {
      const v = S[id];
      if (!v) continue;
      const parts = 'd' in v ? [v] : Object.values(v);
      if (parts.some(x => x && x.d === r.dong && sameSgg(x.sgg, r.sgg))) leaks.push(`[${label}] ${alias}(${id}) ← '${r.name}' ${r.sgg} ${r.dong}`);
    }
  }
}

test('[R-paren] 괄호 안 다른 이름으로 법정동이 새지 않는다 (신사·장신대·현충원)', () => {
  assert.equal(leaks.length, 0, `괄호 이름으로 샌 연결 ${leaks.length}건:\n- ${[...new Set(leaks)].join('\n- ')}`);
});
