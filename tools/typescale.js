// 글자 크기 7단계로 맞추기 (디자인 결함 전수 수정 작업 4). 한 번 돌리면 끝 — 다시 돌려도 안전.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SCALE = { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, '2xl': 26, '3xl': 34 };
function snap(v) {
  if (v <= 12.25) return 12; if (v <= 13.75) return 13; if (v < 16) return 15;
  if (v <= 18.5) return 17; if (v <= 23) return 20; if (v <= 30) return 26; return 34;
}
const nameOf = px => Object.keys(SCALE).find(k => SCALE[k] === px);
const useVar = f => f === 'css/style.css' || f.startsWith('js/') || f === 'index.html';
const files = ['css/style.css', 'index.html', 'rank.html', 'board.html', 'data.html',
  ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
const changed = {};
for (const f of files) {
  const p = path.join(ROOT, f); let s = fs.readFileSync(p, 'utf8'); let n = 0;
  s = s.replace(/font-size:(\s*)([0-9.]+)px/g, (m, sp, num) => {
    const px = snap(parseFloat(num)); n++;
    return 'font-size:' + sp + (useVar(f) ? `var(--fs-${nameOf(px)})` : px + 'px');
  });
  if (n) { fs.writeFileSync(p, s); changed[f] = n; }
}
console.log(changed);
