/* StationShareImage — 떡상 카드 '공유 이미지' (지도 안 떡상 패널용, 2026-11-12)
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
    g.fillStyle = '#7fb0ff'; g.font = '700 26px ' + F; g.fillText('축을 읽으면, 도시의 미래가 보인다', 80, 64);   // 슬로건 (2026-11-14 확정)
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
    ['도심권 CBD', '여의도권 YBD', '강남권 GBD'].forEach(function (d, k) {
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
  function save(r, o) { return saveCanvas(draw(r, o), fileName(r), r.name + ' GTX 개통 후 ' + r.aft.rank + '위'); }

  /* ── 카톡·인스타 공유 카드 (회장님 11-14: 사진이 곧 광고 — 3→1→4→2→5 순서) ──
   * 모두 세로 1080×1350(4:5, 카톡·인스타에서 가장 크게 보임) + 같은 아래 띠(슬로건·주소·'추정·집값 예측 아님·기준일').
   * 앱 이름은 BRAND 한 곳만 — 이름이 정해지면 여기만 바꾼다. */
  var BRAND = '한국철도맵';   // TODO(앱 이름 확정 후): 새 이름으로
  var SITE = 'plazalabs.github.io/kr-rail-map';
  var FONT = '"Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  function cardBase(H) {
    var W = 1080, c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b1d3a'); bg.addColorStop(1, '#10305e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#7fb0ff'; g.font = '700 26px ' + FONT; g.fillText('축을 읽으면, 도시의 미래가 보인다', 72, 70);
    return { c: c, g: g, W: W, H: H };
  }
  // 아래 띠 — note: 계산 방식 한 줄, asof: 자료 기준일
  function cardFooter(k, note, asof) {
    var g = k.g, y = k.H - 150;
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(72, y, k.W - 144, 2);
    g.fillStyle = '#9fb3d1'; g.font = '500 24px ' + FONT;
    g.fillText(note, 72, y + 44);
    g.fillText('교통 접근성 추정 · 집값·투자수익 예측 아님' + (asof ? ' · 자료 기준 ' + asof : ''), 72, y + 80);
    g.fillStyle = '#ffffff'; g.font = '800 30px ' + FONT; g.fillText(BRAND, 72, y + 126);
    var bw = g.measureText(BRAND).width;
    g.fillStyle = '#c8d3e6'; g.font = '600 26px ' + FONT; g.fillText(SITE, 72 + bw + 18, y + 126);
  }

  // ③ TOP10 순위표 카드 — rows: 오른 순 정렬된 역(최대 10), o: { y, w, wait, asof }
  function drawTop10(rows, o) {
    var k = cardBase(1350), g = k.g;
    var when = o.y === 'all' ? '모두 개통하면' : o.y + '년까지 개통하면';
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + FONT; g.fillText('GTX·새 노선 ' + when, 72, 132);
    g.fillStyle = '#ffffff'; g.font = '800 64px ' + FONT; g.fillText('교통 접근성이 가장 많이 오르는 역', 72, 214);
    g.fillStyle = '#9fb3d1'; g.font = '500 28px ' + FONT;
    g.fillText('수도권 ' + (WLABEL[o.w] || '') + '접근성 순위 · TOP ' + rows.length, 72, 262);
    var top = 310, rh = 82;
    rows.slice(0, 10).forEach(function (r, i) {
      var y = top + i * rh;
      if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(56, y - 4, k.W - 112, rh - 6); }
      g.fillStyle = i < 3 ? '#ffd166' : '#9fb3d1'; g.font = '800 40px ' + FONT; g.fillText(String(i + 1), 80, y + 50);
      g.fillStyle = '#ffffff'; g.font = '800 40px ' + FONT;
      var nm = r.name; while (g.measureText(nm).width > 330 && nm.length > 2) nm = nm.slice(0, -1);
      g.fillText(nm === r.name ? nm : nm + '…', 150, y + 50);
      g.fillStyle = '#9fb3d1'; g.font = '500 26px ' + FONT; g.fillText([r.region, r.sgg].filter(Boolean).join(' '), 500, y + 48);   // 이름은 330px 안으로 자름(150~480)
      var chg = '▲' + r.change;
      g.fillStyle = '#5fe39a'; g.font = '800 40px ' + FONT;   // 어두운 바탕에서 잘 보이는 밝은 초록 (기존 역 카드 '−N분'과 같은 색)
      var cw = g.measureText(chg).width; g.fillText(chg, k.W - 80 - cw, y + 50);
      g.fillStyle = '#c8d3e6'; g.font = '600 26px ' + FONT;
      var rk = r.now.rank + '위 → ' + r.aft.rank + '위', rw = g.measureText(rk).width; g.fillText(rk, k.W - 80 - cw - 28 - rw, y + 48);
    });
    cardFooter(k, o.wait ? '타는 시간 + 갈아타며 걷는 시간 + 출퇴근 배차 기다림 · 업무지구까지' : '타는 시간 + 갈아타며 걷는 시간(기다림 제외) · 업무지구까지', o.asof);
    return k.c;
  }
  function saveTop10(rows, o) {
    var name = 'GTX떡상_TOP10_' + (o.y === 'all' ? '전체개통' : o.y + '년') + '.png';
    return saveCanvas(drawTop10(rows, o), name, (o.y === 'all' ? '모두 개통하면' : o.y + '년까지') + ' 교통 접근성 TOP 10');
  }

  function saveCanvas(c, name, title) {
    return new Promise(function (res) { c.toBlob(res, 'image/png'); }).then(function (blob) {
      if (!blob) return '이미지를 만들지 못했어요.';
      var file = (typeof File === 'function') ? new File([blob], name, { type: 'image/png' }) : null;
      var download = function () {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        return '이미지를 저장했어요';
      };
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: title, text: location.origin + location.pathname })
          .then(function () { return '공유했어요'; }, function (e) { return (e && e.name === 'AbortError') ? '' : download(); });
      }
      return download();
    });
  }

  global.StationShareImage = { draw: draw, save: save, fileName: fileName, drawTop10: drawTop10, saveTop10: saveTop10, BRAND: BRAND };
})(typeof window !== 'undefined' ? window : globalThis);
