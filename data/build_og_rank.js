/* 떡상 랭킹 링크 미리보기 그림 — image/og-rank.jpg (1200×630, JPEG — PNG 은 약 690KB 라 무겁다)
 *
 * 실행: node data/build_og_rank.js   (헤드리스 크롬으로 캔버스를 그려 JPEG 로 저장. rank.json 이 바뀌면 다시)
 * 카톡·트위터에 rank.html 주소를 붙이면 이 그림이 뜬다. 정적 사이트라 역마다 다른 그림은 못 만든다 —
 * 수도권 평균 기준 '전체 개통 후 가장 많이 오르는 역 TOP 5' 를 그린다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const { launch } = require(path.join(ROOT, 'tests/e2e/lib/cdp'));
const RT = require(path.join(ROOT, 'js/rank.js'));

const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rank.json'), 'utf8'));
const c = RT.compute(doc, { weight: 'avg', region: 'capital' });
const top = RT.sortRows(c.rows, 'rise').filter(r => !r.isNew).slice(0, 5).map(r => ({ n: r.name, a: r.now.rank, b: r.aft.rank, d: r.change }));
// 특정 역을 앞세우지 않는다(중립, 2026-11-14) — 예전엔 광운대 한 역을 크게 보여 줬다. 그 자리에 슬로건

const html = `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c" width="1200" height="630"></canvas><script>
const T = ${JSON.stringify(top)};
const g = document.getElementById('c').getContext('2d'), F = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, '#0b1d3a'); bg.addColorStop(1, '#123a6e'); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
g.fillStyle = '#9fb3d1'; g.font = '600 30px ' + F; g.fillText('한국철도맵', 64, 78);
g.fillStyle = '#fff'; g.font = '800 64px ' + F; g.fillText('GTX 개통 후,', 64, 168); g.fillText('우리 역은 몇 등?', 64, 248);
g.fillStyle = '#5fe39a'; g.font = '800 40px ' + F; g.fillText('🚀 GTX 떡상 랭킹', 64, 320);
g.fillStyle = '#c8d3e6'; g.font = '500 26px ' + F; g.fillText('CBD·YBD·GBD 까지 시간으로 매긴', 64, 380); g.fillText('수도권 역 순위 — 지금 vs 개통 후', 64, 416);
g.fillStyle = '#7fb0ff'; g.font = '700 28px ' + F; g.fillText('축을 읽으면, 도시의 미래가 보인다', 64, 500);
g.fillStyle = '#7f93b3'; g.font = '500 22px ' + F; g.fillText('plazalabs.github.io/kr-rail-map/rank.html', 64, 580);
// 오른쪽: 많이 오르는 TOP 5
const X = 660; g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.roundRect ? g.roundRect(X - 30, 60, 530, 510, 24) : g.rect(X - 30, 60, 530, 510); g.fill();
g.fillStyle = '#9fb3d1'; g.font = '700 26px ' + F; g.fillText('많이 오르는 역 TOP 5', X, 112);
T.forEach((r, i) => { const y = 180 + i * 84;
  g.fillStyle = '#fff'; g.font = '800 34px ' + F; g.fillText((i + 1) + '. ' + r.n, X, y);
  g.fillStyle = '#9fb3d1'; g.font = '600 24px ' + F; g.fillText(r.a + '위 → ' + r.b + '위', X, y + 34);
  g.fillStyle = '#5fe39a'; g.font = '800 30px ' + F; g.textAlign = 'right'; g.fillText('▲' + r.d, X + 470, y + 14); g.textAlign = 'left'; });
window.DONE = document.getElementById('c').toDataURL('image/jpeg', 0.9);
</script>`;

const srv = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end(html); }).listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const b = await launch({ port: 9841, w: 1200, h: 630 });
  try {
    await b.goto('http://127.0.0.1:' + port + '/', 1200);
    const url = await b.evaluate('window.DONE');
    const out = path.join(ROOT, 'image/og-rank.jpg');
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    console.log('image/og-rank.jpg', (fs.statSync(out).size / 1024).toFixed(0) + 'KB', 'TOP5', top.map(r => r.n + '▲' + r.d).join(' '));
  } finally { await b.close(); srv.close(); }
});
