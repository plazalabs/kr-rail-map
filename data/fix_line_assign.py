"""공식 정차역 목록으로 확인된 '역↔노선' 오배정을 바로잡는다.

원인:
  data/fix_station_lines.py 가 노선 선형에서 80m 이내에 있는 역을 그 노선
  역으로 간주한다. 이 방식은 같은 선로를 쓰는 노선을 구분하지 못한다.
  그래서 서울~수색 구간의 경의중앙선 역들에 공항철도가 함께 붙었다.
  공항철도가 실제로 정차하지 않는 역인데도 그렇다.

  이 상태면 경로 탐색이 '대흥에서 공항철도를 타세요' 같은 답을 낸다.
  부동산으로 치면 '이 역은 공항철도 역세권' 이라는 잘못된 판단을 만든다.

정답지:
  국가철도공단 역위치 CSV(노선별 정차역 목록). 좌표는 6호선처럼 틀린 곳이
  있어 못 믿지만, **정차역 목록은 믿을 만하다**. 그래서 목록만 근거로 쓴다.

  주의: 괄호 부기 때문에 이름만 비교하면 오판한다. 예를 들어 공식 4호선은
  '숙대입구(갈월)' 인데 우리는 '숙대입구' 라서, 단순 비교로는 틀린 것으로
  보인다. 실제로는 맞다. 그래서 아래 목록은 이름 비교가 아니라 **공식
  목록을 직접 확인한 뒤** 손으로 확정한 것만 담았다.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIONS = ROOT / "data" / "stations.geojson"

# 공식 목록을 직접 확인해 확정한 오배정만 적는다. 추측은 넣지 않는다.
# (같은 역이 여러 노선에서 틀릴 수 있으므로 값은 리스트로 합쳐 적는다)
REMOVE = {
    # 공항철도 정차역은 14개뿐이다. 아래 8곳은 정차하지 않는다.
    "수색": ["arex"],
    "서강대": ["arex"],
    "가좌": ["arex"],
    "숙대입구": ["arex", "seoul-metropolitan-subway-line-1"],   # 4호선(숙대입구(갈월))이 맞다
    "효창공원앞": ["arex"],                                     # 6호선 + 경의중앙선이 맞다
    "대흥": ["arex", "gyeongui-jungang-line"],                  # 대흥은 6호선 단독역
    "송정": ["arex"],                                           # 5호선 송정
    "남영": ["arex", "seoul-metropolitan-subway-line-4"],       # 1호선 남영
    # 1호선 목록에 없는 역
    "천안아산": ["seoul-metropolitan-subway-line-1"],           # KTX 경부고속선 역
    # 5호선 목록에 없는 역
    "신답": ["seoul-subway-line-5"],                            # 2호선 성수지선
}


def main():
    doc = json.loads(STATIONS.read_text("utf-8"))
    changes = []
    for f in doc["features"]:
        p = f["properties"]
        name = p.get("name_ko")
        drop = set(REMOVE.get(name, []))
        if not drop:
            continue
        before = p.get("lines") or []
        after = [l for l in before if l not in drop]
        if after == before:
            continue
        p["lines"] = after
        changes.append((name, before, after))

    if not changes:
        print("바꿀 것이 없습니다 (이미 정리됨)")
        return 0

    STATIONS.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"{len(changes)}개 역의 노선 배정을 고쳤습니다\n")
    for name, before, after in changes:
        print(f"  {name}")
        print(f"    전: {before}")
        print(f"    후: {after}")

    # 공항철도 정차역이 14개가 됐는지 확인 — 이게 이 수정의 핵심 목적이다.
    arex = sorted(f["properties"]["name_ko"] for f in doc["features"]
                  if "arex" in (f["properties"].get("lines") or []))
    print(f"\n공항철도 정차역 {len(arex)}개: {', '.join(arex)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
