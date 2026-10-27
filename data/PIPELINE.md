# 한국 철도 데이터 파이프라인 (PIPELINE.md)

> **출처 표기 (앱에 그대로 넣을 문구):**
> 노선/역 데이터 © OpenStreetMap contributors, ODbL 라이선스

## 1. 개요

- 목적: 한국 철도 노선도 웹앱이 읽는 `lines.geojson` / `stations.geojson` 생성
- 입력: Geofabrik 남한 OSM PBF → pyosmium 파싱 → GeoJSON 2종 출력
- 파이프라인 스크립트: `data/build_data.py` (재현: `cd data && python3 build_data.py`)
- 검증 스크립트: `data/verify.py` (스키마 검사 + 유명역 스팟체크)

## 2. 입력 데이터

| 항목 | 값 |
|---|---|
| 파일 | `data/raw/south-korea-261009.osm.pbf` |
| 다운로드 URL | `https://download.geofabrik.de/asia/south-korea-latest.osm.pbf` (307 → `south-korea-261009.osm.pbf`로 리다이렉트) |
| 추출 기준일 | 2026-10-09 (파일명 `261009` = 26년 10월 09일) |
| 다운로드일 | 2026-10-11 |
| 크기 | 288,878,500 bytes (약 276 MB) |
| md5 | `b480965b3fbc84411961aa76d5454366` |

다운로드 명령어:
```bash
cd ~/workspace/kr-rail-map/data/raw
curl -sSL -o south-korea-261009.osm.pbf https://download.geofabrik.de/asia/south-korea-latest.osm.pbf
```

## 3. 파서 설치

VM에 osmium/GDAL/shapely이 없어서 pyosmium을 사용 (manylinux wheel 제공, 컴파일 불필요):
```bash
pip install --break-system-packages osmium   # osmium 4.3.1 설치됨
```

시행착오 기록:
- 처음에 `osmium.index.create_map("dense_file_array", path)`로 전체 노드 위치 인덱스를 만들려 했으나,
  pyosmium 4.3.1의 `create_map`은 인자를 1개만 받고, dense_file_array는 최대 노드 ID 기준으로 파일이 커져서
  "No space left on device"로 실패 (OSM 노드 ID가 수십억 단위라 수십 GB 필요).
- 해결: 위치 인덱스를 쓰지 않고 3-pass 방식으로 변경.
  pass1: route relation 수집 → pass2: 멤버 way의 노드 ID만 수집 + 역 노드 수집 →
  pass3: 필요한 노드의 좌표만 dict에 적재 후 way geometry 생성.
  메모리 사용량 약 30 MB, 전체 실행 약 13분.

## 4. 추출 규칙 (build_data.py)

**노선 (lines)**
- `type=route` + `route ∈ {railway, subway, light_rail, monorail, tram, train}` relation 수집.
  - `route=train`은 스펙의 5개 값에 없지만, KTX/ITX-새마을/무궁화호 열차 운행계통 relation이
    이 값으로만 존재해서 포함 (chul.mom의 "기차 노선 보기"에 해당). 총 106개 중 포함.
- 제외: `railway=disused` / `disused=yes` / `abandoned=yes` 태그 (10개),
  이름에 `폐선` 포함 (1개: 구 동해선 태화강 이남 폐선),
  북한 노선 4개 (평부선, 금강산청년선, 금강산선, 구 경원선 — 위도 37.9~38.6, 휴전선 일대/이북).
- geometry: 멤버 way들의 좌표를 끝점 매칭으로 이어 붙이기 (greedy chaining).
  이어지지 않는 조각은 MultiLineString으로 유지 (62개 노선).
- `id`: `{network}-{ref}` 슬러그 우선, 없으면 `name:en` 슬러그, 없으면 `r{relation_id}`. 중복 시 `-2` 접미.
- `name_ko` = `name:ko` → `name`, `name_en` = `name:en` (없으면 null). 둘 다 없으면 스킵.
- `color` = relation의 `colour`/`color` 태그를 `#RRGGBB`로 정규화, 없으면 null.
- `category`:
  - `subway` → metro / `light_rail,monorail,tram` → urban
  - `route=train` + 이름에 고속/KTX/SRT → ktx, 그 외 train → conventional
  - `route=railway` + 이름에 고속 → ktx, 그 외 → conventional
- `status`: `state=proposed` → planned / `construction` 태그 또는 이름에 공사·예정·미개통 → construction / 그 외 open.

**역 (stations)**
- `railway=station` / `railway=halt` 인 노드 수집 (이름 없는 5개는 스킵).
- 노선 귀속: relation 멤버인 노드 → 해당 노선들 (65개 역).
  멤버십이 없으면 500m 이내 가장 가까운 노선 geometry에 폴백 귀속 (1,150개 역).
  500m 이내 노선이 없으면 미귀속 (121개 역).
- `id` = `st-{node_id}`, `line_id` = 첫 번째 노선 (없으면 null), `lines` = 노선 id 배열.

## 5. 산출물 카운트

| 산출물 | 수 |
|---|---|
| `lines.geojson` (4,946,130 bytes) | **336개** 노선 |
| `stations.geojson` (308,075 bytes) | **1,336개** 역 |

노선 category: metro 181 / urban 30 / ktx 21 / conventional 104
노선 status: open 334 / construction 2 (광주 도시철도 2호선 내선·외선순환)
역 귀속: relation 멤버십 65 / 근접 폴백 1,150 / 미귀속 121 / 이름 없음 스킵 5
수집 relation: 340개 (route=train 106 포함) / disused·폐선 제외 11 / 북한 제외 4 /
geometry·이름 없음 스킵 4

## 6. 색상 없는 노선 69개 (수동 지정 필요)

- 2-10 | 광주 도시철도 2호선 내선순환
- 2-12 | 광주 도시철도 2호선 외선순환
- 201 | 경부선 (부산역 행)
- 201-2 | 경부선 (서울역 행)
- 2082 | 장항화물선
- 2125 | 금장삼각선
- 213 | 영동선
- 214 | 경북선
- 215 | 태백선 백산 방면
- 5-5 | 하남선
- am, am-2 | 인천공항 자기부상철도
- byeollae-line | 별내선
- daegu-line | 대구선
- daegusaneop-line | 대구산업선
- eungam-loop-line | 응암순환선
- gangneung-line-ktx-seoul-gangneung | 강릉선 KTX: 서울 → 강릉
- gyeongbu-line-ktx-seoul-busan | 경부선 KTX: 서울 → 부산
- gyeongbu-line-ktx-seoul-busan-2 | 경부선 KTX: 수서 → 부산
- gyeongbu-line-ktx-seoul-busan-via-gupo | 경부선 KTX: 서울 → 부산 (구포경유)
- gyeongbu-line-ktx-seoul-busan-via-suwon | 경부선 KTX: 서울 → 부산 (수원경유)
- gyeongbu-line-ktx-seoul-daejeon | 경부선 KTX: 서울 → 대전
- gyeongbu-line-ktx-seoul-dongdaegu | 경부선 KTX: 서울 → 동대구
- honam-line-ktx-yongsan-gwangjusongjeong | 호남선 KTX: 용산 → 광주송정
- honam-line-ktx-yongsan-jangseong | 호남선 KTX: 용산 → 장성
- honam-line-ktx-yongsan-mokpo | 호남선 KTX: 용산 → 목포
- honam-line-ktx-yongsan-mokpo-via-seodaejeon | 호남선 KTX: 용산 → 목포 (서대전경유)
- incheon-international-airport-shuttle-train-terminal-1-terminal-2(×2), terminal-2-terminal-1(×2) | 인천국제공항 셔틀트레인
- itx-saemaeul-gyeongbu-line-seoul-busan | 경부선 ITX-새마을: 서울 → 부산
- itx-saemaeul-honam-line-yongsan-gwangju | 호남선 ITX-새마을: 용산 → 광주
- itx-saemaeul-honam-line-yongsan-mokpo | 호남선 ITX-새마을: 용산 → 목포
- itx-saemaeul-jeolla-line-yongsan-yeosu-expo | 전라선 ITX-새마을: 용산 → 여수엑스포
- jichuk-depot-line | 지축기지선
- ktx-204, ktx-jungbunaeryuk-line-chungju-bubal | KTX 중부내륙선
- mugunghwa-ho-gyeongbu-line-seoul-busan | 경부선 무궁화호: 서울 → 부산
- mugunghwa-ho-honam-line-yongsan-gwangju | 호남선 무궁화호: 용산 → 광주
- mugunghwa-ho-honam-line-yongsan-mokpo | 호남선 무궁화호: 용산 → 목포
- mugunghwa-ho-jeolla-line-yongsan-yeosu-expo | 전라선 무궁화호: 용산 → 여수엑스포
- okseo-triangular-junction | 옥서삼각선
- posco-pohang-jecheol-line | 포스코 포항제철소선
- r10553869 | 철도종합시험선로
- r11214689 | 호남선 KTX: 수서 → 광주송정
- r11214690 | 호남선 KTX: 수서 → 목포
- r11272647 | 전라선 KTX: 용산 → 여수엑스포
- r11314593 | 전라선 KTX: 용산 → 전주
- r11314594 | 전라선 KTX: 용산 → 여수엑스포 (서대전경유)
- r12115931 | 송정리 비행장선
- r13605591 | 대구선 (daegu-line과 중복)
- r13653527 | 군산화물선
- r14550657 | K-2인입선
- r19966469 | 하이원추추파크 레일바이크
- r2474720 | 경부고속철도
- r3399104 | 운곡길 (도로 오태깅 의심)
- r4730524, r4730525 | KTX 경부선: 포항 ↔ 서울
- r7798599, r8226481 | 경전선 (중복)
- r9504912 | 일직터널 (터널 단일 구조물)
- r9529550 | 간현레일바이크
- saemaeul-ho-janghang-line-yongsan-iksan | 장항선 새마을호: 용산 → 익산
- seocheon-hwaryeok-line | 서천화력선
- seoul-metro-line-4-chang-dong-depot-line | 창동기지선
- seoul-metro-line-4-nowon-chang-dong-line | 노원창동선
- sillim-line | 신림선
- wolmi-sea-train | 월미바다열차

## 7. chul.mom 수치와 비교 (참고용)

| | chul.mom 표기 | 본 파이프라인 | 비고 |
|---|---|---|---|
| 한국 노선 | 302 | **336** | relation 단위 집계 |
| 한국 역 | 2,377 | **1,336** | 고유 노드 단위 집계 |

괴리 원인 분석:
- **노선 336 > 302**: OSM에 방향별·운행계통별 relation이 중복 등록되어 있음.
  예: 수도권 1호선 약 90개 변형(1-8~1-99), 수인·분당선 약 25개, 4호선 약 28개.
  chul.mom의 302는 중복을 제거하거나 다른 기준으로 집계한 것으로 보임 (추론).
  앱의 노선 목록 UX를 위해서는 물리 노선 단위 중복 제거가 후속 작업으로 필요 (§8 이슈 1).
- **역 1,336 < 2,377**: 본 파이프라인은 `railway=station/halt` 고유 노드만 집계.
  PBF 전체 태그 분포: `railway=station` 약 1,325개, `railway=halt` 16개,
  `railway=tram_stop` 6개, `public_transport=station`(railway 태그 없음) 518개.
  tram_stop(+6)과 pt=station(+518)을 다 합쳐도 1,860으로 2,377에 못 미침.
  chul.mom은 역-노선 쌍 단위 집계이거나 별도 데이터 소스를 쓰는 것으로 보임 (추론, 검증 불가).
  본 수치는 OSM 원시 데이터 기준이므로 그대로 사용하고, 앱에서 필요하면 pt=station 병합을 후속 검토.

## 8. 유명역 10곳 스팟체크 (2026-10-11)

좌표는 [경도, 위도]. OSM 실측값 그대로이며 지어낸 값 없음.

| 역 | name_ko | name_en | 좌표 | 귀속 노선 예시 |
|---|---|---|---|---|
| 서울역 | 서울역 | Seoul Station | [126.972572, 37.552853] | 4-2 (폴백) |
| 부산역 | 부산역 | Busan Station | [129.039903, 35.115726] | 1 (부산1호선, 폴백) |
| 강남역 | 강남 | Gangnam | [127.027557, 37.49795] | 2-7 (2호선, 폴백) |
| 홍대입구 | 홍대입구 | Hongik Univ. | [126.926908, 37.557349] | 경의·중앙선 변형 (폴백) |
| 동대구역 | 동대구 | Dongdaegu | [128.628306, 35.879185] | 201 (경부선, 폴백) |
| 광주송정역 | 광주송정 | Gwangju Songjeong | [126.79011, 35.137707] | honam-line-ktx-yongsan-mokpo (폴백) |
| 대전역 | 대전역 | Daejeon Station | [127.433365, 36.331352] | 1-3 (대전1호선, 폴백) |
| 인천역 | 인천 | Incheon | [126.616887, 37.476682] | 1-8 (1호선, 폴백) |
| 수원역 | 수원 | Suwon | [126.99991, 37.26581] | suin-bundang-line-gosaek-wangsimni (폴백) |
| 청량리역 | 청량리 | Cheongnyangni | [127.048257, 37.580596] | 경의·중앙선 변형 (폴백) |

좌표는 실제 역 위치와 수백 m 이내로 일치함을 확인. 단, 귀속 노선은 대부분 근접 폴백이라
환승역의 전체 노선 목록이 아님 (예: 서울역이 4호선 변형 하나에만 귀속). §8 이슈 2 참조.

## 9. 이슈 사항

1. **운행계통별 relation 중복**: 1호선 약 90개, 수인·분당선 약 25개, 4호선 약 28개 등
   방향·급행/특급 패턴마다 별도 relation. 앱 노선 목록에 그대로 노출하면 UX가 깨짐.
   후속 작업: `(network, ref)` 기준 대표 노선 선정 또는 앱에서 그룹핑.
2. **역-노선 귀속 품질**: relation 멤버십으로 귀속된 역이 65개에 불과하고 1,150개가 500m 근접 폴백.
   폴백은 단일 노선만 부여하므로 환승역의 `lines` 배열이 불완전함
   (서울역에 1호선·경의중앙선·공항철도가 안 붙는 식). OSM 데이터 자체의 한계.
   개선안: 동일 이름 역 노드들을 병합해 lines 배열을 채우는 후처리.
3. **미귀속 121개 역**: 관계 relation이 없는 구간의 역 (예: 정선, 대광리·신탄리(경원선 연천 이북),
   증평, 군산, 광천 등 지방 KORAIL역). 해당 구간 route relation이 OSM에 없음.
4. **노이즈 relation**: `운곡길`(도로 오태깅 의심), `일직터널`(터널 단일 구조물),
   `하이원추추파크 레일바이크`·`간현레일바이크`(관광용), `철도종합시험선로`,
   `송정리 비행장선`·`K-2인입선`(군용 인입선), `대구선`·`경전선` 중복 relation.
   원본 충실 원칙으로 일단 포함, 앱 노출 전 수동 필터 권장.
5. **name_en 공백**: 노선 29개, 역 21개에 영어 이름 없음 (null 유지, 지어내지 않음).
6. **금강산선·구 경원선 제외**: 휴전선 일대 구선(폐선)으로 북한 노선으로 분류해 제외.
   남한 구간(철원 일대) 표시가 필요하면 복원 가능.
7. **좌표 정밀도**: 소수점 6자리로 반올림 저장.
8. **GTX-C·8호선 연장 등 공사 중 노선**: OSM relation에 `construction` 태그가 있는 것은
   광주 2호선 2개뿐. GTX-C 같은 대형 프로젝트는 route relation 자체가 아직 없음.
   앱에서 "공사 중" 레이어를 보여주려면 별도 데이터 소스 필요.

---

# 부동산(주변 시세) 파이프라인

실거래가 → 역. 순서를 지켜야 한다. 2번은 1번이 만든 캐시를 쓰고, 3·4번은
2번이 만든 `_station_dong.json` 을 쓴다.

```bash
python data/lawd.py                      # 코드표 자체 점검 (키 불필요)
python data/fetch_rtms.py --metro --from 202604 --to 202609   # 1. 실거래가 (82개 시군구)
python data/build_station_dong.py        # 2. 역 ↔ 법정동 (RTMS 캐시로 시군구를 확정)
python data/build_station_price.py       # 3. 법정동 중위값 → station-price.json
python data/build_station_complex.py     # 4. 단지·평형대 → station-complex.json
python data/build_sources.py             # 5. 출처 표 갱신 (data.html)
```

## 키는 (시도, 시군구코드, 법정동) 세 부분

이름만으로 묶으면 안 된다. '중구'는 서울·인천·부산·대구·대전·울산에 있고
'서구'는 인천·대구·광주·부산에 있다. 서울 중구 아파트가 인천 중구 역에
붙는 사고가 여기서 난다.

## 시군구 코드는 짐작하지 말고 응답으로 확인한다

`data/lawd.py` 의 표는 **응답에 나오는 법정동으로 확인한 것만** 적는다.
2026년에 인천 구가 다시 나뉘어(영종·검단) 번호가 옮겨졌고, 코드를 순서대로
짐작해 세 번 틀렸다.

| 코드 | 확인된 법정동 | 결론 |
|---|---|---|
| 28125 | 송현동·송림동·만석동 | 동구 |
| 28155 | 운서동·중산동·운남동 | 중구(영종도) |
| 28237 | 부평동·청산동·십정동 | 부평구 |
| 28245 | 작전동·효성동·계산동 | 계양구 |
| 28275 | 가정동·청라동 | 서구 |
| 28290 | 마전동·원당동·당하동 | 서구(검단) |
| 41591~41597 | 화성시 4개 구 | 화성시 (구 이름 미확인) |

`28140`·`28260`·`28310`·`28320` 은 전 기간 0건이다. 표준 법정동코드표를
보고 넣었던 값인데 실제로는 쓰이지 않는다.

## 두 자료의 법정동 표기가 다르다

- 역 주소데이터: `부발읍` (읍까지만), `안양6동` (행정동), `매송면 어천리`
- 실거래가: `부발읍 아리미`, `안양동`, `매송면 어천리`

`data/dong_match.py` 가 정확히 맞는 것 → 읍·면 단위 → 리 이름(같은 시군구에서
유일할 때만) 순으로 넓힌다. 리 이름만으로 맞추면 '중리'가 엉뚱한 동네에 붙는다.

## 구가 빠진 주소

'경기도 고양시 백석동' 처럼 구가 없는 주소가 있다. 이때는 **실거래가 응답에
나온 법정동 목록**을 뒤져 어느 구인지 찾는다(`dong_index`). 지도 경계를 따로
받을 필요가 없다. 둘 이상이면 포기한다 — 억지로 고르면 엉뚱한 값이 붙는다.

## 단지 파일 크기

`station-complex.json` 은 역이 있는 법정동만 담는다. 수도권 전체를 담으면
2MB 가 넘어 모바일에서 부담이다. 지금 1.1MB / 5,301단지.

---

# 노선 선형을 OSM 으로 옮기는 파이프라인

상업적 재사용이 확인되지 않은 철도맘 화면을 보고 그린 선형을 OSM 선로에서 다시
계산한 것으로 바꾼다. 목적은 법적 안전이지 정확도 포기가 아니므로, **검증을
통과한 노선만** 바꾼다.

```
osm_pbf_extract.py            PBF → data/_osm/rail_ways.json, route_rels.json
  ↓
fetch_osm_alignments.py       route relation → 선형 후보  (방법: relation)
build_align_by_graph.py       역↔역을 선로 따라 최단경로 (방법: graph)
  ↓
apply_osm_alignments.py       두 후보를 검증해 lines.geojson 에 반영
```

## relation 방식이 안 되는 경우

OSM 에서 일반철도는 **운행 계통 relation** 으로만 있고 실제 선로는
`railway=rail` way 로 흩어져 있는 경우가 많다. KTX 경부선 relation 은 way 가
1개뿐이었다(1.8km). 그래서 선로 전체를 정점 그래프로 만들고 역과 역 사이를
최단경로로 잇는 방식을 같이 쓴다. 역 좌표는 OSM 역 노드와 1m 이내로 같으므로
그래프 방식이 역 이탈이 더 작다(중앙값 2~5m).

## 선로가 50m 쯤 끊겨 있을 때

터널 입·출구나 편집 경계에서 way 가 끊겨 있으면 경로가 없어서 12km 를 돌아가거나
직선을 긋게 된다. 경의선 효창공원앞~공덕이 그랬다. 15m 이내는 비용 2배로 잇고,
60m 까지는 **비용 6배**로 잇는다. 실제 선로가 있으면 6배짜리는 절대 선택되지
않으므로, 마지막 수단으로만 쓰인다.

## 반영 조건 (apply_osm_alignments.py)

1. 역의 90% 이상이 선에서 300m 안, 중앙 이탈 150m 이내
2. 역이 선에서 400m 넘게 떨어지는 곳이 없을 것
3. **직선으로 메운 구간이 한 곳도 없을 것** — 직선은 그 구간의 모양을 지어내는
   것이고, 양 끝 역을 반드시 지나므로 '역이 선 위에 있다' 검사까지 통과해 버린다
4. 선형 길이가 역 순서대로의 직선 합보다 짧지 않을 것 (삼각부등식)
5. 공식 영업거리가 있으면 ±8% 이내
6. **지금 선형과 길이가 15% 안에서 맞을 것** — 두 자료가 서로 독립이므로,
   어긋나면 어느 쪽이 틀렸는지 자동으로 알 수 없다. 중부내륙선 83km(지금 136km),
   장항선 114km(지금 155km)는 선로 그래프가 다른 선로로 질러간 경우였다

## 지금 상태 (2026-10-27)

84개 중 **52개**가 OSM 선형(relation 39 + graph 13). 남은 32개의 이유:

- **OSM 선로가 끊김**: 동해선 포항~삼척, 태백선 고한~갈래호, KTX 호남선 공주~강경
- **아직 안 지어짐**: GTX-D~H, 동북선, 동부선, 대전 2호선, 광주 2호선, 대구산업선,
  GTX-A 서울역~수서
- **길이가 15% 넘게 어긋남**: KTX 중부내륙선·경강선, 장항선, 충북선, 경원선, 서해선
- **역이 1개 이하**: 화물선·삼각선 6개 (역이 없어 대조할 기준이 없다)

## note 를 다시 쓰지 않는다

`note` 에 '선형: ...' 문장을 **붙이는** 방식이었더니 apply 를 돌릴 때마다 한 줄씩
늘어 노선 정보 패널에 같은 문장이 세 번 반복됐다. 지금은 선형을 설명하는 문장을
전부 걷어내고 하나만 새로 쓴다(`_strip_align`). `tests/attribution.test.js` 가
'선형:' 이 한 번만 나오는지 검사한다.
