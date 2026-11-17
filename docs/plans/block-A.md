# 블록 A 계획 (2026-11-17)

- 범위: 숙제장 1단계의 남은 숙제 — 2-1, 63, 3, 4, 5(+40), 6, 7, 9, 41, 8(맨 뒤)
- 시작 기준선: 데이터 시험 실패 10개 (D-02 D-04 D-10 D-13 D-14 D-15 D-20 D-21 D-33 D-40)
- 데이터 생성 스크립트는 `scripts/` 가 아니라 `data/*.py`, `data/*.js` 에 있다. 결과 파일(`data/*.json`, `*.geojson`)은 손으로 고치지 않고 스크립트를 고친 뒤 다시 만든다.
- 숙제마다: 실패하는 시험 먼저(`tests/data/regression/` 또는 기존 `tests/*.test.js`) → 고침 → `node --test "tests/data/*.test.mjs" "tests/data/regression/*.test.mjs"` + 관련 `node tests/<x>.test.js` → 커밋 하나 → `docs/RUN-LOG.md` 에 한 줄
- 잠긴 시험(`tests/data/invariants.test.mjs`, `tests/e2e/invariants.spec.mjs`)은 고치지 않는다. 바꿔야 하면 `scratch/locked-test-proposals/` 에 새 파일을 두고 RUN-LOG 에 적는다.
- 화면 시험(playwright)은 램 8GB 때문에 숙제 하나에 관련 e2e 한 개씩만 돌린다.

## 순서와 숙제별 계획

| 순서 | 숙제 | 건드릴 파일 | 바뀌는 숫자 | 돌릴 시험 |
|---|---|---|---|---|
| 1 | 2-1 합계 0세대 → '자료에서 확인되지 않음' | `js/dev.js`(whereHtml), `tests/dev.test.js` | 화면 문구만(합계 0인 역 수를 RUN-LOG 에 적음) | `node tests/dev.test.js`, 데이터 시험 |
| 2 | 63 실거래 7종 동 = 그 역 동네 목록 안 | `data/build_station_market.py`(+ 필요하면 `dong_match.py`), `data/station-market.json` 재생성, `js/market.js`(다른 동이면 칸에 동 이름), 새 회귀 시험 `tests/data/regression/market-dong.test.mjs` | 12역의 7종 칸 동·건수. 인천·동인천은 동구 값이 빠질 수 있음(전→후 표) | 회귀 시험, `node tests/market.test.js`, 데이터 시험 |
| 3 | 3 거래 1~4건 시세 숨김 (D-33) | `data/build_station_price.py` → `station-price.json` 재생성(5건 미만 medianPerPyeong=null, deals 는 남김), `js/price.js`·`market-map.js` 등 '거래 적음(N건)' 표시 확인 | 시세 있는 역 수 465→약 447 (18역) | D-33, `tests/market*.test.js`, `tests/price-trend.test.js` |
| 4 | 4 개통 연도 한 곳 (D-20, D-21) | `lines.geojson` 을 만드는 스크립트(plan_status.js 등)에 `open_year` 추가 → 재생성, `data/build_rank.js` 가 `open_year` 를 읽게, `js/timeline.js` 등이 `open_year` 를 읽게 | 타임라인 '미정' 노선 수, rank.year_lines(gtx-a-samseong-stop 정리) | D-20, D-21, D-22, `tests/rank.test.js`, `tests/plan-status.test.js` |
| 5 | 5 인접역 순서 (D-13, D-14) + 40 방향 | stops 를 만드는 스크립트(fix_ktx_stop_lists.py 등) → stops 구간별 `[[…],[…]]`, '서울역'→'서울' 이름 정리, 인접역을 그리는 `js/station-detail.js`(구간 배열 읽기, 방향 통일) | 서울역 GTX-A 인접역(수서 → 없음/연신내), KTX 인접역 방향 | D-13, D-14, 새 회귀 시험(서울역 GTX-A 이웃에 수서 없음), 관련 e2e 1개 |
| 6 | 6 역 개수 하나 (D-02, D-04) | `data/build_access.js`(빠진 12역을 excluded 에 이유와 함께), stations.geojson 생성 스크립트에 `count_definition`, '1,208'·'1,237' 을 쓰는 `js/stats.js`·`station-detail.js` 가 같은 값을 읽게 | 1,249 / 1,208 / 1,237 → 하나(id 기준 1,249) | D-02, D-04, `tests/readme-numbers.test.js` |
| 7 | 7 순위 기준 '2031년까지 개통' 하나 (회장 결정) | `data/build_rank.js`·`rank.json`, `js/rank.js`·`rank-page.js`·`home-cards.js`·`market-map.js`(타일 기본 2031, 전체 개통은 켜는 옵션), 숫자 옆 시나리오 라벨 | 의정부 117/125/127 → 하나, 수도권 675/696 → 675 | `tests/rank.test.js`, D-22, e2e `-g "E-02"`·`"E-03"` |
| 8 | 9 GTX-A 북쪽 개통 후 느려짐 (D-40) | `data/build_access.js` 에 `slower_reasons`, 화면(`js/access.js`·`rocket-*.js`)이 +N분으로 표시 | 48건 이유 기록, 화면 '+1분/+2분' | D-40, `tests/rocket-panel.test.js` |
| 9 | 41 시세 빈 역 정리 | `js/price.js`/`market.js`: 빈 이유(법정동에 아파트 거래 없음 / 거래 적음 / 자료 없음)를 화면에 적기. 데이터 채우기는 새 거래 자료가 필요하면 멈춤 조건 → 이유 표시만 | 이유별 역 수 | `node tests/market.test.js` 등 |
| 10 | 8 서해선 이름 2개 (D-10) — 맨 뒤 | lines.geojson 생성 스크립트에서 '서해선(도시철도)'·'서해선(일반철도)', 노선 페이지·sitemap·README 수 | 노선 이름만 | D-10, `tests/readme-numbers.test.js`, `tests/build-public.test.js` |

- 광주 도시철도 2호선(D-15)은 '나중에'에 그대로 둔다. 이번 블록에서 건드리지 않는다.
- 회장 결정 18·19·24·34 는 CLAUDE.md·TODO.md 에 적기만 하고 이번 블록에서 구현하지 않는다(블록 A 범위 밖).

## 멈추는 조건
- 새 거래 자료를 인터넷에서 받아야 할 때 (41번이 그럴 수 있음)
- 회장님 파일을 지워야 할 때
- 시험 자체가 안 돌아갈 때
