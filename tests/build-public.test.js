/* 공개 결과물 만들기 (tools/build_public.js) 의 주석 지우기 시험
 * 실행: node tests/build-public.test.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { stripJs, stripCss, stripHtml } = require(path.join(__dirname, '..', 'tools', 'build_public.js'));

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
}
const S = s => stripJs(s).replace(/\s+$/, '');

console.log('\n[JS] 주석은 지우고 코드는 그대로');
check('줄 주석', S('var a = 1; // 설명') === 'var a = 1;', S('var a = 1; // 설명'));
check('덩이 주석', S('/* 설명\n 둘째 줄 */\nvar a = 1;').trim() === 'var a = 1;');
check("문자열 안 // 는 그대로", S("var u = 'https://x.org/a'; // c") === "var u = 'https://x.org/a';");
check('큰따옴표 안 /* 는 그대로', S('var s = "/* 아님 */";') === 'var s = "/* 아님 */";');
check('정규식 안 / 와 * 는 그대로', S('var r = /\\/\\*/g; /* k */ var b = 1;') === 'var r = /\\/\\*/g;   var b = 1;', S('var r = /\\/\\*/g; /* k */ var b = 1;'));
check('정규식 [ ] 안의 / 는 그대로', S('var r = /[/]/; // c') === 'var r = /[/]/;');
check('정규식 안 // 는 그대로', S("s.replace(/\\/\\//g, ''); // x") === "s.replace(/\\/\\//g, '');");
check('나눗셈은 정규식으로 안 봄', S('x = a / b / c; // d') === 'x = a / b / c;');
check('return 뒤 정규식', S('return /a\\/b/.test(s); // z') === 'return /a\\/b/.test(s);');
check('템플릿 글자 안 // 는 그대로', S('var s = `a // b`; // c') === 'var s = `a // b`;');
check('템플릿 ${} 안 주석은 지움, 중괄호 깊이 따라감', S('var s = `a${ {x:1}.x /* in */ }b // not`; // c') === 'var s = `a${ {x:1}.x   }b // not`;', S('var s = `a${ {x:1}.x /* in */ }b // not`; // c'));
check('겹친 템플릿', S('var s = `a${ `b${c}` }d`; // e') === 'var s = `a${ `b${c}` }d`;');

console.log('\n[CSS·HTML]');
check('CSS 주석 지움, 문자열 안은 그대로', stripCss('a{b:1}/* x */c{content:"/* y */"}') === 'a{b:1}c{content:"/* y */"}');
const h = stripHtml('<!-- 설명 -->\n<p>본문</p>\n<script>\n// 설명\nvar a = 1;\n</script>\n<script type="application/ld+json">{"a":"//b"}</script>\n<style>/* s */a{b:1}</style>\n');
check('HTML 주석·안쪽 스크립트 주석 지움, JSON-LD 그대로', !/설명/.test(h) && /var a = 1;/.test(h) && /\{"a":"\/\/b"\}/.test(h) && !/\/\* s \*\//.test(h), h);

console.log('\n[실제 파일] 우리 JS 전부: 지운 뒤에도 문법이 맞다 (동작 확인은 dist 로 전체 e2e)');
const ROOT = path.join(__dirname, '..');
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
let bad = [];
for (const f of jsFiles) {
  const raw = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').replace(/\r\n/g, '\n');
  const out = stripJs(raw);
  try { new vm.Script(out); } catch (e) { bad.push(f + ': ' + e.message); }
}
check(`js/ ${jsFiles.length}개 문법 통과`, bad.length === 0, bad);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
