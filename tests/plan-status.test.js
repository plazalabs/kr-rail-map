/* 미래 노선 근거 시험 (H3, 2026-11-14) — 개통 전 노선마다 사업 단계·근거·출처 링크·확인일이 있고,
 * 자료 페이지 표·노선 페이지에 나오며, 연도 화면 세 곳이 그 표로 이어진다.
 * 실행: node tests/plan-status.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)}`); }
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const lines = JSON.parse(read('data/lines.geojson')).features.map(f => f.properties);
const future = lines.filter(p => p.status !== 'open');
const STAGES = ['공사 중', '설계 중', '신설 승인', '정부 계획(구상)', '지자체 제안', '검토 중'];

console.log('\n[자료] 개통 전 노선마다 단계·근거·링크·확인일');
check('개통 전 노선 10개 이상', future.length >= 10, future.length);
const bad = future.filter(p => !STAGES.includes(p.plan_stage) || !p.plan_basis || !/^https:\/\//.test(p.plan_url || '') || !/^\d{4}-\d{2}-\d{2}$/.test(p.plan_checked || ''));
check('모두 정해진 단계 이름 + 근거 + https 링크 + 확인일', bad.length === 0, bad.map(p => p.id));
check("근거·단계에 '확률' 숫자를 붙이지 않음", future.every(p => !/확률|가능성\s*\d/.test(p.plan_basis + p.plan_stage)), future.filter(p => /확률|가능성\s*\d/.test(p.plan_basis)).map(p => p.id));   // 공정률(76.4%) 같은 사실은 됨
check('운행 중 노선에는 안 붙임', lines.filter(p => p.status === 'open' && p.plan_stage).length === 0);
const dj = lines.find(p => p.id === 'daejeon-metro-line-2');
check('대전 2호선 개통 = 대전시 2026-06 발표(2030년 하반기)', dj && /2030년 하반기/.test(dj.opened), dj && dj.opened);

console.log('\n[화면] 자료 페이지 표 · 노선 페이지 · 연도 화면 링크');
const data = read('data.html');
const block = (data.match(/<!-- plans:start -->([\s\S]*?)<!-- plans:end -->/) || [])[1] || '';
check('data.html 에 #plans 표', /id="plans"/.test(block), block.length);
check('표 줄 수 = 개통 전 노선 수', (block.match(/<tr><td>/g) || []).length === future.length, (block.match(/<tr><td>/g) || []).length);
check("표 위에 '그해까지 개통한다고 가정' 설명", /개통한다고 가정/.test(block));
const gtxc = read('line/gtx-c.html');
check('노선 페이지(GTX-C)에 단계·근거·출처·확인일', /class="plan"/.test(gtxc) && /공사 중/.test(gtxc) && /출처/.test(gtxc) && /마지막 확인/.test(gtxc));
check('운행 중 노선 페이지(공항철도)에는 상자 없음', !/<div class="plan">/.test(read('line/arex.html')));
check('순위표(rank.html) 연도 옆 근거 링크', /href="data\.html#plans"/.test(read('rank.html')));
check('타일 지도 연도 옆 근거 링크', /data\.html#plans/.test(read('js/market-map.js')));
check('떡상 패널 연도 설명 옆 근거 링크', /data\.html#plans/.test(read('js/rocket-panel.js')));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
