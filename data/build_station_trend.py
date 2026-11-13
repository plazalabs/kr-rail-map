"""역별 아파트 매매 가격 흐름 (반기별 법정동 중위 평당가) → data/station-trend.json  (D6, 2026-11-13)

연결 규칙은 시세(build_station_price.py)와 같다: (시군구코드, 법정동) → 역 ID. 좌표·역 이름으로 잇지 않는다.
자료: data/_rtms/<시군구>_<YYYYMM>.json (fetch_rtms.py 가 달마다 남기는 캐시). 범위 파일은 읽지 않는다(기간 섞임 방지 — G1).

원칙 (지어내기 금지)
  - 반기마다 거래가 MIN_DEALS(5) 건 미만이면 그 반기는 값 없음(null) — 0 이나 앞뒤 값으로 메우지 않는다.
  - 해제 거래·가격 없는 거래는 뺀다. 평당가는 전용면적 기준(시세와 같음).
  - 최근 반기는 신고 지연(계약 후 30일)으로 건수가 적다 — 마감 안 된 달은 넣지 않는다(LAST_CLOSED).
  - 가격 변화는 '관측된 값의 흐름'일 뿐 개통 효과(인과)가 아니다 — 화면에 그렇게 적는다.

사용
  python data/fetch_rtms.py --metro --from 202301 --to 202609   # 달 캐시가 없으면 먼저 (하루 호출 한도 주의)
  python data/build_station_trend.py
"""
import glob
import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
DONG = ROOT / "data" / "_station_dong.json"
RTMS = ROOT / "data" / "_rtms"
OUT = ROOT / "data" / "station-trend.json"
MIN_DEALS = 5
FIRST = "202301"
LAST_CLOSED = "202609"   # 신고 마감된 마지막 달 (2026-11-13 기준: 10월 거래는 11-30 마감)


def half_of(ym):
    return ym[:4] + ("H1" if int(ym[4:]) <= 6 else "H2")


def main():
    import station_ids  # noqa: E402
    import dong_match  # noqa: E402
    if not DONG.exists():
        raise SystemExit("data/_station_dong.json 이 없습니다.")
    rows = json.loads(DONG.read_text("utf8"))
    ix = station_ids.Index()
    dong2st = {}
    for s in rows:
        if not s.get("dong") or not s.get("lawd"):
            continue
        ids = ix.ids_of_row(s)
        if ids:
            dong2st.setdefault((s["lawd"], s["dong"]), set()).update(ids)

    # (lawd, umd, half) → 평당가 목록
    acc = {}
    months_seen = set()
    for f in sorted(glob.glob(str(RTMS / "*_??????.json"))):
        parts = pathlib.Path(f).stem.split("_")
        if len(parts) != 2:   # 범위 파일(<코드>_<시작>_<끝>)은 건너뛴다 — 달 캐시만
            continue
        code, ym = parts
        if not (code.isdigit() and FIRST <= ym <= LAST_CLOSED):
            continue
        months_seen.add(ym)
        for r in json.loads(pathlib.Path(f).read_text("utf8")):
            if r.get("cancelled") or not r.get("perPyeong") or not r.get("umd"):
                continue
            acc.setdefault((code, r["umd"], half_of(ym)), []).append(r["perPyeong"])

    halves = sorted({k[2] for k in acc})
    if not halves:
        print("달 캐시가 없습니다. fetch_rtms.py --metro --from %s --to %s 를 먼저." % (FIRST, LAST_CLOSED))
        return 1
    # 반기마다 모든 시군구의 달 파일이 다 있어야 그 반기를 쓴다 (빠진 달이 있으면 거래가 적게 보여 왜곡)
    by_month_codes = {}
    for f in glob.glob(str(RTMS / "*_??????.json")):
        parts = pathlib.Path(f).stem.split("_")
        if len(parts) != 2:
            continue
        code, ym = parts
        if code.isdigit():
            by_month_codes.setdefault(ym, set()).add(code)
    all_codes = set().union(*by_month_codes.values()) if by_month_codes else set()
    complete = []
    for h in halves:
        ms = [h[:4] + "%02d" % m for m in (range(1, 7) if h.endswith("H1") else range(7, 13))]
        ms = [m for m in ms if m <= LAST_CLOSED]
        if ms and all(by_month_codes.get(m, set()) >= all_codes for m in ms):
            complete.append(h)
    print("반기", halves, "· 모든 시군구 달 파일이 다 있는 반기", complete)

    # 역마다 시세(station-price.json)가 고른 법정동 하나만 쓴다 — 시세 칸과 가격 흐름이 같은 동을 가리키게
    price = json.loads((ROOT / "data" / "station-price.json").read_text("utf8")).get("stations", {})
    stations = {}
    for (code, umd, h), pers in acc.items():
        if h not in complete:
            continue
        for sid in dong_match.stations_in(code, umd, dong2st):
            pick = price.get(sid)
            if not pick or pick.get("lawd") != code or pick.get("dong") != umd:
                continue
            st = stations.setdefault(sid, {"lawd": code, "dong": umd, "s": {}})
            st["s"][h] = [round(statistics.median(pers), 1) if len(pers) >= MIN_DEALS else None, len(pers)]
    out_st = {}
    for sid, st in stations.items():
        out_st[sid] = {"dong": st["dong"], "lawd": st["lawd"], "s": [[h] + st["s"].get(h, [None, 0]) for h in complete]}
    payload = {
        "source": "국토교통부 아파트 매매 실거래가 (공공데이터포털)",
        "unit": "만원/평 (전용면적), 반기별 법정동 중위값, [반기, 중위 평당가 또는 null(5건 미만), 건수]",
        "halves": complete, "minDeals": MIN_DEALS, "lastClosed": LAST_CLOSED,
        "note": "관측된 가격 흐름이며 철도 개통의 효과(인과)를 뜻하지 않는다. 최근 반기는 신고 지연 반영 전일 수 있다.",
        "keyed_by": "station_id", "stations": out_st,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "utf8")
    print("저장:", OUT.relative_to(ROOT), "역", len(out_st))
    return 0


if __name__ == "__main__":
    sys.exit(main())
