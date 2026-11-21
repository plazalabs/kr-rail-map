/* 한국철도맵 서비스 워커 (PWA 오프라인 지원)
 * 전략:
 *  - 앱 셸 (HTML/CSS/JS/아이콘/manifest): Cache First
 *  - GeoJSON 데이터: Cache First (최초 로드 후 캐시)
 *  - 지도 타일: Network First (오프라인이면 캐시된 타일만, 최대 200개)
 */
const APP_CACHE = 'kr-rail-map-app-v303';
// 실거래 자료 달 — 매달 자동 갱신(.github/workflows/data-refresh.yml)이 바꾼다. 데이터는 캐시 우선이라
// 이름이 바뀌어야 다시 찾은 사람도 새 시세를 받는다.
const DATA_REV = '202609';
const DATA_CACHE = 'kr-rail-map-data-v303-r' + DATA_REV;
const TILE_CACHE = 'kr-rail-map-tiles-v1';
const MAX_TILE_ENTRIES = 200;

const APP_SHELL = [
  './',
  './index.html',
  './data.html',
  './rank.html',
  './board.html',
  './js/line-status.js',
  './js/board.js',
  './js/board-panel.js',
  './js/board-page.js',
  './js/rank-page.js',
  './js/sw-register.js',
  './js/board-config.js',
  './js/rank.js',
  './site.webmanifest',
  './css/style.css',
  './vendor/maplibre-gl.css',
  './vendor/maplibre-gl.js',
  './js/icons.js',
  './js/mode.js',
  './js/ui.js',
  './js/track.js',
  './js/ink.js',
  './js/search.js',
  './js/exits.js',
  './js/price.js',
  './js/market.js',
  './js/jeonse.js',
  './js/price-trend.js',
  './js/app.js',
  './js/route.js',
  './js/draw.js',
  './js/diagram.js',
  './js/diagram-export.js',
  './js/access.js',
  './js/dev.js',
  './js/station-detail.js',
  './js/compare.js',
  './js/stats.js',
  './js/timeline.js',
  './js/route-compare.js',
  './js/invest.js',
  './js/coverage.js',
  './js/station-area.js',
  './js/commute.js',
  './js/rocket-map.js',
  './js/station-share.js',
  './js/rocket-panel.js',
  './js/market-map.js',
  './js/quiz.js',
  './js/home-cards.js',
  './js/active-layers.js',
  './js/wait-setting.js',
  './js/page-keys.js',
  './js/station-talk.js',
  './vendor/pretendard/pretendard.css',
  './js/guide.js',
  './js/tabbar.js',
  './js/panel-fold.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [APP_CACHE, DATA_CACHE, TILE_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isTileRequest(url) {
  // OpenFreeMap / Esri 타일 패턴
  // (basemaps.cartocdn.com 은 다크 베이스맵에서 뺐다 — 키 없이는 워터마크만 준다)
  return /tiles\.openfreemap\.org|server\.arcgisonline\.com|tile\.openstreetmap\.org/.test(url.hostname);
}

function isDataRequest(url) {
  // 데이터는 geojson 뿐 아니라 data/ 아래 json 도 있다 (station-price.json).
  // 예전엔 .geojson 만 잡아서 시세 json 이 앱 셸 캐시로 들어갔다.
  if (url.pathname.endsWith('.geojson')) return true;
  return url.pathname.includes('/data/') && url.pathname.endsWith('.json');
}

// 타일 캐시 개수 제한 (오래된 것부터 삭제)
async function trimTileCache() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_TILE_ENTRIES) {
    await cache.delete(keys[0]);
    return trimTileCache();
  }
}

// 인터넷이 끊겼고 받아 둔 적 없는 페이지 — 짧은 한국어 안내(파일 없이 바로 만든다)
function offlinePage() {
  const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>인터넷 연결 없음 | 한국철도맵</title><style>body{margin:0;font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#fff;color:#16191d;line-height:1.6}' +
    '@media(prefers-color-scheme:dark){body{background:#14171a;color:#e8eaed}a{color:#8ab0ff!important;border-color:#8ab0ff!important}}main{max-width:520px;margin:0 auto;padding:56px 20px}' +
    'h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;opacity:.85}a{display:inline-block;padding:11px 16px;border:1px solid #1b64da;border-radius:10px;color:#1b64da;text-decoration:none;font-weight:600}</style></head>' +
    '<body><main><h1>인터넷 연결이 끊겼어요</h1><p>이 페이지는 아직 받아 두지 않았어요. 지도는 한 번 열어 본 적이 있으면 연결 없이도 볼 수 있어요.</p>' +
    '<a href="' + self.registration.scope + 'index.html">지도로 가기</a></main></body></html>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 1. 지도 타일: Network First
  if (isTileRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(TILE_CACHE).then((cache) => {
              cache.put(request, copy).then(() => trimTileCache());
            });
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 2. GeoJSON 데이터: Cache First
  if (isDataRequest(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // 3. 앱 셸 (같은 origin의 문서/스크립트/스타일/이미지): Cache First
  if (url.origin === self.location.origin) {
    // 문서(내비게이션)는 질문(?…)을 뗀 주소 하나로 — 정적 사이트라 질문은 화면 스크립트가 읽을 뿐 문서는 같다.
    // 질문마다 따로 넣으면 공유 링크(?from=…, ?x=…)를 열 때마다 같은 문서가 캐시에 쌓였다.
    const nav = request.mode === 'navigate';
    const docKey = url.origin + url.pathname;
    event.respondWith(
      (nav ? caches.match(docKey) : caches.match(request)).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          // 내비게이션 응답은 **그 요청 주소로** 저장한다 (IMPL12 건 3).
          // 예전엔 고정 키 './index.html' 에 넣어서, 노선 상세(line/*.html)를 본 뒤 index.html 로 오면
          // 메인 대신 상세 페이지가 떴다 (온라인에서도 — 앱 셸은 Cache First 다).
          // 11-15: 글꼴 조각(woff2)·늦게 부르는 스크립트·그림도 한 번 받으면 넣어 둔다 — 전엔 문서만 넣어서
          // 오프라인 재방문 때 글꼴이 시스템 글꼴로 바뀌었다. 판(버전)이 바뀌면 APP_CACHE 째로 지워지니 옛 파일이 남지 않는다.
          if (res.ok && (request.mode === 'navigate' || /\.(woff2|js|css|png|svg|webp)$/.test(url.pathname))) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(nav ? docKey : request, copy));
          }
          return res;
        }).catch(async () => {
          // 오프라인 내비게이션 폴백
          if (request.mode !== 'navigate') throw new Error('offline');
          // 같은 페이지를 다른 질문(?…)으로 연 적이 있으면 그것 (index.html?from=… → index.html)
          const same = await caches.match(request, { ignoreSearch: true });
          if (same) return same;
          // 11-15: 안 열어 본 노선 페이지(line/…)에 메인을 주면 상대 주소 css·js 가 다 깨져 '불러오는 중…'에서 멈췄다 → 안내 화면
          if (/\/line\//.test(url.pathname)) return offlinePage();
          return caches.match('./index.html');   // 설치 때 받은 메인 (덮어쓰지 않음)
        });
      })
    );
  }
});
