# 블록 B 계획 (2026-11-18)

- 범위: 숙제장 2단계 — 10, 11(+42), 12, 13, 14, 15, 60(배차 한 줄)
- 시작 기준선: 데이터 시험 실패 2개 (D-13 잠긴 시험, D-15 광주 2호선 — 나중에). 화면 시험(playwright)은 10번에서 처음 잼
- 화면 시험 규칙 (회장님 11-18): `tests/e2e/invariants.spec.mjs` 는 **선택자(버튼 이름·id)가 틀린 것만** 고친다. 기대하는 숫자·비교는 절대 바꾸지 않는다. 고칠 때만 `.claude/settings.json` 의 그 파일 deny 한 줄을 풀고, 블록 B 끝에 다시 잠근다.
- 램 8GB: playwright 는 `--workers=1`, 한 번에 시험 몇 개씩.
- 숙제마다: 실패하는 시험 먼저 → 고침 → 데이터 시험 + 관련 단위 시험 + 관련 e2e → 커밋 하나 → RUN-LOG 한 줄.

| 순서 | 숙제 | 건드릴 파일 | 바뀌는 숫자 | 돌릴 시험 |
|---|---|---|---|---|
| 1 | 10 화면 시험 처음 돌리기, 시험 쪽 오류(선택자)부터 | `tests/e2e/invariants.spec.mjs`(선택자만), `.claude/settings.json`(잠깐 풀기) | 없음. E-xx 통과/실패 표를 RUN-LOG 에 | `npx playwright test tests/e2e/invariants.spec.mjs --workers=1` |
| 2 | 11 '최적'이 다른 탭에 모두 밀림 (광운대→강남) + 42 안내에 요금 차이 | `js/route-compare.js`(최적 고르기: 시간·환승·요금 모두 밀리면 그 길을 최적으로), 안내 문구 | 광운대→강남 최적 56분·2회 → 55분·1회 등 | E-11, E-10, `tests/route-*.test.js`, 새 회귀 시험 |
| 3 | 12 청량리 수인분당 80·88분 | 먼저 공식 시간표(data/headways*.json, 레일포털 값)와 대조. `js/route.js` 대기 계산 | 광운대→선릉 최소환승 80분 → 대조 결과에 따라 | E-12, `tests/route-peak.test.js` |
| 4 | 13 성수 지선 환승 안 셈 | 재현부터 — 어느 탭·화면에서 빠지는지. `js/route.js`/`route-compare.js` | 신설동→강남 환승 수 | E-13, `tests/junction-turns.test.js` |
| 5 | 14 역 상세 시간 ≠ 길찾기 시간 (30 vs 31, 40 vs 45) | `data/build_access.js` 와 길찾기가 같은 함수·같은 기준인지. 다르면 문구 지우기(CLAUDE.md 3장) | 서울역·광운대 상세 분 | E-06, `tests/route-consistency.test.js` |
| 6 | 15 상태줄 47 vs 길찾기 50 | `js/app.js` 상태줄 요약이 길찾기 결과(처음 기다림 포함)를 그대로 쓰게 | 상태줄 분 | E-07 |
| 8 | 64 역 상세 순위를 홈과 같은 기준 (11-18 추가) | `data/build_rank.js`(역별 순위 파일 rank-station.json — js/rank.js 로), `js/access.js`(순위를 다시 세지 않고 읽기만), `js/app.js` | 의정부 상세 '전국 127위' → '2031년까지 개통 · 수도권 675역 중 117위' | 새 회귀 시험(데이터·e2e), E-01, tests/access·rank |
| 7 | 60 역 상세 배차 한 줄 "출근 ○분 / 평시 ○분" | `js/station-detail.js`, `data/headways.json`·`headways-off.json` 읽기만 | 화면에 새 줄 | 새 단위 시험, 관련 e2e |

## 멈추는 조건
- 인터넷에서 새 거래 자료를 받아야 할 때
- 회장님 파일을 지워야 할 때
- 시험 자체가 안 돌아갈 때
- 12번: 공식 시간표를 새로 받아야 하면 (자료가 저장소에 없으면) RUN-LOG 회장님 질문에 적고 다음으로
