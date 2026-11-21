/* 축지법 랭킹 링크 미리보기 그림 — image/og-rank.jpg (1200×630, JPEG — PNG 은 약 690KB 라 무겁다)
 *
 * 실행: node data/build_og_rank.js   (헤드리스 크롬으로 캔버스를 그려 JPEG 로 저장. rank.json 이 바뀌면 다시)
 * 카톡·트위터에 rank.html 주소를 붙이면 이 그림이 뜬다. 정적 사이트라 역마다 다른 그림은 못 만든다 —
 * 홈 카드·랭킹과 같은 기준(rank.json default_year · 수도권 평균 · 많이 오르는 순, rank-top.json 과 같은 거르기)으로 TOP 5 를 그린다.
 * 그림에 쓴 값은 data/og-rank.json 에 같이 적는다(그림 sha1 포함) — 시험이 rank-top.json·홈 카드와 맞춰 본다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const RT = require(path.join(ROOT, 'js/rank.js'));

// 그림에 쓰는 값 — 기준 연도·기준 글자·TOP 5
function ogData(doc) {
  const year = RT.defaultYear(doc);
  const c = RT.compute(doc, { weight: 'avg', region: 'capital', at: year });
  const top = RT.sortRows(c.rows.filter(r => !r.isNew && r.change > 0), 'rise').slice(0, 5)
    .map(r => ({ id: r.id, n: r.name, now: r.now.rank, aft: r.aft.rank, ch: r.change }));
  const scenario = (year === 'all' ? '모든 계획 노선' : year + '년까지') + ' 개통 가정 · 수도권 ' + c.total.toLocaleString('ko-KR') + '역 중';
  return { year, total: c.total, scenario, top };
}

function pageHtml(d) {
  return `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c" width="1200" height="630"></canvas><script>
const D = ${JSON.stringify(d)}, T = D.top;
const g = document.getElementById('c').getContext('2d'), F = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, '#0b1d3a'); bg.addColorStop(1, '#123a6e'); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
g.fillStyle = '#9fb3d1'; g.font = '600 30px ' + F; g.fillText('한국철도맵', 64, 78);
g.fillStyle = '#fff'; g.font = '800 64px ' + F; g.fillText('GTX 개통 후,', 64, 168); g.fillText('우리 역은 몇 등?', 64, 248);
g.fillStyle = '#5fe39a'; g.font = '800 40px ' + F; g.fillText('GTX 축지법 랭킹', 64, 320);
g.fillStyle = '#c8d3e6'; g.font = '500 26px ' + F; g.fillText('CBD·YBD·GBD 까지 시간으로 매긴', 64, 380); g.fillText('수도권 역 순위 — 지금 vs 개통 후', 64, 416);
g.fillStyle = '#7fb0ff'; g.font = '700 28px ' + F; g.fillText('철도의 축, 도시의 내일', 64, 500);
g.fillStyle = '#7f93b3'; g.font = '500 22px ' + F; g.fillText('plazalabs.github.io/kr-rail-map/rank.html', 64, 580);
// 오른쪽: 많이 오르는 TOP 5 — 기준 글자는 제목 바로 아래 (숫자와 같은 자리)
const X = 660; g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.roundRect ? g.roundRect(X - 30, 60, 530, 510, 24) : g.rect(X - 30, 60, 530, 510); g.fill();
g.fillStyle = '#9fb3d1'; g.font = '700 26px ' + F; g.fillText('많이 오르는 역 TOP 5', X, 106);
g.fillStyle = '#ffd166'; g.font = '600 21px ' + F; g.fillText(D.scenario, X, 140);
T.forEach((r, i) => { const y = 200 + i * 78;
  g.fillStyle = '#fff'; g.font = '800 32px ' + F; g.fillText((i + 1) + '. ' + r.n, X, y);
  g.fillStyle = '#9fb3d1'; g.font = '600 23px ' + F; g.fillText(r.now + '위 → ' + r.aft + '위', X, y + 32);
  g.fillStyle = '#5fe39a'; g.font = '800 30px ' + F; g.textAlign = 'right'; g.fillText('▲' + r.ch, X + 470, y + 14); g.textAlign = 'left'; });
window.DONE = document.getElementById('c').toDataURL('image/jpeg', 0.9);
</script>`;
}

function build() {
  const { launch } = require(path.join(ROOT, 'tests/e2e/lib/cdp'));
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rank.json'), 'utf8'));
  const d = ogData(doc), html = pageHtml(d);
  const srv = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end(html); }).listen(0, '127.0.0.1', async () => {
    const port = srv.address().port;
    const b = await launch({ port: 9841, w: 1200, h: 630 });
    try {
      await b.goto('http://127.0.0.1:' + port + '/', 1200);
      const url = await b.evaluate('window.DONE');
      const out = path.join(ROOT, 'image/og-rank.jpg');
      const buf = Buffer.from(url.split(',')[1], 'base64');
      fs.writeFileSync(out, buf);
      const meta = { ...d, jpg_sha1: crypto.createHash('sha1').update(buf).digest('hex') };
      fs.writeFileSync(path.join(ROOT, 'data/og-rank.json'), JSON.stringify(meta, null, 1) + '\n');
      console.log('image/og-rank.jpg', (buf.length / 1024).toFixed(0) + 'KB', d.scenario, 'TOP5', d.top.map(r => r.n + ' ' + r.now + '→' + r.aft).join(', '));
    } finally { await b.close(); srv.close(); }
  });
}

module.exports = { ogData };
if (require.main === module) build();
