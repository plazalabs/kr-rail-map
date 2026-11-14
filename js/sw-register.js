/* index.html 에 인라인으로 있던 스크립트 — CSP(script-src 'self') 때문에 파일로 뺐다 (6차 K15 ①B3, 2026-11-14) */
if ('serviceWorker' in navigator) {
  // 이미 옛 워커가 이 화면을 맡고 있었으면, 새 워커가 넘겨받을 때 '새 버전' 알림 (올린 직후 첫 방문이 옛 화면인 문제, 2026-11-14)
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.getElementById('update-toast')) return;
    const t = document.createElement('div');
    t.id = 'update-toast'; t.setAttribute('role', 'status');
    t.innerHTML = '<span>새 버전이 있어요</span><button type="button">새로고침</button>';
    t.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(t);
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('ServiceWorker 등록 실패:', err);
    });
  });
}
