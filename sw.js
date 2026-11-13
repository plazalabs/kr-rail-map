/* 한국철도맵 서비스 워커 (PWA 오프라인 지원)
 * 전략:
 *  - 앱 셸 (HTML/CSS/JS/아이콘/manifest): Cache First
 *  - GeoJSON 데이터: Cache First (최초 로드 후 캐시)
 *  - 지도 타일: Network First (오프라인이면 캐시된 타일만, 최대 200개)
 */
const APP_CACHE = 'kr-rail-map-app-v167';
const DATA_CACHE = 'kr-rail-map-data-v167';
const TILE_CACHE = 'kr-rail-map-tiles-v1';
const MAX_TILE_ENTRIES = 200;

const APP_SHELL = [
  './',
  './index.html',
  './data.html',
  './rank.html',
  './board.html',
  './js/board.js',
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
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          // 내비게이션 응답은 **그 요청 주소로** 저장한다 (IMPL12 건 3).
          // 예전엔 고정 키 './index.html' 에 넣어서, 노선 상세(line/*.html)를 본 뒤 index.html 로 오면
          // 메인 대신 상세 페이지가 떴다 (온라인에서도 — 앱 셸은 Cache First 다).
          if (res.ok && request.mode === 'navigate') {
            const copy = res.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        }).catch(() => {
          // 오프라인 내비게이션 폴백
          if (request.mode === 'navigate') return caches.match('./index.html');   // 설치 때 받은 메인 (덮어쓰지 않음)
          throw new Error('offline');
        });
      })
    );
  }
});
