#!/usr/bin/env python3
"""산출물 검증: 스키마 준수, 유명역 스팟체크, 폴백/미귀속 샘플."""
import json

lines = json.load(open("lines.geojson"))["features"]
sts = json.load(open("stations.geojson"))["features"]

# 1. 스키마 검사
lkeys = {"id", "name_ko", "name_en", "color", "category", "status"}
skeys = {"id", "name_ko", "name_en", "line_id", "lines"}
bad_l = [f["properties"]["id"] for f in lines
         if set(f["properties"].keys()) != lkeys
         or f["geometry"]["type"] not in ("LineString", "MultiLineString")]
bad_s = [s["properties"]["id"] for s in sts
         if set(s["properties"].keys()) != skeys
         or s["geometry"]["type"] != "Point"
         or len(s["geometry"]["coordinates"]) != 2]
print(f"lines={len(lines)} schema_violations={len(bad_l)}")
print(f"stations={len(sts)} schema_violations={len(bad_s)}")
import re
bad_id = [f["properties"]["id"] for f in lines
          if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", f["properties"]["id"])]
print("non-urlsafe line ids:", bad_id[:10], "count:", len(bad_id))
bad_color = [(f["properties"]["id"], f["properties"]["color"]) for f in lines
             if f["properties"]["color"] and not re.fullmatch(r"#[0-9A-F]{6}", f["properties"]["color"])]
print("bad colors:", bad_color[:10], "count:", len(bad_color))
from collections import Counter
print("category:", dict(Counter(f["properties"]["category"] for f in lines)))
print("status:", dict(Counter(f["properties"]["status"] for f in lines)))
line_ids = {f["properties"]["id"] for f in lines}
dangling = [(s["properties"]["id"], s["properties"]["line_id"]) for s in sts
            if s["properties"]["line_id"] and s["properties"]["line_id"] not in line_ids]
print("dangling line refs:", len(dangling))

# 2. 유명역 10곳 스팟체크
targets = ["서울역", "부산역", "강남역", "홍대입구", "동대구역",
           "광주송정역", "대전역", "인천역", "수원역", "청량리역"]
print("\n=== 유명역 스팟체크 ===")
for t in targets:
    hits = [s for s in sts if s["properties"]["name_ko"] == t]
    if not hits:
        hits = [s for s in sts if t.rstrip("역") in (s["properties"]["name_ko"] or "")]
    for s in hits[:3]:
        p = s["properties"]
        print(f"{t}: name_ko={p['name_ko']} name_en={p['name_en']} "
              f"coord={s['geometry']['coordinates']} lines={p['lines'][:4]}")
    if not hits:
        print(f"{t}: NOT FOUND")

# 3. 폴백 귀속 샘플 (lines가 1개이고 fallback으로 들어간 역 중 10개)
print("\n=== 폴백 귀속 샘플 10 ===")
n = 0
for s in sts:
    p = s["properties"]
    if len(p["lines"]) == 1 and n < 10:
        print(f"{p['name_ko']} {s['geometry']['coordinates']} -> {p['lines'][0]}")
        n += 1

# 4. 미귀속 샘플
print("\n=== 미귀속 역 샘플 10 ===")
n = 0
for s in sts:
    p = s["properties"]
    if not p["lines"] and n < 10:
        print(f"{p['name_ko']} {s['geometry']['coordinates']}")
        n += 1
