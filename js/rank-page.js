/* rank.html 에 인라인으로 있던 스크립트 — CSP(script-src 'self') 때문에 파일로 뺐다 (6차 K15 ①B3, 2026-11-14) */
(() => {
  'use strict';
  const PAGE = 50;
  const LABEL = { avg: '평균', cbd: 'CBD 중시', ybd: 'YBD 중시', gbd: 'GBD 중시' };
  const REGION = { seoul: '서울', capital: '수도권(서울·경기·인천)', all: '전국' };
  const DEST = ['CBD', 'YBD', 'GBD'];
  const HI = { cbd: 0, ybd: 1, gbd: 2 };
  const TIER_ORDER = ['rocket', 'up', 'flat', 'down', 'new'];
  const T = RankTable.TIERS;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 상태 — 주소창에 남겨서 링크로 나눌 수 있게
  const qs = new URLSearchParams(location.search);
  const st = {
    w: LABEL[qs.get('w')] ? qs.get('w') : 'avg',
    t: qs.get('t') === 'now' ? 'now' : 'aft',
    r: REGION[qs.get('r')] ? qs.get('r') : 'capital',
    sort: ['rank', 'rise', 'gain'].includes(qs.get('sort')) ? qs.get('sort') : 'rank',
    tier: T[qs.get('tier')] ? qs.get('tier') : '',
    q: qs.get('q') || '',
    open: qs.get('open') || '',
    y: qs.get('y') || 'all',
    wait: qs.get('wait') === '1',   // 출퇴근 배차 포함 (기본 꺼짐)   // 개통 연도 슬라이더 — 'all' = 전체(시기 미정 노선 포함)
    shown: PAGE,
  };
  let doc = null, lineInfo = {};

  function saveUrl() {
    const u = new URL(location.href);
    const set = (k, v, d) => { if (v === d || !v) u.searchParams.delete(k); else u.searchParams.set(k, v); };
    set('w', st.w, 'avg'); set('t', st.t, 'aft'); set('r', st.r, 'capital'); set('sort', st.sort, 'rank');
    set('tier', st.tier, ''); set('q', st.q, ''); set('open', st.open, ''); set('y', st.y, 'all'); set('wait', st.wait ? '1' : '', '');
    history.replaceState(null, '', u);
  }

  function syncControls() {
    document.querySelectorAll('.seg').forEach(g => {
      const k = g.dataset.k;
      g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st[k])));
    });
    $('sort').value = st.sort;
    $('q').value = st.q;
    $('sort').disabled = st.t === 'now';   // '지금' 순위에는 오름 정렬이 뜻이 없다
    $('wait').setAttribute('aria-pressed', String(st.wait));
  }

  function lineChips(ids, onlyPlan) {
    const list = (ids || []).map(id => ({ id, m: lineInfo[id] })).filter(x => x.m && (!onlyPlan || (x.m.s && x.m.s !== 'open')));
    list.sort((a, b) => (/GTX/.test(b.m.n) - /GTX/.test(a.m.n)) || (a.m.n < b.m.n ? -1 : 1));
    const seen = new Set();
    return list.filter(x => { if (seen.has(x.m.n)) return false; seen.add(x.m.n); return true; });
  }
  function chipHtml(x) {
    const plan = x.m.s && x.m.s !== 'open';
    return '<span class="ln' + (plan ? ' plan' : '') + '" style="' + (plan ? 'color:' : 'background:') + esc(x.m.c || '#666') + '"' +
      (plan ? ' title="개통 전"' : '') + '>' + esc(x.m.n) + '</span>';
  }
  function chips(ids) {
    const u = lineChips(ids);
    const h = u.slice(0, 5).map(chipHtml);
    if (u.length > 5) h.push('<span class="ln" style="background:#888">+' + (u.length - 5) + '</span>');
    return h.join('');
  }

  function times(r) {
    const cur = st.t === 'aft' ? r.aft.times : r.now.times;
    const hi = HI[st.w];
    return DEST.map((d, i) => {
      const v = cur[i];
      const before = st.t === 'aft' ? r.now.times[i] : null;
      const old = (before != null && v != null && before > v) ? '<s>' + before + '</s>' : '';
      return '<span' + (i === hi ? ' class="hi"' : '') + '>' + d + ' ' + old + '<b>' + (v == null ? '—' : v + '분') + '</b></span>';
    }).join('');
  }

  function badge(r) {
    const t = RankTable.tierOf(r);
    if (t === 'new') return '<span class="badge">' + Icons.svg(T.new.ic) + ' 신규</span>';
    const c = r.change;
    const txt = c > 0 ? '▲' + c : c < 0 ? '▼' + (-c) : '–';
    return '<span class="badge" title="' + esc(T[t].label + ' · ' + T[t].hint) + '">' + Icons.svg(T[t].ic) + ' ' + txt + '</span>';
  }
  const link = r => './?rocket=1&st=' + encodeURIComponent(r.id);   // 지도 + 떡상 패널 (v109)

  // 떡상 TOP 10 — 지금 순위(왼쪽) → 개통 후 순위(오른쪽). 순위는 로그 눈금 (245위와 9위를 한 그림에)
  function slopeSvg(rows, total) {
    const top = rows.filter(r => !r.isNew && r.change > 0).sort((a, b) => b.change - a.change || a.aft.rank - b.aft.rank).slice(0, 10);
    if (!top.length) return '<p class="sec-sub">이 조건에서는 오르는 역이 없습니다.</p>';
    // 좁은 화면(휴대폰)은 그림 폭을 줄여 글자가 작아지지 않게 한다 (viewBox 가 화면 폭에 맞춰 줄어든다)
    const narrow = ($('slope').clientWidth || 640) < 560;
    const W = narrow ? 400 : 640, H = 330, L = narrow ? 46 : 118, R = W - (narrow ? 178 : 210), Y0 = 28, Y1 = H - 18;
    const lg = v => Math.log10(Math.max(1, v));
    const maxR = Math.max(total, ...top.map(r => r.now.rank));
    const y = rank => Y0 + (lg(rank) / lg(maxR)) * (Y1 - Y0);
    // 라벨이 겹치지 않게 아래로 밀어 준다
    const place = (arr, key) => { const out = new Map(); let last = -1e9; arr.slice().sort((a, b) => y(a[key].rank) - y(b[key].rank)).forEach(r => { const v = Math.max(y(r[key].rank), last + 15.5); out.set(r, v); last = v; }); return out; };
    const ly = place(top, 'now'), ry = place(top, 'aft');
    const Hfit = Math.max(H, Math.ceil(Math.max(...ly.values(), ...ry.values()) + 14));
    const ticks = [1, 10, 100, 1000].filter(t => t <= maxR);
    let g = '<svg viewBox="0 0 ' + W + ' ' + Hfit + '" role="img" aria-label="많이 오르는 역 10곳의 지금 순위와 개통 후 순위">';
    g += '<text class="ax" x="' + L + '" y="14" text-anchor="middle">지금</text><text class="ax" x="' + R + '" y="14" text-anchor="middle">' + aftLabel() + '</text>';
    ticks.forEach(t => { const yy = y(t); g += '<line x1="' + L + '" x2="' + R + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--border)" stroke-dasharray="2 4"/>' +
      '<text class="ax" x="' + ((L + R) / 2) + '" y="' + (yy - 3) + '" text-anchor="middle">' + t + '위</text>'; });
    g += '<line x1="' + L + '" x2="' + L + '" y1="' + Y0 + '" y2="' + Y1 + '" stroke="var(--border)"/><line x1="' + R + '" x2="' + R + '" y1="' + Y0 + '" y2="' + Y1 + '" stroke="var(--border)"/>';
    top.forEach(r => {
      const t = RankTable.tierOf(r);
      const col = 'var(--t-' + t + ')';
      const a = y(r.now.rank), b = y(r.aft.rank);
      g += '<a href="#" data-open="' + esc(r.id) + '" aria-label="' + esc(r.name + ' 지금 ' + r.now.rank + '위에서 ' + aftLabel() + ' ' + r.aft.rank + '위') + '">' +
        '<line x1="' + L + '" y1="' + a + '" x2="' + R + '" y2="' + b + '" stroke="' + col + '" stroke-width="' + (t === 'rocket' ? 3 : 2) + '" stroke-linecap="round" opacity=".9"/>' +
        '<circle cx="' + L + '" cy="' + a + '" r="3.5" fill="' + col + '"/><circle cx="' + R + '" cy="' + b + '" r="4.5" fill="' + col + '"/>' +
        '<text class="rk" x="' + (L - 8) + '" y="' + (ly.get(r) + 4) + '" text-anchor="end">' + r.now.rank + '위</text>' +
        '<text x="' + (R + 9) + '" y="' + (ry.get(r) + 4) + '"><tspan class="rk">' + r.aft.rank + '위 </tspan><tspan class="nm">' + esc(r.name) + '</tspan>' +
        '<tspan class="gn" fill="var(--i-' + t + ')"> ▲' + r.change + '</tspan></text></a>';
    });
    return g + '</svg>';
  }

  // 펼친 역 카드 — 큰 순위 변화, 업무지구별 분 막대, 이 역에 새로 생기는 노선
  function cardHtml(r) {
    const t = RankTable.tierOf(r);
    const mx = Math.max(60, ...r.now.times.concat(r.aft.times).filter(v => v != null));
    const bars = DEST.map((d, i) => {
      const n = r.now.times[i], a = r.aft.times[i];
      const cut = (n != null && a != null && n > a) ? '<span class="cut">−' + (n - a) + '분</span> ' : '';
      return '<div class="bar-row"><span class="d">' + d + '</span><span class="tr">' +
        (n != null ? '<i style="width:' + (n / mx * 100).toFixed(1) + '%"></i>' : '') +
        (a != null ? '<i class="af" style="width:' + (a / mx * 100).toFixed(1) + '%"></i>' : '') +
        '</span><span class="v">' + cut + (n == null ? '—' : n) + '→<b>' + (a == null ? '—' : a + '분') + '</b></span></div>';
    }).join('');
    const plan = lineChips(r.lines, true);
    const nl = plan.length
      ? '<div class="newlines"><div class="t">이 역에 새로 생기는 노선</div>' + plan.map(x => {
          const yr = RankTable.yearOf(x.m.o);
          return '<span class="nl">' + chipHtml(x) + '<span class="nl-yr">' + (yr ? yr + '년' : '시기 미정') + '</span></span>';
        }).join('') + '</div>'
      : (r.change > 0 ? '<div class="newlines"><div class="t">이 역에는 새 노선이 없지만, 가까운 역의 새 노선(GTX 등)으로 갈아타는 길이 빨라집니다.</div></div>' : '');
    const head = r.isNew
      ? '<div class="big"><span class="a">지금은 철도로 갈 수 없음</span><span class="arrow">→</span><span class="b">' + r.aft.rank + '위</span><span class="badge">' + Icons.svg(T.new.ic) + ' 신규</span></div>'
      : '<div class="big"><span class="a">지금 ' + r.now.rank + '위</span><span class="arrow">→</span><span class="b">' + aftLabel() + ' ' + r.aft.rank + '위</span>' + badge(r).replace('class="badge"', 'class="badge t-' + t + '"') + '</div>';
    return '<div class="card t-' + t + '" id="card-' + esc(r.id) + '">' + head +
      '<div class="bars">' + bars + '</div>' +
      '<div class="legend"><span><i style="background:var(--bar-now)"></i>지금</span><span><i style="background:var(--bar-aft)"></i>' + aftLabel() + '</span></div>' +
      nl + '<a class="go" href="' + link(r) + '">지도에서 보기 →</a>' +
      '<button class="share" data-share="' + esc(r.id) + '"><i data-ic="camera"></i> 공유 이미지 저장</button>' +
      '<button class="share" data-link="' + esc(r.id) + '"><i data-ic="link"></i> 링크 복사</button><span class="share-msg" role="status"></span></div>';
  }

  // 개통 연도 단계 — rank.json years + '전체'
  const stops = () => (doc.years || []).map(String).concat(['all']);
  const yrLabel = y => y === 'all' ? '전체 개통' : y + '년까지';
  const aftLabel = () => st.y === 'all' ? '개통 후' : st.y + '년';
  function renderYear() {
    const S = stops();
    if (!S.includes(st.y)) st.y = 'all';
    const i = S.indexOf(st.y);
    $('yr-row').hidden = st.t === 'now' || S.length < 2;
    $('yr').max = String(S.length - 1); $('yr').value = String(i);
    $('yr').setAttribute('aria-valuetext', yrLabel(st.y));
    $('yr-ticks').innerHTML = S.map(y => '<span' + (y === st.y ? ' aria-current="true"' : '') + '>' + (y === 'all' ? '전체' : "'" + y.slice(2)) + '</span>').join('');
    $('yr-now').textContent = yrLabel(st.y);
    const ids = st.y === 'all' ? (doc.undated_lines || []) : ((doc.year_lines || {})[st.y] || []);
    const named = lineChips(ids);
    $('yr-opens').innerHTML = named.length
      ? (st.y === 'all' ? '시기 미정 노선까지:' : st.y + '년 개통:') + ' ' + named.map(chipHtml).join(' ')
      : '';
  }

  function render() {
    if (!doc) return;
    syncControls(); renderYear(); saveUrl();
    const res = RankTable.compute(doc, { weight: st.w, region: st.r, at: st.t === 'aft' ? st.y : 'all', wait: st.wait });
    let rows = res.rows;
    const isNow = st.t === 'now';

    // 등급 칩 (개통 후 시점에서만 — 지금 시점에는 '오른다'가 없다)
    const tc = RankTable.tierCounts(rows);
    $('tiers').hidden = isNow;
    $('tiers').innerHTML = '<button class="tchip tc-all" data-tier="" aria-pressed="' + (!st.tier) + '">전체 <b>' + rows.length.toLocaleString() + '</b></button>' +
      TIER_ORDER.map(k => '<button class="tchip tc-' + k + '" data-tier="' + k + '" aria-pressed="' + (st.tier === k) + '" title="' + esc(T[k].hint) + '">' +
        Icons.svg(T[k].ic) + ' ' + T[k].label + ' <b>' + tc[k].toLocaleString() + '</b></button>').join('');

    // 떡상 TOP 10 — 개통 후, 찾기·등급 거르기 없을 때
    const showSlope = !isNow && !st.q && !st.tier;
    $('slope-sec').hidden = !showSlope;
    if (showSlope) $('slope').innerHTML = slopeSvg(rows, res.total);

    if (isNow) {
      rows = rows.filter(r => r.now.rank != null).map(r => Object.assign({}, r, { aft: r.now, orig: r }));
      rows = RankTable.sortRows(rows, 'rank');
      const cnt = new Map(); rows.forEach(r => cnt.set(r.aft.score, (cnt.get(r.aft.score) || 0) + 1));
      rows.forEach(r => { r.tie = cnt.get(r.aft.score) > 1; });
    } else {
      rows = RankTable.sortRows(rows, st.sort === 'rank' ? 'after' : st.sort);
      if (st.tier) rows = rows.filter(r => RankTable.tierOf(r) === st.tier);
    }
    const total = isNow ? res.totalNow : res.total;
    const filtered = rows.filter(r => RankTable.matches(r, st.q));
    $('slope-h').textContent = (st.y === 'all' ? '개통하면' : st.y + '년까지 개통하면') + ' 가장 많이 오르는 역 TOP 10';
    $('hint').textContent = REGION[st.r] + ' ' + total.toLocaleString() + '역 · ' + LABEL[st.w] + ' · ' +
      (isNow ? '지금' : aftLabel() === '개통 후' ? '개통 후' : aftLabel() + '까지 개통') + ' 기준' + (st.wait ? ' · 출퇴근 배차 포함' : '') + (st.tier ? ' · ' + T[st.tier].label + ' ' + filtered.length + '곳' : '') +
      (st.q ? ' · "' + st.q + '" ' + filtered.length + '곳' : '');
    $('list-h').textContent = st.tier ? T[st.tier].label + ' 역' : (st.sort === 'rise' && !isNow ? '많이 오르는 순' : st.sort === 'gain' && !isNow ? '점수 많이 오르는 순' : '순위');

    // 1~3위 카드 — 순위순·거르기 없을 때만
    const podOn = !st.q && !st.tier && (isNow || st.sort === 'rank');
    const pod = $('podium');
    pod.hidden = !podOn;
    pod.innerHTML = podOn ? rows.slice(0, 3).map(r =>
      '<a class="pod" href="' + link(r) + '"><span class="medal">' + (r.tie ? '공동 ' : '') + r.aft.rank + '위</span>' +
      '<div class="nm">' + esc(r.name) + '</div><div class="rg">' + esc([r.region, r.sgg].filter(Boolean).join(' ')) + '</div>' +
      '<div class="sc">' + r.aft.score.toFixed(1) + '<small>점</small></div>' +
      '<div class="tm">' + DEST.map((d, j) => d + ' ' + (r.aft.times[j] == null ? '—' : r.aft.times[j] + '분')).join(' · ') + '</div></a>').join('') : '';

    const body = podOn ? filtered.slice(3) : filtered;
    const list = $('list');
    if (!filtered.length) {
      list.innerHTML = '<li class="empty">찾는 역이 없어요. 지역을 <b>전국</b>으로 바꾸거나 등급 거르기를 풀어 보세요.</li>';
      $('more').hidden = true; return;
    }
    const page = body.slice(0, st.shown);
    list.innerHTML = page.map(r => {
      const t = isNow ? 'flat' : RankTable.tierOf(r);
      const open = st.open === r.id;
      const gain = (!isNow && r.now.score != null && r.aft.score > r.now.score) ? '+' + (r.aft.score - r.now.score).toFixed(1) + '점' : '';
      const from = (!isNow && r.now.rank != null) ? '<span class="from">' + r.now.rank + '위 →</span>' : '';
      return '<li><button class="row t-' + t + '" data-id="' + esc(r.id) + '" aria-expanded="' + open + '" aria-controls="card-' + esc(r.id) + '">' +
        '<span class="rk">' + from + '<b>' + r.aft.rank + '<span class="tie">' + (r.tie ? ' 공동' : '') + '</span></b>' + (isNow ? '' : badge(r)) + '</span>' +
        '<span class="who"><span class="nm">' + esc(r.name) + '</span><span class="rg">' + esc([r.region, r.sgg].filter(Boolean).join(' ')) + '</span>' +
        '<span class="lines">' + chips(r.lines) + '</span><span class="tms">' + times(r) + '</span></span>' +
        '<span class="scr"><b>' + r.aft.score.toFixed(1) + '</b><small>점</small>' + (gain ? '<span class="gain">' + gain + '</span>' : '') +
        '<span class="chev" aria-hidden="true">' + (open ? '접기 ▲' : '자세히 ▼') + '</span></span></button>' +
        (open ? cardHtml(r.orig || r) : '') + '</li>';
    }).join('');
    const left = body.length - page.length;
    $('more').hidden = left <= 0;
    $('more').textContent = '더 보기 (' + left.toLocaleString() + '곳 남음)';
  }

  // 역 하나 펼치기 — 목록에 없으면(더 보기 밖) 찾기로 보여 준다
  function openStation(id, scroll) {
    st.open = st.open === id ? '' : id;
    render();
    if (st.open) {
      let el = document.querySelector('.row[data-id="' + CSS.escape(id) + '"]');
      if (!el) { const r = doc.rows.find(x => x.id === id); if (r) { st.q = r.n; render(); el = document.querySelector('.row[data-id="' + CSS.escape(id) + '"]'); } }
      if (el && scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el) el.focus({ preventScroll: true });
    }
  }

  document.querySelectorAll('.seg').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    st[g.dataset.k] = b.dataset.v; st.shown = PAGE; render();
  }));
  $('tiers').addEventListener('click', e => {
    const b = e.target.closest('.tchip'); if (!b) return;
    st.tier = b.dataset.tier; st.shown = PAGE; if (st.tier && st.sort === 'rank') st.sort = 'rise'; render();
  });
  $('yr').addEventListener('input', e => { stopPlay(); st.y = stops()[+e.target.value] || 'all'; render(); });
  let playT = null;
  function stopPlay() { if (playT) { clearInterval(playT); playT = null; $('yr-play').innerHTML = Icons.svg('play'); $('yr-play').setAttribute('aria-label', '연도 차례로 보기'); } }
  $('yr-play').addEventListener('click', () => {
    if (playT) { stopPlay(); return; }
    const S = stops(); let i = 0;
    st.y = S[0]; st.open = ''; render();
    $('yr-play').innerHTML = Icons.svg('stop'); $('yr-play').setAttribute('aria-label', '멈추기');
    playT = setInterval(() => { i++; if (i >= S.length) { stopPlay(); return; } st.y = S[i]; render(); }, 1600);
  });
  $('wait').addEventListener('click', () => { st.wait = !st.wait; render(); });
  $('sort').addEventListener('change', e => { st.sort = e.target.value; st.shown = PAGE; render(); });
  let tmr = null;
  $('q').addEventListener('input', e => { clearTimeout(tmr); tmr = setTimeout(() => { st.q = e.target.value.trim(); st.shown = PAGE; render(); }, 150); });
  $('more').addEventListener('click', () => { st.shown += PAGE; render(); });
  $('list').addEventListener('click', e => { const b = e.target.closest('.row'); if (b) openStation(b.dataset.id, false); });
  /* 공유 이미지 — 정사각형 1080×1080 PNG (인스타·카톡). 화면 글꼴로 캔버스에 그린다. 외부 자원 없음.
   * 휴대폰에서 파일 공유를 지원하면 공유 창, 아니면 내려받기. */
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function shareCanvas(r) {
    const S = 1080, c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d');
    const F = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const t = RankTable.tierOf(r);
    const COL = { rocket: '#0a8f4a', up: '#3aa76d', flat: '#8a929a', down: '#b45309', new: '#7a3fd0' }[t];
    // 배경
    const bg = g.createLinearGradient(0, 0, 0, S); bg.addColorStop(0, '#0b1d3a'); bg.addColorStop(1, '#10305e');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(900 - i * 40, 160 + i * 30, 260 - i * 30, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#9fb3d1'; g.font = '600 34px ' + F; g.fillText((st.t === 'aft' && st.y !== 'all' ? st.y + '년까지 개통하면' : 'GTX·새 노선 모두 개통하면') + ', 우리 역 접근성은 몇 위?', 80, 120);   // 카드 공통 표기 (2026-11-14)
    g.fillStyle = '#ffffff'; g.font = '800 104px ' + F; g.fillText(r.name + '역', 80, 250);
    g.fillStyle = '#9fb3d1'; g.font = '500 32px ' + F; g.fillText([r.region, r.sgg].filter(Boolean).join(' ') + ' · ' + REGION[st.r] + ' ' + (st.w === 'avg' ? '' : LABEL[st.w] + ' ') + '순위', 84, 305);
    // 큰 순위
    g.font = '700 46px ' + F; g.fillStyle = '#c8d3e6';
    const nowTxt = r.isNew ? '지금은 철도 없음' : '지금 ' + r.now.rank + '위';
    g.fillText(nowTxt, 80, 440);
    g.fillStyle = '#ffffff'; g.font = '800 150px ' + F; g.fillText(r.aft.rank + '위', 80, 600);
    const w1 = g.measureText(r.aft.rank + '위').width;
    g.font = '600 36px ' + F; g.fillStyle = '#c8d3e6'; g.fillText('개통 후', 80 + w1 + 24, 600);
    // 배지
    const bt = t === 'new' ? '신규' : (r.change > 0 ? '▲' + r.change : r.change < 0 ? '▼' + (-r.change) : '그대로') + '  ' + ({ rocket: '접근성 크게 개선', up: '접근성 개선', flat: '비슷', down: '상대 하락' })[t];   // '떡상'·'계단' 빼기 (카드 공통 표기)
    g.font = '800 44px ' + F; const bw = g.measureText(bt).width + 56;
    roundRect(g, 80, 640, bw, 78, 39); g.fillStyle = COL; g.fill();
    g.fillStyle = '#fff'; g.fillText(bt, 108, 694);
    // 이 역에 새로 생기는 노선 (개통 연도)
    const plan = lineChips(r.lines, true).slice(0, 3).map(x => { if (x.m.s === 'planned' || x.m.s === 'proposed') return x.m.n + ' (계획)'; const y = RankTable.yearOf(x.m.o); return x.m.n + (y ? ' ' + y : ''); });   // 계획 노선은 연도 없이 (카드 공통 표기)
    if (plan.length) { g.font = '600 30px ' + F; g.fillStyle = '#c8d3e6'; g.fillText('새 노선 ' + plan.join(' · '), 80 + bw + 26, 692); }
    // 업무지구 분
    const D = ['도심권 CBD', '여의도권 YBD', '강남권 GBD'];   // 권역 안 가장 빠른 역까지 (감사 이전1)
    D.forEach((d, i) => {
      const y = 800 + i * 70, n = r.now.times[i], a = r.aft.times[i];
      g.fillStyle = '#9fb3d1'; g.font = '600 32px ' + F; g.fillText(d, 80, y);
      g.fillStyle = '#ffffff'; g.font = '800 40px ' + F;
      const txt = (n != null && a != null && n > a) ? n + '분 → ' + a + '분' : (a == null ? '—' : a + '분');
      g.fillText(txt, 330, y);
      if (n != null && a != null && n > a) { g.fillStyle = '#5fe39a'; g.font = '800 34px ' + F; g.fillText('−' + (n - a) + '분', 720, y); }
    });
    g.fillStyle = '#7f93b3'; g.font = '500 24px ' + F;
    g.fillText(st.wait ? '추정값 · 타고 가는 시간 + 갈아타며 걷는 시간 + 출퇴근 배차 기다림' : '추정값 · 타고 가는 시간 + 갈아타며 걷는 시간 (기다리는 시간 제외)', 80, 1000);
    g.fillStyle = '#c8d3e6'; g.font = '700 28px ' + F;
    g.fillText('한국철도맵 · 개통 후 교통 접근성 순위 · plazalabs.github.io/kr-rail-map/rank.html', 80, 1044);
    return c;
  }
  async function shareStation(id, msgEl) {
    const r = RankTable.compute(doc, { weight: st.w, region: st.r, at: st.t === 'aft' ? st.y : 'all', wait: st.wait }).rows.find(x => x.id === id);
    if (!r) return;
    const c = shareCanvas(r);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    if (!blob) { if (msgEl) msgEl.textContent = '이미지를 만들지 못했어요.'; return; }
    const name = '접근성_' + r.name + '_' + (r.now.rank || '') + '위→' + r.aft.rank + '위.png';
    const file = (typeof File === 'function') ? new File([blob], name, { type: 'image/png' }) : null;
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: r.name + ' GTX 개통 후 ' + r.aft.rank + '위', text: location.origin + location.pathname });
        if (msgEl) msgEl.textContent = '공유했어요.';
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    if (msgEl) msgEl.textContent = '이미지를 저장했어요 (' + name + ').';
  }
  window.RankShare = { canvas: id => { const r = RankTable.compute(doc, { weight: st.w, region: st.r, at: st.t === 'aft' ? st.y : 'all', wait: st.wait }).rows.find(x => x.id === id); return r ? shareCanvas(r) : null; } };
  $('list').addEventListener('click', e => { const b = e.target.closest('[data-share]'); if (!b) return; e.stopPropagation(); shareStation(b.getAttribute('data-share'), b.parentNode.querySelector('.share-msg')); }, true);
  // 링크 복사 — 이 역 카드가 펼쳐진 순위표 주소 (지금 기준·지역·연도 그대로). 카톡에 붙여 넣으면 바로 그 역
  function cardUrl(id) {
    const u = new URL(location.href);
    u.searchParams.set('open', id); u.searchParams.delete('q'); u.searchParams.delete('tier');
    return u.toString();
  }
  $('list').addEventListener('click', async e => {
    const b = e.target.closest('[data-link]'); if (!b) return; e.stopPropagation();
    const url = cardUrl(b.getAttribute('data-link'));
    const msg = b.parentNode.querySelector('.share-msg');
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (er) { /* 권한 없음 */ }
    if (!ok) {
      const ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (er) { ok = false; }
      ta.remove();
    }
    if (msg) msg.textContent = ok ? '링크를 복사했어요.' : '복사하지 못했어요: ' + url;
  }, true);
  $('slope').addEventListener('click', e => { const a = e.target.closest('[data-open]'); if (!a) return; e.preventDefault(); openStation(a.getAttribute('data-open'), true); });

  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 200); });
  fetch('data/rank.json').then(r => r.ok ? r.json() : Promise.reject(r.status)).then(d => {
    doc = d; lineInfo = d.lines || {};
    // ?open=역ID 로 들어오면(지도 역 상세의 '떡상 랭킹에서 보기') 그 역 카드를 펼친다 — 목록 밖이면 이름으로 찾고, 수도권 밖이면 전국
    if (st.open) {
      const r = d.rows.find(x => x.id === st.open);
      if (r) {
        if (st.r === 'capital' && !['서울', '경기', '인천'].includes(r.r)) st.r = 'all';
        if (st.r === 'seoul' && r.r !== '서울') st.r = 'capital';
        if (!st.q) st.q = r.n;
      } else st.open = '';
    }
    render();
    if (st.open) { const el = document.querySelector('.row[data-id="' + CSS.escape(st.open) + '"]'); if (el) el.scrollIntoView({ block: 'center' }); }
  }).catch(() => { $('list').innerHTML = '<li class="empty">순위 자료를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</li>'; });
})();
