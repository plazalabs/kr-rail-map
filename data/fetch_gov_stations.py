"""공공데이터포털에서 국가철도공단 '역위치' 파일을 전부 찾아 받는다.

왜 필요한가:
  노선·역 데이터를 공공데이터로 옮기려면 노선별 CSV 가 필요하다. 그런데
  포털 검색은 한 번에 6건씩만 보여주고 '더보기'가 스크립트로 안 눌린다.
  그래서 데이터 ID 가 15041300~15041345 구간에 몰려 있는 것을 이용해
  상세 페이지 제목을 직접 읽어 목록을 만든다.

  다운로드는 로그인 없이 된다(포털이 '파일데이터는 로그인 없이 다운로드'
  라고 명시). 인증키도 필요 없다. 인증키가 필요한 건 오픈API 쪽이다.

사용:
  python data/fetch_gov_stations.py --probe     # 목록만 조사
  python data/fetch_gov_stations.py --download  # 실제 파일 받기
"""
import argparse
import csv
import io
import json
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTDIR = ROOT / "data" / "_gov"
INDEX = OUTDIR / "_index.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

# 역위치 데이터가 몰려 있는 ID 구간. 확인된 것: 15041301(2호선),
# 15041304(5호선), 15041331(공항철도), 15041335(9호선), 15041337(신분당선).
ID_RANGE = range(15041295, 15041350)


def get(url, referer=None, timeout=30):
    h = {"User-Agent": UA}
    if referer:
        h["Referer"] = referer
    req = urllib.request.Request(url, headers=h)
    return urllib.request.urlopen(req, timeout=timeout).read()


def probe():
    OUTDIR.mkdir(parents=True, exist_ok=True)
    found = {}
    for did in ID_RANGE:
        url = f"https://www.data.go.kr/data/{did}/fileData.do"
        try:
            html = get(url, timeout=20).decode("utf-8", "replace")
        except Exception as e:              # noqa: BLE001
            print(f"  {did}: 없음 ({type(e).__name__})")
            continue
        m = re.search(r"<title>(.*?)</title>", html, re.S)
        title = re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
        if "역위치" not in title:
            print(f"  {did}: {title[:60]}")
            continue
        # 다운로드에 필요한 atchFileId
        a = re.search(r"fileDownload\.do\?atchFileId=([A-Za-z0-9_]+)&fileDetailSn=(\d+)", html)
        # 이용허락범위
        lic = re.search(r"이용허락범위\s*</[^>]+>\s*<[^>]+>\s*([^<]+)", html)
        found[did] = {
            "id": did,
            "title": title,
            "atchFileId": a.group(1) if a else None,
            "fileDetailSn": a.group(2) if a else "1",
            "license": lic.group(1).strip() if lic else "",
        }
        print(f"  {did}: {title[:70]}  [{found[did]['license'] or '?'}]")
        time.sleep(0.35)
    INDEX.write_text(json.dumps(list(found.values()), ensure_ascii=False, indent=1), "utf8")
    print(f"\n역위치 데이터 {len(found)}건 발견 → {INDEX.relative_to(ROOT)}")
    return found


def download():
    if not INDEX.exists():
        print("먼저 --probe 를 실행하세요")
        return 1
    items = json.loads(INDEX.read_text("utf8"))
    OUTDIR.mkdir(parents=True, exist_ok=True)
    ok = 0
    for it in items:
        if not it.get("atchFileId"):
            print("건너뜀(첨부ID 없음):", it["title"][:50])
            continue
        url = ("https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId="
               f"{it['atchFileId']}&fileDetailSn={it['fileDetailSn']}&insertDataPrcus=N")
        referer = f"https://www.data.go.kr/data/{it['id']}/fileData.do"
        try:
            raw = get(url, referer=referer, timeout=60)
        except Exception as e:              # noqa: BLE001
            print(f"  실패 {it['title'][:40]}: {type(e).__name__}")
            continue
        # 포털 CSV 는 EUC-KR 이 기본이다. 안 되면 UTF-8 로 시도.
        text = None
        for enc in ("euc-kr", "cp949", "utf-8-sig"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            print(f"  디코딩 실패 {it['title'][:40]}")
            continue
        # 파일명은 제목에서 만든다 (포털이 zip 으로 주기도 해서 확장자를 믿지 않는다)
        safe = re.sub(r"[^\w가-힣]+", "_", it["title"]).strip("_")[:60]
        path = OUTDIR / (safe + ".csv")
        path.write_text(text, encoding="utf-8")
        rows = list(csv.reader(io.StringIO(text)))
        print(f"  저장 {path.name}  {len(rows) - 1}행  헤더={rows[0] if rows else '?'}")
        ok += 1
        time.sleep(0.4)
    print(f"\n{ok}개 파일 저장 → {OUTDIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--download", action="store_true")
    a = ap.parse_args()
    if a.probe:
        probe()
    elif a.download:
        sys.exit(download())
    else:
        ap.print_help()
