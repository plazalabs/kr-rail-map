/* GTX 입구 링크 미리보기 그림 — image/og-gtx.jpg (1200×630, JPEG)
 *
 * 실행: node data/build_og_gtx.js   (build_gtx_card.js 뒤. 헤드리스 크롬으로 캔버스를 그려 저장 — build_og_rank.js 와 같은 방식)
 * 정적 사이트라 역마다 다른 그림은 못 만든다 — 공용 하나. 큰 숫자 예시는 홈 TOP1 역의 카드 값(gtx-card.json) 그대로.
 * 카드 규칙의 금지어('떡상'·'계단' 등)를 쓰지 않는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const { launch } = require(path.join(ROOT, 'tests/e2e/lib/cdp'));
const G = require(path.join(ROOT, 'js/gtx-card.js'));
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const card = read('data/gtx-card.json');
const top = read('data/rank-top.json').top[0];
const x = card.s[top.id];
if (!x || x.kd !== 'cut') throw new Error('예시 역 카드가 없거나 줄어드는 업무지구가 없음: ' + top.id);
const d = card.dest[x.d];
const mk = x.k && card.k[x.k] ? card.k[x.k].m : 'none';
const ex = {
  st: x.n + (x.g ? ' · ' + x.g : ''),
  big: d.name + '까지 지금 ' + x.now[x.d] + '분 → 개통 후 ' + x.aft[x.d] + '분',
  acc: G.TIER_WORD[x.t], mk: G.MARKET_WORD[mk], year: card.year,
};
const words = Object.values(ex).join(' ');
const bad = G.hasBanned(words);
if (bad.length) throw new Error('금지어: ' + bad.join(','));

const html = `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c" width="1200" height="630"></canvas><script>
const E = ${JSON.stringify(ex)};
const g = document.getElementById('c').getContext('2d'), F = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, '#0b1d3a'); bg.addColorStop(1, '#123a6e'); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
g.fillStyle = '#9fb3d1'; g.font = '600 28px ' + F; g.fillText('한국철도맵 · GTX 입구', 64, 70);
g.fillStyle = '#fff'; g.font = '800 46px ' + F; g.fillText('우리 동네에서 업무지구까지 몇 분?', 64, 136);
// 카드
rr(64, 172, 1072, 330, 24); g.fillStyle = '#ffffff'; g.fill();
g.fillStyle = '#4a5158'; g.font = '700 28px ' + F; g.fillText(E.st, 104, 228);
g.fillStyle = '#16191d'; let s = 60; g.font = '800 ' + s + 'px ' + F; while (g.measureText(E.big).width > 990) { s--; g.font = '800 ' + s + 'px ' + F; } g.fillText(E.big, 104, 310);
g.fillStyle = '#5b6470'; g.font = '600 24px ' + F; g.fillText(E.year + '년까지 개통 가정', 104, 352);
const chip = (x, label, word, fg, bgc, round) => { g.font = '800 30px ' + F; const w = g.measureText(word).width; g.font = '600 22px ' + F; const lw = g.measureText(label).width;
  const W = lw + w + 52; rr(x, 388, W, 70, round); g.fillStyle = bgc; g.fill(); g.lineWidth = 3; g.strokeStyle = fg; g.stroke();
  g.fillStyle = fg; g.font = '600 22px ' + F; g.fillText(label, x + 20, 431); g.font = '800 30px ' + F; g.fillText(word, x + 32 + lw, 433); return x + W + 20; };
const nx = chip(104, '접근성', E.acc, '#08743c', '#dcf5e6', 35);
chip(nx, '시세 흐름', E.mk, '#6a2fc0', '#f1eafd', 8);
g.fillStyle = '#c8d3e6'; g.font = '700 28px ' + F; g.fillText('접근성 순위·시세는 다른 지표 · 집값 예측 아님', 64, 560);
g.fillStyle = '#7f93b3'; g.font = '500 22px ' + F; g.fillText('plazalabs.github.io/kr-rail-map/gtx.html', 64, 602);
window.DONE = document.getElementById('c').toDataURL('image/jpeg', 0.9);
</script>`;

const srv = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end(html); }).listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const b = await launch({ port: 9842, w: 1200, h: 630 });
  try {
    await b.goto('http://127.0.0.1:' + port + '/', 1200);
    const url = await b.evaluate('window.DONE');
    const out = path.join(ROOT, 'image/og-gtx.jpg');
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    console.log('image/og-gtx.jpg', (fs.statSync(out).size / 1024).toFixed(0) + 'KB', ex.st, '·', ex.big, '·', ex.acc, '·', ex.mk);
  } finally { await b.close(); srv.close(); }
});
