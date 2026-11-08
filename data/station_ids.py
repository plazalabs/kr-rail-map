#!/usr/bin/env python3
"""역 이름 키 → 역 ID 키 (IMPL12 건 2).

왜: 시세·단지·공급 자료가 '역 이름'을 키로 썼다. 이름이 같은 역(시청·교대·용산 …)이 37개라
부산 시청 역 패널에 서울 시청 시세가 떴다. 자료를 역 ID로 다시 묶는다.

자료(시세·단지·공급)는 모두 (시군구코드 lawd, 법정동) 단위다. 이름 하나에 붙어 있던 항목은
그 이름을 가진 역들 가운데 '항목의 lawd 와 같은 시군구에 있다고 확인되는 역'에만 준다.
추측으로 붙이지 않는다 — 확인이 안 되면 '자료 없음'.

확인 근거 (둘 중 하나, 항목마다 basis 로 기록)
  addr  : 국가철도공단 역 주소데이터(_station_dong.json)에서 그 역에 대응된 행들의 lawd 목록에 항목 lawd 가 있다.
          (시세·단지·공급 항목은 바로 이 주소 행의 (lawd, 법정동)에서 만들어졌으므로 이것이 항목의 출처다.
           서울역처럼 행이 두 시군구(용산구·중구)에 걸친 역도 있어 목록으로 본다.)
          주소 행을 역에 대응시키는 규칙은 build_station_region.py 와 같다 —
          이름이 지도에 한 곳뿐이면 그 역, 여럿이면 '이름 + 노선 표기'가 딱 한 역에 맞을 때만.
  coord : 주소 행이 하나도 대응되지 않은 역만. 좌표 1km(COORD_KM) 안의 '주소 행이 있는 역'들이 모두 같은
          lawd 하나이고 그것이 항목 lawd 와 같을 때. 구 경계(반경 안에 lawd 가 둘 이상)면 주지 않는다.
네트워크·키를 쓰지 않는다.
"""
import json
import math
import pathlib
import sys
from collections import defaultdict

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import station_names  # noqa: E402
from build_station_region import LINE_CODE  # noqa: E402

COORD_KM = 1.0   # 설계값: 좌표 확인 반경


def _hav(a, b):
    R = 6371.0
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dla, dlo = la2 - la1, math.radians(b[0] - a[0])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


class Index:
    def __init__(self, stations=None, rows=None):
        stations = stations if stations is not None else json.loads((HERE / "stations.geojson").read_text("utf8"))["features"]
        rows = rows if rows is not None else json.loads((HERE / "_station_dong.json").read_text("utf8"))
        self.by_name = defaultdict(list)
        self.coord = {}
        for s in stations:
            p = s["properties"]
            self.by_name[p["name_ko"]].append(p)
            self.coord[p["id"]] = s["geometry"]["coordinates"]
        self.name_of = {sid: p["name_ko"] for ps in self.by_name.values() for p in ps for sid in [p["id"]]}
        # 1차: 이름이 한 곳뿐이거나 이름+노선이 딱 한 역에 맞는 행
        self._row_ids = {}
        pending = []
        got = defaultdict(set)
        for r in rows:
            ids, amb = self._match(r)
            self._row_ids[self._key(r)] = ids
            if r.get("lawd"):
                for sid in ids:
                    got[sid].add(r["lawd"])
            if amb:
                pending.append((r, amb))
        # 2차: 노선 표기가 여러 역에 맞아 모호했던 행 — 후보 가운데 1차에서 같은 시군구(lawd)로 확인된 역이
        # 딱 하나면 그 역으로 (주소 근거). 예: '1호선 시청' 행은 서울·부산·대전 시청 모두에 맞지만,
        # 서울 시청은 '2호선 시청' 행으로 이미 서울 중구(11140)가 확인돼 있다.
        for r, amb in pending:
            if not r.get("lawd"):
                continue
            same = [sid for sid in amb if r["lawd"] in got.get(sid, ())]
            if len(same) == 1:
                k = self._key(r)
                self._row_ids[k] = sorted(set(self._row_ids[k]) | {same[0]})
        got = defaultdict(set)
        for r in rows:
            if r.get("lawd"):
                for sid in self._row_ids[self._key(r)]:
                    got[sid].add(r["lawd"])
        self.lawds = dict(got)                      # 역 ID → {lawd} (주소 행 출처)
        self.lawd = {sid: next(iter(v)) for sid, v in got.items() if len(v) == 1}   # 표시용(하나일 때)
        self.known = [(sid, v, self.coord[sid]) for sid, v in got.items() if sid in self.coord]

    @staticmethod
    def _key(r):
        return (r.get("name"), r.get("line"), r.get("lawd"), r.get("dong"), r.get("jibun"), r.get("road"))

    def _match(self, r):
        """(확정 ID 목록, 모호 후보 ID 목록). build_station_region 과 같은 1차 규칙:
        이름이 지도에 한 곳뿐이면 그 역, 여럿이면 '이름 + 노선 표기'가 딱 한 역에 맞을 때만.
        이수/총신대입구(이수)처럼 한 역이 두 이름으로 들어 있으면 이름마다 따로 찾는다(resolve_all)."""
        out, amb = [], []
        for nm in station_names.resolve_all(r["name"]) or []:
            ss = self.by_name.get(nm) or []
            if len(ss) == 1:
                out.append(ss[0]["id"])
            elif len(ss) > 1:
                cands = set(LINE_CODE.get(r.get("line"), []))
                hit = [p for p in ss if cands & set(p.get("lines") or [])]
                if len(hit) == 1:
                    out.append(hit[0]["id"])
                elif len(hit) > 1:
                    amb.extend(p["id"] for p in hit)
        return out, amb

    def ids_of_row(self, r):
        """주소 행 하나 → 그 행이 가리키는 지도 역 ID 목록 (1차 규칙 + 2차 시군구 일치). 모호하면 []."""
        k = self._key(r)
        if k in self._row_ids:
            return list(self._row_ids[k])
        return self._match(r)[0]

    def _coord_lawd(self, sid):
        """반경 안 주소 확인 역들의 lawd 가 하나로 일치하면 (lawd, 근거 목록), 아니면 (None, 근거 목록)."""
        c = self.coord.get(sid)
        if not c:
            return None, []
        near = [(round(_hav(c, oc), 3), oid, sorted(lws)) for oid, lws, oc in self.known
                if oid != sid and _hav(c, oc) <= COORD_KM]
        allw = {lw for _, _, lws in near for lw in lws}
        return (next(iter(allw)) if len(allw) == 1 else None), sorted(near)

    def assign(self, name, lawd):
        """이름 항목(lawd) → [(역 ID, basis)] . 없으면 [] 와 이유."""
        ss = self.by_name.get(name) or []
        if not ss:
            return [], "지도에 그 이름의 역이 없음"
        if not lawd:
            return [], "항목에 시군구코드 없음"
        addr = [(p["id"], "addr") for p in ss if lawd in self.lawds.get(p["id"], ())]
        if addr:
            return addr, None
        out = []
        for p in ss:
            if p["id"] in self.lawds:         # 주소 행이 있는데 lawd 가 다른 역 — 좌표로 덮어쓰지 않는다
                continue
            lw, _near = self._coord_lawd(p["id"])
            if lw == lawd:
                out.append((p["id"], "coord"))
        if out:
            return out, None
        return [], "같은 시군구에 있다고 확인되는 역 없음"


def rekey(name_map, lawd_of, index=None):
    """{이름: 항목} → ({역ID: 항목}, {역ID: basis}, [못 붙인 것])."""
    ix = index or Index()
    by_id, basis, unmatched = {}, {}, []
    for name, entry in sorted(name_map.items()):
        ids, why = ix.assign(name, lawd_of(entry))
        if not ids:
            unmatched.append({"name": name, "lawd": lawd_of(entry), "reason": why})
            continue
        for sid, b in ids:
            by_id[sid] = entry
            basis[sid] = b
    return by_id, basis, unmatched


if __name__ == "__main__":
    ix = Index()
    print(f"주소로 시군구가 확인된 역 {len(ix.lawd)}곳 / 지도 역 {len(ix.coord)}곳")
