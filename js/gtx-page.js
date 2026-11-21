/* GTX 입구 (gtx.html) — 입력 하나 → 카드 하나.
 * 숫자는 data/gtx-card.json(build_gtx_card.js)·data/rank-top.json 그대로 읽는다. 여기서 세지 않는다. */
(function () {
  'use strict';
  var G = GtxCard, D = null, TOP = null;   // js/gtx-card.js 의 const (window 속성 아님)
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  var tr = function (n, d) { try { if (window.KRTrack) window.KRTrack(n, d); } catch (e) { /* 무시 */ } };
  var num = function (v) { return Number(v).toLocaleString('ko-KR'); };
  var half = function (h) { var m = /^(\d{4})H([12])$/.exec(h || ''); return m ? m[1] + ' ' + (m[2] === '1' ? '상반기' : '하반기') : h; };
  var norm = function (q) { return String(q || '').replace(/\s+/g, '').replace(/역$/, ''); };

  function lineText(id) {
    var l = D.lines[id]; if (!l) return id;
    return l[0] + ' (' + LineStatus.word(l[1]) + (l[2] != null ? ' · ' + l[2] : '') + ')';
  }
  function bigText(x) {
    var d = x.d == null ? null : D.dest[x.d];
    if (!d) return { main: '업무지구까지 철도로 갈 수 없어요', sub: '' };
    if (x.kd === 'new') return { main: d.name + '까지 지금은 못 감 → 개통 후 ' + x.aft[x.d] + '분', sub: d.label };
    if (x.kd === 'same') return { main: d.name + '까지 ' + x.now[x.d] + '분 · 개통 후에도 같음', sub: d.label };
    return { main: d.name + '까지 지금 ' + x.now[x.d] + '분 → 개통 후 ' + x.aft[x.d] + '분', sub: d.label };
  }
  function marketOf(x) { return x.k && D.k[x.k] ? D.k[x.k] : null; }
  function marketKey(x) { var k = marketOf(x); return k ? k.m : 'none'; }
  function marketNote(x) {
    var k = marketOf(x), M = D.market;
    if (!k) return '이 역에 연결된 아파트 실거래 자료가 없어요';
    if (k.m === 'hold') return '거래가 적어 비교하지 않아요 (' + half(M.from) + ' ' + num(k.a[0]) + '건 · ' + half(M.to) + ' ' + num(k.a[1]) + '건, 기준 ' + M.min_deals + '건)';
    return k.dong + ' 중위 평당가 ' + half(M.from) + ' → ' + half(M.to) + ' ' + (k.p > 0 ? '+' : '') + k.p + '% · 수도권 ' + num(M.n_label) + '개 동 가운데 ' +
      (k.m === 'strong' ? '위쪽 25%' : k.m === 'weak' ? '아래쪽 25%' : '가운데 50%') + ' (경계 ' + M.q25 + '% / ' + M.q75 + '%)';
  }

  function render(id) {
    var x = D.s[id], card = $('card');
    if (!x) return;
    $('pick').hidden = true;
    card.innerHTML = ''; card.hidden = false; card.dataset.st = id;
    card.appendChild(el('p', 'st', x.n + (x.g ? ' · ' + x.g : '')));
    var b = bigText(x), big = el('p', 'big', b.main);
    if (b.sub) big.appendChild(el('small', null, b.sub + ' · ' + D.year + '년까지 개통 가정'));
    card.appendChild(big);
    var chips = el('div', 'chips');
    var ca = el('button', 'chip acc'); ca.type = 'button'; ca.appendChild(el('span', null, '접근성')); ca.appendChild(document.createTextNode(G.TIER_WORD[x.t]));
    var mk = marketKey(x), cm = el('button', 'chip mk ' + mk); cm.type = 'button'; cm.appendChild(el('span', null, '시세 흐름')); cm.appendChild(document.createTextNode(G.MARKET_WORD[mk]));
    chips.append(ca, cm); card.appendChild(chips);
    var note = el('p', 'chip-note'); note.hidden = true; card.appendChild(note);
    ca.addEventListener('click', function () { note.hidden = false; note.textContent = D.access_basis + ' · 수도권 순위 ' + (x.rn ? x.rn + '위' : '지금은 철도 없음') + ' → 개통 후 ' + x.ra + '위'; });
    cm.addEventListener('click', function () { note.hidden = false; note.textContent = marketNote(x); });
    if (x.ln.length) {
      var p = el('p', 'small', '새 노선 ' + x.ln.map(lineText).join(' · '));
      if (x.pz) p.appendChild(el('span', 'badge', '구상안 기준'));
      card.appendChild(p);
    }
    var k = marketOf(x);
    if (k) card.appendChild(el('p', 'small', '시세는 대표 동 ' + k.dong + ' 기준'));
    card.appendChild(el('p', 'small', '접근성 순위와 시세는 다른 지표 · 집값 예측 아님'));
    card.appendChild(el('p', 'small', '기준일 순위 ' + D.updated + ' · 시세 ' + half(D.market.from) + ' → ' + half(D.market.to)));

    var acts = el('div', 'actions');
    var sh = el('button', 'primary', '카드 공유'); sh.type = 'button'; sh.addEventListener('click', function () { share(id, x); });
    var mp = el('a', null, '지도에서 자세히'); mp.href = 'index.html?st=' + encodeURIComponent(id) + '&mode=invest';
    acts.append(sh, mp); card.appendChild(acts);
    var shMsg = el('p', 'small'); shMsg.id = 'share-msg'; shMsg.setAttribute('role', 'status'); card.appendChild(shMsg);

    var det = el('details'), sum = el('summary', null, '자세히 보기'); det.appendChild(sum);
    var tb = el('table'), head = el('tr'); ['업무지구', '지금', '개통 후'].forEach(function (h) { head.appendChild(el('th', null, h)); }); tb.appendChild(head);
    D.dest.forEach(function (d, i) {
      var r = el('tr'); r.appendChild(el('td', null, d.name));
      r.appendChild(el('td', null, x.now[i] == null ? '못 감' : x.now[i] + '분'));
      r.appendChild(el('td', null, x.aft[i] == null ? '못 감' : x.aft[i] + '분')); tb.appendChild(r);
    });
    det.appendChild(tb);
    det.appendChild(el('p', 'small', '수도권 ' + num(D.total) + '역 중 ' + (x.rn ? x.rn + '위' : '지금은 철도 없음') + ' → 개통 후 ' + x.ra + '위' + (x.ch ? ' (' + (x.ch > 0 ? x.ch + '계단 오름' : (-x.ch) + '계단 밀림') + ')' : '')));
    if (k) {
      det.appendChild(el('p', 'small', '대표 동 ' + k.dong + (k.pp ? ' · 중위 평당가 ' + num(k.pp) + '만 원' : '') + ' · 거래 ' + half(D.market.from) + ' ' + num(k.a[0]) + '건, ' + half(D.market.to) + ' ' + num(k.a[1]) + '건' + (k.p != null ? ' · 변화 ' + (k.p > 0 ? '+' : '') + k.p + '%' : '')));
      det.appendChild(el('p', 'small', '수도권 ' + num(D.market.n_label) + '개 동 기준 경계: 아래 25% ' + D.market.q25 + '% · 가운데 ' + D.market.q50 + '% · 위 25% ' + D.market.q75 + '%'));
    }
    if (x.j) det.appendChild(el('p', 'small', '전세가율 ' + Math.round(x.j[0] * 100) + '% (짝 ' + num(x.j[1]) + '개)' + (x.j[0] >= D.risk ? ' · 전세가율 ' + Math.round(D.risk * 100) + '% 이상 짝이 많아요' : '')));
    det.appendChild(el('p', 'small', D.market.note));
    var how = el('a', null, '계산 방법'); how.href = 'data.html'; var hp = el('p', 'small'); hp.appendChild(how); det.appendChild(hp);
    card.appendChild(det);
  }

  function shareCanvas(id, x) {
    var S = 1080, c = document.createElement('canvas'); c.width = S; c.height = S;
    var g = c.getContext('2d'), F = '"Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif';
    g.fillStyle = '#0f1b33'; g.fillRect(0, 0, S, S);
    var fit = function (t, w, size, weight) { var s = size; g.font = weight + ' ' + s + 'px ' + F; while (s > 20 && g.measureText(t).width > w) { s--; g.font = weight + ' ' + s + 'px ' + F; } };
    g.fillStyle = '#c8d3e6'; fit(x.n + (x.g ? ' · ' + x.g : ''), S - 160, 44, '700'); g.fillText(x.n + (x.g ? ' · ' + x.g : ''), 80, 150);
    var b = bigText(x); g.fillStyle = '#ffffff'; fit(b.main, S - 160, 64, '800'); g.fillText(b.main, 80, 280);
    g.fillStyle = '#9fb3d1'; fit(b.sub + ' · ' + D.year + '년까지 개통 가정', S - 160, 30, '600'); g.fillText(b.sub + ' · ' + D.year + '년까지 개통 가정', 80, 335);
    var chip = function (label, word, y, color) { g.font = '600 30px ' + F; g.fillStyle = '#9fb3d1'; g.fillText(label, 80, y); g.font = '800 46px ' + F; g.fillStyle = color; g.fillText(word, 300, y); };
    chip('접근성', G.TIER_WORD[x.t], 470, '#4fd88a');
    chip('시세 흐름', G.MARKET_WORD[marketKey(x)], 560, '#c4a3ff');
    var y = 680, line = function (t) { g.fillStyle = '#c8d3e6'; fit(t, S - 160, 30, '600'); g.fillText(t, 80, y); y += 50; };
    if (x.ln.length) line('새 노선 ' + x.ln.map(lineText).join(' · ') + (x.pz ? ' · 구상안 기준' : ''));
    var k = marketOf(x); if (k) line('시세는 대표 동 ' + k.dong + ' 기준');
    line('접근성 순위와 시세는 다른 지표 · 집값 예측 아님');
    line('기준일 순위 ' + D.updated + ' · 시세 ' + half(D.market.from) + ' → ' + half(D.market.to));
    g.fillStyle = '#9fb3d1'; fit('한국철도맵 · plazalabs.github.io/kr-rail-map/gtx.html', S - 160, 28, '700'); g.fillText('한국철도맵 · plazalabs.github.io/kr-rail-map/gtx.html', 80, 1030);
    return c;
  }
  function share(id, x) {
    var msg = $('share-msg'), result = function (r) { tr('share_result', { 종류: 'card-gtx', 결과: r }); };
    tr('share_card', { 종류: 'card-gtx' });
    var url = location.origin + location.pathname + '?st=' + encodeURIComponent(id) + '&ref=card-gtx';
    shareCanvas(id, x).toBlob(function (blob) {
      if (!blob) { result('만들기 실패'); msg.textContent = '이미지를 만들지 못했어요.'; return; }
      var name = 'GTX입구_' + x.n + '.png', file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
      var save = function () {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        result('저장'); msg.textContent = '카드 그림을 저장했어요. 링크: ' + url;
      };
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: x.n + ' GTX 개통 후', text: url })
          .then(function () { result('공유함'); msg.textContent = '공유했어요.'; })
          .catch(function (e) { if (e && e.name === 'AbortError') result('취소'); else save(); });
      } else save();
    }, 'image/png');
  }

  // 찾기: 역 이름(수도권 카드) → 동 이름 → 수도권 밖 역
  function find(q) {
    var n = norm(q); if (!n) return { kind: 'empty' };
    var ids = Object.keys(D.s).filter(function (id) { return norm(D.s[id].n) === n; });
    var seen = {}, uniq = ids.filter(function (id) { var x = D.s[id], key = x.n + '|' + x.ra; if (seen[key]) return false; seen[key] = 1; return true; });
    if (uniq.length) return { kind: 'card', ids: uniq };
    var byDong = Object.keys(D.s).filter(function (id) { var k = D.s[id].k; return k && norm(D.k[k].dong) === n || (k && norm(D.k[k].dong).replace(/동$/, '') === n); });
    seen = {}; byDong = byDong.filter(function (id) { var key = D.s[id].n; if (seen[key]) return false; seen[key] = 1; return true; });
    if (byDong.length) return { kind: 'card', ids: byDong, dong: true };
    var out = Object.keys(D.o).find(function (nm) { return norm(nm) === n; });
    if (out) return { kind: 'outside', id: D.o[out], name: out };
    return { kind: 'none' };
  }
  function go(q, how) {
    var r = find(q), msg = $('msg'), pick = $('pick');
    pick.hidden = true; pick.innerHTML = ''; msg.textContent = '';
    if (r.kind === 'empty') return;
    if (r.kind === 'card') {
      tr('GTX 입구 검색', { 결과: '카드', 방법: how });
      if (r.ids.length === 1) { render(r.ids[0]); return; }
      msg.textContent = r.dong ? '이 동에 있는 역을 고르세요' : '이름이 같은 역이 여럿이에요. 하나를 고르세요';
      r.ids.forEach(function (id) {
        var x = D.s[id], li = el('li'), b = el('button', null, x.n + ' · ' + (x.g || x.r) + (x.ln.length ? ' · ' + x.ln.map(function (l) { return D.lines[l] ? D.lines[l][0] : l; }).join('·') : ''));
        b.type = 'button'; b.addEventListener('click', function () { render(id); }); li.appendChild(b); pick.appendChild(li);
      });
      pick.hidden = false; $('card').hidden = true;
      return;
    }
    $('card').hidden = true;
    if (r.kind === 'outside') {
      tr('GTX 입구 검색', { 결과: '수도권 밖', 방법: how });
      msg.textContent = '지금은 수도권 역만 볼 수 있어요. ';
      var a = el('a', null, r.name + ' 역 상세 보기'); a.href = 'index.html?st=' + encodeURIComponent(r.id); msg.appendChild(a);
      return;
    }
    tr('GTX 입구 검색', { 결과: '찾지 못함', 방법: how });
    msg.textContent = '"' + q + '"을(를) 찾지 못했어요. 역 이름이나 동 이름을 넣어 보세요.';
  }

  function renderTop() {
    if (!TOP || !TOP.top || !TOP.top.length) return;
    $('top3-sub').textContent = (TOP.year === 'all' ? '모든 계획 노선' : TOP.year + '년까지') + ' 개통 가정 · 수도권 ' + TOP.total + '역 중 교통 접근성 순위 · 집값 예측 아님';
    var ol = $('top3-list');
    TOP.top.forEach(function (t, i) {
      var li = el('li'), b = el('button', null, (i + 1) + '. ' + t.n); b.type = 'button';
      b.addEventListener('click', function () { $('q').value = t.n; if (D.s[t.id]) { tr('GTX 입구 검색', { 결과: '카드', 방법: 'TOP3' }); $('msg').textContent = ''; render(t.id); } else go(t.n, 'TOP3'); });
      li.appendChild(b); ol.appendChild(li);
    });
    $('top3').hidden = false;
  }

  Promise.all([fetch('data/gtx-card.json').then(function (r) { return r.json(); }), fetch('data/rank-top.json').then(function (r) { return r.json(); }).catch(function () { return null; })])
    .then(function (res) {
      D = res[0]; TOP = res[1];
      renderTop();
      var q = $('q');
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(q.value, '입력'); });
      var st = new URLSearchParams(location.search).get('st');
      if (st && D.s[st]) { q.value = D.s[st].n; render(st); }
      document.body.dataset.ready = '1';
    })
    .catch(function () { $('msg').textContent = '자료를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'; });
})();
