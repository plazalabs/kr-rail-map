"""역 주소데이터로 '역 ↔ 법정동' 매핑을 만든다.

왜 필요한가:
  실거래가 API 는 좌표를 주지 않는다. 법정동명(역삼동)과 지번만 준다.
  지오코더 API 는 '저장장치에 저장 금지'라 좌표를 미리 계산해 넣을 수 없다.
  그런데 국가철도공단 주소데이터에는 역별 지번주소가 있다. 지번주소에
  법정동이 들어 있으므로, **지오코딩 없이** 역과 법정동을 이어붙일 수 있다.

  실거래가의 umdNm 은 법정동 이름만 오기 때문에, 같은 이름이 여러 구에
  있는 경우(신사동: 강남구/은평구)를 구분하려면 시군구도 같이 잡아야 한다.
  그래서 키를 (시군구, 법정동) 으로 만든다.
"""
import csv
import glob
import json
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
# 역위치 CSV 는 tests/official.test.js 의 정답지다. 주소 CSV 를 같은 폴더에
# 두면 그 테스트가 주소 CSV 까지 정답지로 읽어서, '1호선' 하나에 전국
# 1호선(서울·부산·대구·대전·광주)이 전부 섞인다. 실제로 그렇게 깨졌다.
# 그래서 주소 CSV 는 하위 폴더에 따로 둔다.
GOV = ROOT / "data" / "_gov"
ADDR = GOV / "addr"
INDEX = ADDR / "_addr_index.json"
RTMS = ROOT / "data" / "_rtms"
sys.path.insert(0, str(ROOT / "data"))
import lawd as LAWD  # noqa: E402
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")

# 주소에서 번지 토큰을 찾아 그 앞 토큰을 법정동으로 본다.
#   "서울특별시 금천구 가산동 468-4"      → 가산동
#   "경기도 안양시 만안구 석수동 101-16"  → 석수동
#   "노원구 월계동 85"                    → 월계동
BUNJI = re.compile(r"^(?:산)?\d+(?:-\d+)?$")
# 법정동이 아닌 접미사 — '동'으로 끝나도 법정동이 아닌 것들
NOT_DONG = {"시", "군", "구", "읍", "면", "리", "가"}
# 법정동 이름이 끝나는 글자. '가'는 종로1가·남대문로5가 같은 도심 법정동이다.
DONG_END = ("동", "읍", "면", "리", "가")
# 도로명 접미사 — 이걸 법정동으로 착각하면 안 된다
ROAD_END = ("대로", "로", "길")


def _norm(addr):
    """'쌍동리213-15' 처럼 붙어 있는 주소를 띄운다.

    실패하던 건들이 전부 이 문제였다. 다만 '산17'(산번지)은 붙여 둬야
    '산'이 법정동으로 잘못 잡히지 않는다.

    주의: 처음엔 정규식 lookbehind 로 '(?<!산)([가-힣])(\\d)' 를 썼는데,
    '도산동1023-3' 에서 '동' 앞 글자가 '산' 이라 분리가 안 됐다. 막아야
    하는 건 '산' 뒤에 숫자가 바로 오는 경우뿐이라, 매치된 글자가 '산' 인지만
    본다.
    """
    s = str(addr or "").strip()
    s = re.sub(r"([가-힣])(\d)",
               lambda m: m.group(0) if m.group(1) == "산" else m.group(1) + " " + m.group(2),
               s)
    # '383-1번지' 만 띄운다. 숫자+한글을 전부 띄우면 '한강로3가' 가
    # '한강로3 가' 로 쪼개져서 법정동을 잃는다. 실제로 그랬다.
    s = re.sub(r"(\d)(번지)", r"\1 \2", s)
    toks = s.split()
    # 원본에 '을지로 7가' 처럼 잘못 띄어진 주소가 있다. '숫자+가' 토큰은
    # 앞 토큰과 붙여야 법정동이 된다.
    out = []
    for t in toks:
        # '안양6동' 처럼 법정동 이름 자체에 숫자가 들어간다. 숫자+동/가 를
        # 앞 토큰과 붙이지 않으면 '6동' 이라는 없는 법정동이 생긴다.
        if re.fullmatch(r"\d+(동|읍|면|리|가)", t) and out:
            out[-1] += t
        else:
            out.append(t)
    return out


def split_addr(addr):
    """지번주소 → (시군구, 법정동). 못 찾으면 (None, None).

    법정동은 **'읍면 리' 형태로 돌려준다**('매송면 어천리'). 실거래가 API 가
    법정동을 그 형태로 주기 때문이다. 리 이름만 쓰면 '중리'처럼 같은
    시군구 안에 여러 번 나오는 이름이 하나로 합쳐진다.
    """
    toks = _norm(addr)
    if not toks:
        return None, None

    dong = None
    didx = None
    # 1) 번지 앞 토큰이 법정동
    for i, t in enumerate(toks):
        if BUNJI.match(t) and i > 0:
            cand = toks[i - 1]
            if cand.endswith(DONG_END) and cand not in NOT_DONG and not cand.endswith(ROAD_END):
                dong, didx = cand, i - 1
                break
    # 2) 번지가 없거나 앞 토큰이 도로명이면, 뒤에서부터 '동/읍/면/리' 를 찾는다
    if dong is None:
        for i in range(len(toks) - 1, -1, -1):
            t = toks[i]
            if t.endswith(DONG_END) and t not in NOT_DONG and not t.endswith(ROAD_END):
                dong, didx = t, i
                break

    # 리 앞에 읍·면이 있으면 붙인다. 실거래가는 '읍면 리' 로 주고, 리 이름만
    # 으로는 같은 시군구 안의 동명 리를 구분할 수 없다.
    if dong and dong.endswith("리") and didx and didx > 0:
        prev = toks[didx - 1]
        if prev.endswith(("읍", "면")):
            dong = prev + " " + dong
            didx -= 1

    # '안양6동' 은 행정동 이름이고 법정동은 '안양동' 이다. 실거래가는
    # 법정동을 주므로 숫자를 떼야 맞는다.
    if dong:
        dong = re.sub(r"\d+(?=동$)", "", dong)

    # 시군구: 법정동 앞에서 '구/시/군' 으로 끝나는 가장 가까운 토큰.
    # 시도('서울특별시')도 '시' 로 끝나므로 건너뛴다 — 안 그러면
    # '서울특별시 신촌동' 의 시군구가 '서울특별시' 가 된다.
    sgg = ""
    start = didx if didx is not None else len(toks)
    for j in range(start - 1, -1, -1):
        t = toks[j]
        if t.endswith(("도", "특별시", "광역시", "특별자치시")):
            continue
        if t.endswith(("구", "시", "군")):
            sgg = t
            break
    return sgg or None, dong


def download():
    if not INDEX.exists():
        raise SystemExit("data/_gov/addr/_addr_index.json 이 없습니다. 먼저 목록을 만들어야 합니다.")
    items = json.loads(INDEX.read_text("utf8"))
    ok = 0
    for it in items:
        safe = re.sub(r"[^\w가-힣]+", "_", it["title"]).strip("_")[:60]
        ADDR.mkdir(parents=True, exist_ok=True)
        path = ADDR / ("주소_" + safe + ".csv")
        if path.exists():
            continue
        url = ("https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId="
               f"{it['atch']}&fileDetailSn={it['sn']}&insertDataPrcus=N")
        ref = f"https://www.data.go.kr/data/{it['id']}/fileData.do"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ref})
            raw = urllib.request.urlopen(req, timeout=60).read()
        except Exception as e:              # noqa: BLE001
            print(f"  실패 {it['title'][:40]}: {type(e).__name__}")
            continue
        text = None
        for enc in ("euc-kr", "cp949", "utf-8-sig"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            print(f"  디코딩 실패 {it['title'][:40]}")
            continue
        path.write_text(text, encoding="utf-8")
        ok += 1
        time.sleep(0.3)
    print(f"새로 받은 파일 {ok}개")


def sido_of(jibun):
    """지번주소 → 시도. 주소가 '노원구 월계동 85' 처럼 시도 없이 시작해도
    두 번째 토큰까지 본다."""
    toks = _norm(jibun)
    for t in toks[:2]:
        sd = LAWD.norm_sido(t)
        if sd:
            return sd
    return None


def dong_index():
    """법정동 이름 → 그 법정동이 실제로 거래된 시군구 코드 집합.

    '경기도 고양시 백석동' 처럼 구가 빠진 주소가 있다. 백석동은 일산동구에만
    있으므로, 실거래가 응답에 나온 법정동 목록을 뒤지면 어느 구인지 알 수
    있다. 지도 경계를 따로 받을 필요가 없다.
    """
    idx = {}
    for f in glob.glob(str(RTMS / "*_*.json")):
        stem = pathlib.Path(f).stem
        code = stem.split("_")[0]
        if len(code) != 5 or not code.isdigit():
            continue
        try:
            recs = json.loads(pathlib.Path(f).read_text("utf8"))
        except (OSError, ValueError):
            continue
        if not isinstance(recs, list):
            continue
        for r in recs:
            d = r.get("umd")
            if not d:
                continue
            # '매송면 어천리' 는 그대로도, 리 이름만으로도 찾을 수 있게 둔다.
            # 여기서는 어느 시군구인지만 알면 되므로, 리 이름이 같은 시군구
            # 안에서 겹쳐도 문제가 되지 않는다.
            for k in (d, d.split()[-1]):
                idx.setdefault(k, set()).add(code)
    return idx


def resolve_lawd(sido, sgg, dong, index):
    """(시도, 시군구, 법정동) → 시군구 코드. 못 정하면 None."""
    code = LAWD.resolve(sido, sgg)
    if code:
        return code
    if not sgg and not dong:
        return None

    # 구가 빠진 주소: 같은 시(또는 같은 시도) 안에서 법정동으로 찾는다.
    cand = set(LAWD.CODE)
    if sgg:
        cand = {c for c in cand if LAWD.CODE[c][2] == sgg or LAWD.CODE[c][1] == sgg}
    if sido:
        cand = {c for c in cand if LAWD.CODE[c][0] == sido}
    if not cand or not dong:
        return None
    hits = cand & index.get(dong, set())
    if not hits and " " in dong:
        hits = cand & index.get(dong.split()[-1], set())
    # 둘 이상이면 포기한다. 억지로 하나를 고르면 엉뚱한 동네 시세가 붙는다.
    return hits.pop() if len(hits) == 1 else None


def parse(jibun):
    """주소 → (시도, 시군구, 법정동)."""
    sgg, dong = split_addr(jibun)
    return sido_of(jibun), sgg, dong


PAREN = re.compile(r"\s*\([^)]*\)\s*")


def build():
    index = dong_index()
    if not index:
        print("주의: 실거래가 캐시가 없다. 구가 빠진 주소는 코드를 못 붙인다.\n"
              "      python data/fetch_rtms.py --metro --from 202604 --to 202609")
    rows = []
    for f in sorted(glob.glob(str(ADDR / "주소_*.csv"))):
        rd = list(csv.DictReader(pathlib.Path(f).read_text("utf-8").splitlines()))
        for r in rd:
            name = (r.get("역명") or "").strip()
            jibun = (r.get("지번주소") or "").strip()
            road = (r.get("도로명주소") or "").strip()
            if not name or not jibun:
                continue
            sido, sgg, dong = parse(jibun)
            # 지번주소가 '서울특별시 신촌동 74-12' 처럼 구를 빼먹은 경우가
            # 있다. 도로명주소에는 구가 있어서, 모자란 것만 그쪽에서 채운다.
            if not (sido and sgg and dong):
                rsido, rsgg, rdong = parse(PAREN.sub(" ", road))
                sido = sido or rsido
                sgg = sgg or rsgg
                dong = dong or rdong
            code = resolve_lawd(sido, sgg, dong, index) if dong else None
            rows.append({
                "name": name,
                "line": (r.get("선명") or "").strip(),
                "sido": sido or "",
                "sgg": sgg or "",
                "lawd": code or "",
                "dong": dong or "",
                "jibun": jibun,
                "road": road,
            })

    total = len(rows)
    parsed = [r for r in rows if r["dong"]]
    print(f"주소 {total}행 중 법정동 파싱 성공 {len(parsed)} "
          f"({len(parsed) / total * 100:.1f}%)" if total else "주소 데이터 없음")
    bad = [r for r in rows if not r["dong"]]
    for r in bad[:8]:
        print(f"  파싱 실패: {r['name']:<10} {r['jibun']}")

    # 시군구 코드를 못 붙인 역은 시세를 붙일 수 없다. 조용히 넘어가면
    # '이 역은 원래 시세가 없다' 와 구분이 안 되므로 숫자로 남긴다.
    nocode = [r for r in parsed if not r["lawd"]]
    by_sido = {}
    for r in nocode:
        by_sido[r["sido"] or "(시도 불명)"] = by_sido.get(r["sido"] or "(시도 불명)", 0) + 1
    print(f"시군구 코드를 못 붙인 역 {len(nocode)}곳 "
          + (", ".join(f"{k} {v}" for k, v in sorted(by_sido.items())) if by_sido else ""))
    for r in nocode[:6]:
        print(f"  코드 없음: {r['name']:<10} {r['jibun']}")

    out = ROOT / "data" / "_station_dong.json"
    out.write_text(json.dumps(parsed, ensure_ascii=False, indent=1), "utf8")
    print(f"\n저장: {out.relative_to(ROOT)} ({len(parsed)}행)")

    # (시도, 시군구코드, 법정동) → 역 목록. 이름만 쓰면 '중구'가 섞인다.
    by_dong = {}
    for r in parsed:
        if not r["lawd"]:
            continue
        by_dong.setdefault((r["lawd"], r["dong"]), []).append(r["name"])
    print(f"법정동 {len(by_dong)}곳에 역이 배정됨")
    for (code, dong), names in list(by_dong.items())[:5]:
        sd, sg, _p = LAWD.CODE.get(code, ("", "", ""))
        print(f"  {sd} {sg} {dong}: {', '.join(names[:4])}")
    return 0


if __name__ == "__main__":
    if "--download" in sys.argv:
        download()
    sys.exit(build())
