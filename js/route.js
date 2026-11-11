/* 길찾기: 역-노선 그래프 + 다익스트라 최단경로 + 노선별 평균속도 시간 추정 */
'use strict';

const RouteFinder = (() => {
  // 노선별 평균 속도 (km/h) — 실측 시각표가 아닌 어림 추정치 (추론)
  //
  // 카테고리 하나로 묶으면 안 된다. 'metro' 안에 2호선(표정 44km/h)과
  // 경춘선(표정 62km/h)이 같이 들어 있어서, 하나의 상수로는 둘 다 못 맞힌다.
  // 예전에 32km/h 하나로 두었더니 춘천→서울이 172분(실제 78분)으로 나왔다.
  // 그래서 카테고리 기본값 + 노선별 예외로 둔다.
  const SPEEDS = { ktx: 170, metro: 32, urban: 45, conventional: 55, etc: 40 };

  // 노선별 표정속도 (km/h) = 영업거리 ÷ 전 구간 소요시간. 공개 시각표 기준.
  //   경춘선   춘천~상봉 81.2km / 79분  = 62
  //   경의중앙 문산~지평 118.8km / 158분 = 45
  //   수인분당 청량리~인천 104.5km / 132분 = 47
  //   신분당   신사~광교 33.2km / 37분   = 54
  //   공항철도 서울~인천공항 63.8km / 66분 = 58
  //   경강선   판교~여주 54.0km / 57분   = 57
  //   동해선   부전~태화강 63.4km / 72분  = 53
  //   서해선   소사~원시 31.4km / 37분   = 51
  //   대경선   구미~경산 61.8km / 45분   = 55  (2024 개통 광역철도)
  //   KTX 강릉선 서울~강릉 213.8km / 114분 = 113
  const LINE_SPEEDS = {
    'seoul-metropolitan-subway-gyeongchun-line': 62,
    'gyeongui-jungang-line': 45,
    'suin-bundang-line': 47,
    'seoul-metropolitan-subway-shinbundang-line': 54,
    'arex': 58,
    'seoul-metropolitan-subway-gyeonggang-line': 57,
    'donghae-line': 53,
    'seoul-metropolitan-subway-seohae-line': 51,
    'daegyeong-line': 55,
    'gangneung-line-ktx': 113,
  };
  // <official-runtimes> — data/build_official_runtimes.py 가 만든다. 손으로 고치지 말 것.
  // 출처: 서울교통공사 역간거리 및 소요시간(2024.3.25. 기준), 서울열린데이터광장 OA-12034, 공공누리 제1유형
  const OFFICIAL_RUNTIMES = {"seoul-metropolitan-subway-line-1":[["서울","시청",120],["시청","종각",120],["종각","종로3가",90],["종로3가","종로5가",90],["종로5가","동대문",90],["동대문","동묘앞",60],["동묘앞","신설동",90],["신설동","제기동",90],["제기동","청량리",90]],"seoul-subway-line-2":[["시청","을지로입구",90],["을지로입구","을지로3가",60],["을지로3가","을지로4가",60],["을지로4가","동대문역사문화공원",90],["동대문역사문화공원","신당",90],["신당","상왕십리",60],["상왕십리","왕십리",60],["왕십리","한양대",90],["한양대","뚝섬",90],["뚝섬","성수",60],["성수","건대입구",90],["건대입구","구의",120],["구의","강변",60],["강변","잠실나루",120],["잠실나루","잠실",90],["잠실","잠실새내",90],["잠실새내","종합운동장",90],["종합운동장","삼성",90],["삼성","선릉",90],["선릉","역삼",90],["역삼","강남",60],["강남","교대",90],["교대","서초",60],["서초","방배",120],["방배","사당",150],["사당","낙성대",120],["낙성대","서울대입구",90],["서울대입구","봉천",60],["봉천","신림",90],["신림","신대방",120],["신대방","구로디지털단지",90],["구로디지털단지","대림",90],["대림","신도림",150],["신도림","문래",120],["문래","영등포구청",60],["영등포구청","당산",90],["당산","합정",150],["합정","홍대입구",90],["홍대입구","신촌",120],["신촌","이대",60],["이대","아현",60],["아현","충정로",90],["충정로","시청",90],["시청","용답",180],["용답","신답",90],["신답","용두",90],["용두","신설동",90],["신설동","도림천",90],["도림천","양천구청",150],["양천구청","신정네거리",180],["신정네거리","까치산",150]],"seoul-metro-line-3":[["지축","구파발",180],["구파발","연신내",120],["연신내","불광",90],["불광","녹번",90],["녹번","홍제",120],["홍제","무악재",90],["무악재","독립문",90],["독립문","경복궁",120],["경복궁","안국",90],["안국","종로3가",90],["종로3가","을지로3가",60],["을지로3가","충무로",60],["충무로","동대입구",90],["동대입구","약수",60],["약수","금호",60],["금호","옥수",60],["옥수","압구정",120],["압구정","신사",120],["신사","잠원",90],["잠원","고속터미널",90],["고속터미널","교대",120],["교대","남부터미널",90],["남부터미널","양재",120],["양재","매봉",120],["매봉","도곡",90],["도곡","대치",60],["대치","학여울",60],["학여울","대청",90],["대청","일원",90],["일원","수서",120],["수서","가락시장",120],["가락시장","경찰병원",60],["경찰병원","오금",60]],"seoul-metropolitan-subway-line-4":[["불암산","상계",90],["상계","노원",90],["노원","창동",120],["창동","쌍문",90],["쌍문","수유",120],["수유","미아",90],["미아","미아사거리",120],["미아사거리","길음",90],["길음","성신여대입구",120],["성신여대입구","한성대입구",90],["한성대입구","혜화",90],["혜화","동대문",120],["동대문","동대문역사문화공원",60],["동대문역사문화공원","충무로",120],["충무로","명동",60],["명동","회현",60],["회현","서울",90],["서울","숙대입구",90],["숙대입구","삼각지",90],["삼각지","신용산",60],["신용산","이촌",90],["이촌","동작",180],["동작","이수",150],["동작","총신대입구(이수)",150],["이수","사당",90],["총신대입구(이수)","사당",90],["사당","남태령",90]],"seoul-subway-line-5":[["방화","개화산",90],["개화산","김포공항",100],["김포공항","송정",130],["송정","마곡",90],["마곡","발산",100],["발산","우장산",90],["우장산","화곡",90],["화곡","까치산",90],["까치산","신정",110],["신정","목동",70],["목동","오목교",80],["오목교","양평",80],["양평","영등포구청",70],["영등포구청","영등포시장",70],["영등포시장","신길",90],["신길","여의도",90],["여의도","여의나루",80],["여의나루","마포",120],["마포","공덕",70],["공덕","애오개",80],["애오개","충정로",80],["충정로","서대문",60],["서대문","광화문",90],["광화문","종로3가",100],["종로3가","을지로4가",100],["을지로4가","동대문역사문화공원",90],["동대문역사문화공원","청구",80],["청구","신금호",90],["신금호","행당",80],["행당","왕십리",70],["왕십리","마장",60],["마장","답십리",100],["답십리","장한평",100],["장한평","군자",100],["군자","아차산",90],["아차산","광나루",110],["광나루","천호",130],["천호","강동",70],["강동","길동",90],["길동","굽은다리",70],["굽은다리","명일",70],["명일","고덕",100],["고덕","상일동",100],["상일동","강일",110],["강일","미사",110],["미사","하남풍산",150],["하남풍산","하남시청",110],["하남시청","하남검단산",150],["하남검단산","둔촌동",110],["둔촌동","올림픽공원",100],["올림픽공원","방이",80],["방이","오금",80],["오금","개롱",70],["개롱","거여",80],["거여","마천",90]],"seoul-subway-line-6":[["응암","역촌",100],["역촌","불광",80],["불광","독바위",80],["독바위","연신내",130],["연신내","구산",80],["구산","응암",120],["응암","새절",80],["새절","증산",80],["증산","디지털미디어시티",80],["디지털미디어시티","월드컵경기장",70],["월드컵경기장","마포구청",70],["마포구청","망원",80],["망원","합정",80],["합정","상수",70],["상수","광흥창",70],["광흥창","대흥",90],["대흥","공덕",80],["공덕","효창공원앞",80],["효창공원앞","삼각지",90],["삼각지","녹사평",100],["녹사평","이태원",70],["이태원","한강진",90],["한강진","버티고개",90],["버티고개","약수",70],["약수","청구",70],["청구","신당",70],["신당","동묘앞",60],["동묘앞","창신",80],["창신","보문",70],["보문","안암",70],["안암","고려대",70],["고려대","월곡",100],["월곡","상월곡",70],["상월곡","돌곶이",70],["돌곶이","석계",80],["석계","태릉입구",70],["태릉입구","화랑대",70],["화랑대","봉화산",80],["봉화산","신내",270]],"seoul-subway-line-7":[["장암","도봉산",270],["도봉산","수락산",140],["수락산","마들",120],["마들","노원",90],["노원","중계",80],["중계","하계",70],["하계","공릉",90],["공릉","태릉입구",60],["태릉입구","먹골",70],["먹골","중화",80],["중화","상봉",110],["상봉","면목",70],["면목","사가정",70],["사가정","용마산",70],["용마산","중곡",80],["중곡","군자",80],["군자","어린이대공원",80],["어린이대공원","건대입구",80],["건대입구","자양",90],["자양","청담",150],["청담","강남구청",90],["강남구청","학동",70],["학동","논현",80],["논현","반포",70],["반포","고속터미널",90],["고속터미널","내방",150],["내방","이수",90],["이수","남성",80],["남성","숭실대입구",150],["숭실대입구","상도",70],["상도","장승배기",150],["장승배기","신대방삼거리",110],["신대방삼거리","보라매",70],["보라매","신풍",140],["신풍","대림",120],["대림","남구로",90],["남구로","가산디지털단지",80],["가산디지털단지","철산",120],["철산","광명사거리",110],["광명사거리","천왕",120],["천왕","온수",140]],"seoul-subway-line-8":[["암사역사공원","암사",90],["암사","천호",90],["천호","강동구청",80],["강동구청","몽촌토성",120],["몽촌토성","잠실",70],["잠실","석촌",110],["석촌","송파",70],["송파","가락시장",70],["가락시장","문정",70],["문정","장지",70],["장지","복정",70],["복정","남위례",110],["남위례","산성",100],["산성","남한산성입구",130],["남한산성입구","단대오거리",70],["단대오거리","신흥",70],["신흥","수진",70],["수진","모란",90]]};
  // </official-runtimes>
  const TRANSFER_MIN = 4;   // 환승 1회당 추가 시간 (추론) — 자료 없는 역의 기본값
  // 역 안 환승 도보 시간. data/transfer-times.json 이 오면 그 값을 쓰고,
  // 없으면 위의 4분을 쓴다. (아래 loadTransfers / transferMinutes 참고)
  let transferDoc = null;
  // 경로를 '고를 때' 매기는 환승 비용은 '실제 도보 시간 + 이 값' 이다.
  // 실제 여행자는 2분 아끼자고 3번 갈아타지 않는다. 예전에는 8분 고정이었는데,
  // 그 8분은 '평균 환승 4분 + 4분' 이었으므로 평균적인 역에서는 예전과 같다.
  const TRANSFER_DECISION_EXTRA = 4;
  // 갈아탈 때 다음 열차를 기다리는 시간(분) = 배차 간격의 절반(평균 대기). 표시 시간에도 넣는다 (2026-11-11 고침).
  // 예전엔 0분이라 환승 많은 경로가 너무 짧게 나왔다 — 공덕→강남 25분(지하철종결자 최소시간 32분, 환승 2),
  // 광운대→강남 24분. 배차는 공개 시각표의 낮·출퇴근 평균 대략값. 첫 열차 대기는 넣지 않는다(앱들과 같은 기준).
  const WAIT_DEFAULT = 2.5;                                // 서울 도심 지하철 약 4~6분 간격
  const WAIT_MIN = {
    'seoul-metropolitan-subway-line-1': 4,                // 코레일 구간 섞임, 약 6~10분
    'gyeongui-jungang-line': 6,                           // 약 10~15분
    'seoul-metropolitan-subway-gyeongchun-line': 8,       // 약 15~20분
    'suin-bundang-line': 4,                               // 약 8~10분
    'seoul-metropolitan-subway-seohae-line': 6,
    'seoul-metropolitan-subway-gyeonggang-line': 6,
    'donghae-line': 8, 'daegyeong-line': 8,
    'arex': 5,                                            // 일반열차 약 10분 간격 (회장님 지적)
    'seoul-metropolitan-subway-shinbundang-line': 2.5,
  };
  function waitMin(lid) {
    if (!lid) return 0;
    if (lineCat.get(lid) === 'ktx' || (typeof EXPRESS !== 'undefined' && EXPRESS[lid])) return 0;   // KTX·급행은 접근 시간으로 따로
    if (/^gtx|great-train-express/.test(lid)) return 4;   // 계획 배차 약 6~10분
    return WAIT_MIN[lid] != null ? WAIT_MIN[lid] : WAIT_DEFAULT;
  }
  // 다른 노선으로 '갈아탈 때'만 (출발역 첫 탑승·직결 운행은 0)
  // 평면환승(같은 승강장 맞은편, 배차를 맞춰 운영 — 청량리 GTX-B·C, 삼성 GTX-A·C 등)은 도착하면 맞은편 열차가
  // 바로 받으므로 기다리는 시간 0 (2026-11-11 회장님 지적). 걷기는 PLATFORM_MIN(10초)만.
  function transferWait(nl, line, stationId, fromId, toId) {
    if (!nl || !line || line === START || nl === line) return 0;
    if (sameService(nl, line)) return 0;
    if (stationId && isPlatformTransfer(stationId, line, nl, fromId, toId)) return 0;
    return waitMin(nl);
  }
  const WALK_KMH = 4;
  // KTX 탑승 1회당 붙는 접근 시간 (분). 좌석 지정·개찰·승강장 이동.
  //
  // 왜 필요한가: 이 값이 없으면 '상봉→청량리 3.8km 를 KTX 로' 같은 경로가
  // 최단시간으로 뽑힌다. 3.8km 구간이 1분이라 도시철도(6분)를 이기기 때문이다.
  // 실제로는 그렇게 타는 사람이 없고, 요금도 8,250원부터 시작한다.
  // 도시철도·GTX 는 바로 타므로 0 이다.
  const RAIL_ACCESS_MIN = 12;

  // --- 그래프 구성 상수 -------------------------------------------------
  const ATTACH_MAX_KM = 1.5;   // 역을 선형에 귀속시키는 최대 거리
  const WALK_MAX_KM = 0.5;     // 도보 환승으로 인정하는 최대 거리 (같은 이름이라도 이보다 멀면 별개 역)
  const CLOSED_TOL_KM = 0.05;  // 순환선 폐합 판정 (조각의 시작점과 끝점이 사실상 동일)

  // GTX 역간 소요시간 (분) — 자체 산출 (2026-11-12, 회장님 결정 '우리 방법').
  //   1) 국토교통부가 발표한 구간 시간 6개 (운정중앙~서울역 20, 수서~동탄 19, 인천대입구~서울역 30,
  //      서울역~마석 27, 덕정~삼성 27, 삼성~수원 26분 — 언론 보도로 인용된 국토부 발표값)
  //      + 광운대~삼성 9분 (노원구 GTX-C 착공식 발표, 뉴스핌 2024-04-16)
  //   2) 우리 선형을 따라 잰 역간 거리
  //   3) 구간 시간 = 0.413분/km × 거리 + 1.791분 × 역간 수 (주행 약 145km/h + 역마다 서고 출발하는 시간)
  //      — 7개 발표 구간으로 최소제곱 추정. 그다음 발표 구간 안에서는 합계가 발표값과 정확히 같도록 비율로 맞춘다(짧은 구간 먼저).
  //   GTX-A 서울역~수서는 발표값이 없어 모델값 그대로. 창릉역은 우리 역 자료에 아직 없어 대곡~연신내 한 구간.
  //   만드는 법: 인계 노트 '11-12 GTX 자체 산출' (node data/build_gtx_times.js)
  // 형식: [역명, 다음역까지 분]. 마지막역은 null.
  const GTX_TIMES = {
    'great-train-express-line-a': [
      ['운정중앙',4.3],['킨텍스',4.6],['대곡',5.8],['연신내',5.4],
      // 서울역~수서는 아직 운행하지 않는다 — 그 구간은 아래 'gtx-a-seoul-suseo' 가 맡는다.
      // 한 표에 [서울역, null] 을 두면 서울역→수서 간선이 생기지 않는다 (2026-11-10).
      ['서울역',null],['수서',6.4],['성남',6.4],['구성',6.2],['동탄',null]],
    // 미개통. 2027년 개통 때는 삼성 무정차, 삼성 정차는 2028년 예정 — '개통 후' 는 최종 계획(삼성 정차) 기준.
    'gtx-a-seoul-suseo': [['서울역',6.1],['삼성',3.6],['수서',null]],
    'gtx-b': [
      ['인천대입구',6.1],['인천시청',3.7],['부평',4.8],['부천종합운동장',5.5],['신도림',3.1],['여의도',3.7],['용산',3],['서울역',5.4],['청량리',3.6],['상봉',4.8],['별내',3.3],['왕숙',5.3],['평내호평',4.6],['마석',null]],
    'gtx-c': [
      ['덕정',7.8],['의정부',6.5],['창동',3.8],['광운대',3.2],['청량리',2.2],['왕십리',3.6],['삼성',3.9],['양재',5.2],['과천청사',3.2],['인덕원',4.1],['금정',4.3],['의왕',5.3],['수원',null]],
  };
  // 표의 역명 → 우리 데이터 역명. 과천청사 = 정부과천청사, 서울역 = '서울' (데이터 역명에 '역'이 없다 —
  // 예전엔 '서울역'을 못 찾아 GTX-A·B 의 서울역 앞뒤 공식 소요시간 간선이 통째로 빠졌다, IMPL12)
  const GTX_NAME_ALIAS = { '과천청사': '정부과천청사', '서울역': '서울' };

  // 급행 계통 (2026-11-11) — 지도에는 따로 그리지 않고(같은 선로) 길찾기 그래프에만 넣는다.
  // ITX-청춘: 용산~춘천. 정차역은 위키백과 'ITX-Cheongchun' 의 주요 정차역, 소요시간은 2026년 시간표의
  // 구간 합계(청량리→춘천 56~63분 → 60분, 용산→청량리 17~19분 → 18분)만 확인했다. 중간 역 사이 시간은
  // 그 합계를 역간 직선거리 비례로 나눈 추정이다. 지정석·배차가 드물어 탈 때 접근 시간 10분을 붙인다
  // (안 붙이면 청량리→왕십리 같은 짧은 구간에서 전철 대신 ITX 를 고른다).
  const EXPRESS = {
    'itx-cheongchun': {
      name_ko: 'ITX-청춘', color: '#2f7d5b', category: 'conventional', accessMin: 10,
      via: ['gyeongui-jungang-line', 'seoul-metropolitan-subway-gyeongchun-line'],
      // [구간 첫 역, 구간 끝 역, 분] — 구간 안의 정차역은 stops 순서대로
      stops: ['용산', '옥수', '왕십리', '청량리', '평내호평', '청평', '가평', '강촌', '남춘천', '춘천'],
      spans: [['용산', '청량리', 18], ['청량리', '춘천', 60]],
    },
  };

  // 같은 열차가 이어 달리는 노선 묶음. 지도에서는 개통 상태가 달라 노선을 나눠 그리지만
  // (GTX-A 서울역~수서 = 공사 중, 평택 연장 = 계획), 개통하면 갈아타지 않고 그대로 간다.
  // 묶음 안에서 노선이 바뀌는 것은 환승이 아니다 — 환승 시간·횟수에 넣지 않는다.
  const THROUGH = {
    'gtx-a-seoul-suseo': 'great-train-express-line-a',
    'gtx-a-pyeongtaek': 'great-train-express-line-a',
  };
  function serviceOf(lineId) { return THROUGH[lineId] || lineId; }
  function sameService(a, b) { return a === b || (a != null && b != null && serviceOf(a) === serviceOf(b)); }
  // legs 가운데 실제로 갈아타는 횟수 (걷는 구간·이어 달리는 구간은 세지 않는다)
  function countTransfers(legs) {
    const ride = legs.filter(l => !l.walk && l.lineId !== null);
    let n = 0;
    for (let i = 1; i < ride.length; i++) if (!sameService(ride[i - 1].lineId, ride[i].lineId)) n++;
    return n;
  }

  let adj = new Map();      // stationId -> [{to, lineId, distKm, walk}]
  let lineCat = new Map();  // lineId -> category
  let lineStatus = new Map(); // lineId -> status (open / construction / planned / proposed)
  let stationsById = new Map();
  let geomAdjacent = new Set(); // '노선:역A|역B' — 선형에서 바로 이웃한 역 쌍
  let orderByLine = new Map();  // lineId -> [{id, piece, along}] 선형 순서

  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  /* ---------- 역 안 환승 도보 시간 ----------
   * OSM 노선 relation 의 정차점 좌표로 잰 승강장 사이 거리 ÷ 1.0m/s + 수직이동 90초.
   * 공식 환승 소요시간 자료가 아니라 추정값이다 (data/build_transfer_times.py).
   * 자료가 없는 역·노선쌍은 예전처럼 4분을 쓴다.
   */
  function loadTransfers(doc) {
    transferDoc = (doc && doc.stations) ? doc : null;
    return transferDoc ? Object.keys(transferDoc.stations).length : 0;
  }

  // 같은 승강장 평면(수평)환승 — 계단·통로 없이 맞은편 열차로 건너간다 (10초, 방향별 — 아래 표).
  // 근거: 국토부·대광위 'GTX 환승 트라이앵글' — 청량리(GTX-B·C)·삼성(GTX-A·C) 평면환승 설계
  //   (청량리역 광역환승센터 B·C '초단위' 환승, 머니투데이방송 2020-10-27 / 서울시 미디어허브 'GTX 이용을 더욱 편리하게').
  // 역은 이름 + 그 역을 지나는 노선으로 찾는다 (동명역 오매칭 방지).
  // 평면환승은 '가는 방향'이 맞을 때만이다 — 같은 승강장을 나눠 쓰는 두 방향끼리만 맞은편이고,
  // 나머지 방향 조합(되돌아가는 쪽 등)은 계단을 오르내리는 일반 환승이다 (2026-11-12 회장님 자료 확인).
  // 열차 방향은 [노선, 직전 역, 다음 역] — 직전 역으로 '타고 온 방향', 다음 역으로 '갈 방향'을 가린다.
  //   청량리: 마석행 B ↔ 덕정행 C, 인천대입구행 B ↔ 수원행 C
  //   삼성:   동탄행 A ↔ 수원행 C, 운정중앙행 A ↔ 덕정행 C
  const GA = 'great-train-express-line-a';
  const PLATFORM_TRANSFER = [
    { station: '청량리', pair: [['gtx-b', '서울', '상봉'], ['gtx-c', '왕십리', '광운대']] },
    { station: '청량리', pair: [['gtx-b', '상봉', '서울'], ['gtx-c', '광운대', '왕십리']] },
    { station: '삼성', pair: [[GA, '서울', '수서'], ['gtx-c', '왕십리', '양재']] },
    { station: '삼성', pair: [[GA, '수서', '서울'], ['gtx-c', '양재', '왕십리']] },
  ];
  const PLATFORM_STATIONS = new Set(PLATFORM_TRANSFER.map(p => p.station));
  // 맞은편으로 몇 걸음 — 국토부 발표는 '동일 승강장 바로 환승'·'초 단위'라고만 하고 숫자는 없다.
  // 10초는 우리 추정 (2026-11-12 회장님 결정). 기다리는 시간은 따로 0 (transferWait).
  const PLATFORM_MIN = 10 / 60;
  const nameOfId = id => { const s = id && stationsById.get(id); return s ? s.properties.name_ko : null; };
  function isPlatformTransfer(stationId, a, b, fromId, toId) {
    if (!stationId || !a || !b) return false;
    const name = nameOfId(stationId);
    if (!PLATFORM_STATIONS.has(name)) return false;
    const sa = serviceOf(a), sb = serviceOf(b);
    const pn = nameOfId(fromId), nn = nameOfId(toId);
    // 탄 열차 X(직전 역 = X[1]) → 갈아탈 열차 Y(다음 역 = Y[2])
    const fits = (X, Y) => X[0] === sa && Y[0] === sb && X[1] === pn && Y[2] === nn;
    return PLATFORM_TRANSFER.some(p => p.station === name &&
      (fits(p.pair[0], p.pair[1]) || fits(p.pair[1], p.pair[0])));
  }
  // 평면환승역에서는 '어느 쪽에서 왔는지'가 다음 환승 시간을 바꾸므로 상태에 직전 역을 넣는다.
  const stateKey = (to, nl, from) => skey(to, nl) + (PLATFORM_STATIONS.has(nameOfId(to)) ? '\u0002' + from : '');
  // 아직 안 지은 GTX 역은 아주 깊다(대심도). 평면환승이 아닌 환승은 실측 자료가 없어 보수적으로 8분 (2026-11-11 회장님 결정 —
  // 서울역 공항철도↔GTX-A 를 4분으로 잡아 공덕→삼성이 18분으로 너무 짧게 나왔다).
  const GTX_DEEP_TRANSFER_MIN = 8;
  const isGtx = lid => /^gtx|great-train-express/.test(lid || '');
  function transferMinutes(stationId, a, b, fromId, toId) {
    if (sameService(a, b) && a !== b) return 0;   // 이어 달리는 구간 — 갈아타지 않는다
    if (isPlatformTransfer(stationId, a, b, fromId, toId)) return PLATFORM_MIN;
    const base = (() => {
      if (!transferDoc || !stationId || !a || !b || a === b) return TRANSFER_MIN;
      const s = transferDoc.stations[stationId];
      if (!s) return TRANSFER_MIN;
      const p = s.pairs[pairKey(a, b)];
      return p ? p.min : TRANSFER_MIN;
    })();
    if ((isGtx(a) && isUnopened(a)) || (isGtx(b) && isUnopened(b))) return Math.max(base, GTX_DEEP_TRANSFER_MIN);
    return base;
  }

  // 공식 소요시간표의 두 역 사이에 '다른 정차역'이 끼어 있는지.
  // 끼어 있으면 그 공식값은 더 이상 이 구간의 시간이 아니다 (예: GTX-B 청학 신설).
  function hasStationBetween(lid, a, b) {
    const list = orderByLine.get(lid);
    if (!list) return false;
    const ea = list.find(x => x.id === a);
    const eb = list.find(x => x.id === b);
    if (!ea || !eb || ea.piece !== eb.piece) return false;
    const lo = Math.min(ea.along, eb.along), hi = Math.max(ea.along, eb.along);
    return list.some(x => x.piece === ea.piece && x.id !== a && x.id !== b &&
      x.along > lo + 1e-9 && x.along < hi - 1e-9);
  }

  // 미개통 = 운행 중이 아닌 모든 노선. 결과 화면에서 '미개통' 배지로 알린다.
  const UNOPENED = new Set(['construction', 'planned', 'proposed']);
  function isUnopened(lineId) {
    return UNOPENED.has(lineStatus.get(lineId) || 'open');
  }

  function hav(ax, ay, bx, by) {
    const r = Math.PI / 180;
    const dLat = (by - ay) * r, dLon = (bx - ax) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  // 점 p를 선형 위에 투영 → {alongKm, distKm}
  function project(p, coords) {
    let best = { alongKm: 0, distKm: Infinity };
    let acc = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const [ax, ay] = coords[i], [bx, by] = coords[i + 1];
      const segLen = hav(ax, ay, bx, by);
      // 간이 투영 (위경도를 평면 근사)
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = hav(p[0], p[1], ax + t * dx, ay + t * dy);
      if (d < best.distKm) best = { alongKm: acc + t * segLen, distKm: d };
      acc += segLen;
    }
    return best;
  }

  // distKm 를 넘기지 않으면 두 역의 직선거리를 쓴다(도보 환승).
  // 선로 엣지는 '선형을 따라간 거리'를 넘긴다 — 직선거리는 곡선 구간에서 실제보다
  // 짧아서, 요금·거리 계산이 지그재그 우회를 싸게 착각했다.
  function addEdge(a, b, lineId, walk, distKm) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    if (distKm == null) {
      distKm = hav(
        stationsById.get(a).geometry.coordinates[0], stationsById.get(a).geometry.coordinates[1],
        stationsById.get(b).geometry.coordinates[0], stationsById.get(b).geometry.coordinates[1]);
    }
    // 지금 다닐 수 있는 간선인지. '현재 vs 개통 후' 비교에서 이 값으로 걸러낸다.
    // 도보 환승은 노선이 없으니 언제나 가능하다.
    const open = walk ? true : !isUnopened(lineId);
    adj.get(a).push({ to: b, lineId, distKm, walk: !!walk, open });
    adj.get(b).push({ to: a, lineId, distKm, walk: !!walk, open });
  }

  function buildGraph(lines, stations) {
    adj = new Map(); lineCat = new Map(); stationsById = new Map();
    lineStatus = new Map(); geomAdjacent = new Set(); orderByLine = new Map();
    const activeIds = new Set();
    // 미개통(착공·계획·구상) 노선도 전부 그래프에 넣는다.
    // 이 지도는 '지금 운행 중인 노선'이 아니라 '앞으로 존재할 노선'을 그리는 지도다.
    // 다만 결과 화면에서 미개통 구간을 명시적으로 표시해 오해를 막는다.
    const activeLines = lines;
    activeLines.forEach(f => {
      lineCat.set(f.properties.id, f.properties.category || 'etc');
      lineStatus.set(f.properties.id, (f.properties.status || 'open').toLowerCase());
      activeIds.add(f.properties.id);
    });
    stations.forEach(s => stationsById.set(s.properties.id, s));

    // 노선 → 그 노선에 귀속된 역
    const stationsByLine = new Map();
    stations.forEach(s => {
      (s.properties.lines || []).forEach(lid => {
        if (!activeIds.has(lid)) return;
        if (!stationsByLine.has(lid)) stationsByLine.set(lid, []);
        stationsByLine.get(lid).push(s);
      });
    });

    let edgeCount = 0, loopEdges = 0;

    // 조각(LineString) 단위로 투영한다.
    // 조각을 이어붙여 평탄화하면 (a) 순환선이 한 곳에서 끊기고
    // (b) 분기 경계에서 서로 다른 지선의 역이 '인접역'으로 잘못 연결된다.
    activeLines.forEach(f => {
      const lid = f.properties.id;
      const sts = stationsByLine.get(lid);
      if (!sts || sts.length < 2) return;
      const pieces = f.geometry.type === 'LineString'
        ? [f.geometry.coordinates]
        : (f.geometry.coordinates || []);

      pieces.forEach((coords, pieceIdx) => {
        if (!coords || coords.length < 2) return;
        const seq = [];
        sts.forEach(s => {
          const pr = project(s.geometry.coordinates, coords);
          if (pr.distKm > ATTACH_MAX_KM) return;   // 엉뚱한 귀속 방지
          seq.push({ id: s.properties.id, along: pr.alongKm });
        });
        if (seq.length < 2) return;
        seq.sort((a, b) => a.along - b.along);
        if (!orderByLine.has(lid)) orderByLine.set(lid, []);
        const ord = orderByLine.get(lid);
        seq.forEach(s => ord.push({ id: s.id, piece: pieceIdx, along: s.along }));
        for (let i = 0; i < seq.length - 1; i++) {
          if (seq[i].id === seq[i + 1].id) continue;
          // 선형을 따라간 거리 (직선거리가 아님). 단, 두 역 사이 직선거리보다 짧을 수는 없다 (2026-11-11 고침):
          // 짧은 선 조각에 옆 가지·이웃 역이 조각 끝으로 '붙으면' 둘 다 같은 끝점에 투영돼 0km 연결이 생겼다
          // (전체 1,648개 중 142개 — 홍대입구→서강대 0.00km 등). 탐색이 그 '순간이동'을 타서 시간이 짧게 나오고
          // 홍대입구→강남이 경의중앙 우회로 잡혔다. 연결은 남기고 거리만 직선거리 이상으로 바로잡는다.
          const ca = stationsById.get(seq[i].id).geometry.coordinates, cb = stationsById.get(seq[i + 1].id).geometry.coordinates;
          addEdge(seq[i].id, seq[i + 1].id, lid, false, Math.max(seq[i + 1].along - seq[i].along, hav(ca[0], ca[1], cb[0], cb[1])));
          geomAdjacent.add(lid + ':' + pairKey(seq[i].id, seq[i + 1].id));
          edgeCount++;
        }
        // 순환선 폐합: 조각의 시작점과 끝점이 사실상 같으면 마지막 역 → 첫 역을 잇는다.
        // (2호선이 당산에서 끊겨 당산→합정이 29분/3회환승으로 계산되던 원인)
        const a = coords[0], b = coords[coords.length - 1];
        if (seq.length > 2 && seq[0].id !== seq[seq.length - 1].id &&
            hav(a[0], a[1], b[0], b[1]) <= CLOSED_TOL_KM) {
          let total = 0;
          for (let i = 0; i < coords.length - 1; i++) total += hav(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
          addEdge(seq[seq.length - 1].id, seq[0].id, lid, false,
            Math.max(0.01, total - seq[seq.length - 1].along + seq[0].along));
          geomAdjacent.add(lid + ':' + pairKey(seq[0].id, seq[seq.length - 1].id));
          edgeCount++; loopEdges++;
        }
      });
    });

    // 동명역 도보 환승: 이름이 같아도 실제로 걸어갈 수 있는 거리만 연결한다.
    // (서울 '시청'과 부산 '시청'을 잇던 325km 도보 엣지 제거)
    const byName = new Map();
    stations.forEach(s => {
      const n = s.properties.name_ko;
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push(s);
    });
    let walkEdges = 0, walkRejected = 0;
    byName.forEach(list => {
      if (list.length < 2) return;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const pa = list[i].geometry.coordinates, pb = list[j].geometry.coordinates;
          if (hav(pa[0], pa[1], pb[0], pb[1]) > WALK_MAX_KM) { walkRejected++; continue; }
          addEdge(list[i].properties.id, list[j].properties.id, null, true);
          walkEdges++;
        }
      }
    });

    applyOfficialRuntimes();
    addGtxOfficialEdges(activeIds);
    addExpressEdges();

    return { stations: stationsById.size, edges: edgeCount, loopEdges, walkEdges, walkRejected };
  }

  // 서울교통공사 1~8호선: 실제로 이어진 두 역(같은 노선)에 공식 역간 시간 + 정차 시간을 붙인다 (2026-11-11).
  // 평균 속도(32km/h)로 낸 값은 노선·구간마다 틀렸다 — 회장님 실측 광운대→시청 27분을 계산은 23분으로 냈다.
  // 공식 시간은 '달리는 시간'만이라 역마다 DWELL_MIN 을 더한다(구간 하나 = 한 역에 도착·정차).
  // 공식 자료가 없는 코레일 구간(1호선 청량리 밖 등)은 지금처럼 속도로 낸다.
  const DWELL_MIN = 0.5;
  let officialRuntimeEdges = 0;
  function applyOfficialRuntimes() {
    officialRuntimeEdges = 0;
    const look = new Map();   // lid|이름A|이름B → 초 (양방향)
    Object.entries(OFFICIAL_RUNTIMES).forEach(([lid, list]) => list.forEach(([a, b, sec]) => {
      look.set(lid + '|' + a + '|' + b, sec); look.set(lid + '|' + b + '|' + a, sec);
    }));
    adj.forEach((list, u) => {
      const nu = stationsById.get(u) && stationsById.get(u).properties.name_ko;
      list.forEach(e => {
        if (e.walk || e.officialMin != null || !OFFICIAL_RUNTIMES[e.lineId]) return;
        const nv = stationsById.get(e.to) && stationsById.get(e.to).properties.name_ko;
        const sec = look.get(e.lineId + '|' + nu + '|' + nv);
        if (sec == null) return;
        e.officialMin = sec / 60 + DWELL_MIN;
        e.official = 'seoul-metro';
        officialRuntimeEdges++;
      });
    });
  }

  // GTX 공식 소요시간 엣지 추가: 공식 역 순서대로 인접역 연결.
  // 미개통 노선(GTX-B/C 등)도 포함한다 — 이 지도는 개통 예정 노선까지 그린다.
  function addExpressEdges() {
    Object.entries(EXPRESS).forEach(([lid, x]) => {
      // 정차역 이름 → 역 ID: via 노선 위에서 그 이름이 하나뿐일 때만 (동명역 오매칭 방지)
      const idOf = name => {
        const ids = [];
        stationsById.forEach((s, id) => {
          if (s.properties.name_ko !== name) return;
          const ls = Array.isArray(s.properties.lines) ? s.properties.lines : [];
          if (ls.some(l => x.via.includes(l))) ids.push(id);
        });
        return ids.length === 1 ? ids[0] : null;
      };
      const ids = x.stops.map(idOf);
      if (ids.some(v => !v)) return;   // 정차역을 하나라도 못 찾으면 이 계통을 통째로 넣지 않는다
      lineCat.set(lid, x.category);
      lineStatus.set(lid, 'open');
      const km = (a, b) => {
        const p = stationsById.get(a).geometry.coordinates, q = stationsById.get(b).geometry.coordinates;
        return hav(p[0], p[1], q[0], q[1]);
      };
      x.spans.forEach(([from, to, total]) => {
        const i0 = x.stops.indexOf(from), i1 = x.stops.indexOf(to);
        const seg = [];
        for (let i = i0; i < i1; i++) seg.push(km(ids[i], ids[i + 1]));
        const sum = seg.reduce((s, v) => s + v, 0) || 1;
        for (let i = i0; i < i1; i++) {
          const a = ids[i], b = ids[i + 1], d = seg[i - i0], min = total * d / sum;
          if (!adj.has(a)) adj.set(a, []);
          if (!adj.has(b)) adj.set(b, []);
          adj.get(a).push({ to: b, lineId: lid, distKm: d, officialMin: min, open: true });
          adj.get(b).push({ to: a, lineId: lid, distKm: d, officialMin: min, open: true });
        }
      });
    });
  }
  // 화면에서 이름·색을 찾을 수 있게 (지도 노선 목록에는 없는 계통)
  function extraLines() {
    return Object.entries(EXPRESS).map(([id, x]) => ({ id, name_ko: x.name_ko, color: x.color, via: x.via }));
  }

  function addGtxOfficialEdges(activeIds) {
    // 이름 → 역 ID 는 '그 GTX 노선이 지나는 역' 가운데서만 찾는다 (IMPL12).
    // 예전엔 전체에서 이름이 처음 나온 역을 썼다 — 동명 역(교대·시청·용산 …)이면 다른 도시 역에 간선이 붙을 수 있었다.
    // 그 노선 위에 그 이름이 하나뿐일 때만 잇는다(둘 이상이면 모호해서 잇지 않는다).
    const onLine = new Map();   // lid → Map(name → [id])
    stationsById.forEach((s, id) => {
      const n = s.properties.name_ko;
      const ls = Array.isArray(s.properties.lines) ? s.properties.lines
        : (typeof s.properties.lines === 'string' ? (() => { try { return JSON.parse(s.properties.lines); } catch (e) { return []; } })() : []);
      for (const l of ls) {
        if (!onLine.has(l)) onLine.set(l, new Map());
        const m = onLine.get(l);
        m.set(n, (m.get(n) || []).concat(id));
      }
    });
    const resolveOn = (lid, n) => {
      const m = onLine.get(lid);
      if (!m) return null;
      const ids = m.get(n) || m.get(GTX_NAME_ALIAS[n]) || [];
      return ids.length === 1 ? ids[0] : null;
    };
    Object.entries(GTX_TIMES).forEach(([lid, seq]) => {
      if (activeIds && !activeIds.has(lid)) return;   // 데이터에 없는 노선만 건너뜀
      for (let i = 0; i < seq.length - 1; i++) {
        const a = resolveOn(lid, seq[i][0]), b = resolveOn(lid, seq[i + 1][0]);
        const min = seq[i][1];
        if (!a || !b || min == null) continue;
        // 공식 소요시간은 '표에 적힌 두 역 사이' 시간이다.
        // 그 사이에 역이 새로 끼어들었으면(예: GTX-B 청학) 그 구간은 공식값을 쓰면 안 된다.
        // 아니면 역을 건너뛰는 지름길이 생겨 경유역 목록과 소요시간이 어긋난다.
        if (hasStationBetween(lid, a, b)) continue;
        // 기하 기반 엣지가 같은 역 쌍에 이미 있으면 걷어낸다.
        // 남겨두면 다익스트라가 '직선거리÷110km/h' 로 계산한 더 짧은 값을 골라
        // 공식 소요시간이 무시된다 (광운대→삼성이 9분이 아니라 6분으로 나오던 원인).
        const strip = (from, to) => {
          const list = adj.get(from);
          if (!list) return;
          adj.set(from, list.filter(e => !(e.to === to && e.lineId === lid && e.officialMin == null)));
        };
        strip(a, b); strip(b, a);
        // 공식 시간 엣지 (기하 기반 엣지보다 우선)
        // distKm 을 0 으로 두면 '최소요금' 탐색에서 GTX 구간이 공짜가 되어
        // 요금 계산이 엉터리가 된다. 두 역 사이 직선거리라도 넣어둔다.
        const gkm = hav(
          stationsById.get(a).geometry.coordinates[0], stationsById.get(a).geometry.coordinates[1],
          stationsById.get(b).geometry.coordinates[0], stationsById.get(b).geometry.coordinates[1]);
        const edge = { to: b, lineId: lid, distKm: gkm, officialMin: min, open: !isUnopened(lid) };
        const rev = { to: a, lineId: lid, distKm: gkm, officialMin: min, open: !isUnopened(lid) };
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push(edge);
        adj.get(b).push(rev);
      }
    });
  }

  // GTX·고속 계통은 category 가 urban 이라 표의 속도(48km/h)를 쓰면
  // 일반철도(62km/h)보다 느려져 엉뚱한 우회 경로가 잡힌다. 따로 처리한다.
  function speedOf(lineId) {
    const own = LINE_SPEEDS[lineId];
    if (own) return own;
    const cat = lineCat.get(lineId);
    if (cat === 'ktx') return SPEEDS.ktx;
    if (/^gtx|great-train-express/.test(lineId || '')) return 110;
    return SPEEDS[cat] || 40;
  }

  function edgeMinutes(e) {
    if (e.walk) return e.distKm / WALK_KMH * 60 + 2;
    if (e.officialMin != null) return e.officialMin;  // GTX 공식 소요시간 우선
    // 도시·광역 전철(metro)은 역마다 서 있는 시간도 더한다 — 공식 구간(DWELL_MIN)과 같은 기준 (2026-11-11)
    const run = e.distKm / speedOf(e.lineId) * 60;
    return lineCat.get(e.lineId) === 'metro' ? run + DWELL_MIN : run;
  }

  // 이 노선에 '탈 때' 붙는 접근 시간. KTX 만 해당한다.
  // route-compare.js 가 같은 값을 쓰도록 노출한다 (두 탭의 소요시간이 갈라지면 안 된다).
  function accessMinutes(lineId) {
    if (lineId && EXPRESS[lineId]) return EXPRESS[lineId].accessMin;
    return lineId && lineCat.get(lineId) === 'ktx' ? RAIL_ACCESS_MIN : 0;
  }

  // 최소 힙 (다익스트라용)
  function heapPush(h, item) {
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  function heapPop(h) {
    const top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }

  // 상태 = (역, 현재 노선). 환승 비용을 탐색 '안에서' 지불해야
  // 반환된 경로가 실제로 보고하는 지표 기준 최적이 된다.
  const START = '\u0000start';
  const skey = (id, line) => id + '\u0001' + (line || '');

  // opts.transferPenalty : 탐색 비용에만 쓰는 환승 페널티. 주지 않으면
  // '그 역의 실제 도보 시간 + TRANSFER_DECISION_EXTRA' 를 쓴다. 표시되는
  // 소요시간도 같은 실제 도보 시간을 쓰므로, 고른 경로와 보여주는 시간이 맞는다.
  //
  // 왜 필요한가: 환승 3회 우회가 직통보다 2분 빠르다는 이유로 선택되면
  // 사용자 입장에서는 '더 나쁜 경로'다 (강남→원주: GTX-C+KTX 3회환승 49분
  // vs GTX-D 직통 0회환승 56분). 실제 여행자는 2분 때문에 3번 갈아타지 않는다.
  // 그래서 경로 선택에서만 환승을 비싸게 매기고, 표시 시간은 그대로 둔다.
  function findRoute(fromId, toId, opts) {
    if (!stationsById.has(fromId) || !stationsById.has(toId)) return null;
    if (fromId === toId) return { path: [fromId], legs: [], minutes: 0, transfers: 0 };
    const explicitPenalty = (opts && opts.transferPenalty != null) ? opts.transferPenalty : null;
    // openOnly: 지금 운행 중인 노선만 쓴다. '지금 vs 개통 후' 비교의 '지금' 쪽.
    const openOnly = !!(opts && opts.openOnly);

    const dist = new Map([[skey(fromId, START), 0]]);
    const prev = new Map();      // key -> {fromKey, fromId, edge}
    const pq = [];
    heapPush(pq, [0, fromId, START]);

    let endKey = null;
    while (pq.length) {
      const [d, u, line, k0] = heapPop(pq);
      const k = k0 || skey(u, line);
      if (d > (dist.get(k) ?? Infinity)) continue;   // 낡은 항목
      if (u === toId) { endKey = k; break; }
      const pu = prev.has(k) ? prev.get(k).fromId : null;   // 직전 역 (평면환승 방향)

      for (const e of (adj.get(u) || [])) {
        // 미개통 노선은 지금 탈 수 없다. 도보 환승은 언제나 열려 있다.
        if (openOnly && !e.open) continue;
        const nl = e.lineId || null;
        let cost = edgeMinutes(e);
        // 환승 비용: 앞뒤 모두 노선이 있고 서로 다를 때만. 환승은 지금 있는
        // 역(u)에서 일어난다. 역마다 실제 도보 시간이 다르므로 그 값을 쓴다.
        // transferPenalty 를 명시하면 예전처럼 '그 값을 그대로' 쓴다
        // (경로 비교 화면이 같은 잣대로 세 경로를 비교해야 하기 때문).
        if (line !== START && line !== null && nl !== null && !sameService(nl, line)) {
          cost += explicitPenalty != null
            ? explicitPenalty
            : transferMinutes(u, line, nl, pu, e.to) + TRANSFER_DECISION_EXTRA;
        }
        // KTX 로 새로 탈 때는 접근 시간이 든다. 탐색 비용에도 넣어야
        // '3.8km KTX' 같은 경로가 애초에 후보로 뽑히지 않는다.
        if (nl !== line) cost += accessMinutes(nl);
        cost += transferWait(nl, line, u, pu, e.to);
        const nk = stateKey(e.to, nl, u);
        const nd = d + cost;
        if (nd < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nd);
          prev.set(nk, { fromKey: k, fromId: u, edge: e });
          heapPush(pq, [nd, e.to, nl, nk]);
        }
      }
    }
    if (!endKey) return null;

    // 경로 복원
    const revPath = [toId], revEdges = [];
    let cur = endKey;
    const startKey = skey(fromId, START);
    while (cur !== startKey) {
      const p = prev.get(cur);
      revPath.push(p.fromId);
      revEdges.push(p.edge);
      cur = p.fromKey;
    }
    const path = revPath.reverse();
    const edges = revEdges.reverse();   // edges[i] : path[i] → path[i+1]

    // leg 분해 (노선 바뀌면 환승)
    const legs = [];
    let legStart = 0, curLine = edges[0] ? (edges[0].lineId || null) : null;
    let minutes = 0, legKm = 0;
    // 첫 구간부터 KTX 면 접근 시간을 붙인다
    minutes += accessMinutes(curLine);
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      minutes += edgeMinutes(e);
      const lid = e.lineId || null;
      if (lid !== curLine) {
        // 환승은 지금 역(path[i])에서 일어난다. 역·노선쌍마다 실제 도보
        // 시간이 다르므로 그 값을 표시 시간에 넣는다. transferAfter 는
        // '이 구간을 내린 뒤 갈아타는 데 걸리는 시간' 이다.
        const tm = (curLine !== null && lid !== null)
          ? transferMinutes(path[i], curLine, lid, path[i - 1], path[i + 1]) : 0;
        const wt = transferWait(lid, curLine, path[i], path[i - 1], path[i + 1]);
        legs.push({ lineId: curLine, from: path[legStart], to: path[i],
                    walk: curLine === null, distKm: legKm, transferAfter: tm, waitAfter: wt,
                    platform: !!(curLine && lid && isPlatformTransfer(path[i], curLine, lid, path[i - 1], path[i + 1])) });
        if (tm) minutes += tm;
        minutes += wt;
        minutes += accessMinutes(lid);
        legStart = i; curLine = lid; legKm = 0;
      }
      legKm += e.distKm;
    }
    legs.push({ lineId: curLine, from: path[legStart], to: path[path.length - 1],
                walk: curLine === null, distKm: legKm, transferAfter: 0 });

    // 각 leg 에 개통 상태를 실어 보낸다 → 화면에서 '미개통' 배지로 표시.
    const unopenedNames = [];
    legs.forEach(l => {
      if (!l.lineId) return;
      l.status = lineStatus.get(l.lineId) || 'open';
      l.unopened = isUnopened(l.lineId);
      if (l.unopened) unopenedNames.push(l.lineId);
    });

    const transfers = countTransfers(legs);

    return {
      path, legs,
      minutes: Math.round(minutes),
      transfers: Math.max(0, transfers),
      unopenedLines: Array.from(new Set(unopenedNames)),
    };
  }

  /* ---------- 한 역 → 모든 역 ----------
   * findRoute 는 한 쌍만 답한다. '도심까지 몇 분' 을 모든 역에 대해 구하려면
   * 1,246번 부르게 되므로, 한 번의 다익스트라로 전 역 시간을 뽑는다.
   *
   * 비용 규칙은 findRoute 와 '완전히 같다' — edgeMinutes + 환승 도보 + 접근시간.
   * 두 함수가 갈라지면 상세 패널의 '강남까지 34분' 과 길찾기의 34분이
   * 서로 다른 말을 하게 된다. 그래서 새 규칙을 만들지 않고 그대로 쓴다.
   *
   * 반환: Map<stationId, 분>. 도달 불가(지금은 미개통 노선만 있는 역 등)는 없다.
   */
  function allTimesFrom(fromId, opts) {
    const out = new Map();
    if (!stationsById.has(fromId)) return out;
    const openOnly = !!(opts && opts.openOnly);
    // opts.noWait: 기다리는 시간을 하나도 넣지 않는다 — 타고 가는 시간 + 환승 걷기만. 역 순위(도심 접근성)용
    // (2026-11-12 회장님 결정: 순위는 '타고 가는 시간' 기준, 배차는 역마다 공평하게 빼고 비교).
    const noWait = !!(opts && opts.noWait);
    const pfrom = new Map();   // 상태 → 직전 역 (평면환승 방향)
    // 두 값을 따로 들고 간다 (2026-11-11 고침).
    //  - 탐색 비용 d: 경로 '고르기' 용. 환승마다 TRANSFER_DECISION_EXTRA 를 더 얹는다 (findRoute 와 같음)
    //  - 표시 시간 m: 고른 경로의 실제 분. findRoute 의 minutes 와 같은 규칙
    // 예전에는 d 를 그대로 돌려줘서, 환승 1번마다 4분씩 길게 나왔다 — 역 상세 '강남까지 N분'(도심 접근성)이
    // 같은 두 역의 길찾기보다 4~8분 길었다 (용산→강남 30분 vs 길찾기 22분).
    const dist = new Map([[skey(fromId, START), 0]]);
    const disp = new Map([[skey(fromId, START), 0]]);
    const pq = [];
    heapPush(pq, [0, fromId, START]);
    const best = new Map();   // 역 → [탐색 비용, 표시 분]
    while (pq.length) {
      const [d, u, line, k0] = heapPop(pq);
      const k = k0 || skey(u, line);
      if (d > (dist.get(k) ?? Infinity)) continue;   // 낡은 항목
      const m = disp.get(k) || 0;
      const pu = pfrom.get(k) || null;
      const prev = best.get(u);
      if (prev == null || d < prev[0]) best.set(u, [d, m]);
      for (const e of (adj.get(u) || [])) {
        if (openOnly && !e.open) continue;
        const nl = e.lineId || null;
        let cost = edgeMinutes(e), shown = edgeMinutes(e);
        if (line !== START && line !== null && nl !== null && !sameService(nl, line)) {
          cost += transferMinutes(u, line, nl, pu, e.to) + TRANSFER_DECISION_EXTRA;
        }
        // 표시: findRoute 처럼 노선 id 가 바뀌면 그 역의 환승 도보 시간을 넣는다
        if (line !== START && line !== null && nl !== null && nl !== line) shown += transferMinutes(u, line, nl, pu, e.to);
        if (nl !== line) { cost += accessMinutes(nl); shown += accessMinutes(nl); }
        if (!noWait) { const w = transferWait(nl, line, u, pu, e.to); cost += w; shown += w; }   // 기다리는 시간 (findRoute 와 같음)
        const nk = stateKey(e.to, nl, u);
        const nd = d + cost;
        if (nd < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nd);
          disp.set(nk, m + shown);
          pfrom.set(nk, u);
          heapPush(pq, [nd, e.to, nl, nk]);
        }
      }
    }
    best.forEach((v, kk) => out.set(kk, Math.round(v[1])));
    return out;
  }

  // 이 노선이 미개통인지 (UI 에서 노선 범례·상세에 배지로 쓴다)
  function lineIsUnopened(lineId) { return isUnopened(lineId); }
  function statusOf(lineId) { return lineStatus.get(lineId) || 'open'; }

  // 경로의 실제 이동거리(km) — 역 사이 간선의 distKm 을 더한다.
  // 역 좌표끼리 직선거리를 더하면 곡선 구간에서 실제보다 짧게 나온다.
  function pathDistance(path) {
    let km = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const list = adj.get(path[i]) || [];
      let best = null;
      for (const e of list) {
        if (e.to !== path[i + 1]) continue;
        if (!best || e.distKm > best.distKm) best = e;   // 같은 쌍에 여러 노선이면 긴 쪽(보수적)
      }
      if (best) km += best.distKm;
    }
    return km;
  }

  return {
    buildGraph, findRoute, allTimesFrom, lineIsUnopened, statusOf, pathDistance,
    loadTransfers, transferMinutes, sameService, countTransfers,
    // route-compare.js 가 '같은 그래프'를 쓰도록 노출한다.
    // 예전에는 route-compare 가 그래프를 따로 만들었는데, 그쪽은 선형 조각을 이어붙여
    // 평탄화하는 바람에 GTX-D 분기(팔당 ↔ 삼성)에 없는 엣지가 생겼다.
    // 게다가 GTX 속도 보정(110km/h)이 빠져 두 탭의 소요시간이 서로 달랐다.
    adjacency: () => adj,
    stationById: (id) => stationsById.get(id),
    hasStation: (id) => stationsById.has(id),
    edgeMinutes,
    accessMinutes, extraLines, isPlatformTransfer,
    categoryOf: (lineId) => lineCat.get(lineId),
    TRANSFER_MIN,
    WALK_KMH,
  };
})();

