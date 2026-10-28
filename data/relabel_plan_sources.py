"""미래철도DB 흔적을 데이터에서 걷어내고, 계획 노선은 '임시' 로 표시한다.

배경
----
노선·역 목록을 만들 때 미래철도DB(FRDB)를 참고했다. 그 사이트는 스스로
"비영리, 비상업, 개인 사이트" 라고 밝히고 이용허락 표시가 없다. 유료화를
앞두고는 출처로 쓸 수 없다.

지금 목록은 OSM(ODbL)과 공공데이터포털 역위치 CSV(이용허락 제한 없음)로
다시 확인했다 — `data/build_membership.py` 가 그 증빙을 남긴다. 확인되지 않은
것은 `data/line-membership.json` 의 unconfirmed 에 이름으로 남는다.

이 스크립트가 하는 일
--------------------
1. `frdb_*` 속성을 전부 지운다. 배포 데이터에 남아 있으면 '그 자료에서
   가져왔다' 는 표시가 되어, 출처를 바꾼다는 뜻이 무색해진다.
2. 개통 전 노선에는 `provisional: true` 와 `plan_source` 를 붙인다.
   개통 전 노선의 역명은 계획 발표 기준이고 확정이 아니다. 그 사실을
   데이터에 값으로 남겨야 화면에서도 숨기지 않을 수 있다.

재실행해도 결과가 같다 (idempotent).

사용
----
    python data/relabel_plan_sources.py            # 미리보기
    python data/relabel_plan_sources.py --apply    # 저장
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
LINES = ROOT / "lines.geojson"
STATIONS = ROOT / "stations.geojson"

PLAN_SOURCE = "국가·지자체 계획 발표"


def strip(props):
    """frdb_ 로 시작하는 키를 지운다. 지운 키 목록을 돌려준다."""
    gone = [k for k in props if k.startswith("frdb_")]
    for k in gone:
        del props[k]
    return gone


def main():
    apply = "--apply" in sys.argv
    lines = json.loads(LINES.read_text("utf8"))
    stations = json.loads(STATIONS.read_text("utf8"))

    n_line = n_station = 0
    gone_keys = set()
    for f in lines["features"]:
        p = f["properties"]
        gone = strip(p)
        if gone:
            n_line += 1
            gone_keys.update(gone)
        if p.get("status") and p["status"] != "open":
            p["provisional"] = True
            p["plan_source"] = PLAN_SOURCE

    for f in stations["features"]:
        p = f["properties"]
        gone = strip(p)
        if gone:
            n_station += 1
            gone_keys.update(gone)

    print(f"frdb_* 속성을 지운 노선 {n_line}개 · 역 {n_station}개")
    print(f"  지운 키: {', '.join(sorted(gone_keys))}")
    prov = [f["properties"]["id"] for f in lines["features"]
            if f["properties"].get("provisional")]
    print(f"  provisional 표시한 노선 {len(prov)}개: {', '.join(prov)}")

    if not apply:
        print("\n미리보기만 했다. 저장하려면 --apply")
        return
    LINES.write_text(json.dumps(lines, ensure_ascii=False, separators=(",", ":")), "utf8")
    STATIONS.write_text(json.dumps(stations, ensure_ascii=False, separators=(",", ":")), "utf8")
    print(f"\n저장: {LINES.name} {LINES.stat().st_size // 1024}KB · "
          f"{STATIONS.name} {STATIONS.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
