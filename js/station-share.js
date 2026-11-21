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

  /* 카드 공통 표기 (뮤즈 카드 검수 TASK, 2026-11-14) — 카드 3종(TOP10·우리 역·타일)과 rank.html 카드가 같은 말을 쓴다.
   * - 시나리오: 같은 계산은 같은 이름 — 'GTX·새 노선 모두 개통하면' / '2031년까지 개통하면'
   * - 개통 전 노선은 '이름 (상태 말 · 연도)', 연도 없으면 '이름 (상태 말)' (LineStatus.label — 지도 라벨과 같은 글자)
   * - '떡상'·'계단' 대신 '접근성 개선'·'▲N' (앱 TOP10 카드와 같은 말) */
  function scenario(y) { return (!y || y === 'all') ? 'GTX·새 노선 모두 개통하면' : y + '년까지 개통하면'; }
  // 노선 글자 규칙은 LineStatus.label 하나 (rank.html 공유 그림과 같은 함수)
  function planLabel(m) { return LineStatus.label(m); }
  var CARD_TIER = { rocket: '접근성 크게 개선', up: '접근성 개선', flat: '비슷', down: '상대 하락', new: '신규' };
  function changeText(r) { return r.change > 0 ? '▲' + r.change : r.change < 0 ? '▼' + (-r.change) : '그대로'; }
  // 이 역에 새로 생기는 노선 (개통 전) — 'GTX-C (공사 중 · 2031)', 'GTX-G (계획)'
  function planLines(doc, r) {
    return (r.lines || []).map(function (id) { return doc.lines && doc.lines[id]; })
      .filter(function (m) { return m && m.s !== 'open'; }).slice(0, 3).map(planLabel);
  }

  // o: { doc, y: '2031'|'all', w: 'avg'|…, wait }
  function draw(r, o) {
    // 공유 카드 ① 우리 역 카드 (11-14): 정사각형 1080 → 세로 1080×1350(카톡·인스타에서 더 크게) + 공통 아래 띠
    var k = cardBase(1350), g = k.g, F = FONT, D = 40;   // D: 정사각형 때보다 내용을 아래로 내린 만큼
    var t = RankTable.tierOf(r);
    g.fillStyle = 'rgba(255,255,255,.06)'; for (var i = 0; i < 6; i++) { g.beginPath(); g.arc(900 - i * 40, 200 + i * 30, 260 - i * 30, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + F; g.fillText(scenario(o.y) + ', 우리 역 접근성은 몇 위?', 80, 120 + D);
    g.fillStyle = '#ffffff'; g.font = '800 104px ' + F; g.fillText(r.name + '역', 80, 250 + D);
    g.fillStyle = '#9fb3d1'; g.font = '500 32px ' + F; g.fillText([r.region, r.sgg].filter(Boolean).join(' ') + ' · 수도권 ' + (WLABEL[o.w] || '') + '순위', 84, 305 + D);
    g.font = '700 46px ' + F; g.fillStyle = '#c8d3e6';
    g.fillText(r.isNew ? '지금은 철도 없음' : '지금 접근성 ' + r.now.rank + '위', 80, 460 + D);   // 아래 큰 숫자 = 개통 후 접근성 순위
    g.fillStyle = '#ffffff'; g.font = '800 150px ' + F; g.fillText(r.aft.rank + '위', 80, 620 + D);
    var w1 = g.measureText(r.aft.rank + '위').width;
    g.font = '600 36px ' + F; g.fillStyle = '#c8d3e6'; g.fillText('개통 후', 80 + w1 + 24, 620 + D);   // 시나리오는 맨 위 한 문장
    var bt = t === 'new' ? '신규' : changeText(r) + '  ' + CARD_TIER[t];
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
    cardFooter(k, o.wait ? '타는 시간 + 갈아타며 걷는 시간 + 출퇴근 배차 기다림 · 업무지구까지' : '타는 시간 + 갈아탈 때 걷기·기다림(처음 열차 대기 제외) · 업무지구까지', o.doc && o.doc.updated);
    return k.c;
  }

  function fileName(r) { return '접근성_' + r.name + '_' + (r.now.rank || '') + '위→' + r.aft.rank + '위.png'; }

  // 반환: 안내 글 ('공유했어요' / '이미지를 저장했어요' / '' (취소))
  function save(r, o) { return saveCanvas(draw(r, o), fileName(r), r.name + ' 개통 후 접근성 ' + r.aft.rank + '위', 'card-station', o && o.q); }

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
  // Q7 (11-15): 길찾기·통근권 카드 기준일 — 노선 단계(개통 시기·사업 단계)를 마지막으로 확인한 날 (data.html 기준일 표 '미래 노선'과 같은 값)
  function linesAsof() {
    try {
      var d = (typeof LINES !== 'undefined' ? LINES : []).map(function (f) { return f.properties && f.properties.plan_checked; }).filter(Boolean).sort();
      return d.length ? '노선 단계 ' + d[d.length - 1] + ' 확인' : '';
    } catch (e) { return ''; }
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
    var when = scenario(o.y);
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + FONT; g.fillText(when, 72, 132);
    g.fillStyle = '#ffffff'; g.font = '800 64px ' + FONT; g.fillText('개통 후 교통 접근성 개선 TOP 10', 72, 214);   // 계산한 지표 그대로(주식 '오르는' 문법 빼기 — 표시광고법)
    g.fillStyle = '#9fb3d1'; g.font = '500 28px ' + FONT;
    g.fillText('수도권 ' + (WLABEL[o.w] || '') + '접근성 순위 · TOP ' + rows.length, 72, 262);
    var top = 310, rh = 82;
    rows.slice(0, 10).forEach(function (r, i) {
      var y = top + i * rh;
      if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(56, y - 4, k.W - 112, rh - 6); }
      g.fillStyle = i < 3 ? '#ffd166' : '#9fb3d1'; g.font = '800 40px ' + FONT; g.fillText(String(i + 1), 80, y + 50);
      g.fillStyle = '#ffffff'; g.font = '800 40px ' + FONT;
      var nm = topName(g, r.name);   // 말줄임표까지 320px 안 (지역 칸 490 앞에서 끝남)
      g.fillText(nm, 150, y + 50);
      var L = top10Row(g, r, k.W);   // 열 배치 한 곳에서 (겹침 검사도 같은 함수)
      if (L.region) { g.fillStyle = '#9fb3d1'; g.font = '500 26px ' + FONT; g.fillText(L.region, L.regX, y + 48); }
      g.fillStyle = '#5fe39a'; g.font = '800 40px ' + FONT;   // 어두운 바탕에서 잘 보이는 밝은 초록 (기존 역 카드 '−N분'과 같은 색)
      g.fillText(L.chg, L.chgX, y + 50);
      g.fillStyle = '#c8d3e6'; g.font = '600 26px ' + FONT; g.fillText(L.rk, L.rkX, y + 48);
    });
    cardFooter(k, o.wait ? '타는 시간 + 갈아타며 걷는 시간 + 출퇴근 배차 기다림 · 업무지구까지' : '타는 시간 + 갈아탈 때 걷기·기다림(처음 열차 대기 제외) · 업무지구까지', o.asof);
    return k.c;
  }
  /* TOP10 한 행의 열 위치 (뮤즈 카드 검수 1순위: '인천 연수'+'접근성' 겹침). 오른쪽 끝부터 ▲N → '접근성 N위 → M위' 를 놓고,
   * 지역은 이름 칸 끝(480)과 순위 글자 사이 남은 폭(사이 24px)에 '시도 시군구' → '시군구 끝말(연수구)' → '시도' 중 들어가는 첫 것 —
   * 글자 중간을 자르면('인천…') 어디인지 못 읽어서 말 단위로 고른다. 하나도 안 들어가면 지역을 뺀다. */
  function topName(g, name) {
    if (g.measureText(name).width <= 320) return name;
    var ell = g.measureText('…').width, nm = name;
    while (nm.length > 2 && g.measureText(nm).width + ell > 320) nm = nm.slice(0, -1);
    return nm + '…';
  }
  function top10Row(g, r, W) {
    g.font = '800 40px ' + FONT; var chg = changeText(r), cw = g.measureText(chg).width, chgX = W - 80 - cw;
    g.font = '600 26px ' + FONT; var rk = '접근성 ' + r.now.rank + '위 → ' + r.aft.rank + '위', rkX = chgX - 28 - g.measureText(rk).width;
    g.font = '500 26px ' + FONT;
    var regX = 490, room = rkX - 24 - regX, sg = String(r.sgg || '').split(' ');
    var cands = [[r.region, r.sgg].filter(Boolean).join(' '), sg[sg.length - 1], r.region].filter(Boolean);
    var reg = '';
    for (var i = 0; i < cands.length; i++) if (g.measureText(cands[i]).width <= room) { reg = cands[i]; break; }
    return { chg: chg, chgX: chgX, rk: rk, rkX: rkX, region: reg, regX: regX, regEnd: regX + (reg ? g.measureText(reg).width : 0) };
  }
  // 시험·눈 검수용: 행마다 지역 끝 x < 순위 글자 시작 x 인지
  function top10Layout(rows, g) { return rows.map(function (r) { var L = top10Row(g, r, 1080); g.font = '800 40px ' + FONT; var nEnd = 150 + g.measureText(topName(g, r.name)).width; return { name: r.name, nameEnd: Math.round(nEnd), region: L.region, regEnd: Math.round(L.regEnd), rkStart: Math.round(L.rkX), overlap: nEnd > L.regX - 8 || (!!L.region && L.regEnd > L.rkX - 8) }; }); }
  function saveTop10(rows, o) {
    var name = '접근성TOP10_' + (o.y === 'all' ? '전체개통' : o.y + '년') + '.png';
    return saveCanvas(drawTop10(rows, o), name, (o.y === 'all' ? '모두 개통하면' : o.y + '년까지') + ' 교통 접근성 개선 TOP 10', 'card-top10', o.q);
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
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + F; g.fillText(scenario('all'), 72, 132);
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
    cardFooter(k, o.wait ? '타는 시간 + 갈아타며 걷는 시간 + 출퇴근 배차 기다림 · 업무지구 안 가장 가까운 역까지' : '타는 시간 + 갈아탈 때 걷기·기다림(처음 열차 대기 제외) · 업무지구 안 가장 가까운 역까지', info.asof);
    return k.c;
  }
  function saveLife(info, o) {
    var s = lifeSummary(info.rows || []);
    return saveCanvas(drawLife(info, o), '생활권변화_' + info.name + '.png',
      info.name + '역 생활권 변화 — 30분 안 업무지구 ' + s.n30now + '곳 → ' + s.n30aft + '곳', 'card-life', info.q);
  }

  // ② 출퇴근 비교 카드 (회장님 11-14: A) — info: { from, to, status: better|new|same|worse, now:{min,tr}, aft:{min,tr}, lines:[이름] }
  // 길찾기 '지금 → 개통 후' 상자와 같은 값(RouteCompare.compareNowFuture). 시간 = 타는 시간 + 갈아탈 때 걷기·기다림, 처음 열차 기다림·시간표·급행·지연 뺌
  function commuteSummary(info) {
    var n = info.now, a = info.aft, st = info.status;
    var save = (n && a) ? n.min - a.min : 0;
    return { save: save, pct: (n && n.min > 0 && save > 0) ? Math.round(save / n.min * 100) : 0,
      tag: st === 'new' ? '새로 연결' : (st === 'better' ? '−' + save + '분' : '변화 없음'), good: st === 'new' || st === 'better' };
  }
  function fitText(g, t, maxW) { while (g.measureText(t).width > maxW && t.length > 2) t = t.slice(0, -2) + '…'; return t; }
  function drawCommute(info, o) {
    o = o || {};
    var k = cardBase(1350), g = k.g, F = FONT, s = commuteSummary(info), W = k.W;
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + F; g.fillText(scenario('all'), 72, 132);
    // 출발 → 도착 (길면 글자를 줄이고, 그래도 길면 두 줄)
    var A = info.from + '역', B = info.to + '역', size = 76;
    g.font = '800 ' + size + 'px ' + F;
    while (g.measureText(A + ' → ' + B).width > W - 144 && size > 56) { size -= 4; g.font = '800 ' + size + 'px ' + F; }
    g.fillStyle = '#ffffff';
    var y = 226;
    if (g.measureText(A + ' → ' + B).width <= W - 144) g.fillText(A + ' → ' + B, 72, y);
    else { g.fillText(fitText(g, A + ' →', W - 144), 72, y); y += size + 10; g.fillText(fitText(g, B, W - 144), 72, y); }
    g.fillStyle = '#ffd166'; g.font = '800 52px ' + F; g.fillText('출퇴근 길이 이렇게 바뀌어요', 72, y + 74);
    // 지금 / 개통 후 두 칸
    var top = y + 120, bw = (W - 144 - 32) / 2, bh = 300;
    var box = function (x, label, m, tr, hot) {
      roundRect(g, x, top, bw, bh, 28); g.fillStyle = hot ? 'rgba(95,227,154,.16)' : 'rgba(255,255,255,.08)'; g.fill();
      g.fillStyle = '#c8d3e6'; g.font = '700 32px ' + F; g.fillText(label, x + 36, top + 62);
      g.fillStyle = hot ? '#5fe39a' : '#ffffff';
      if (m == null) { g.font = '800 64px ' + F; g.fillText('못 감', x + 36, top + 170); g.fillStyle = '#c8d3e6'; g.font = '600 28px ' + F; g.fillText('운행 중인 철도로는', x + 36, top + 232); }
      else {
        g.font = '800 120px ' + F; g.fillText(String(m), x + 36, top + 190);
        var mw = g.measureText(String(m)).width; g.font = '800 44px ' + F; g.fillText('분', x + 36 + mw + 10, top + 190);
        g.fillStyle = '#c8d3e6'; g.font = '600 30px ' + F; g.fillText(tr == null ? '' : (tr ? '환승 ' + tr + '번' : '갈아타지 않음'), x + 36, top + 250);
      }
    };
    box(72, '지금', info.now ? info.now.min : null, info.now ? info.now.tr : null, false);
    box(72 + bw + 32, '개통 후', info.aft ? info.aft.min : null, info.aft ? info.aft.tr : null, s.good);
    // 줄어드는 시간 띠
    var py = top + bh + 40;
    roundRect(g, 72, py, W - 144, 132, 28); g.fillStyle = s.good ? '#0a8f4a' : 'rgba(255,255,255,.10)'; g.fill();
    g.fillStyle = '#ffffff'; g.font = '800 60px ' + F;
    var big = info.status === 'new' ? '철도로 새로 이어져요' : (info.status === 'better' ? '한 번 갈 때 ' + s.save + '분 줄어요' : '이 길은 시간 변화 없음');
    g.fillText(fitText(g, big, W - 216), 108, py + 86);
    // 왕복·한 달(출근 20일) 환산 — 'better' 일 때만
    var ly = py + 132 + 70;
    g.font = '600 32px ' + F; g.fillStyle = '#c8d3e6';
    if (info.status === 'better') {
      var month = s.save * 2 * 20, hh = Math.floor(month / 60), mm = month % 60;
      g.fillText('왕복 ' + (s.save * 2) + '분 · 한 달 출근 20일이면 약 ' + (hh ? hh + '시간 ' : '') + (mm ? mm + '분' : '') + ' (' + s.pct + '%)', 72, ly);
      ly += 52;
    }
    if (info.lines && info.lines.length) { g.fillStyle = '#ffffff'; g.font = '700 32px ' + F; g.fillText(fitText(g, '타는 새 노선: ' + info.lines.join(' · '), W - 144), 72, ly); ly += 48; }
    if (info.unsure) { g.fillStyle = '#ffd166'; g.font = '600 28px ' + F; g.fillText('계획·구상 단계 노선은 바뀌거나 늦어질 수 있어요', 72, ly); ly += 44; }
    // 길이 막대: 회색 = 지금, 초록 = 개통 후 (긴 쪽을 꽉 찬 길이로)
    var nm = info.now && info.now.min, am = info.aft && info.aft.min;
    if (nm != null || am != null) {
      var bx = 232, bmax = W - 72 - bx - 130, mx = Math.max(nm || 0, am || 0) || 1, by = Math.max(ly + 26, k.H - 330);
      var bar = function (yy, label, m, col) {
        g.fillStyle = '#c8d3e6'; g.font = '700 28px ' + F; g.fillText(label, 72, yy + 30);
        if (m == null) { g.fillStyle = '#9fb3d1'; g.font = '600 26px ' + F; g.fillText('철도로 못 감', bx, yy + 30); return; }
        var L = Math.max(30, m / mx * bmax); roundRect(g, bx, yy + 4, L, 34, 17); g.fillStyle = col; g.fill();
        g.fillStyle = '#ffffff'; g.font = '800 28px ' + F; g.fillText(m + '분', bx + L + 14, yy + 32);
      };
      bar(by, '지금', nm, 'rgba(200,211,230,.45)');
      bar(by + 60, '개통 후', am, s.good ? '#5fe39a' : 'rgba(200,211,230,.45)');
    }
    cardFooter(k, '타는 시간 + 갈아탈 때 걷기·기다림 · 처음 열차 기다림·시간표·급행·지연 미반영', info.asof || linesAsof());
    return k.c;
  }
  function saveCommute(info, o) {
    var s = commuteSummary(info);
    return saveCanvas(drawCommute(info, o), '출퇴근_' + info.from + '_' + info.to + '.png',
      info.from + '역 → ' + info.to + '역 개통 후 ' + s.tag, 'card-commute', info.q);
  }

  // ⑤ 개통 전/후 지도 카드 (회장님 11-14 B) — "○○역까지 N분 안에 닿는 역" 을 지금 | 개통 후 두 칸에 나란히.
  // 지도 사진(타일)이 아니라 노선·역을 직접 그린다 — 타일 저작권·CORS 걱정 없고 글자가 또렷하다.
  // info: { name, coord:[lng,lat], limit, now:[{id,name,min,coord}], aft:[…], lines: 노선 GeoJSON features, wait }
  function reachSummary(info) {
    var nowIds = {}; (info.now || []).forEach(function (r) { nowIds[r.id] = 1; });
    var added = (info.aft || []).filter(function (r) { return !nowIds[r.id]; }).sort(function (a, b) { return a.min - b.min; });
    return { n: (info.now || []).length, m: (info.aft || []).length, added: added, nowIds: nowIds };
  }
  function drawReach(info, o) {
    o = o || {};
    var k = cardBase(1350), g = k.g, F = FONT, W = k.W, s = reachSummary(info);
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + F; g.fillText(scenario('all'), 72, 132);
    g.fillStyle = '#ffffff'; var size = 76; g.font = '800 ' + size + 'px ' + F;
    var title = info.name + '역까지 ' + info.limit + '분 안';
    while (g.measureText(title).width > W - 144 && size > 52) { size -= 4; g.font = '800 ' + size + 'px ' + F; }
    g.fillText(fitText(g, title, W - 144), 72, 226);
    g.fillStyle = '#ffd166'; g.font = '800 50px ' + F;
    g.fillText(s.added.length ? '닿는 역이 ' + s.n + '곳 → ' + s.m + '곳' : '개통해도 닿는 역은 그대로', 72, 300);
    // 두 칸이 같은 범위를 보도록 — 개통 후에 닿는 역 + 목적지로 범위를 잡는다
    var pts = (info.aft || []).map(function (r) { return r.coord; }).concat([info.coord]);
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (c) { if (!c) return; x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); });
    var kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, spanX = Math.max((x1 - x0) * kx, 0.08), spanY = Math.max(y1 - y0, 0.08);
    var PW = 456, PH = 600, PT = 390, pad = 1.18;
    var sc = Math.min(PW / (spanX * pad), PH / (spanY * pad));
    var proj = function (c, px) { return [px + PW / 2 + (c[0] - cx) * kx * sc, PT + PH / 2 - (c[1] - cy) * sc]; };
    var panel = function (px, label, count, after) {
      g.fillStyle = '#c8d3e6'; g.font = '700 32px ' + F; g.fillText(label, px, PT - 22);
      g.fillStyle = after && s.added.length ? '#5fe39a' : '#ffffff'; g.font = '800 40px ' + F;
      var ct = count + '곳' + (after && s.added.length ? ' (+' + s.added.length + ')' : ''); g.fillText(ct, px + PW - g.measureText(ct).width, PT - 22);
      g.save(); roundRect(g, px, PT, PW, PH, 24); g.fillStyle = 'rgba(255,255,255,.06)'; g.fill(); g.clip();
      // 노선: 지금 = 운행 중만(옅게), 개통 후 = 운행 중 + 새 노선(제 색 점선)
      (info.lines || []).forEach(function (f) {
        var pr = f.properties || {}, open = pr.status === 'open';
        if (!open && !after) return;
        var geom = f.geometry || {}, parts = geom.type === 'LineString' ? [geom.coordinates] : (geom.type === 'MultiLineString' ? geom.coordinates : []);
        g.strokeStyle = open ? 'rgba(200,211,230,.28)' : (/^#[0-9a-f]{6}$/i.test(pr.color || '') ? pr.color : '#ffd166');
        g.lineWidth = open ? 3 : 5; g.setLineDash(open ? [] : [12, 8]);
        parts.forEach(function (cs) { g.beginPath(); cs.forEach(function (c, i) { var q = proj(c, px); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke(); });
      });
      g.setLineDash([]);
      var rows = after ? (info.aft || []) : (info.now || []);
      rows.forEach(function (r) {
        var q = proj(r.coord, px), isNew = after && !s.nowIds[r.id];
        g.beginPath(); g.arc(q[0], q[1], isNew ? 8 : 6, 0, Math.PI * 2); g.fillStyle = isNew ? '#ffd166' : '#5fe39a'; g.fill();
      });
      var d = proj(info.coord, px);
      g.beginPath(); g.arc(d[0], d[1], 13, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
      g.beginPath(); g.arc(d[0], d[1], 6, 0, Math.PI * 2); g.fillStyle = '#0b1d3a'; g.fill();
      g.restore();
    };
    panel(72, '지금', s.n, false);
    panel(72 + PW + 24, '개통 후', s.m, true);
    // 범례 + 새로 닿는 역 예
    var ly = PT + PH + 52;
    g.font = '600 26px ' + F;
    var leg = function (x, col, r, t) { g.beginPath(); g.arc(x + 9, ly - 9, r, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.fillStyle = '#c8d3e6'; g.fillText(t, x + 26, ly); return x + 26 + g.measureText(t).width + 30; };
    var lx = leg(72, '#ffffff', 10, info.name + '(목적지)'); lx = leg(lx, '#5fe39a', 7, info.limit + '분 안'); leg(lx, '#ffd166', 8, '새로 닿는 역');
    if (s.added.length) {
      ly += 52; g.fillStyle = '#ffffff'; g.font = '700 30px ' + F;
      g.fillText(fitText(g, '새로: ' + s.added.slice(0, 5).map(function (r) { return r.name + ' ' + r.min + '분'; }).join(' · '), W - 144), 72, ly);
    }
    ly += 46; g.fillStyle = '#ffd166'; g.font = '600 26px ' + F;
    g.fillText('점선 = 아직 없는 노선(공사·계획·구상) — 바뀌거나 늦어질 수 있어요', 72, ly);
    cardFooter(k, o.wait ? '타는 시간 + 갈아탈 때 걷기 + 출퇴근 배차 기다림 · 시간표·급행·지연 미반영' : '타는 시간 + 갈아탈 때 걷기·기다림 · 처음 열차 기다림·시간표·급행·지연 미반영', info.asof || linesAsof());
    return k.c;
  }
  // 맞벌이 통근권 카드 (11-15 킬러 아이디어 '둘 다 출근 가능한 동네') — 지도 한 칸: 두 직장 + 둘 다 N분 안인 역(색 = 둘 중 긴 쪽)
  // info: { a:{name,coord}, b:{name,coord}, limit, rows:[{name,coord,min,m1,m2}], lines, wait, q, asof }
  var TWO_BANDS = [[15, '#5fe39a', '15분'], [30, '#b5e86a', '30분'], [45, '#ffd166', '45분'], [60, '#ff9f43', '60분'], [90, '#ff6b6b', '90분']];
  function twoColor(m) { for (var i = 0; i < TWO_BANDS.length; i++) if (m <= TWO_BANDS[i][0]) return TWO_BANDS[i][1]; return '#ff6b6b'; }
  // 두 직장 사이 '가운데쯤' 역 — 둘 중 긴 쪽이 짧고, 두 분이 비슷한 순 (카드·시험이 같은 값)
  function twoBest(rows, n) {
    return (rows || []).filter(function (r) { return r.m1 > 0 && r.m2 > 0; }).slice()
      .sort(function (p, q) { return p.min - q.min || Math.abs(p.m1 - p.m2) - Math.abs(q.m1 - q.m2); }).slice(0, n || 4);
  }
  function drawTwo(info, o) {
    o = o || {};
    var k = cardBase(1350), g = k.g, F = FONT, W = k.W;
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + F; g.fillText('맞벌이 통근권 · 지금 운행 중인 노선', 72, 132);
    g.fillStyle = '#ffffff'; var size = 72; g.font = '800 ' + size + 'px ' + F;
    var title = info.a.name + '·' + info.b.name + ' 둘 다 ' + info.limit + '분 안';
    while (g.measureText(title).width > W - 144 && size > 48) { size -= 4; g.font = '800 ' + size + 'px ' + F; }
    g.fillText(fitText(g, title, W - 144), 72, 222);
    var rows = info.rows || [];
    g.fillStyle = '#ffd166'; g.font = '800 50px ' + F;
    g.fillText(rows.length ? '함께 살 만한 역 ' + rows.length + '곳' : '두 곳 모두 닿는 역이 없어요', 72, 296);
    var pts = rows.map(function (r) { return r.coord; }).concat([info.a.coord, info.b.coord]);
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (c) { if (!c) return; x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); });
    var kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, spanX = Math.max((x1 - x0) * kx, 0.08), spanY = Math.max(y1 - y0, 0.08);
    var PX = 72, PW = W - 144, PH = 640, PT = 340, pad = 1.15;
    var sc = Math.min(PW / (spanX * pad), PH / (spanY * pad));
    var proj = function (c) { return [PX + PW / 2 + (c[0] - cx) * kx * sc, PT + PH / 2 - (c[1] - cy) * sc]; };
    g.save(); roundRect(g, PX, PT, PW, PH, 24); g.fillStyle = 'rgba(255,255,255,.06)'; g.fill(); g.clip();
    (info.lines || []).forEach(function (f) {
      var pr = f.properties || {};
      if (pr.status !== 'open') return;
      var geom = f.geometry || {}, parts = geom.type === 'LineString' ? [geom.coordinates] : (geom.type === 'MultiLineString' ? geom.coordinates : []);
      g.strokeStyle = 'rgba(200,211,230,.25)'; g.lineWidth = 3;
      parts.forEach(function (cs) { g.beginPath(); cs.forEach(function (c, i) { var q = proj(c); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke(); });
    });
    rows.slice().sort(function (p, q) { return q.min - p.min; }).forEach(function (r) {
      var q = proj(r.coord); g.beginPath(); g.arc(q[0], q[1], 7, 0, Math.PI * 2); g.fillStyle = twoColor(r.min); g.fill();
    });
    [[info.a, 'A'], [info.b, 'B']].forEach(function (x) {
      var d = proj(x[0].coord);
      g.beginPath(); g.arc(d[0], d[1], 20, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
      g.fillStyle = '#0b1d3a'; g.font = '800 24px ' + F; var tw = g.measureText(x[1]).width; g.fillText(x[1], d[0] - tw / 2, d[1] + 9);
    });
    g.restore();
    var ly = PT + PH + 50;
    g.font = '600 26px ' + F;
    var lx = 72;
    TWO_BANDS.filter(function (b) { return b[0] <= info.limit; }).forEach(function (b) {
      g.beginPath(); g.arc(lx + 9, ly - 9, 8, 0, Math.PI * 2); g.fillStyle = b[1]; g.fill();
      g.fillStyle = '#c8d3e6'; g.fillText(b[2] + ' 안', lx + 24, ly); lx += 24 + g.measureText(b[2] + ' 안').width + 26;
    });
    ly += 44; g.fillStyle = '#c8d3e6';
    g.fillText(fitText(g, '색 = 둘 중 더 먼 쪽 · A ' + info.a.name + ' · B ' + info.b.name, W - 144), 72, ly);
    var best = twoBest(rows, 3);
    if (best.length) {
      ly += 54; g.fillStyle = '#ffffff'; g.font = '700 32px ' + F;
      g.fillText(fitText(g, '가운데쯤(A·B분): ' + best.map(function (r) { return r.name + ' ' + r.m1 + '·' + r.m2; }).join(' · '), W - 144), 72, ly);
    }
    cardFooter(k, o.wait ? '역에서 역까지 · 타는 시간 + 갈아탈 때 걷기 + 출퇴근 배차 기다림 · 집·회사까지 걷는 시간 제외' : '역에서 역까지 · 타는 시간 + 갈아탈 때 걷기·기다림 · 처음 열차 기다림·집·회사까지 걷는 시간 제외', info.asof || linesAsof());
    return k.c;
  }
  function saveTwo(info, o) {
    return saveCanvas(drawTwo(info, o), '맞벌이통근권_' + info.a.name + '_' + info.b.name + '_' + info.limit + '분.png',
      info.a.name + '·' + info.b.name + ' 둘 다 ' + info.limit + '분 안 — ' + (info.rows || []).length + '곳', 'card-two', info.q);
  }
  function saveReach(info, o) {
    var s = reachSummary(info);
    return saveCanvas(drawReach(info, o), '통근권_' + info.name + '_' + info.limit + '분.png',
      info.name + '역까지 ' + info.limit + '분 안 — 지금 ' + s.n + '곳 → 개통 후 ' + s.m + '곳', 'card-reach', info.q);
  }

  // tag: 어떤 카드가 퍼졌는지 세려고 공유 주소에 ?ref= 이름표 (6차 공유 피드백 — 측정 없는 바이럴은 구멍)
  // 결과도 따로 센다(2026-11-15): 누름(share_card) → 결과(share_result: 공유함·저장함·취소·공유 실패→저장·만들기 실패) → 받은 사람 도착(js/track.js '공유로 도착')
  // q: 받은 사람이 카드 내용을 바로 보게 하는 주소 조건(예: 'rocket=1&st=…') — 카드를 만든 곳이 채운다 (11-15)
  function saveCanvas(c, name, title, tag, q) {
    if (tag && typeof global.KRTrack === 'function') global.KRTrack('share_card', { 종류: tag });   // Umami: 카드별 공유 단추 횟수
    var result = function (r) { if (tag && typeof global.KRTrack === 'function') global.KRTrack('share_result', { 종류: tag, 결과: r }); };
    return new Promise(function (res) { c.toBlob(res, 'image/png'); }).then(function (blob) {
      if (!blob) { result('만들기 실패'); return '이미지를 만들지 못했어요.'; }
      var file = (typeof File === 'function') ? new File([blob], name, { type: 'image/png' }) : null;
      var download = function () {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        result(why || '저장함');
        return '이미지를 저장했어요';
      };
      var why = '';
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: title, text: location.origin + location.pathname + (tag ? '?ref=' + tag + (q ? '&' + q : '') : (q ? '?' + q : '')) })
          .then(function () { result('공유함'); return '공유했어요'; }, function (e) {
            if (e && e.name === 'AbortError') { result('취소'); return ''; }
            why = '공유 실패→저장'; return download();
          });
      }
      return download();
    });
  }

  global.StationShareImage = { draw: draw, save: save, fileName: fileName, drawTop10: drawTop10, saveTop10: saveTop10, top10Layout: top10Layout, scenario: scenario, planLabel: planLabel, CARD_TIER: CARD_TIER, changeText: changeText, drawLife: drawLife, saveLife: saveLife, lifeSummary: lifeSummary, drawCommute: drawCommute, saveCommute: saveCommute, commuteSummary: commuteSummary, drawReach: drawReach, saveReach: saveReach, drawTwo: drawTwo, saveTwo: saveTwo, twoBest: twoBest, reachSummary: reachSummary, BRAND: BRAND, FONT: FONT, cardBase: cardBase, cardFooter: cardFooter, saveCanvas: saveCanvas };
})(typeof window !== 'undefined' ? window : globalThis);
