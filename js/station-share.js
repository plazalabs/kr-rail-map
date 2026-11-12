/* StationShareImage — 떡상 카드 '📸 공유 이미지' (지도 안 떡상 패널용, 2026-11-12)
 *
 * 정사각형 1080×1080 PNG (인스타·카톡). 화면 글꼴로 캔버스에 그린다. 외부 자원 없음.
 * 휴대폰에서 파일 공유를 지원하면 공유 창, 아니면 내려받기.
 * 그림은 rank.html 의 shareCanvas 와 같다 (예전엔 패널에서 누르면 rank.html 로 넘어갔다 — 회장님: 한 화면에).
 * TODO(새벽 개편): rank.html 도 이 파일을 쓰게 해서 그리는 코드를 하나로.
 */
(function (global) {
  'use strict';
  var WLABEL = { avg: '', cbd: '도심 중시 ', ybd: '여의도 중시 ', gbd: '강남 중시 ' };
  var COLS = { rocket: '#0a8f4a', up: '#3aa76d', flat: '#8a929a', down: '#d9701a', new: '#7a3fd0' };

  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // 이 역에 새로 생기는 노선 (개통 전) — '이름 연도'
  function planLines(doc, r) {
    return (r.lines || []).map(function (id) { return doc.lines && doc.lines[id]; })
      .filter(function (m) { return m && m.s !== 'open'; }).slice(0, 3)
      .map(function (m) { var y = RankTable.yearOf(m.o); return m.n + (y ? ' ' + y : ''); });
  }

  // o: { doc, y: '2031'|'all', w: 'avg'|…, wait }
  function draw(r, o) {
    var S = 1080, c = document.createElement('canvas'); c.width = S; c.height = S;
    var g = c.getContext('2d');
    var F = '"Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    var t = RankTable.tierOf(r);
    var bg = g.createLinearGradient(0, 0, 0, S); bg.addColorStop(0, '#0b1d3a'); bg.addColorStop(1, '#10305e');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,.06)'; for (var i = 0; i < 6; i++) { g.beginPath(); g.arc(900 - i * 40, 160 + i * 30, 260 - i * 30, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + F; g.fillText('GTX 개통 후, 우리 역은 몇 등?', 80, 120);
    g.fillStyle = '#ffffff'; g.font = '800 104px ' + F; g.fillText(r.name + '역', 80, 250);
    g.fillStyle = '#9fb3d1'; g.font = '500 32px ' + F; g.fillText([r.region, r.sgg].filter(Boolean).join(' ') + ' · 수도권 ' + (WLABEL[o.w] || '') + '순위', 84, 305);
    g.font = '700 46px ' + F; g.fillStyle = '#c8d3e6';
    g.fillText(r.isNew ? '지금은 철도 없음' : '지금 ' + r.now.rank + '위', 80, 440);
    g.fillStyle = '#ffffff'; g.font = '800 150px ' + F; g.fillText(r.aft.rank + '위', 80, 600);
    var w1 = g.measureText(r.aft.rank + '위').width;
    g.font = '600 36px ' + F; g.fillStyle = '#c8d3e6'; g.fillText(o.y === 'all' ? '개통 후' : o.y + '년 개통 후', 80 + w1 + 24, 600);
    var bt = t === 'new' ? '신규' : (r.change > 0 ? '▲' + r.change + '계단' : r.change < 0 ? '▼' + (-r.change) + '계단' : '그대로') + '  ' + RankTable.TIERS[t].label;
    g.font = '800 44px ' + F; var bw = g.measureText(bt).width + 56;
    roundRect(g, 80, 640, bw, 78, 39); g.fillStyle = COLS[t]; g.fill();
    g.fillStyle = '#fff'; g.fillText(bt, 108, 694);
    var plan = planLines(o.doc, r);
    if (plan.length) { g.font = '600 30px ' + F; g.fillStyle = '#c8d3e6'; g.fillText('새 노선 ' + plan.join(' · '), 80 + bw + 26, 692); }
    ['CBD 도심', 'YBD 여의도', 'GBD 강남'].forEach(function (d, k) {
      var y = 800 + k * 70, n = r.now.times ? r.now.times[k] : null, a = r.aft.times ? r.aft.times[k] : null;
      g.fillStyle = '#9fb3d1'; g.font = '600 32px ' + F; g.fillText(d, 80, y);
      g.fillStyle = '#ffffff'; g.font = '800 40px ' + F;
      g.fillText((n != null && a != null && n > a) ? n + '분 → ' + a + '분' : (a == null ? '—' : a + '분'), 330, y);
      if (n != null && a != null && n > a) { g.fillStyle = '#5fe39a'; g.font = '800 34px ' + F; g.fillText('−' + (n - a) + '분', 720, y); }
    });
    g.fillStyle = '#7f93b3'; g.font = '500 24px ' + F;
    g.fillText(o.wait ? '추정값 · 타고 가는 시간 + 갈아타며 걷는 시간 + 출퇴근 배차 기다림' : '추정값 · 타고 가는 시간 + 갈아타며 걷는 시간 (기다리는 시간 제외)', 80, 1000);
    g.fillStyle = '#c8d3e6'; g.font = '700 28px ' + F;
    g.fillText('한국철도맵 GTX 떡상 랭킹 · plazalabs.github.io/kr-rail-map', 80, 1044);
    return c;
  }

  function fileName(r) { return 'GTX떡상_' + r.name + '_' + (r.now.rank || '') + '위→' + r.aft.rank + '위.png'; }

  // 반환: 안내 글 ('공유했어요' / '이미지를 저장했어요' / '' (취소))
  function save(r, o) {
    var c = draw(r, o);
    return new Promise(function (res) { c.toBlob(res, 'image/png'); }).then(function (blob) {
      if (!blob) return '이미지를 만들지 못했어요.';
      var name = fileName(r);
      var file = (typeof File === 'function') ? new File([blob], name, { type: 'image/png' }) : null;
      var download = function () {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        return '이미지를 저장했어요';
      };
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: r.name + ' GTX 개통 후 ' + r.aft.rank + '위', text: location.origin + location.pathname })
          .then(function () { return '공유했어요'; }, function (e) { return (e && e.name === 'AbortError') ? '' : download(); });
      }
      return download();
    });
  }

  global.StationShareImage = { draw: draw, save: save, fileName: fileName };
})(typeof window !== 'undefined' ? window : globalThis);
