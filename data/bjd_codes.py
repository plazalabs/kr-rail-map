"""법정동코드 전체자료 → (시군구, 동 이름) → 법정동 5자리.

왜 이 파일이 필요한가:
  주택인허가 API 는 bjdongCd 를 반드시 요구한다(시군구 코드만 주면 빈 응답).
  그런데 우리가 역 주소에서 아는 것은 **이름**뿐이다 — '종로1가', '부발읍 아리미'.
  지금까지는 K-apt 단지 목록에서 코드를 캐냈다. 단지가 있는 동만 코드를 알 수
  있어서, 역이 있는 376쌍 중 285쌍(76%)만 조회가 됐다. 종로1~6가·을지로1~7가처럼
  아파트가 없는 동네는 영원히 '자료 없음'으로 남았다.

  행정표준코드관리시스템(code.go.kr)이 법정동코드 전체자료를 공개한다.
  이걸 쓰면 367/376(97.6%)까지 올라간다.

원본 받는 법 (2026-11-01 실측):
  POST https://www.code.go.kr/etc/codeFullDown.do
    Referer: https://www.code.go.kr/stdcode/regCodeL.do
    body: codeseId=법정동코드&chkHigh=0&chkLow=0&chkSd=0&chkSgg=0&chkUmd=0&chkRi=0&chkJijuk=0
  → ZIP(413KB) 안에 '법정동코드 전체자료.txt' (cp949, 탭 구분 3열,
    법정동코드 / 법정동명 / 폐지여부, 53,403줄)

  data/_gov/bjd_codes.json 은 이 원본에서 **존재하는 법정동만** 뽑아
  {시군구5: {"읍면 리" 또는 "동": 법정동5}} 로 접은 것이다. 원본은 커밋하지 않는다.

  왜 마지막 낱말(리)이 아니라 전체 이름을 키로 쓰나:
    한 시군구 안에 같은 이름의 리가 여럿이다 — 순천시 승주읍 봉덕리와
    황전면 봉덕리. 마지막 낱말만 키로 쓰면 322줄이 조용히 덮여 사라진다.
    역이 그런 동을 쓰고 있지는 않지만(2026-11-01 확인), 사라지는 것보다
    '못 찾음'이 낫다.

  python data/bjd_codes.py --build [원본경로]   # json 다시 만들기
  python data/bjd_codes.py --check              # 커밋된 json 이 원본과 같은지
  python data/bjd_codes.py --selftest
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "_gov" / "bjd_codes.json"

# 원본 후보 — 레포 밖(audit/)에 두는 것을 기본으로 한다.
RAW = [
    ROOT / "data" / "_gov" / "bjd_full.zip",
    ROOT / "data" / "_gov" / "법정동코드 전체자료.txt",
    ROOT.parent / "audit" / "bjd_full.bin",
]

# 시군구가 쪼개지거나 이름이 바뀐 곳.
#   인천 서구(28275)가 2026년에 서해구(28275)+검단구(28290)로 갈라졌다.
#   역 주소는 아직 '인천광역시 서구 불로동' 이라 28275 로 들어오는데,
#   불로동은 이제 28290 에만 있다. 옛 코드로 조회하면 그 동이 안 나온다.
#   lawd.py 가 이 분구를 짐작만 하고 이름을 못 붙였는데, 전체자료로 확인됐다.
SGG_ALIASES = {
    "28275": ["28275", "28290"],
}

# 동 이름이 바뀌었거나, 원본 주소데이터에 오타가 있는 것.
#   개보동 → 개봉동 (국가철도공단 주소데이터 오타. 1호선 개봉역)
#   교하읍 야당리 → 야당동 (교하읍이 동으로 승격. 경의중앙선 운정역)
DONG_ALIASES = {
    ("11530", "개보동"): "개봉동",
    ("41480", "야당리"): "야당동",
}

_cache = None


def last_token(dong):
    """'부발읍 아리미' → '아리미'."""
    parts = (dong or "").split()
    return parts[-1] if parts else ""


def is_umd(token):
    return bool(token) and token[-1] in ("읍", "면")


def parse(text):
    """원본 텍스트(cp949 로 읽은 것) → {시군구5: {"읍면 리" 또는 "동": 법정동5}}.

    시도(1100000000)·시군구(1111000000) 줄은 법정동이 아니라서 버린다.
    폐지된 코드도 버린다 — 지금 조회해야 하는 것은 살아있는 동이다.

    이름에서 시군구 접두사를 **글자 그대로 걷어낸다.** 낱말 수로 자르면
    세종특별자치시에서 틀린다 — 세종은 구가 없어서 '세종특별자치시 연서면
    용암리' 가 3낱말이라, 앞 두 낱말을 버리면 읍/면 이름이 사라지고
    같은 이름의 리끼리 덮인다(2026-11-01 실측: 5건).
    """
    rows = []
    sgg_name = {}
    for line in text.splitlines()[1:]:
        p = line.split("\t")
        if len(p) < 3:
            continue
        code, name, alive = p[0].strip(), p[1].strip(), p[2].strip()
        if alive != "존재" or len(code) != 10 or not code.isdigit():
            continue
        if code[5:] == "00000":      # 시군구까지 — 접두사로만 쓴다
            sgg_name[code[:5]] = name
            continue
        rows.append((code, name))

    out = {}
    for code, name in rows:
        prefix = sgg_name.get(code[:5], "")
        full = name[len(prefix):].strip() if prefix and name.startswith(prefix) else name
        if not full:
            continue
        out.setdefault(code[:5], {})[full] = code[5:]
    return {k: dict(sorted(v.items())) for k, v in sorted(out.items())}


def read_raw(path=None):
    """원본을 찾아 텍스트로 읽는다. ZIP 이면 안에서 꺼낸다."""
    import zipfile
    cands = [pathlib.Path(path)] if path else RAW
    for p in cands:
        if not p.exists():
            continue
        if p.suffix.lower() in (".zip", ".bin"):
            with zipfile.ZipFile(p) as z:
                return z.read(z.namelist()[0]).decode("cp949")
        raw = p.read_bytes()
        for enc in ("cp949", "utf-8"):
            try:
                return raw.decode(enc)
            except UnicodeDecodeError:
                continue
    raise SystemExit("법정동코드 원본을 찾지 못했다. --build <경로> 로 지정하라.")


def build(path=None):
    table = parse(read_raw(path))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":")),
                   "utf8")
    return table


def load():
    global _cache
    if _cache is None:
        if not OUT.exists():
            return {}
        _cache = json.loads(OUT.read_text("utf8"))
    return _cache


def code_for(lawd, dong, table=None):
    """(시군구 5자리, 동 이름) → 법정동 10자리 코드. 못 찾으면 None.

    **돌려주는 코드의 앞 5자리가 들어온 lawd 와 다를 수 있다.** 인천 서구처럼
    분구된 곳은 옛 시군구로 물어도 지금 코드를 돌려준다. 조회할 때는 반드시
    이 반환값을 써야 한다(들어온 lawd 를 그대로 쓰면 없는 동을 조회한다).

    동 이름이 시군구 안에서 유일하지 않으면 None 을 준다. 아무거나 집어서
    돌려주면 남의 동네 인허가가 그 역에 붙는다 — 그게 더 큰 거짓말이다.
    """
    t = load() if table is None else table
    tok = last_token(dong)
    if not tok:
        return None
    tok = DONG_ALIASES.get((lawd, tok), tok)
    # 별칭이 통째로 이름을 바꾼 경우(야당리→야당동)는 읍/면 낱말을 버린다.
    if tok != last_token(dong):
        full = tok
    else:
        full = " ".join((dong or "").split())

    for sgg in SGG_ALIASES.get(lawd, [lawd]):
        sub = t.get(sgg) or {}
        if full in sub:
            return sgg + sub[full]
        # 동 이름만 적힌 역('역동')과 '읍 리'로 적힌 역을 모두 받는다.
        hits = [v for k, v in sub.items() if k.split()[-1] == tok]
        if len(hits) == 1:
            return sgg + hits[0]
        if len(hits) > 1:
            return None              # 같은 이름이 여럿 — 고르지 않는다
    return None


def umd_codes(lawd, dong, table=None):
    """역이 '부발읍' 처럼 읍/면까지만 알 때 → 그 읍/면 안의 모든 법정동 코드.

    읍/면 자체는 법정동이 아니다(리 하나하나가 법정동이다). 그래서 이름으로
    한 개를 못 찾는다. 이때는 그 읍/면 아래 리를 전부 조회해야 한다 —
    주택인허가가 '부발읍 아리미' 로 들어오기 때문이다.
    """
    t = load() if table is None else table
    parts = (dong or "").split()
    if not parts or not is_umd(parts[0]):
        return []
    umd = parts[0]
    out = []
    for sgg in SGG_ALIASES.get(lawd, [lawd]):
        for name, b in (t.get(sgg) or {}).items():
            if name == umd or name.startswith(umd + " "):
                out.append(sgg + b)
    return out


# ---------------------------------------------------------------- 자체 점검

def selftest():
    ok = fail = 0
    bad = []

    def chk(name, cond, detail=""):
        nonlocal ok, fail
        if cond:
            ok += 1
        else:
            fail += 1
            bad.append(name + (("  (" + str(detail) + ")") if detail else ""))

    sample = "\n".join([
        "법정동코드\t법정동명\t폐지여부",
        "1100000000\t서울특별시\t존재",
        "1111000000\t서울특별시 종로구\t존재",
        "1111010100\t서울특별시 종로구 청운동\t존재",
        "1111010200\t서울특별시 종로구 신교동\t존재",
        "1111010300\t서울특별시 종로구 사직동\t폐지",
        "2829000000\t인천광역시 검단구\t존재",
        "2829011000\t인천광역시 검단구 불로동\t존재",
        "4150000000\t경기도 이천시\t존재",
        "4150031021\t경기도 이천시 부발읍 아리미\t존재",
        "4150032021\t경기도 이천시 장호원읍 아리미\t존재",
        # 구가 없는 시 — 낱말 수로 이름을 자르면 여기서 틀린다
        "3611000000\t세종특별자치시\t존재",
        "3611010100\t세종특별자치시 반곡동\t존재",
        "3611035033\t세종특별자치시 연서면 용암리\t존재",
        "3611036025\t세종특별자치시 조치원읍 용암리\t존재",
    ])
    t = parse(sample)

    chk("시도 줄은 법정동이 아니다", "00000" not in t.get("11", {}))
    chk("시군구 줄은 버린다", t.get("11110") and len(t["11110"]) == 2, t.get("11110"))
    chk("법정동을 이름으로 찾는다", t["11110"]["청운동"] == "10100")
    chk("폐지된 동은 넣지 않는다", "사직동" not in t["11110"])
    chk("'읍 리' 전체 이름을 키로 쓴다", t["41500"].get("부발읍 아리미") == "31021",
        t.get("41500"))
    chk("같은 이름의 리를 잃지 않는다", len(t["41500"]) == 2, t.get("41500"))
    chk("구가 없는 시도 접두사를 걷어낸다", t["36110"].get("반곡동") == "10100",
        t.get("36110"))
    chk("세종의 읍/면 이름을 살린다",
        t["36110"].get("연서면 용암리") == "35033", t.get("36110"))

    # --- code_for
    chk("코드를 붙여 돌려준다", code_for("11110", "청운동", t) == "1111010100")
    chk("없는 동은 None", code_for("11110", "없는동", t) is None)
    chk("빈 이름은 None", code_for("11110", "", t) is None)
    chk("'읍 리' 로 찾는다", code_for("41500", "부발읍 아리미", t) == "4150031021")
    chk("같은 이름이 여럿이면 고르지 않는다", code_for("41500", "아리미", t) is None,
        code_for("41500", "아리미", t))

    # --- 분구된 시군구: 옛 코드로 물어도 지금 코드를 준다
    chk("옛 시군구 코드를 따라간다", code_for("28275", "불로동", t) == "2829011000",
        code_for("28275", "불로동", t))
    chk("돌려준 코드의 시군구가 바뀐다", code_for("28275", "불로동", t)[:5] == "28290")

    # --- 오타/개칭
    chk("오타를 고친다",
        code_for("11530", "개보동", {"11530": {"개봉동": "10700"}}) == "1153010700")
    chk("옛 이름을 지금 이름으로",
        code_for("41480", "교하읍 야당리", {"41480": {"야당동": "10800"}}) == "4148010800")

    # --- 읍/면 확장
    chk("읍/면인지 본다", is_umd("부발읍") and is_umd("월롱면") and not is_umd("역동"))
    chk("마지막 낱말", last_token("문산읍 문산리") == "문산리" and last_token("") == "")
    chk("읍 하나로 그 안의 리를 모두 준다",
        sorted(umd_codes("41500", "부발읍", t)) == ["4150031021"], umd_codes("41500", "부발읍", t))
    chk("읍이 아니면 빈 목록", umd_codes("41500", "아리미", t) == [])

    print("bjd_codes: %d 통과 / %d 실패" % (ok, fail))
    for b in bad:
        print("  ✗", b)
    return fail == 0


def main():
    args = sys.argv[1:]
    if "--selftest" in args:
        sys.exit(0 if selftest() else 1)
    if "--build" in args:
        path = None
        i = args.index("--build")
        if len(args) > i + 1 and not args[i + 1].startswith("-"):
            path = args[i + 1]
        t = build(path)
        print("법정동 %d곳 · 시군구 %d곳 → %s"
              % (sum(len(v) for v in t.values()), len(t), OUT.relative_to(ROOT)))
        sys.exit(0)
    if "--check" in args:
        old = load()
        new = parse(read_raw())
        if old == new:
            print("커밋된 법정동코드표가 원본과 같다 (%d곳)"
                  % sum(len(v) for v in old.values()))
            sys.exit(0)
        print("커밋된 표가 원본과 다르다. --build 로 다시 만들라.")
        sys.exit(1)
    print(__doc__)


if __name__ == "__main__":
    main()
