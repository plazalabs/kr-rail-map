#!/usr/bin/env python3
"""옛 참고선(옛 참고선) 자료 걷어내기 — 한 번 돌리는 정리 스크립트 (2026-11-10).

하는 일
-------
1. 계획 노선의 새 역 15곳: 옛 참고선 좌표 → 이름이 가리키는 곳(OpenStreetMap 지명) 좌표.
2. GTX-A 를 실제 운행 상태대로 나눈다.
     great-train-express-line-a : 운정중앙~서울역 · 수서~동탄 (운행 중)
     gtx-a-seoul-suseo          : 서울역~수서 (공사 중 — 2027년 상반기 전망)
     gtx-a-pyeongtaek           : 동탄~평택지제 (계획 — 설계 단계)
3. 서천화력선·금장삼각선 삭제 (OSM 에 선로가 없다 — 걷힌 노선).
4. 군산화물선 → 군산항선 (지금 선로 이름. 옛 군산화물선은 OSM 에 측선 1.1km 만 남았다).
5. 정차역 목록의 출처 표기에서 옛 참고선을 지운다 (목록은 정부·지자체 발표 기준으로 우리가 정리한 것).

선 모양은 이 스크립트가 아니라 build_own_alignments.py --apply 가 바꾼다. 이걸 먼저 돌린다.
다시 돌려도 결과가 같다.
"""
import json
import sys

from osm_align import ROOT
from own_align_config import PLANNED_STATION_COORDS

LINES = ROOT / "data" / "lines.geojson"
STATIONS = ROOT / "data" / "stations.geojson"

A = "great-train-express-line-a"
A_MID = "gtx-a-seoul-suseo"
A_EXT = "gtx-a-pyeongtaek"

STOPS_SOURCE = {
    A: "운행 중 구간 — 운영사·국토교통부 공개 자료 기준 자체 정리",
    "gtx-b": "국토교통부 실시계획·지자체 발표 기준 자체 정리 (청학은 인천시 추가 정거장, 2034년 목표)",
    "gtx-c": "국토교통부 실시계획·발표 기준 자체 정리",
    "gtx-d": "국토교통부 2024-01-25 발표(2기 GTX 구상) 기준 자체 정리 — 세부 정차역 미확정",
    "gtx-e": "국토교통부 2024-01-25 발표(2기 GTX 구상) 기준 자체 정리 — 세부 정차역 미확정",
    "gtx-f": "국토교통부 2024-01-25 발표(2기 GTX 구상) 기준 자체 정리 — 세부 정차역 미확정",
    "gtx-g": "경기도 2024-04 발표(GTX 플러스) 기준 자체 정리 — 세부 정차역 미확정",
    "gtx-h": "경기도 2024-04 발표(GTX 플러스) 기준 자체 정리 — 세부 정차역 미확정",
    "honam-line-ktx": "자체 정리 (KTX 호남선 정차역)",
}


def main():
    ln = json.loads(LINES.read_text("utf8"))
    st = json.loads(STATIONS.read_text("utf8"))
    log = []

    # 1) 계획 역 좌표
    for f in st["features"]:
        p = f["properties"]
        if "옛 참고선" in (p.get("coord_source") or "") or "옛 참고선" in (p.get("source") or ""):
            nm = p["name_ko"]
            if nm not in PLANNED_STATION_COORDS:
                raise SystemExit(f"좌표 표에 없는 역: {nm}")
            xy, desc = PLANNED_STATION_COORDS[nm]
            f["geometry"]["coordinates"] = [xy[0], xy[1]]
            p["source"] = "계획 발표 기준 자체 정리"
            p["coord_source"] = f"지명 위치: {desc} (OpenStreetMap) — 역 위치 미확정"
            log.append(f"역 좌표 {nm}")

    # 2) GTX-A 역 소속
    def station(name, lid):
        hit = [f for f in st["features"] if f["properties"]["name_ko"] == name and lid in f["properties"]["lines"]]
        if len(hit) != 1:
            raise SystemExit(f"{name}({lid}) 역을 하나로 못 정함: {len(hit)}")
        return hit[0]

    ext_ids = {f["properties"]["id"] for f in st["features"] if A_EXT in f["properties"]["lines"]}
    if not ext_ids:
        for nm in ("서울", "수서"):
            station(nm, A)["properties"]["lines"].append(A_MID)
        station("동탄", A)["properties"]["lines"].append(A_EXT)
        pj = station("평택지제", A)["properties"]
        pj["lines"] = [A_EXT if x == A else x for x in pj["lines"]]
        if pj.get("line_id") == A:
            pj["line_id"] = A_EXT
        log.append("GTX-A 역 소속 나눔")

    # 3) 노선
    feats = ln["features"]
    ids = [f["properties"]["id"] for f in feats]
    a = feats[ids.index(A)]
    ap = a["properties"]
    ap["stops"] = ["운정중앙", "킨텍스", "대곡", "연신내", "서울", "수서", "성남", "구성", "동탄"]

    def xy(name, lid):
        return station(name, lid)["geometry"]["coordinates"][:2]

    if A_MID not in ids:
        base = {"color": ap["color"], "category": ap["category"], "provisional": True,
                "plan_source": "국가·지자체 계획 발표", "operator": "-"}
        mid = {"type": "Feature", "properties": dict(
            id=A_MID, name_ko="GTX-A 서울역~수서", name_en="GTX-A Seoul–Suseo", status="construction",
            variants=1, note="", opened="2027년 상반기 전망 (삼성역 무정차 통과)",
            stops=["서울", "수서"], stops_source="국토교통부 발표 기준 자체 정리", **base),
            "geometry": {"type": "LineString", "coordinates": [xy("서울", A_MID), xy("수서", A_MID)]}}
        ext = {"type": "Feature", "properties": dict(
            id=A_EXT, name_ko="GTX-A 평택 연장", name_en="GTX-A Pyeongtaek extension", status="planned",
            variants=1, note="", opened="미정 (2028년 착공 구상)",
            stops=["동탄", "평택지제"], stops_source="국토교통부·평택시 발표 기준 자체 정리", **base),
            "geometry": {"type": "LineString", "coordinates": [xy("동탄", A_EXT), xy("평택지제", A_EXT)]}}
        i = ids.index(A)
        feats[i + 1:i + 1] = [mid, ext]
        log.append("GTX-A 미개통 2구간 추가")

    # OSM 에 선로가 없는 노선 — 걷힌 것으로 보고 지운다.
    #   서천화력선: 간치역 2020년 폐역 뒤 걷힘.  금장삼각선: 2021년 경주 구간 이설 때 없어짐.
    GONE = {"seocheon-hwaryeok-line": "서천화력선", "geumjang-triangle-line": "금장삼각선"}
    for f in feats:
        if f["properties"]["id"] in GONE:
            log.append(GONE[f["properties"]["id"]] + " 삭제")
    ln["features"] = feats = [f for f in feats if f["properties"]["id"] not in GONE]

    for f in feats:
        p = f["properties"]
        if p["id"] == "gunsan-cargo-line" and p["name_ko"] != "군산항선":
            p["name_ko"], p["name_en"] = "군산항선", "Gunsanhang Line"
            log.append("군산화물선 → 군산항선")
        if p["id"] in STOPS_SOURCE and p.get("stops_source") != STOPS_SOURCE[p["id"]]:
            p["stops_source"] = STOPS_SOURCE[p["id"]]
            log.append(f"정차역 출처 표기 {p['id']}")

    LINES.write_text(json.dumps(ln, ensure_ascii=False, separators=(",", ":")), "utf8")
    STATIONS.write_text(json.dumps(st, ensure_ascii=False, separators=(",", ":")), "utf8")
    print("\n".join(log) or "바뀐 것 없음")
    print(f"노선 {len(feats)} · 역 {len(st['features'])}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
