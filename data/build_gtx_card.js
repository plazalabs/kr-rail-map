#!/usr/bin/env node
/* GTX 입구 카드 전용 작은 파일 data/gtx-card.json.
 * rank.json·rank-station.json(build_rank.js)과 station-trend.json(시세 흐름)이 만들어진 뒤에 돈다.
 * 순위·등급은 본체와 같은 js/rank.js, 카드 규칙은 js/gtx-card.js — 여기서 새로 세지 않는다.
 * 기준 문서: 결정_GTX입구_20261121.md · TASK_GTX입구_MVP_20261121.md */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const RankTable = require(path.join(ROOT, 'js/rank.js'));
const G = require(path.join(ROOT, 'js/gtx-card.js'));
const doc = read('data/rank.json');
const rs = read('data/rank-station.json');
const access = read('data/access.json');
const trend = read('data/station-trend.json');
const jeonse = read('data/station-jeonse.json');
const stations = read('data/stations.geojson').features;
const lineFeat = new Map(read('data/lines.geojson').features.map(f => [f.properties.id, f.properties]));

const hav = (lng1, lat1, lng2, lat2) => {
  const R = 6371, r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const year = RankTable.defaultYear(doc);
if (String(year) !== String(rs.year)) throw new Error(`기본 연도가 다름: rank.json ${year} · rank-station.json ${rs.year}`);
const destIdx = ['CBD', 'YBD', 'GBD'].map(k => doc.dest.indexOf(k));
if (destIdx.some(i => i < 0)) throw new Error('rank.json dest 에 CBD·YBD·GBD 가 없음: ' + doc.dest);
const dest = ['cbd', 'ybd', 'gbd'].map(id => { const d = access.destinations.find(x => x.id === id); return { id, name: d.name, label: d.label }; });

// 순위·등급: 평균 · 수도권 · 기본 연도 · 배차 끔 = rank-station.json 과 같은 계산
const cap = RankTable.compute(doc, { weight: 'avg', region: 'capital', at: year });
const resById = new Map(cap.rows.map(r => [r.id, r]));
const rowById = new Map(doc.rows.map(r => [r.id, r]));
const byId = new Map(stations.map(f => [f.properties.id, f]));

// 2031년까지 새로 여는 노선 (year_lines 의 기본 연도 이하)
const newLines = new Set(Object.entries(doc.year_lines).filter(([y]) => +y <= +year).flatMap(([, ls]) => ls));

// 시세: 마지막으로 다 찬 반기 vs 1년 전, 법정동 단위, 10건
const MIN_DEALS = 10;
const pair = G.halfPair(trend.lastClosed);
const mk = G.buildMarket(trend.stations, pair, MIN_DEALS);
const r1 = v => Math.round(v * 10) / 10;

// 묶음(같은 이름 · 대표 역에서 0.6km 안, build_rank.js 와 같은 규칙)의 대표 행 찾기
const repOf = id => {
  if (rowById.has(id)) return rowById.get(id);
  const f = byId.get(id); if (!f) return null;
  const [x, y] = f.geometry.coordinates;
  return doc.rows.find(r => { const g = byId.get(r.id); return g && g.properties.name_ko === f.properties.name_ko && hav(x, y, ...g.geometry.coordinates) <= 0.6; }) || null;
};

const s = {}, k = {};
let pzCount = 0, mismatch = [];
for (const [id, [rank, scope]] of Object.entries(rs.by)) {
  if (scope !== 'c') continue;
  const row = repOf(id);
  const res = row && resById.get(row.id);
  if (!row || !res) { mismatch.push(id + ' 대표 행 없음'); continue; }
  if (res.aft.rank !== rank) { mismatch.push(`${id} ${row.n}: 계산 ${res.aft.rank} ≠ rank-station ${rank}`); continue; }
  const now = destIdx.map(i => row.now[i]);
  const aft = destIdx.map(i => (row.y[String(year)] || [])[i]);
  const pd = G.pickDest(now, aft);
  const ln = (row.l || []).filter(l => newLines.has(l));
  const pz = ln.some(l => (lineFeat.get(l) || {}).status === 'proposed');
  if (pz) pzCount++;
  const ts = trend.stations[id] || trend.stations[row.id];
  const key = ts && ts.lawd && ts.dong ? ts.lawd + '|' + ts.dong : null;
  if (key && mk.k[key] && !k[key]) {
    // 중위 평당가는 시세 라벨과 같은 자료·같은 반기(비교 끝 반기, 전용면적 기준) — 옆의 거래 건수와 기간을 맞춘다
    const x = mk.k[key], h = (ts.s || []).find(v => v[0] === pair.to);
    k[key] = { dong: x.dong, m: x.m, p: x.p == null ? null : r1(x.p), a: x.a, pp: h && h[1] != null ? Math.round(h[1]) : null };
  }
  const jj = jeonse.stations[id] || jeonse.stations[row.id];
  s[id] = { n: row.n, g: row.g || '', r: row.r || '', d: pd.i, kd: pd.kind, now, aft, t: RankTable.tierOf(res), ch: res.isNew ? null : res.change,
    rn: res.now.rank, ra: res.aft.rank, k: key && mk.k[key] ? key : null, ln, pz,
    j: jj ? [jj.r, jj.n] : null };
}
if (mismatch.length) throw new Error('순위가 rank-station.json 과 다름 (같은 숫자 원칙):\n' + mismatch.slice(0, 10).join('\n'));
if (pzCount) console.warn(`경고: 구상 노선이 들어간 역 ${pzCount}곳 — ${year} 고정이면 0 이어야 함`);

// 수도권 밖 역 이름 → 본체 역 상세 링크용 id
const outside = {};
for (const [id, [, scope]] of Object.entries(rs.by)) if (scope === 'n') { const f = byId.get(id); if (f && !(f.properties.name_ko in outside)) outside[f.properties.name_ko] = id; }

const out = {
  updated: doc.updated, year: +year, dest,
  access_note: '교통 접근성 순위 · 집값 예측 아님',
  access_basis: '평균(도심·여의도·강남) 기준 수도권 ' + cap.total + '역 중 순위 · ' + year + '년까지 개통 가정 · 배차 넣기 끔',
  total: cap.total, risk: jeonse.risk, jeonse_min: jeonse.minPairs,
  market: { from: pair.from, to: pair.to, min_deals: MIN_DEALS, method: 'linear',
    q25: r1(mk.q25), q50: r1(mk.q50), q75: r1(mk.q75), n_label: mk.n_label, n_hold: mk.n_hold, note: trend.note },
  // 카드의 새 노선 이름·상태·개통 연도·색 — lines.geojson name_ko·status·open_year 그대로(500KB 파일을 페이지가 받지 않게)
  lines: Object.fromEntries([...new Set(Object.values(s).flatMap(x => x.ln))].map(id => { const p = lineFeat.get(id) || {};
    return [id, [p.name_ko || id, p.status || 'open', p.open_year == null ? null : p.open_year, p.color || '#555']]; })),
  s, k, o: outside,
};
fs.writeFileSync(path.join(ROOT, 'data/gtx-card.json'), JSON.stringify(out));
const kb = (fs.statSync(path.join(ROOT, 'data/gtx-card.json')).size / 1024).toFixed(0);
console.log(`gtx-card.json: 역 ${Object.keys(s).length} · 동 ${Object.keys(k).length}(라벨 ${mk.n_label} · 보류 ${mk.n_hold}, 시세 전체 동 기준) · 경계 ${r1(mk.q25)} / ${r1(mk.q50)} / ${r1(mk.q75)}% · ${pair.from}→${pair.to} · ${kb}KB`);
