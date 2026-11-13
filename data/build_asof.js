/* 자료 기준일 표 (H5, 2026-11-14 · 68점 평가 16번 · 기획서 P0-4)
 *
 * 왜: "앱이 최근 수정됨"·"노선 계획을 최근 확인함"·"가격 자료가 최근 거래를 반영함"은 다른 사실이다.
 *     자료마다 기준일(어느 기간·언제 계산·언제 확인)을 따로, 한곳에 보여 준다.
 * 어떻게: 각 자료 파일 안에 적힌 값(updated·period·lastClosed·plan_checked)을 그대로 읽어 data.html 의
 *     <!-- asof:start --> ~ <!-- asof:end --> 사이를 다시 쓴다. 파일에 날짜가 없으면 칸을 비우지 않고 그 줄을 뺀다(지어내지 않음).
 * 실행: node data/build_asof.js   (자료를 다시 만든 뒤 함께 돌린다)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const J = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ym = s => { const m = String(s || '').match(/^(\d{4})-?(\d{2})/); return m ? m[1] + '년 ' + (+m[2]) + '월' : ''; };
const per = p => (Array.isArray(p) && p.length === 2) ? ym(p[0]) + '~' + ym(p[1]).replace(/^\d{4}년 /, '') + ' 거래' : '';

function rows() {
  const out = [];
  const price = J('data/station-price.json'), cx = J('data/station-complex.json'), tr = J('data/station-trend.json');
  const je = J('data/station-jeonse.json'), mk = J('data/station-market.json'), dev = J('data/station-dev.json');
  const acc = J('data/access.json'), rank = J('data/rank.json'), reg = J('data/station-region.json');
  const lines = J('data/lines.geojson');
  const add = (what, basis, date, note) => { if (date) out.push({ what, basis, date, note: note || '' }); };
  // 다음 갱신 예정 (4차 N4, 2026-11-14): 실거래는 계약 후 30일 안에 신고 → 다음 달 거래는 그다음 달 말에야 거의 찬다.
  // 마감월 M 이면 M+1 월분을 M+3 월 첫 주에 받는다 (예: 9월 마감 → 10월분은 12월 첫 주). 예정이며 늦어질 수 있음.
  const nextUp = s => { const m = String(s || '').match(/^(\d{4})-?(\d{2})/); if (!m) return ''; const d = new Date(+m[1], +m[2] - 1 + 3, 1), n = new Date(+m[1], +m[2], 1);
    return ' · 다음 갱신 예정 ' + d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 첫 주(' + (n.getMonth() + 1) + '월분)'; };
  if (cx && cx.period) add('주변 시세·단지 정보', per(cx.period), ym(cx.updated) + ' 마감분까지', '실거래는 계약 후 30일 안에 신고 — 최근 1~2개월은 건수가 적음' + nextUp(cx.updated));
  else if (price) add('주변 시세', '', ym(price.updated) + ' 마감분까지', nextUp(price.updated).slice(3));
  if (tr && tr.halves) add('가격 흐름(반기)', tr.halves[0].slice(0, 4) + '년 상반기~' + tr.halves[tr.halves.length - 1].slice(0, 4) + '년 ' + (tr.halves[tr.halves.length - 1].slice(4) === 'H1' ? '상' : '하') + '반기', ym(tr.lastClosed) + ' 마감분까지', '마감 안 된 반기는 흐리게 표시' + nextUp(tr.lastClosed));
  if (je && je.period) add('전세가율', per(je.period), ym(je.period[1]) + ' 마감분까지', '같은 단지·같은 면적 매매·전세 짝' + nextUp(je.period[1]));
  if (mk && mk.period) add('실거래 7종(전월세·오피스텔·토지 등)', per(mk.period), ym(mk.updated) + ' 마감분까지', nextUp(mk.updated).slice(3));
  if (dev && dev.updated) add('앞으로 들어올 세대(주택인허가)', '사용검사 전 인허가 건', dev.updated + ' 받음', '미착공 건은 취소·지연될 수 있음');
  if (acc && acc.updated) add('도심 접근성(역→업무지구 시간)', '공개 시간표·역간 시간 바탕 추정', rank && rank.updated ? rank.updated + ' 계산' : acc.updated + ' 계산', '');
  if (rank && rank.updated) add('떡상 순위(개통 후 순위 변화)', '연도 = 그해까지 개통한다고 가정', rank.updated + ' 계산', '');
  if (lines) {
    const ck = [...new Set(lines.features.map(f => f.properties.plan_checked).filter(Boolean))].sort();
    if (ck.length) add('미래 노선 개통 시기·사업 단계', '노선별 발표·보도 (아래 미래 노선 근거 표)', ck[ck.length - 1] + ' 확인', '계획은 바뀔 수 있음');
  }
  if (reg && reg.updated) add('같은 이름 역의 지역 표시', '국가철도공단 역 주소데이터 · OSM 행정경계', reg.updated + ' 만듦', '');
  // 코드에 적힌 공식 자료 기준일 (route.js 주석의 '기준' 글자를 그대로 읽는다)
  const route = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8');
  const rt = route.match(/역간거리 및 소요시간\((\d{4})\.(\d{1,2})\.(\d{1,2})\.\s*기준\)/);
  if (rt) add('지하철 역간 소요시간(1~8호선)', '서울교통공사 역간거리 및 소요시간', rt[1] + '-' + rt[2].padStart(2, '0') + '-' + rt[3].padStart(2, '0') + ' 기준', '');
  return out;
}

function main() {
  const R = rows();
  const block = '<!-- asof:start · data/build_asof.js 가 만든다. 손으로 고치지 말 것 -->\n<h2 id="asof">자료 기준일 — 자료마다 따로</h2>\n' +
    '<p>앱을 고친 날과 자료의 기준일은 다릅니다. 아래는 각 자료 파일에 적힌 기간·마감월·계산일·확인일을 그대로 옮긴 것입니다.</p>\n' +
    '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>자료</th><th>범위</th><th>기준일</th><th>주의</th></tr></thead><tbody>\n' +
    R.map(r => '<tr><td>' + esc(r.what) + '</td><td>' + esc(r.basis) + '</td><td>' + esc(r.date) + '</td><td>' + esc(r.note) + '</td></tr>').join('\n') +
    '\n</tbody></table></div>\n<!-- asof:end -->';
  const P = path.join(ROOT, 'data.html');
  const page = fs.readFileSync(P, 'utf8');
  let next;
  if (page.includes('<!-- asof:start')) next = page.replace(/<!-- asof:start[\s\S]*?<!-- asof:end -->/, block);
  else { const at = page.indexOf('<h2>항목별 출처</h2>'); if (at < 0) throw new Error('data.html 자리 못 찾음'); next = page.slice(0, at) + block + '\n\n' + page.slice(at); }
  if (next !== page) fs.writeFileSync(P, next);
  console.log('자료 기준일', R.length + '줄');
  return R;
}
if (require.main === module) main();
module.exports = { rows };
