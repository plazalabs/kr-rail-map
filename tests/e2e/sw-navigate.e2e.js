/* e2e: 서비스워커 내비게이션 캐시가 index.html 을 덮어쓰지 않는가 (IMPL12 건 3)
 *  재현 시나리오 (수정 전 sw.js 131~133: navigate 응답을 고정 키 './index.html' 에 저장)
 *   1) 메인을 열어 서비스워커가 페이지를 제어하게 한다
 *   2) 노선 상세 페이지(line/arex.html)로 이동한다 — 캐시에 없는 내비게이션
 *   3) 캐시의 './index.html' 이 메인인지 본다 / index.html 로 다시 가면 메인이 뜨는지 본다
 *   4) 오프라인에서 캐시에 없는 노선 페이지로 가면 폴백이 메인인지 본다
 * 실행: node tests/e2e/run.js --only sw-navigate
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('sw-navigate');
const ROOTURL = BASE.replace(/index\.html.*$/, '');

(async () => {
  const b = await launch({ port: 9691, w: 1280, h: 900 });
  // 이전 실행의 서비스워커·캐시를 지운다 (깨끗한 상태에서 재현)
  await b.send('Storage.clearDataForOrigin', { origin: new URL(ROOTURL).origin, storageTypes: 'service_workers,cache_storage' }).catch(() => {});
  await b.goto(BASE, 4000);
  for (let i = 0; i < 40; i++) {
    if (await b.evaluate(`navigator.serviceWorker && navigator.serviceWorker.controller ? true : false`).catch(() => false)) break;
    await sleep(300);
    if (i === 10) await b.goto(BASE, 3000);   // 첫 방문은 제어 전이라 한 번 새로 연다
  }
  const ctl = await b.evaluate(`!!(navigator.serviceWorker && navigator.serviceWorker.controller)`);
  R.check('서비스워커가 페이지를 제어함', ctl);
  const cacheName = await b.evaluate(`caches.keys().then(k => k.find(x => x.startsWith('kr-rail-map-app-')))`);

  await b.goto(ROOTURL + 'line/arex.html', 3000);
  const t1 = await b.evaluate(`document.title`);
  R.check('노선 상세 페이지가 열림', /인천국제공항철도/.test(t1), t1);
  await sleep(800);   // cache.put 은 응답 뒤 비동기
  const cachedIdx = await b.evaluate(`caches.open('${cacheName}').then(c => c.match('${ROOTURL}index.html')).then(r => r ? r.text() : '').then(t => (t.match(/<title>([^<]*)/) || [])[1] || '')`);
  R.check("캐시의 './index.html' 이 여전히 메인 페이지", /전국 철도 노선도/.test(cachedIdx), cachedIdx);

  await b.goto(ROOTURL + 'index.html', 3000);
  const t2 = await b.evaluate(`document.title`);
  R.check('index.html 로 돌아오면 메인이 뜸 (상세 페이지가 아님)', /전국 철도 노선도/.test(t2), t2);

  // 오프라인 폴백은 CDP 오프라인 흉내가 서비스워커 쪽 fetch 에 걸리지 않아(재현 실험에서 확인) 판정하지 않는다.
  R.check('오프라인 폴백 = 메인 (CDP 오프라인 흉내가 서비스워커 fetch 에 적용되지 않아 미검증)', null);

  R.finish();
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
