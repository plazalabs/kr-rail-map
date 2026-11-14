/* StationShareImage — 떡상 카드 '공유 이미지' (지도 안 떡상 패널용, 2026-11-12)
 *
 * 세로 1080×1350 PNG (인스타·카톡, 11-14 정사각형에서 바꿈). 화면 글꼴로 캔버스에 그린다. 외부 자원 없음.
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
    // 공유 카드 ① 우리 역 카드 (11-14): 정사각형 1080 → 세로 1080×1350(카톡·인스타에서 더 크게) + 공통 아래 띠
    var k = cardBase(1350), g = k.g, F = FONT, D = 40;   // D: 정사각형 때보다 내용을 아래로 내린 만큼
    var t = RankTable.tierOf(r);
    g.fillStyle = 'rgba(255,255,255,.06)'; for (var i = 0; i < 6; i++) { g.beginPath(); g.arc(900 - i * 40, 200 + i * 30, 260 - i * 30, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + F; g.fillText('GTX 개통 후, 우리 역은 몇 등?', 80, 120 + D);
    g.fillStyle = '#ffffff'; g.font = '800 104px ' + F; g.fillText(r.name + '역', 80, 250 + D);
    g.fillStyle = '#9fb3d1'; g.font = '500 32px ' + F; g.fillText([r.region, r.sgg].filter(Boolean).join(' ') + ' · 수도권 ' + (WLABEL[o.w] || '') + '순위', 84, 305 + D);
    g.font = '700 46px ' + F; g.fillStyle = '#c8d3e6';
    g.fillText(r.isNew ? '지금은 철도 없음' : '지금 접근성 ' + r.now.rank + '위', 80, 460 + D);
    g.fillStyle = '#ffffff'; g.font = '800 150px ' + F; g.fillText(r.aft.rank + '위', 80, 620 + D);
    var w1 = g.measureText(r.aft.rank + '위').width;
    g.font = '600 36px ' + F; g.fillStyle = '#c8d3e6'; g.fillText(o.y === 'all' ? '개통 후' : o.y + '년 개통 후', 80 + w1 + 24, 620 + D);
    var bt = t === 'new' ? '신규' : (r.change > 0 ? '▲' + r.change + '계단' : r.change < 0 ? '▼' + (-r.change) + '계단' : '그대로') + '  ' + RankTable.TIERS[t].label;
    g.font = '800 44px ' + F; var bw = g.measureText(bt).width + 56;
    roundRect(g, 80, 670 + D, bw, 78, 39); g.fillStyle = COLS[t]; g.fill();
    g.fillStyle = '#fff'; g.fillText(bt, 108, 724 + D);
    var plan = planLines(o.doc, r);
    if (plan.length) { g.font = '600 30px ' + F; g.fillStyle = '#c8d3e6'; g.fillText('새 노선 ' + plan.join(' · '), 80, 812 + D); }
    g.fillStyle = '#ffd166'; g.font = '700 26px ' + F; g.fillText('예상 소요 시간 (노선별 평균 속도 추정 · 시간표·급행·지연 미반영)', 80, 870 + D);
    ['도심권 CBD', '여의도권 YBD', '강남권 GBD'].forEach(function (d, j) {
      var y = 930 + D + j * 80, n = r.now.times ? r.now.times[j] : null, a = r.aft.times ? r.aft.times[j] : null;
      g.fillStyle = '#9fb3d1'; g.font = '600 32px ' + F; g.fillText(d, 80, y);
      g.fillStyle = '#ffffff'; g.font = '800 40px ' + F;
      g.fillText((n != null && a != null && n > a) ? n + '분 → ' + a + '분' : (a == null ? '—' : a + '분'), 330, y);
      if (n != null && a != null && n > a) { g.fillStyle = '#5fe39a'; g.font = '800 34px ' + F; g.fillText('−' + (n - a) + '분', 720, y); }
    });
    cardFooter(k, o.wait ? '타는 시간 + 갈아타며 걷는 시간 + 출퇴근 배차 기다림 · 업무지구까지' : '타는 시간 + 갈아타며 걷는 시간(기다림 제외) · 업무지구까지', o.doc && o.doc.updated);
    return k.c;
  }

  function fileName(r) { return 'GTX떡상_' + r.name + '_' + (r.now.rank || '') + '위→' + r.aft.rank + '위.png'; }

  // 반환: 안내 글 ('공유했어요' / '이미지를 저장했어요' / '' (취소))
  function save(r, o) { return saveCanvas(draw(r, o), fileName(r), r.name + ' 개통 후 접근성 ' + r.aft.rank + '위', 'card-station'); }

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
    g.fillStyle = '#ffffff'; g.font = '800 64px ' + FONT; g.fillText('개통 후 교통 접근성 개선 TOP 10', 72, 214);   // 계산한 지표 그대로(주식 '오르는' 문법 빼기 — 표시광고법)
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
      var rk = '접근성 ' + r.now.rank + '위 → ' + r.aft.rank + '위', rw = g.measureText(rk).width; g.fillText(rk, k.W - 80 - cw - 28 - rw, y + 48);
    });
    cardFooter(k, o.wait ? '타는 시간 + 갈아타며 걷는 시간 + 출퇴근 배차 기다림 · 업무지구까지' : '타는 시간 + 갈아타며 걷는 시간(기다림 제외) · 업무지구까지', o.asof);
    return k.c;
  }
  function saveTop10(rows, o) {
    var name = 'GTX떡상_TOP10_' + (o.y === 'all' ? '전체개통' : o.y + '년') + '.png';
    return saveCanvas(drawTop10(rows, o), name, (o.y === 'all' ? '모두 개통하면' : o.y + '년까지') + ' 교통 접근성 개선 TOP 10', 'card-top10');
  }

  // ② 우리 역 생활권 변화 카드 (종합피드백 12장 B, 2026-11-14) — 킬러 1순위 '생활권 변화'의 무료 미리보기.
  // info: { name, area, rows: StationAccess.of(id).rows, asof } — 업무지구 5곳까지 지금 → 개통 후 분, 막대 두 줄.
  var LIFE_LABEL = { cbd: '도심 (시청·광화문)', ybd: '여의도', gbd: '강남', seoul: '서울역', pangyo: '판교' };
  function lifeSummary(rows) {
    var ok = rows.filter(function (r) { return r.after != null; });
    var in30 = function (k) { return rows.filter(function (r) { return r[k] != null && r[k] <= 30; }).length; };
    var saves = rows.filter(function (r) { return r.save != null && r.save > 0; });
    var best = saves.slice().sort(function (a, b) { return b.save - a.save; })[0] || null;
    return { n30now: in30('now'), n30aft: in30('after'), total: ok.length, best: best,
      newCount: rows.filter(function (r) { return r.isNew; }).length };
  }
  function drawLife(info, o) {
    o = o || {};
    var k = cardBase(1350), g = k.g, F = FONT, rows = info.rows || [], s = lifeSummary(rows);
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + F; g.fillText('GTX·새 노선이 모두 개통하면', 72, 132);
    g.fillStyle = '#ffffff'; g.font = '800 84px ' + F;
    var nm = info.name + '역'; while (g.measureText(nm).width > 936 && nm.length > 3) nm = nm.slice(0, -2) + '…';
    g.fillText(nm, 72, 226);
    g.fillStyle = '#ffd166'; g.font = '800 56px ' + F; g.fillText('생활권 변화', 72, 300);
    if (info.area) { g.fillStyle = '#9fb3d1'; g.font = '500 28px ' + F; g.fillText(info.area, 72, 346); }
    // 요약 띠: 30분 안 업무지구 수 + 가장 많이 줄어드는 곳
    roundRect(g, 72, 380, k.W - 144, 120, 24); g.fillStyle = 'rgba(255,255,255,.08)'; g.fill();
    g.fillStyle = '#c8d3e6'; g.font = '600 30px ' + F; g.fillText('30분 안에 닿는 업무지구', 104, 430);
    g.fillStyle = '#ffffff'; g.font = '800 46px ' + F; g.fillText(s.n30now + '곳 → ' + s.n30aft + '곳', 104, 482);
    if (s.best) {
      var bt = (LIFE_LABEL[s.best.id] || s.best.name) + ' −' + s.best.save + '분';
      g.font = '800 34px ' + F; var bw = g.measureText(bt).width + 48;
      roundRect(g, k.W - 104 - bw, 418, bw, 64, 32); g.fillStyle = '#0a8f4a'; g.fill();
      g.fillStyle = '#ffffff'; g.fillText(bt, k.W - 104 - bw + 24, 462);
    }
    // 목적지별 막대: 옅은 회색 = 지금, 초록 = 개통 후 (120분을 꽉 찬 길이로)
    var x0 = 360, wMax = k.W - 72 - x0 - 300, top = 560, rh = 108, cap = 120;
    var len = function (m) { return Math.max(26, Math.min(m, cap) / cap * wMax); };   // 26px = 막대 높이 — 더 짧으면 둥근 모서리가 깨진다
    rows.slice(0, 5).forEach(function (r, i) {
      var y = top + i * rh, good = r.save > 0 || r.isNew;
      g.fillStyle = '#ffffff'; g.font = '700 30px ' + F; g.fillText(LIFE_LABEL[r.id] || r.name, 72, y + 48);
      if (r.now != null) { g.fillStyle = 'rgba(200,211,230,.35)'; roundRect(g, x0, y + 4, len(r.now), 26, 13); g.fill(); }
      if (r.after != null) { g.fillStyle = good ? '#5fe39a' : '#8a929a'; roundRect(g, x0, y + 40, len(r.after), 26, 13); g.fill(); }
      g.font = '600 24px ' + F; g.fillStyle = '#c8d3e6';
      g.fillText(r.now == null ? '지금 철도로 못 감' : '지금 ' + r.now + '분', x0 + (r.now == null ? 0 : len(r.now) + 12), y + 26);
      g.fillStyle = '#ffffff'; g.font = '800 26px ' + F;
      g.fillText(r.after == null ? '—' : '개통 후 ' + r.after + '분', x0 + (r.after == null ? 0 : len(r.after) + 12), y + 62);
      var tag = r.isNew ? '새로 연결' : (r.save > 0 ? '−' + r.save + '분' : '그대로');
      g.font = '800 30px ' + F; g.fillStyle = good ? '#5fe39a' : '#9fb3d1';
      g.fillText(tag, k.W - 72 - g.measureText(tag).width, y + 48);
    });
    cardFooter(k, o.wait ? '타는 시간 + 갈아타며 걷는 시간 + 출퇴근 배차 기다림 · 업무지구 안 가장 가까운 역까지' : '타는 시간 + 갈아타며 걷는 시간(기다림 제외) · 업무지구 안 가장 가까운 역까지', info.asof);
    return k.c;
  }
  function saveLife(info, o) {
    var s = lifeSummary(info.rows || []);
    return saveCanvas(drawLife(info, o), '생활권변화_' + info.name + '.png',
      info.name + '역 생활권 변화 — 30분 안 업무지구 ' + s.n30now + '곳 → ' + s.n30aft + '곳', 'card-life');
  }

  // tag: 어떤 카드가 퍼졌는지 세려고 공유 주소에 ?from= 이름표 (6차 공유 피드백 — 측정 없는 바이럴은 구멍)
  function saveCanvas(c, name, title, tag) {
    if (tag && typeof global.KRTrack === 'function') global.KRTrack('share_card', { 종류: tag });   // Umami: 카드별 공유 단추 횟수
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
        return navigator.share({ files: [file], title: title, text: location.origin + location.pathname + (tag ? '?from=' + tag : '') })
          .then(function () { return '공유했어요'; }, function (e) { return (e && e.name === 'AbortError') ? '' : download(); });
      }
      return download();
    });
  }

  global.StationShareImage = { draw: draw, save: save, fileName: fileName, drawTop10: drawTop10, saveTop10: saveTop10, drawLife: drawLife, saveLife: saveLife, lifeSummary: lifeSummary, BRAND: BRAND, FONT: FONT, cardBase: cardBase, cardFooter: cardFooter, saveCanvas: saveCanvas };
})(typeof window !== 'undefined' ? window : globalThis);
