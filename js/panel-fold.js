/* PanelFold — 오른쪽 창(떡상·게시판·길찾기·그리기·통근권) 접기·펼치기 손잡이 (회장님 피드백 11-15)
 *
 * "지도가 한눈에 다 보여야 편하다" — 왼쪽 패널에만 있던 접기 손잡이(#sidebar-toggle)를 오른쪽 창에도 붙인다.
 *   - PC(981px 이상)에서 오른쪽 창이 열려 있으면 그 창 왼쪽 가장자리에 › 손잡이 → 누르면 창이 접히고(닫히지 않음, 고른 역·순위 그대로)
 *     손잡이는 화면 오른쪽 끝으로 가서 ‹ 펼치기.
 *   - 창을 닫았다 다시 열면 펼친 상태로 시작.
 *   - 휴대폰은 아래 시트(손잡이 grip)라 해당 없음.
 * Esc: 오른쪽 창은 원래대로 Esc 로 닫힌다(js/ui.js). 닫을 것이 없을 때 Esc 는 왼쪽 패널을 접는다(js/ui.js 가 KR_foldLeft 호출).
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var SEL = '.rkp:not([hidden]), #route-panel:not([hidden]), #draw-panel:not([hidden]), #cm-panel:not([hidden])';
  var btn = null, raf = 0, seen = '';
  var mq = window.matchMedia ? window.matchMedia('(min-width: 981px)') : { matches: true };

  function openPanel() {
    var list = document.querySelectorAll(SEL);
    for (var i = 0; i < list.length; i++) {
      if (getComputedStyle(list[i]).display !== 'none') return list[i];
    }
    return null;
  }
  function folded() { return document.body.classList.contains('rpanel-hidden'); }

  function place() {
    raf = 0;
    if (!btn) return;
    // 새 창이 열리면(떡상 접어 둔 채 길찾기를 여는 등) 펼친다 — 접힌 채 열려 안 보이면 고장처럼 보인다
    var now = Array.prototype.map.call(document.querySelectorAll('.rkp:not([hidden]), #route-panel:not([hidden]), #draw-panel:not([hidden]), #cm-panel:not([hidden])'), function (e) { return e.id || e.className.split(' ').pop(); }).join(',');
    if (folded() && now.split(',').some(function (k) { return k && (',' + seen + ',').indexOf(',' + k + ',') < 0; })) document.body.classList.remove('rpanel-hidden');
    seen = now;
    if (typeof syncMapBtn === 'function') syncMapBtn();
    if (!mq.matches) { setHidden(true); return; }   // 휴대폰은 손잡이 없음 — 계산(스타일·크기 재기) 건너뜀
    // 접힌 동안은 창이 display:none 이라 접히기 전 '열린 창'을 기억해 둔 것으로 판단
    var p = folded() ? null : openPanel();
    var any = folded() ? !!document.querySelector('.rkp:not([hidden]), #route-panel:not([hidden]), #draw-panel:not([hidden]), #cm-panel:not([hidden])') : !!p;
    if (!mq.matches || !any) {
      setHidden(true);
      if (folded() && !any) document.body.classList.remove('rpanel-hidden');   // 창을 닫으면 다음엔 펼친 채로
      return;
    }
    setHidden(false);
    var wrap = document.getElementById('map-wrap').getBoundingClientRect();
    if (folded()) {
      btn.style.right = '0px';
      btn.style.top = '50%';
    } else {
      var r = p.getBoundingClientRect();
      btn.style.right = Math.max(0, Math.round(wrap.right - r.left)) + 'px';
      btn.style.top = Math.round(r.top - wrap.top + Math.min(r.height, wrap.height - (r.top - wrap.top)) / 2) + 'px';
    }
    var f = folded();
    setAttr('aria-expanded', f ? 'false' : 'true');
    setAttr('aria-label', f ? '오른쪽 창 펼치기' : '오른쪽 창 접기');
    setAttr('title', f ? '오른쪽 창 펼치기' : '오른쪽 창 접기 (지도 넓게)');
  }
  // 바뀔 때만 쓴다 — 같은 값이라도 hidden 을 쓰면 아래 MutationObserver 가 다시 불러 매 프레임 도는 고리가 됐다(R8 실측, 11-15)
  function setHidden(h) { if (btn.hidden !== h) btn.hidden = h; }
  function setAttr(k, v) { if (btn.getAttribute(k) !== v) btn.setAttribute(k, v); }
  function schedule() { if (!raf) raf = requestAnimationFrame(place); }

  function toggle() {
    document.body.classList.toggle('rpanel-hidden');
    if (window.KRTrack && folded()) window.KRTrack('오른쪽 창 접기');
    place();
    setTimeout(function () { try { if (window.map && map.resize) map.resize(); } catch (e) { /* 무시 */ } }, 60);
  }

  function init() {
    var wrap = document.getElementById('map-wrap');
    if (!wrap || btn) return;
    btn = document.createElement('button');
    btn.id = 'rpanel-toggle';
    btn.type = 'button';
    btn.className = 'icon-btn floating';
    btn.hidden = true;
    btn.addEventListener('click', toggle);
    wrap.appendChild(btn);
    // 창이 열리고 닫히는 것(hidden 속성)·크기 바뀜을 따라 손잡이를 옮긴다
    // 성능 (R8, 11-15): 지도(#map) 안 변화(표지·칩·maplibre 클래스)는 손잡이와 상관없다 — 첫 화면에 180번 돌던 것
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) { var t = list[i].target; if (t !== btn && !(t.closest && t.closest('#map'))) { schedule(); return; } }
    }).observe(wrap, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', schedule);
    if (mq.addEventListener) mq.addEventListener('change', schedule);
    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(schedule);
      var watch = function () { document.querySelectorAll('.rkp, #route-panel, #draw-panel').forEach(function (el) { if (!el.dataset.pfObs) { el.dataset.pfObs = '1'; ro.observe(el); } }); };
      new MutationObserver(watch).observe(wrap, { childList: true });
      watch();
    }
    // 통근권 창(#cm-panel)은 #map-wrap 밖(body)에 붙는다 — 따로 지켜본다 (P2, 11-15)
    var watchCm = function () {
      var c = document.getElementById('cm-panel');
      if (!c || c.dataset.pfCm) return;
      c.dataset.pfCm = '1';
      new MutationObserver(schedule).observe(c, { attributes: true, attributeFilter: ['hidden'] });
      if (ro) ro.observe(c);
      schedule();
    };
    new MutationObserver(watchCm).observe(document.body, { childList: true });
    watchCm();
    schedule();
    initMapOnly();
    restoreLeft();
  }

  /* ---------- '지도만 보기' (회장님 11-15 아이디어 ①) — 왼쪽·오른쪽 창을 한 번에 접고, 다시 누르면 한 번에 편다 ---------- */
  var LEFT_KEY = 'kr-rail-map-left-folded';
  var mapBtn = null;
  function leftHidden() { return document.body.classList.contains('sidebar-hidden'); }
  function anyRight() { return !!document.querySelector('.rkp:not([hidden]), #route-panel:not([hidden]), #draw-panel:not([hidden]), #cm-panel:not([hidden])'); }
  function mapOnly() { return leftHidden() && (!anyRight() || folded()); }
  function clickLeft() { var st = document.getElementById('sidebar-toggle'); if (st && st.dataset.bound) st.click(); }
  function toggleMapOnly() {
    if (!mq.matches) return;
    if (mapOnly()) {
      if (leftHidden()) clickLeft();
      if (folded()) toggle();
    } else {
      if (!leftHidden()) clickLeft();
      if (anyRight() && !folded()) toggle();
      if (window.KRTrack) window.KRTrack('지도만 보기');
    }
    syncMapBtn();
  }
  function syncMapBtn() {
    if (!mapBtn) return;
    var on = mapOnly();
    var p = on ? 'true' : 'false';
    if (mapBtn.getAttribute('aria-pressed') === p) return;   // 바뀐 게 없으면 손대지 않음(관찰자 고리 막기)
    mapBtn.setAttribute('aria-pressed', p);
    mapBtn.classList.toggle('active', on);
    mapBtn.title = on ? '창 다시 펴기' : '지도만 보기 (왼쪽·오른쪽 창 한 번에 접기)';
    mapBtn.lastChild.textContent = on ? ' 창 펴기' : ' 지도만';
  }
  /* ---------- 접은 상태 기억 (아이디어 ②) — 왼쪽 패널만. 오른쪽 창은 누를 때 여는 것이라 열면 늘 펼친 채 ---------- */
  var leftSaved = null;
  function rememberLeft() {
    if (!mq.matches) return;
    var v = leftHidden() ? '1' : '0';
    if (v === leftSaved) return;
    leftSaved = v;
    try { localStorage.setItem(LEFT_KEY, v); } catch (e) { /* 저장 안 되는 창(사생활 보호 등)은 무시 */ }
  }
  function restoreLeft() {
    var v = null;
    try { v = localStorage.getItem(LEFT_KEY); } catch (e) { /* 무시 */ }
    leftSaved = leftHidden() ? '1' : '0';
    if (v !== '1' || !mq.matches || leftHidden()) return;
    var n = 0;
    (function wait() {   // 사이드바 손잡이가 준비(ui.js initDrawer)된 뒤에 눌러야 지도 여백도 같이 맞춰진다
      var st = document.getElementById('sidebar-toggle');
      if (st && st.dataset.bound) { if (!leftHidden()) st.click(); leftSaved = '1'; return; }
      if (++n < 100) setTimeout(wait, 100);
    })();
  }
  function initMapOnly() {
    var mode = document.getElementById('mode-btn');
    if (!mode || mapBtn) return;
    mapBtn = document.createElement('button');
    mapBtn.id = 'maponly-btn';
    mapBtn.type = 'button';
    mapBtn.className = 'tb-maponly';
    mapBtn.setAttribute('aria-pressed', 'false');
    var ic = document.createElement('i'); ic.setAttribute('data-ic', 'map');
    mapBtn.appendChild(ic); mapBtn.appendChild(document.createTextNode(' 지도만'));
    mapBtn.addEventListener('click', toggleMapOnly);
    mode.parentNode.insertBefore(mapBtn, mode.nextSibling);
    if (window.Icons && Icons.hydrate) Icons.hydrate(mapBtn);
    new MutationObserver(function () { syncMapBtn(); rememberLeft(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    syncMapBtn();
  }

  window.PanelFold = { toggle: toggle, isFolded: folded, refresh: schedule, toggleMapOnly: toggleMapOnly, isMapOnly: mapOnly };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
