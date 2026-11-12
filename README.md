# 한국철도맵 (KoreaRailMap)

수도권 전철을 중심으로 한 **철도 노선도 웹앱**. 서버 없이 도는 정적 단일 페이지 앱입니다.

- 지도 위에 86개 노선 / 1,242개 역
- 역 검색 · 최단 경로·환승·요금 계산
- **도심 접근성** — 역에서 도심·여의도·강남·서울역·판교까지, 지금과 개통 후
- **통근권 찾기** — `분석 > 통근권 찾기`. 직장(목적지) 역까지 30·45·60·90분 안에 닿는 역을 지도에 색으로, 목록은 가까운 순·(투자 모드) 시세 낮은 순. 길찾기와 같은 시간 계산
- **45도 개략 노선도** (지리 좌표를 옥타리니어로 재배치, 수도권·부산 등은 돋보기로 넓혀 역 겹침 0)
- **키보드만으로 쓰기** — 지도에서 N/P 로 역 고르기·Enter 로 열기, 패널을 닫으면 포커스가 연 버튼으로
- **빠른 시작** — 사이드바 맨 위 4칸(길찾기·통근권·투자 모드·노선도), 첫 방문에는 안내 카드
- **전세가율** (투자 모드) — 같은 단지·같은 전용면적의 매매·신규 전세를 짝지어 역·단지마다 중위값, 80% 이상 짝 수, 지도 색칠 레이어 (`data/build_station_jeonse.py`, 방법: `data.html#jeonse`)
- **🚀 GTX 떡상 랭킹** (`rank.html`) — CBD·YBD·GBD 까지 시간으로 지금 vs 개통 후 순위, 떡상 TOP 10 그림, 등급(떡상·상승·보합·상대 하락·신규), 평균/CBD/YBD/GBD 중시, 개통 연도 슬라이더(2027~2035), 역 카드·공유 이미지(1080×1080). 지도에는 `지도 레이어 > 🚀 떡상 지도` (`data/build_rank.js`, `js/rank.js`, `js/rocket-map.js`, 방법: `data.html#rocket`)
- **GTX 평면환승** — 청량리(B↔C)·삼성(A↔C) 같은 승강장, 방향이 맞는 조합만 10초 (나머지 8분), ITX-청춘 급행 (`js/route.js`)
- **GTX 역간 시간 자체 산출** — 공식 발표 구간 7개 + 선형 거리 (`data/build_gtx_times.js`, 방법: `data.html#gtx-time`)
- **역세권 범위 (근사)** — 사이드바 `지도 레이어 > 역세권 범위`. 1차 250m·2차 350m(서울시 『안심주택의 역세권 범위』 거리 기준), 줌 14 이상.
  공식 기준점은 승강장 경계지만 그 자료(행안부 지하철역사)가 신청형이라 아직 없어, **출구가 있는 역(938)은 출구별 원의 합집합, 없는 역(308)은 역 좌표 기준 원**으로 근사한다. 범례·역 패널에 근사임을 표시한다.
- 노선별 정적 랜딩 페이지 72개 + sitemap(74 URL)
- 모바일 대응(오프캔버스 드로어 / 하단 툴바 / 바텀시트)
- PWA(오프라인) · 7가지 지도 테마

## 실행

```bash
python3 -m http.server 8123
# 브라우저에서 http://localhost:8123/
```

`?line=<노선 id>` 로 특정 노선만 볼 수 있습니다. 예: `/?line=seoul-subway-line-2`

## 테스트

둘 다 외부 패키지 없이 Node 22 로 돕니다.

```bash
# 단위 테스트 — 모듈 계산·데이터 검사 (CI test.yml 이 푸시마다 실행)
for f in tests/*.test.js; do node "$f" || exit 1; done

# 화면 점검(e2e) — 헤드리스 Chrome 으로 실제로 눌러 본다. 네트워크 필요
node tests/e2e/run.js            # 전 항목
node tests/e2e/run.js --list     # 항목 목록
```

화면 점검의 항목·환경 변수·판정 규칙은 [`tests/e2e/README.md`](tests/e2e/README.md). CI 에서는 `e2e.yml` 이 main 푸시마다(문서만 바뀐 푸시 제외)·야간·수동으로 돈다. 지금은 실패해도 배포를 막지 않고 알림만 한다 — 야간 실행이 5번 연속 성공하면 배포를 막는 단계로 바꾼다(2026-11-09 결정 5).

## 구조

| 경로 | 설명 |
|---|---|
| `index.html` / `css/style.css` | 앱 셸, 디자인 토큰, 반응형 레이아웃 |
| `js/ui.js` | 토스트·모달 관리·드로어·드롭다운·키보드 |
| `js/app.js` | 지도 3종, 표시 범위(수도권/전국), 검색, 노선 토글, 공유, 즐겨찾기 |
| `js/route.js` | 길찾기 (역-노선 그래프 + 다익스트라, 노선별 표정속도) |
| `js/access.js` | 도심 접근성 — `data/access.json` 읽기·순위·표 렌더 |
| `js/dev.js` | 앞으로 들어올 세대 — `data/station-dev.json` 읽기·연도별·사업 목록 |
| `js/diagram.js` | **개략 노선도 엔진** — 환승역 병합, 45도 완화 배치, 라벨 충돌 회피 |
| `js/draw.js` | 나만의 노선 그리기 + 거리/면적 측정 |
| `js/station-detail.js` `compare.js` `stats.js` `timeline.js` `route-compare.js` `invest.js` `coverage.js` | 역 상세·비교·통계·타임라인·경로비교·투자분석·영향권 |
| `js/station-area.js` | 역세권 범위(근사). 기준점 원천(`setAnchorSource`) → 거리장 → 등치선(250·350m) 구조라 승강장 경계 자료가 오면 원천만 교체 |
| `vendor/` | MapLibre GL JS 4.7.1 (로컬 벤더링, BSD) |
| `tests/*.test.js` | 단위 테스트 (의존성 없는 단일 스크립트) |
| `tests/e2e/` | 화면 점검 — 헤드리스 Chrome + CDP, 실행기 `run.js` |
| `data/lines.geojson` `data/stations.geojson` | 앱이 읽는 최종 데이터 (86노선·1,242역) |
| `data/build_access.js` | `data/access.json` 생성 (route.js 재사용, 1,234역 × 2회 다익스트라) |
| `data/fix_interchange_lines.py` | 고립된 역·노선을 300m 근거로 이어 붙인다 → `stations.geojson` |
| `data/fetch_dev.py` `data/build_station_dev.py` | 주택인허가 → `data/station-dev.json` (법정동 단위, 1,191곳) |
| `data/bjd_codes.py` | 법정동코드 전체자료 → `data/_gov/bjd_codes.json` (역 주소의 동 이름을 코드로) |
| `data/build_data.py` | 파이프라인: Geofabrik PBF → 원시 GeoJSON |
| `data/clean_data.py` | 후처리: 노이즈 제거·변형 병합·역 병합 |
| `data/dedupe_geometry.py` | 같은 구간이 양방향으로 중복된 조각 제거 (연장 2배 오류 수정) |
| `data/fix_station_lines.py` | 역↔노선 연결 보정 (0역 노선 문제 수정) |
| `build_pages.py` | 노선별 정적 페이지 `line/*.html` + `sitemap.xml` + `robots.txt` 생성 |
| `data/PIPELINE.md` `CLEANING.md` `SCHEMA.md` | 데이터 문서 |

## 데이터 다시 만들기

```bash
cd data
python3 build_data.py        # PBF → GeoJSON (raw 필요)
python3 clean_data.py        # 노이즈 제거·병합
python3 dedupe_geometry.py   # 중복 선형 제거
python3 fix_station_lines.py # 역-노선 연결 보정
cd .. && python3 build_pages.py   # 정적 페이지 + sitemap
```

## 데이터 출처

- 노선 선형: © OpenStreetMap contributors, ODbL — 80개 노선. 역 순서는 `data/own_align_config.py` 에 직접 정리
- 계획 노선 6개(GTX-D~H, 동부선): 역을 이은 개략선, 자체 작성 (`data/build_own_alignments.py`)
- 베이스맵: © OpenStreetMap · OpenFreeMap / 위성: © Esri
- 원천 전체와 이용 조건: `data/sources.json` (사람이 읽는 표는 `data.html`)
- 무색 노선의 색상은 디자인 지정 (CLEANING.md)

## 저작권

© 2026 플라자랩스. All rights reserved. 저장소가 공개돼 있어도 이용 허락이 아니다 —
허락 없이 복제·재배포·크롤링·상업적 이용을 할 수 없다. 자세한 내용은 `LICENSE`.
OSM·공공데이터 원자료는 각 원천의 조건을 따른다.

## 배포

정적 파일이라 GitHub Pages / Cloudflare Pages / Vercel에 그대로 올리면 됩니다.
