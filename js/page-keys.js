/* 보조 페이지(게시판·자료·떡상 랭킹) 공통 키보드 (K1, 회장님 지시 2026-11-13)
 *  - Esc: 입력칸에 있으면 먼저 입력칸에서 빠져나온다(글자는 그대로). 그다음 Esc 는 지도(./)로.
 *         쓰다 만 글(textarea·text 입력에 글자)이 있으면 한 번 묻는다 — 실수로 날리지 않게.
 *         열린 <details>·메뉴처럼 페이지 안에서 먼저 닫을 것이 있으면 그것부터(그 처리기가 preventDefault 하면 건너뜀).
 *  - Ctrl/⌘+Enter: 여러 줄 입력칸(textarea)에서 그 폼 보내기 (한 줄 입력칸 Enter 는 브라우저 기본 = 보내기).
 *  - '/' 또는 Ctrl/⌘+K: 지도 페이지 검색으로 (./?find=1 → 지도 페이지가 검색창에 포커스).
 */
(function () {
  'use strict';
  var isText = function (el) {
    return !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
      (el.tagName === 'INPUT' && /^(text|search|email|url|tel|number|password|)$/i.test(el.type || '')));
  };
  function hasDraft() {
    var els = document.querySelectorAll('form textarea, form input[type=text]');
    for (var i = 0; i < els.length; i++) {
      // 닉네임처럼 이 브라우저가 기억해 둔 값은 '쓰다 만 글'이 아니다
      if (els[i].hasAttribute('data-remembered')) continue;
      if (els[i].tagName === 'TEXTAREA' ? els[i].value.trim() : (els[i].value.trim() && els[i].id !== 'nick')) return true;
    }
    return false;
  }
  function toMap(extra) {
    location.href = './' + (extra || '');
  }
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;   // 한글 조합 중 Esc·Enter 는 IME 몫
    var a = document.activeElement;
    if (e.key === 'Escape') {
      var open = document.querySelector('details[open].pk-esc');
      if (open) { open.open = false; e.preventDefault(); return; }
      if (isText(a) || (a && a.tagName === 'SELECT')) { a.blur(); e.preventDefault(); return; }
      if (hasDraft() && !window.confirm('쓰던 글이 있습니다. 지도로 나갈까요? (쓴 내용은 사라집니다)')) return;
      e.preventDefault();
      toMap();
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && a && a.tagName === 'TEXTAREA' && a.form) {
      e.preventDefault();
      if (a.form.requestSubmit) a.form.requestSubmit(); else a.form.submit();
      return;
    }
    if (((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !isText(a) && !e.ctrlKey && !e.metaKey && !e.altKey)) {
      e.preventDefault();
      toMap('?find=1');
    }
  });
})();
