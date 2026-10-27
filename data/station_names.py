"""공식 주소데이터의 역 이름을 지도 이름으로 바꾼다.

두 자료는 같은 역을 다르게 부른다.

  공식 주소데이터        지도(stations.geojson)
  서울역                 서울
  김포공항역              김포공항
  총신대입구              이수          (2024년 개명, 옛 이름이 별칭으로 남아 있음)
  잠실(송파구청)          잠실

이걸 안 맞추면 시세가 통째로 사라진다. 실제로 그랬다 — 서울역과 이수역은
이름이 어긋나서 역 패널에 시세 섹션이 아예 안 떴고, 그 사실을 아무도
몰랐다. 데이터가 없어서가 아니라 이름이 달라서 없었다.

규칙은 세 단계다. 세게 추측하지 않는다.
  1) 괄호 부기를 뗀 이름이 지도에 있으면 그걸 쓴다.
  2) 끝의 '역' 을 떼 본다. ('서울역' → '서울')
  3) 지도 데이터의 별칭 목록에서 찾는다. ('총신대입구' → '이수')
셋 다 아니면 None. 억지로 붙이면 엉뚱한 동네 시세가 붙는다.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIONS = ROOT / "data" / "stations.geojson"

_cache = None


def _norm(name):
    return re.sub(r"\s*\(.*?\)\s*", "", str(name or "")).strip()


def load():
    """지도 이름 집합과 별칭→정식이름 표를 만든다. 한 번만 읽는다."""
    global _cache
    if _cache is not None:
        return _cache
    data = json.loads(STATIONS.read_text("utf8"))
    names = set()
    alias = {}
    for f in data["features"]:
        p = f.get("properties") or {}
        n = p.get("name_ko")
        if not n:
            continue
        names.add(n)
        for a in p.get("aliases") or []:
            # 정식 이름이 우선이다. 별칭이 다른 역의 정식 이름과 겹치면
            # (개명 전 이름을 다른 역이 쓰는 경우) 정식 이름을 남긴다.
            alias.setdefault(a, n)
    for a in list(alias):
        if a in names:
            alias.pop(a, None)
    _cache = (names, alias)
    return _cache


def resolve(name):
    """공식 이름 → 지도 이름. 못 찾으면 None."""
    if not name:
        return None
    names, alias = load()
    n = str(name).strip()
    for cand in (n, _norm(n)):
        if cand in names:
            return cand
    base = _norm(n)
    if base.endswith("역") and len(base) > 1:
        cut = base[:-1]
        if cut in names:
            return cut
    if base in alias:
        return alias[base]
    if n in alias:
        return alias[n]
    return None


def resolve_all(name):
    """한 이름이 가리킬 수 있는 지도 이름을 전부 돌려준다.

    왜 하나로 안 끝나는가: 지도 데이터에 같은 역이 두 이름으로 들어 있는
    경우가 있다. 이수역은 '이수' 와 '총신대입구(이수)' 로 두 번 들어 있고
    148m 떨어져 있다. 하나만 고르면 나머지 한쪽은 시세가 안 뜬다.

    역을 지우는 대신 양쪽에 같은 값을 붙인다. 지우는 건 되돌릴 수 없고,
    이 함수의 일은 '이름을 잇는 것' 이지 '데이터를 고치는 것' 이 아니다.
    """
    out = set()
    one = resolve(name)
    if one:
        out.add(one)
    if not name:
        return out
    n = str(name).strip()
    base = _norm(n)
    names, alias = load()
    # 괄호 안 이름도 후보로 본다 — '총신대입구(이수)' 의 '이수' 처럼
    # 괄호 쪽이 지도 이름인 경우가 있다.
    for m in re.findall(r"\(([^)]+)\)", n):
        cand = m.strip()
        if cand in names:
            out.add(cand)
        elif cand in alias:
            out.add(alias[cand])
    if base in names:
        out.add(base)
    if base.endswith("역") and base[:-1] in names:
        out.add(base[:-1])
    if base in alias:
        out.add(alias[base])
    return out


if __name__ == "__main__":
    # 자체 점검 — 이름 해석이 깨지면 시세가 조용히 사라진다.
    cases = [
        ("서울역", "서울"),
        ("김포공항역", "김포공항"),
        ("총신대입구", "이수"),
        ("잠실(송파구청)", "잠실"),
        ("강남", "강남"),
        ("없는역이름", None),
    ]
    bad = 0
    for src, want in cases:
        got = resolve(src)
        ok = got == want
        print(("  ✓ " if ok else "  ✗ ") + src + " → " + str(got) + ("" if ok else " (기대 " + str(want) + ")"))
        bad += 0 if ok else 1

    # 한 이름이 여러 지도 이름을 가리키는 경우 — 이수역은 지도에 두 번 있다.
    multi = [
        ("총신대입구(이수)", {"이수", "총신대입구(이수)"}),
        ("강남", {"강남"}),
    ]
    for src, want in multi:
        got = resolve_all(src)
        ok = got == want
        print(("  ✓ " if ok else "  ✗ ") + src + " → " + str(sorted(got)))
        bad += 0 if ok else 1

    names, alias = load()
    print("지도 이름 %d개 · 별칭 %d개" % (len(names), len(alias)))
    print("실패 %d" % bad)
    raise SystemExit(1 if bad else 0)
