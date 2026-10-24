"""역 개명·부기를 검색 별칭으로 붙인다.

왜 필요한가:
  공식 자료는 개명된 역을 '불암산(당고개)' 처럼 괄호 부기로 적는다.
  우리 지도는 '불암산' 하나만 쓰기 때문에, 예전 이름인 '당고개' 로 검색하면
  결과가 안 나오거나(더 나쁘게는) 엉뚱한 역이 나온다. 실제로 '당고개' 를
  검색하면 신림선 '당곡' 이 나왔다 — 4호선 종점을 찾으려는 사람에게는
  틀린 답이다. 없음보다 틀림이 나쁘다.

어떻게 뽑는가:
  국가철도공단 역위치 CSV 의 역명에서 'A(B)' 꼴을 찾아,
  우리 데이터에 'A' 나 'B' 중 하나가 있으면 **나머지 하나를 별칭으로** 넣는다.
  추측으로 만들지 않고 공식 표기를 근거로만 만든다.

  이미 별칭이 있는 역은 건드리지 않는다 (사람이 넣은 값을 덮어쓰지 않는다).
"""
import csv
import glob
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GOV = ROOT / "data" / "_gov"
STATIONS = ROOT / "data" / "stations.geojson"

PAREN = re.compile(r"^(?P<main>.+?)\((?P<sub>[^)]+)\)$")


def official_names():
    """공식 역명 집합. 'A(B)' 형태를 그대로 모은다."""
    out = set()
    for f in glob.glob(str(GOV / "*역위치*.csv")):
        try:
            rows = list(csv.DictReader(io.open(f, encoding="utf-8-sig")))
        except Exception:                       # noqa: BLE001
            continue
        for r in rows:
            nm = (r.get("역명") or "").strip()
            if nm:
                out.add(nm)
    return out


def main(dry=True):
    data = json.loads(STATIONS.read_text("utf8"))
    feats = data["features"]

    ours = {}
    for f in feats:
        n = f["properties"].get("name_ko")
        if n:
            ours.setdefault(n, f)

    additions = {}
    for off in official_names():
        m = PAREN.match(off)
        if not m:
            continue
        main_name, sub = m.group("main").strip(), m.group("sub").strip()
        # '서울(경의중앙선)' 처럼 노선명이 괄호에 오는 경우가 있다.
        # 역명처럼 생기지 않은 것은 건너뛴다.
        if any(k in sub for k in ("선", "호선")) and not sub.endswith("역"):
            continue
        if main_name in ours and sub not in ours:
            additions.setdefault(main_name, set()).add(sub)
        elif sub in ours and main_name not in ours:
            additions.setdefault(sub, set()).add(main_name)

    changed = 0
    for name, al in sorted(additions.items()):
        f = ours.get(name)
        if not f:
            continue
        cur = list(f["properties"].get("aliases") or [])
        if cur:
            print(f"  건너뜀(이미 별칭 있음) {name}: {cur}")
            continue
        new = sorted(a for a in al if a != name)
        if not new:
            continue
        f["properties"]["aliases"] = new
        changed += 1
        print(f"  {name} ← {', '.join(new)}")

    print(f"\n별칭 {changed}곳 " + ("(미리보기 — 저장 안 함)" if dry else "저장"))
    if changed and not dry:
        STATIONS.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf8")
        print(f"저장: {STATIONS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(dry="--write" not in sys.argv))
