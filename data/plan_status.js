/* 미래 노선의 사업 단계·근거·출처 링크·확인일 (H3, 2026-11-14)
 *
 * 왜: 연도 버튼(떡상·타일 지도)은 미래를 매우 구체적으로 보이게 한다. 68점 평가 10번·기획서 11.5 —
 *     "공식 목표 연도와 시나리오 연도를 나누고, 노선마다 근거·발표 시점·사업 단계·마지막 확인일을 연결하라."
 * 무엇: data/lines.geojson 의 개통 전 노선마다 properties 에
 *     plan_stage   — 공사 중 / 설계 중 / 신설 승인 / 정부 계획(구상) / 지자체 제안 / 검토 중 (확인 가능한 상태만, 확률 같은 숫자 안 붙임)
 *     plan_basis   — 한 줄 근거 (누가 언제 무엇을 발표)
 *     plan_url     — 근거 링크 (보도자료 원문을 못 찾으면 그 발표를 전한 보도)
 *     plan_checked — 이 내용을 마지막으로 확인한 날
 *   을 붙인다. opened(화면 글자)도 최신 발표와 다르면 고친다.
 * 실행: node data/plan_status.js   (같은 값이면 바뀌는 것 없음)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'lines.geojson');
const CHECKED = '2026-11-14';

const PLAN = {
  'gtx-a-seoul-suseo': { stage: '공사 중', basis: '국토교통부: 삼성역 구간 보강 후 2027년 상반기 무정차 통과 전망, 삼성역 정차는 2028년 (2026-11-03 보도)', url: 'https://news.bizwatch.co.kr/article/real_estate/2026/11/03/0012' },
  'gtx-a-changneung': { stage: '신설 승인', basis: '2021-08 신설 승인(LH 비용 부담), LH 광역교통개선대책 개통 2030년으로 변경 (2026-09 보도)', url: 'https://biz.newdaily.co.kr/site/data/html/2026/09/30/2026093000143.html' },
  'gtx-a-pyeongtaek': { stage: '설계 중', basis: '국가철도공단: 2027년 4분기 설계 마치고 2028년 착공 구상 — 개통 시기 미확정 (2026-04 보도)', url: 'https://news.mtn.co.kr/news-detail/2026042005021558065' },
  'gtx-b': { stage: '공사 중', basis: '민자 구간 착공 보고(2025-03), 공사 72개월 — 2031년 운행 목표 (보도)', url: 'https://news.mtn.co.kr/news-detail/2025080716382129857' },
  'gtx-c': { stage: '공사 중', basis: '국토교통부: 2026-09-15 민간투자 본공사 착수, 공사 60개월 (2031년 목표)', url: 'https://www.sidae.com/article/2026091509243569574' },
  'gtx-c-sangnoksu': { stage: '공사 중', basis: 'GTX-C 본선과 같이 2026-09-15 본공사 착수 (2031년 목표)', url: 'https://www.sidae.com/article/2026091509243569574' },
  'gtx-d': { stage: '정부 계획(구상)', basis: '정부 2기 GTX 구상(2024-01-25 민생토론회) — D·E·F 1단계 2035년 개통 목표(그 발표를 전한 보도, 정부 원문엔 연도 없음), 제5차 국가철도망 구축계획 반영 전, 노선·역 확정 전', url: 'https://biz.newdaily.co.kr/site/data/html/2024/01/26/2024012600139.html' },
  'gtx-e': { stage: '정부 계획(구상)', basis: '정부 2기 GTX 구상(2024-01-25 민생토론회) — 2035년 개통 목표, 노선·역 확정 전', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148925218' },
  'gtx-f': { stage: '정부 계획(구상)', basis: '정부 2기 GTX 구상(2024-01-25 민생토론회) — 1단계(교산~왕숙2) 2035년 목표, 노선·역 확정 전', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148925218' },
  'gtx-g': { stage: '지자체 제안', basis: '경기도 GTX 플러스 노선안(2024-04-01) — 정부 계획 반영 전', url: 'https://newsseoul.co.kr/news/view/1065568225789045' },
  'gtx-h': { stage: '지자체 제안', basis: '경기도 GTX 플러스 노선안(2024-04-01) — 정부 계획 반영 전', url: 'https://newsseoul.co.kr/news/view/1065568225789045' },
  'dongbuk-line': { stage: '공사 중', basis: '서울시: 2027년 11월 개통 목표, 공정률 76.4% (2026-09 시의회 현장 방문)', url: 'https://m.go.seoul.co.kr/news/2026/09/07/20260907500208' },
  'dongbu-line': { stage: '검토 중', basis: '서울시 제3차 도시철도망 구축계획(2026-06)에 안 들어감 — 사업 타당성 검토 뒤 계획 변경으로 추진 예정', url: 'https://www.nocutnews.co.kr/news/6531171' },
  'gwangju-metro-line-2-inner-circle-line': { stage: '공사 중', basis: '전남광주통합특별시 발표(2026-10-02): 1단계 2028년 12월, 2단계 2035년 12월로 연기', url: 'https://news.mtn.co.kr/news-detail/2026100214544582969' },
  'daegusaneop-line': { stage: '공사 중', basis: '국가철도공단: 2025-11 제2공구 착공, 2030년 12월 개통 예정', url: 'https://www.hankyung.com/article/2025111200281' },
  'daejeon-metro-line-2': { stage: '공사 중', basis: '대전시 발표(2026-06-23): 보상 지연·시운전 연장으로 2028년 말 → 2030년 하반기', url: 'https://www.segye.com/newsView/20260623517601', opened: '2030년 하반기 (대전시 2026-06-23 발표 — 당초 2028년 말)' },
  'yangsan-line': { stage: '공사 중', basis: '부산시·양산시 운영 협약(2026-03-30), 종합시험운행 중 — 2026년 12월 개통 예정(보도, 확정 공고 전)', url: 'https://www.segye.com/newsView/20260828503196' },
  'busan-metro-line-2-yangsan-ext': { stage: '공사 중', basis: '양산선과 같이 2026년 12월 개통 예정 — 부산시 운영(2026-03-30 협약)', url: 'https://www.segye.com/newsView/20260828503196' },
};

const raw = fs.readFileSync(P, 'utf8');
const doc = JSON.parse(raw);
let n = 0;
const missing = [];
for (const f of doc.features) {
  const p = f.properties;
  if (p.status === 'open') continue;
  const x = PLAN[p.id];
  if (!x) { missing.push(p.id); continue; }
  const want = { plan_stage: x.stage, plan_basis: x.basis, plan_url: x.url, plan_checked: CHECKED };
  if (x.opened) want.opened = x.opened;
  for (const [k, v] of Object.entries(want)) if (p[k] !== v) { p[k] = v; n++; }
}
if (missing.length) { console.error('근거 없는 개통 전 노선:', missing.join(', ')); process.exit(1); }
if (n) fs.writeFileSync(P, JSON.stringify(doc));

// data.html '미래 노선 근거' 표 (<!-- plans:start --> ~ <!-- plans:end --> 사이를 다시 쓴다)
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DP = path.join(__dirname, '..', 'data.html');
const page = fs.readFileSync(DP, 'utf8');
const rows = doc.features.filter(f => f.properties.status !== 'open' && f.properties.plan_stage)
  .sort((a, b) => a.properties.name_ko.localeCompare(b.properties.name_ko, 'ko', { numeric: true }))
  .map(f => { const p = f.properties; return '<tr><td><a href="line/' + esc(p.id) + '.html">' + esc(p.name_ko) + '</a></td><td>' + esc(p.plan_stage) + '</td><td>' + esc(p.opened || '미정') + '</td><td>' + esc(p.plan_basis) + ' · <a href="' + esc(p.plan_url) + '" rel="noopener" target="_blank">출처</a></td><td>' + esc(p.plan_checked) + '</td></tr>'; });
const block = '<!-- plans:start -->\n<h2 id="plans">미래 노선 근거 — 사업 단계·출처·확인일</h2>\n' +
  '<p>떡상 순위·타일 지도의 연도 버튼은 <b>그해까지 그 노선이 개통한다고 가정</b>한 계산입니다. 개통 시기는 아래 발표 기준이며 바뀔 수 있습니다. ' +
  '단계는 확인할 수 있는 상태(공사 중·설계 중·신설 승인·정부 계획(구상)·지자체 제안·검토 중)만 적고, 개통 확률 같은 숫자는 붙이지 않습니다. ' +
  '보도자료 원문을 찾지 못한 경우 그 발표를 전한 보도를 링크했습니다.</p>\n' +
  '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>노선</th><th>단계</th><th>개통(발표 기준)</th><th>근거</th><th>확인일</th></tr></thead><tbody>\n' + rows.join('\n') + '\n</tbody></table></div>\n<!-- plans:end -->';
let next;
if (page.includes('<!-- plans:start -->')) next = page.replace(/<!-- plans:start -->[\s\S]*?<!-- plans:end -->/, block);
else { const at = page.indexOf('<h2>정확성의 한계</h2>'); if (at < 0) throw new Error('data.html 자리 못 찾음'); next = page.slice(0, at) + block + '\n\n' + page.slice(at); }
if (next !== page) { fs.writeFileSync(DP, next); console.log('data.html 미래 노선 근거 표 갱신', rows.length + '줄'); }
console.log('바꾼 값', n, '· 개통 전 노선', Object.keys(PLAN).length);
module.exports = { PLAN };
