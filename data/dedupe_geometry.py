#!/usr/bin/env python3
"""노선 선형 중복 조각 제거.

OSM route relation 을 병합하는 과정에서 같은 구간이 양방향/다른 변형으로
두 번 들어간 경우가 있다(예: 2호선 순환선이 정방향·역방향으로 두 번).
그대로 두면 노선 연장이 2배로 계산되고 역 순서도 뒤섞인다.

같은 길이(±1.5%) + 같은 경계상자(±0.002°)를 가진 조각을 중복으로 보고
하나만 남긴다.

사용: cd data && python3 dedupe_geometry.py
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TOL_LEN = 0.015
TOL_BOX = 0.002


def hav(a, b):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = (math.sin((lat2 - lat1) / 2) ** 2 +
         math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def plen(p):
    return sum(hav(p[i], p[i + 1]) for i in range(len(p) - 1))


def bbox(p):
    xs = [c[0] for c in p]
    ys = [c[1] for c in p]
    return (min(xs), min(ys), max(xs), max(ys))


def same(a, b):
    if abs(a[0] - b[0]) > max(a[0], b[0]) * TOL_LEN + 0.05:
        return False
    return all(abs(a[1][i] - b[1][i]) <= TOL_BOX for i in range(4))


def main():
    path = os.path.join(HERE, "lines.geojson")
    lines = json.load(open(path, encoding="utf-8"))
    total_before = total_after = 0.0
    dropped = 0
    report = []

    for f in lines["features"]:
        g = f["geometry"]
        parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        parts = [p for p in parts if len(p) >= 2]
        before = sum(plen(p) for p in parts)
        total_before += before
        if len(parts) <= 1:
            total_after += before
            continue

        sig = sorted(((plen(p), bbox(p), i) for i, p in enumerate(parts)),
                     key=lambda t: -t[0])
        keep = []
        for ln, bx, i in sig:
            dup = any(same((ln, bx), (plen(parts[k]), bbox(parts[k]))) for k in keep)
            if not dup:
                keep.append(i)
        keep.sort()
        dropped += len(parts) - len(keep)
        after = sum(plen(parts[i]) for i in keep)
        total_after += after
        if len(keep) != len(parts):
            report.append((f["properties"]["name_ko"], len(parts), len(keep),
                           round(before, 1), round(after, 1)))

        coords = [parts[i] for i in keep]
        if len(coords) == 1:
            f["geometry"] = {"type": "LineString", "coordinates": coords[0]}
        else:
            f["geometry"] = {"type": "MultiLineString", "coordinates": coords}

    with open(path, "w", encoding="utf-8") as fp:
        json.dump(lines, fp, ensure_ascii=False, separators=(",", ":"))

    print(f"중복 조각 {dropped}개 제거")
    print(f"총 연장 {total_before:.1f}km → {total_after:.1f}km")
    for name, b, a, kmb, kma in report[:20]:
        print(f"  - {name}: {b}조각 → {a}조각, {kmb}km → {kma}km")


if __name__ == "__main__":
    main()
