"""공식 역위치 CSV 로 '역 ↔ 노선' 배정이 맞는지 검사한다.

발견 경위:
  공항철도가 대흥·효창공원앞·서강대·남영·숙대입구·수색·가좌·송정에 붙어
  있었다. 실제로는 정차하지 않는 역들이다. 이 상태면 경로 탐색이
  '대흥에서 공항철도 타세요' 같은 답을 낸다.

  국가철도공단 역위치 CSV 는 노선별 정차역 목록을 그대로 담고 있으므로,
  이걸 정답지로 삼아 우리 배정을 검사할 수 있다. 공식 데이터의 좌표는
  6호선처럼 틀린 곳이 있어 못 믿지만, **정차역 목록은 믿을 만하다**.
"""
import csv
import glob
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GOV = ROOT / "data" / "_gov"

# 공식 '선명' → 우리 노선 id
LINE_MAP = {
    "1호선": "seoul-metropolitan-subway-line-1",
    "2호선": "seoul-subway-line-2",
    "3호선": "seoul-metro-line-3",
    "4호선": "seoul-metropolitan-subway-line-4",
    "5호선": "seoul-subway-line-5",
    "6호선": "seoul-subway-line-6",
    "7호선": "seoul-subway-line-7",
    "8호선": "seoul-subway-line-8",
    "9호선": "seoul-subway-line-9",
    "공항철도": "arex",
    "수인분당": "suin-bundang-line",
    "신분당선": "seoul-metropolitan-subway-shinbundang-line",
    "용인에버라인": "everline",
    "의정부": "uijeongbu-lrt",
    "우이신설": "ui-sinseol-line",
    "인천1호선": "incheon-subway-line-1",
    "인천2호선": "incheon-subway-line-2",
    "동해": "donghae-line",
    "자기부상": "incheon-airport-maglev-line-eastbound",
}


def norm(name):
    s = (name or "").strip()
    s = re.sub(r"\(.*?\)", "", s)
    for a, b in [("·", " "), ("ㆍ", " "), ("-", " "), (".", " "), (" ", "")]:
        s = s.replace(a, b)
    if s.endswith("역") and len(s) > 2:
        s = s[:-1]
    return s


def main():
    gov_by_line = {}
    for f in sorted(glob.glob(str(GOV / "*.csv"))):
        rd = list(csv.DictReader(pathlib.Path(f).read_text("utf-8").splitlines()))
        for r in rd:
            line = (r.get("선명") or "").strip()
            name = (r.get("역명") or "").strip()
            if line and name:
                gov_by_line.setdefault(line, set()).add(norm(name))

    st = json.loads((ROOT / "data" / "stations.geojson").read_text("utf-8"))["features"]
    ours_by_line = {}
    for f in st:
        p = f["properties"]
        for lid in (p.get("lines") or []):
            ours_by_line.setdefault(lid, {})[norm(p["name_ko"])] = p["name_ko"]

    print(f"{'노선':<26}{'공식':>6}{'우리':>6}{'공식에 없음':>10}")
    print("-" * 52)
    problems = []
    for gov_line, names in sorted(gov_by_line.items()):
        lid = LINE_MAP.get(gov_line)
        if not lid:
            continue
        ours = ours_by_line.get(lid, {})
        extra = sorted(ours[k] for k in ours if k not in names)
        print(f"{gov_line + ' → ' + lid:<26}{len(names):>6}{len(ours):>6}{len(extra):>10}")
        if extra:
            problems.append((gov_line, lid, extra, sorted(names - set(ours))))

    print("\n=== 공식 정차역 목록에 없는 역이 붙은 노선 ===")
    if not problems:
        print("  없음")
    for gov_line, lid, extra, missing in problems:
        print(f"\n[{gov_line}] 잘못 붙은 역 {len(extra)}개: {', '.join(extra)}")
        if missing:
            print(f"    반대로 빠진 역 {len(missing)}개: {', '.join(missing[:12])}"
                  + (" …" if len(missing) > 12 else ""))

    out = [{"line": g, "id": lid, "extra": e, "missing": m} for g, lid, e, m in problems]
    (ROOT / "data" / "_line_assign_check.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), "utf8")
    print(f"\n저장: data/_line_assign_check.json ({len(out)}개 노선 문제)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
