/* 실거래 7종 표시 (js/market.js) + 결과 파일(data/station-market.json) 점검 — 2026-11-09
 * 실행: node tests/market.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)}`); }
}

// 표시 규칙은 손으로 만든 작은 자료로 본다 (규칙 시험용 — 앱 자료가 아니다)
async function withData(d) {
  const win = { fetch: async () => ({ ok: true, json: async () => d }) };
  vm.runInNewContext(read('js/market.js'), { window: win, fetch: win.fetch });
  await win.StationMarket.load('x');
  return win.StationMarket;
}

(async () => {
  console.log('[표시 규칙]');
  const M = await withData({ keyed_by: 'station_id', period: ['2026-04', '2026-09'], minDeals: 5, stations: {
    'st-a': {
      'apt-rent': { n: 40, jn: 30, wn: 10, jd: 52000, wd: 5000, wr: 180, d: '역삼동' },
      'offi-trade': { n: 3, few: true, sh: 0, d: '역삼동' },
      'land-trade': { n: 8, sh: 2, med: 90000, m2: 3200.5, top: [['대', 6]], d: '역삼동' },
      'nrg-trade': { n: 6, sh: 0, med: 150000, pp: 9000, top: [['제2종근린생활', 4]], d: '역삼동' }
    } } });
  const h = M.sectionHtml('st-a');
  const row = k => (h.match(new RegExp('<tr data-kind="' + k + '">([\\s\\S]*?)</tr>')) || [])[1] || '';
  check('7줄', (h.match(/<tr /g) || []).length === 7);
  check('전월세: 전세 5억 2,000만 (30건)', /전세 <b>5억 2,000만<\/b> \(30건\)/.test(row('apt-rent')), row('apt-rent'));
  check('전월세: 월세 보증금 / 월세', /월세 <b>5,000만 \/ 180만<\/b> \(10건\)/.test(row('apt-rent')), row('apt-rent'));
  check('5건 미만 → 거래 적음 (3건), 값 없음', /거래 적음 \(3건\)/.test(row('offi-trade')) && !/<b>/.test(row('offi-trade')), row('offi-trade'));
  check('토지: ㎡당 + 지분 제외 표시', /3,201만<\/b>\/㎡/.test(row('land-trade')) && /지분거래 2건 제외/.test(row('land-trade')), row('land-trade'));
  check('상가: 용도 상위', /제2종근린생활 4/.test(row('nrg-trade')));
  check('없는 종류 → 자료 없음', /자료 없음/.test(row('silv-trade')) && /자료 없음/.test(row('rh-trade')));
  check('없는 역 → 7칸 모두 자료 없음', (M.sectionHtml('st-zzz').match(/자료 없음/g) || []).length === 7);
  check('수익률 표시 없음 (1단계 결정)', !/수익률/.test(h));
  const bad = await withData({ stations: { 'st-a': {} } });
  check('역 ID 키가 아닌 자료는 거부', bad.isReady() === false);

  console.log('\n[결과 파일 data/station-market.json]');
  const f = path.join(ROOT, 'data/station-market.json');
  if (!fs.existsSync(f)) { check('파일 있음', false); }
  else {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const stations = JSON.parse(read('data/stations.geojson')).features.map(x => x.properties.id);
    const ids = new Set(stations);
    const keys = Object.keys(d.stations);
    check('역 ID 키', d.keyed_by === 'station_id' && keys.length > 0, keys.length);
    check('모든 키가 실제 역 ID', keys.every(k => ids.has(k)), keys.filter(k => !ids.has(k)).slice(0, 5));
    check('7종 표 · 기간 · 5건 기준', Object.keys(d.kinds).length === 7 && d.period.length === 2 && d.minDeals === 5, d.kinds);
    const cells = keys.flatMap(k => Object.entries(d.stations[k]));
    check('5건 미만 칸에는 중위값이 없다', cells.every(([, s]) => !s.few || (s.med == null && s.pp == null && s.m2 == null)));
    check('중위값 있는 칸은 5건 이상', cells.every(([k, s]) => /-rent$/.test(k) || s.med == null || s.n >= 5));
    check('전월세 전세·월세 중위도 5건 이상일 때만', cells.every(([k, s]) => !/-rent$/.test(k) || ((s.jd == null || s.jn >= 5) && (s.wr == null || s.wn >= 5))));
    check('수익률 필드 없음', !/yield|수익률/.test(JSON.stringify(d.stations)));
    check('보고서에 연결 근거 없는 거래 수가 있음', Object.values(d.report).every(r => typeof r.unlinked === 'number' && typeof r.linked === 'number'));
    check('압축 저장 (들여쓰기 없음)', !/\n\s+"/.test(fs.readFileSync(f, 'utf8').slice(0, 5000)));
  }

  console.log('\n[연결 — 소스 모양]');
  const app = read('js/app.js'), sd = read('js/station-detail.js'), html = read('index.html'), sw = read('sw.js');
  check('투자 모드일 때만 받음 (loadInvestData 안)', /function loadInvestData\(\) \{[\s\S]*?station-market\.json[\s\S]*?\n\}/.test(app));
  check('역 상세는 투자 모드에서만 그림', /if \(invest && typeof StationMarket/.test(sd));
  check('index.html·서비스워커에 market.js', html.includes('js/market.js') && sw.includes("'./js/market.js'"));

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
