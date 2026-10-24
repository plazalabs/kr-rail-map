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
        if re.fullmatch(r"\d+가", t) and out:
            out[-1] += t
        else:
            out.append(t)
    return out


def split_addr(addr):
    """지번주소 → (시군구, 법정동). 못 찾으면 (None, None)."""
    toks = _norm(addr)
    if not toks:
        return None, None

    dong = None
    cut = len(toks)
    # 1) 번지 앞 토큰이 법정동
    for i, t in enumerate(toks):
        if BUNJI.match(t) and i > 0:
            cand = toks[i - 1]
            if cand.endswith(DONG_END) and cand not in NOT_DONG and not cand.endswith(ROAD_END):
                dong = cand
                cut = i
                break
    # 2) 번지가 없거나 앞 토큰이 도로명이면, 뒤에서부터 '동/읍/면/리' 를 찾는다
    if dong is None:
        for i in range(len(toks) - 1, -1, -1):
            t = toks[i]
            if t.endswith(DONG_END) and t not in NOT_DONG and not t.endswith(ROAD_END):
                dong = t
                cut = i
                break

    # 시군구: 법정동 앞에서 '구/시/군' 으로 끝나는 가장 가까운 토큰
    sgg = ""
    for j in range(cut - 1, -1, -1):
        if toks[j].endswith(("구", "시", "군")):
            sgg = toks[j]
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


def build():
    rows = []
    for f in sorted(glob.glob(str(ADDR / "주소_*.csv"))):
        rd = list(csv.DictReader(pathlib.Path(f).read_text("utf-8").splitlines()))
        for r in rd:
            name = (r.get("역명") or "").strip()
            jibun = (r.get("지번주소") or "").strip()
            if not name or not jibun:
                continue
            sgg, dong = split_addr(jibun)
            rows.append({
                "name": name,
                "line": (r.get("선명") or "").strip(),
                "sgg": sgg or "",
                "dong": dong or "",
                "jibun": jibun,
                "road": (r.get("도로명주소") or "").strip(),
            })

    total = len(rows)
    parsed = [r for r in rows if r["dong"]]
    print(f"주소 {total}행 중 법정동 파싱 성공 {len(parsed)} "
          f"({len(parsed) / total * 100:.1f}%)" if total else "주소 데이터 없음")
    bad = [r for r in rows if not r["dong"]]
    for r in bad[:8]:
        print(f"  파싱 실패: {r['name']:<10} {r['jibun']}")

    out = ROOT / "data" / "_station_dong.json"
    out.write_text(json.dumps(parsed, ensure_ascii=False, indent=1), "utf8")
    print(f"\n저장: {out.relative_to(ROOT)} ({len(parsed)}행)")

    # (시군구, 법정동) → 역 목록
    by_dong = {}
    for r in parsed:
        by_dong.setdefault((r["sgg"], r["dong"]), []).append(r["name"])
    print(f"법정동 {len(by_dong)}곳에 역이 배정됨")
    sample = list(by_dong.items())[:5]
    for (sgg, dong), names in sample:
        print(f"  {sgg} {dong}: {', '.join(names[:4])}")
    return 0


if __name__ == "__main__":
    if "--download" in sys.argv:
        download()
    sys.exit(build())
