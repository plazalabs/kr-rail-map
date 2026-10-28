"""역 하나를 데이터에서 뺀다. 확인된 오류를 정리할 때만 쓴다.

왜 스크립트로 하나
------------------
손으로 JSON 을 고치면 다른 곳(환승 시간·출처 증빙)에 흔적이 남는다. 빼고 나서
그 파일들을 다시 만들도록 안내하고, 무엇을 뺐는지 기록을 남긴다.

**지우는 것은 되돌리기 어렵다.** 그래서 이 스크립트는
  1) 뺄 역의 내용을 전부 보여주고
  2) `--apply` 없이는 아무것도 저장하지 않는다.

사용
----
    python data/remove_station.py st-14084816254          # 미리보기
    python data/remove_station.py st-14084816254 --apply  # 저장
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
STATIONS = ROOT / "stations.geojson"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print("역 id 를 주세요. 예: st-14084816254")
        return 1
    sid = args[0]
    apply = "--apply" in sys.argv

    doc = json.loads(STATIONS.read_text("utf8"))
    hit = [f for f in doc["features"] if f["properties"].get("id") == sid]
    if not hit:
        print(f"{sid} 를 찾지 못했다")
        return 1
    f = hit[0]
    p = f["properties"]
    print("뺄 역:")
    print(f"  id       {p.get('id')}")
    print(f"  이름     {p.get('name_ko')} ({p.get('name_en')})")
    print(f"  노선     {', '.join(p.get('lines') or [])}")
    print(f"  좌표     {f['geometry']['coordinates']}")
    print(f"  별칭     {', '.join(p.get('aliases') or []) or '없음'}")
    print(f"  나머지   {({k: v for k, v in p.items() if k not in ('id', 'name_ko', 'name_en', 'lines', 'line_id', 'aliases')})}")

    same = [x["properties"]["name_ko"] for x in doc["features"]
            if x["properties"]["name_ko"] == p.get("name_ko") and x["properties"]["id"] != sid]
    if same:
        print(f"  참고: 같은 이름의 다른 역 {len(same)}개는 그대로 둔다")

    if not apply:
        print("\n미리보기만 했다. 저장하려면 --apply")
        return 0

    doc["features"] = [x for x in doc["features"] if x["properties"].get("id") != sid]
    STATIONS.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), "utf8")
    print(f"\n저장: {STATIONS.name} — 역 {len(doc['features'])}개")
    print("다음 명령으로 파생 파일을 다시 만드세요:")
    print("  python data/build_transfer_times.py")
    print("  python data/build_membership.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
