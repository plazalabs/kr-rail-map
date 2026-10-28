#!/usr/bin/env python3
"""노선별 정적 랜딩 페이지 + sitemap.xml 생성기.

- data/lines.geojson, data/stations.geojson 을 읽어
  line/<id>.html 을 만든다 (크롤러가 읽을 수 있는 실제 콘텐츠).
- 수도권(수도권 bbox 안에 역이 있는) 노선만 생성한다.

사용: python build_pages.py
"""
import json
import math
import os
import re
import html
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
# 배포 도메인은 한 곳에서만 정의한다. canonical·og:url·JSON-LD·sitemap·robots 가
# 전부 이 값에서 파생되므로, 손으로 고칠 곳이 없다.
# 다른 도메인으로 배포할 때는 SITE_URL 환경변수로 덮어쓴다.
SITE = os.environ.get("SITE_URL", "https://plazalabs.github.io/kr-rail-map").rstrip("/")
OUT = os.path.join(HERE, "line")
TODAY = date.today().isoformat()

METRO = (126.28, 36.88, 128.02, 38.36)  # minLng, minLat, maxLng, maxLat
CAT_KO = {"metro": "도시철도", "urban": "광역·도시철도", "ktx": "KTX·고속철도",
          "conventional": "일반철도", "etc": "기타"}


def hav(a, b):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = (math.sin((lat2 - lat1) / 2) ** 2 +
         math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def parts(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    return [p for p in geom["coordinates"] if len(p) >= 2]


def length_km(geom):
    return sum(sum(hav(p[i], p[i + 1]) for i in range(len(p) - 1)) for p in parts(geom))


def order_stations(geom, sts, lat0):
    kx = 111.32 * math.cos(math.radians(lat0))
    ky = 110.57
    # 선형을 평면으로
    segs, acc = [], 0.0
    for part in parts(geom):
        prev = None
        for c in part:
            p = (c[0] * kx, c[1] * ky)
            if prev is not None:
                segs.append((prev, p, acc))
                acc += math.hypot(p[0] - prev[0], p[1] - prev[1])
            prev = p
    out = []
    for s in sts:
        c = s["geometry"]["coordinates"]
        p = (c[0] * kx, c[1] * ky)
        best = (1e18, 0.0)
        for a, b, base in segs:
            dx, dy = b[0] - a[0], b[1] - a[1]
            l2 = dx * dx + dy * dy
            t = 0 if l2 == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
            px, py = a[0] + t * dx, a[1] + t * dy
            d = (p[0] - px) ** 2 + (p[1] - py) ** 2
            if d < best[0]:
                best = (d, base + t * math.sqrt(l2))
        out.append((best[1], s))
    out.sort(key=lambda x: x[0])
    return [s for _, s in out]


STYLE = """
:root{--bg:#fff;--surface:#f6f7f9;--text:#16191d;--text2:#4a5158;--muted:#868e96;--border:#e3e6ea;--accent:#0b57d0}
*{box-sizing:border-box}
body{margin:0;font-family:"Pretendard",-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
color:var(--text);background:var(--bg);line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:760px;margin:0 auto;padding:0 20px 80px}
header{border-bottom:1px solid var(--border);background:var(--surface)}
header .wrap{padding:14px 20px;display:flex;align-items:center;gap:10px}
.logo{font-weight:700;font-size:16px;text-decoration:none;letter-spacing:-.02em}
.logo i{display:inline-block;width:4px;height:15px;border-radius:2px;margin-right:7px;vertical-align:-2px;
background:linear-gradient(180deg,#0052a4 0 33%,#00a84d 33% 66%,#ef7c1c 66% 100%)}
header nav{margin-left:auto;font-size:13px;color:var(--muted)}
h1{font-size:28px;line-height:1.3;letter-spacing:-.03em;margin:28px 0 8px}
.lede{color:var(--text2);font-size:15px;margin:0 0 22px}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 26px;padding:0;list-style:none}
.stats li{background:var(--surface);border-radius:9px;padding:10px 14px;font-size:13px;color:var(--text2)}
.stats b{display:block;font-size:19px;color:var(--text);font-variant-numeric:tabular-nums}
h2{font-size:16px;margin:32px 0 12px;letter-spacing:-.02em}
ol.st{list-style:none;padding:0;margin:0;counter-reset:s}
ol.st li{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:14px}
ol.st li:last-child{border-bottom:0}
ol.st .n{width:26px;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;text-align:right}
ol.st .dot{width:9px;height:9px;border-radius:50%;flex:0 0 9px}
ol.st .en{margin-left:auto;color:var(--muted);font-size:12px}
.rel{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.rel a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-size:13px;
border:1px solid var(--border);border-radius:8px;padding:7px 11px}
.rel a:hover{background:var(--surface)}
.rel i{width:9px;height:9px;border-radius:50%}
.cta{display:inline-flex;align-items:center;gap:8px;margin:34px 0 0;background:var(--accent);color:#fff;
text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:11px}
.cta:hover{filter:brightness(1.07)}
.note{margin-top:34px;padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
@media(max-width:560px){h1{font-size:23px}.stats li{padding:8px 11px}}
"""


def esc(s):
    return html.escape(str(s), quote=True)


def main():
    lines = json.load(open(os.path.join(HERE, "data", "lines.geojson"), encoding="utf-8"))
    stations = json.load(open(os.path.join(HERE, "data", "stations.geojson"), encoding="utf-8"))
    sts = stations["features"]
    by_line = {}
    for s in sts:
        for lid in s["properties"].get("lines") or []:
            by_line.setdefault(lid, []).append(s)

    os.makedirs(OUT, exist_ok=True)
    made = []
    for f in lines["features"]:
        p = f["properties"]
        lid = p["id"]
        mine = by_line.get(lid, [])
        if len(mine) < 3:
            continue
        # 예전에는 수도권 bbox 안에 역이 있는 노선만 페이지를 만들었다.
        # 그런데 지도는 부산·대구·광주·대전 노선과 전국 KTX 를 이미 그린다.
        # 지도에 있는데 페이지가 없는 상태는 색인 측면에서도 일관성이 없어 필터를 없앴다.

        km = length_km(f["geometry"])
        lat0 = sum(s["geometry"]["coordinates"][1] for s in mine) / len(mine)
        ordered = order_stations(f["geometry"], mine, lat0)
        seen, seq = set(), []
        for s in ordered:
            nm = s["properties"]["name_ko"]
            if nm in seen:
                continue
            seen.add(nm)
            seq.append(s)
        if len(seq) < 3:
            continue

        color = p.get("color") or "#8a8f98"
        cat = CAT_KO.get(p.get("category"), "철도")
        status = {"open": "운행 중", "construction": "공사 중",
                  "planned": "계획 중", "proposed": "계획 중"}.get(p.get("status"), "운행 중")
        first, last = seq[0]["properties"]["name_ko"], seq[-1]["properties"]["name_ko"]
        title = f"{p['name_ko']} 노선도 · 역 {len(seq)}곳 · {km:.1f}km | 한국철도맵"
        desc = (f"{p['name_ko']}은 {first}부터 {last}까지 이어지는 {cat} 노선입니다. "
                f"정차역 {len(seq)}곳, 노선 연장 {km:.1f}km, {status}. "
                f"지도에서 노선과 역 위치를 확인하고 최단 경로·환승을 계산해 보세요.")

        # 환승 노선
        rel, seen_rel = [], set()
        for s in seq:
            for other in s["properties"].get("lines") or []:
                if other == lid or other in seen_rel:
                    continue
                of = next((x for x in lines["features"] if x["properties"]["id"] == other), None)
                if not of or len(by_line.get(other, [])) < 3:
                    continue
                seen_rel.add(other)
                rel.append(of["properties"])
        rel = rel[:14]

        station_rows = "\n".join(
            f'<li><span class="n">{i + 1}</span>'
            f'<span class="dot" style="background:{color}"></span>'
            f'<span>{esc(s["properties"]["name_ko"])}</span>'
            f'<span class="en">{esc(s["properties"].get("name_en") or "")}</span></li>'
            for i, s in enumerate(seq))

        rel_html = "\n".join(
            f'<li><a href="{esc(r["id"])}.html"><i style="background:{r.get("color") or "#8a8f98"}"></i>'
            f'{esc(r["name_ko"])}</a></li>' for r in rel) or '<li class="muted">환승 노선이 없습니다</li>'

        ld = {
            "@context": "https://schema.org",
            "@graph": [
                {"@type": "BreadcrumbList", "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "한국철도맵", "item": SITE + "/"},
                    {"@type": "ListItem", "position": 2, "name": f"{p['name_ko']} 노선도",
                     "item": f"{SITE}/line/{lid}.html"}]},
                {"@type": "WebPage", "@id": f"{SITE}/line/{lid}.html",
                 "url": f"{SITE}/line/{lid}.html", "name": title, "description": desc,
                 "inLanguage": "ko", "isPartOf": {"@type": "WebSite", "name": "한국철도맵", "url": SITE + "/"},
                 "about": {"@type": "Thing", "name": p["name_ko"]}},
                {"@type": "ItemList", "name": f"{p['name_ko']} 정차역",
                 "numberOfItems": len(seq),
                 "itemListElement": [
                     {"@type": "ListItem", "position": i + 1,
                      "name": s["properties"]["name_ko"]} for i, s in enumerate(seq[:60])]},
            ],
        }

        doc = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="icon" type="image/png" href="../icons/icon-192.png">
<link rel="canonical" href="{SITE}/line/{esc(lid)}.html">
<meta property="og:type" content="article">
<meta property="og:site_name" content="한국철도맵">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{SITE}/line/{esc(lid)}.html">
<meta property="og:image" content="{SITE}/image/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="{esc(color)}">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>{STYLE}</style>
</head>
<body>
<header><div class="wrap"><a class="logo" href="../"><i></i>한국철도맵</a>
<nav>수도권 전철 노선도</nav></div></header>
<main class="wrap">
<nav aria-label="위치" style="font-size:12px;color:var(--muted);margin-top:18px">
<a href="../" style="text-decoration:none">홈</a> › {esc(cat)} › {esc(p["name_ko"])}</nav>
<h1>{esc(p["name_ko"])} 노선도</h1>
<p class="lede">{esc(desc)}</p>
<ul class="stats">
<li><b>{len(seq)}</b>정차역</li>
<li><b>{km:.1f}km</b>노선 연장</li>
<li><b>{esc(cat)}</b>구분</li>
<li><b>{esc(status)}</b>상태</li>
</ul>
<h2>{esc(p["name_ko"])} 정차역 {len(seq)}곳</h2>
<ol class="st">
{station_rows}
</ol>
<h2>환승 노선</h2>
<ul class="rel">
{rel_html}
</ul>
<a class="cta" href="../?line={esc(lid)}">지도에서 {esc(p["name_ko"])} 보기 →</a>
<p class="note">노선·역 데이터는 OSM(ODbL)·국가철도공단 역위치 자료로 확인했습니다. 개통 전 노선의 역명은 계획 발표 기준(확정 아님). 출구 좌표 © OpenStreetMap contributors (ODbL) · 지도 © OpenStreetMap · OpenFreeMap<br>
표시된 연장은 선형 데이터 기준이며 실제 영업거리와 다를 수 있습니다.</p>
</main>
</body>
</html>
"""
        fn = os.path.join(OUT, lid + ".html")
        with open(fn, "w", encoding="utf-8") as fp:
            fp.write(doc)
        made.append((lid, p["name_ko"], len(seq), km))

    # sitemap
    urls = [f"{SITE}/"] + [f"{SITE}/line/{lid}.html" for lid, *_ in made]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        pri = "1.0" if u.endswith("/") else "0.8"
        sm.append(f"  <url><loc>{u}</loc><lastmod>{TODAY}</lastmod><priority>{pri}</priority></url>")
    sm.append("</urlset>")
    open(os.path.join(HERE, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(sm))

    open(os.path.join(HERE, "robots.txt"), "w", encoding="utf-8").write(
        "User-agent: *\nAllow: /\n\nSitemap: " + SITE + "/sitemap.xml\n")

    print(f"생성 완료: {len(made)}개 노선 페이지 + sitemap({len(urls)} URL)")
    for lid, name, n, km in made[:10]:
        print(f"  - {name}: {n}역 {km:.1f}km")


if __name__ == "__main__":
    main()
