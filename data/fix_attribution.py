"""출처 표기를 실제 데이터 출처에 맞게 고친다.

기존 표기는 '노선·역 데이터 © OpenStreetMap contributors (ODbL)' 이었는데
이건 사실과 다르다. 노선·역 데이터는 미래철도DB(FRDB)와 철도맘(chul.mom)을
참고해 재구성한 것이고, OSM 에서 온 것은 역 출구 좌표뿐이다.

출처를 잘못 적는 것은 두 가지로 손해다.
 1. 실제로는 라이선스가 없는 데이터를 'ODbL 이라 자유롭게 쓸 수 있다' 고
    주장하는 셈이라, 나중에 유료화할 때 더 위험해진다.
 2. ODbL 은 출처 표기를 요구하므로, OSM 이 아닌 것을 OSM 이라 적어도
    요구를 충족하지 못한다.

그래서 파일별로 정확한 문구로 바꾼다. 되돌리기 쉽도록 바꾼 개수만 보고한다.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# (찾을 문자열, 바꿀 문자열) — 정확히 일치하는 것만 바꾼다.
REPLACEMENTS = [
    # index.html 사이드바 하단
    (
        "      노선·역 데이터 © OpenStreetMap contributors (ODbL)<br>\n"
        "      지도 © OpenStreetMap · OpenFreeMap / 위성 © Esri\n",
        "      노선·역 데이터 — 미래철도DB(FRDB)·철도맘(chul.mom) 자료를 참고해 재구성<br>\n"
        "      출구 좌표 © OpenStreetMap contributors (ODbL)<br>\n"
        "      지도 © OpenStreetMap · OpenFreeMap / 위성 © Esri<br>\n"
        '      <a href="data.html">데이터 출처·이용 조건</a>\n',
    ),
    # line/*.html 하단 한 줄 표기
    (
        '<p class="note">노선·역 데이터 © OpenStreetMap contributors (ODbL) · 지도 © OpenStreetMap · OpenFreeMap<br>',
        '<p class="note">노선·역 데이터는 미래철도DB(FRDB)·철도맘(chul.mom) 공개 자료를 참고해 재구성했습니다. '
        '출구 좌표 © OpenStreetMap contributors (ODbL) · 지도 © OpenStreetMap · OpenFreeMap · '
        '<a href="../data.html">데이터 출처</a><br>',
    ),
]


def main() -> int:
    targets = [ROOT / "index.html"] + sorted((ROOT / "line").glob("*.html"))
    total = 0
    missed = []
    for path in targets:
        text = path.read_text(encoding="utf-8")
        before = text
        for old, new in REPLACEMENTS:
            if old in text:
                text = text.replace(old, new)
        if text != before:
            path.write_text(text, encoding="utf-8")
            total += 1
        elif "OpenStreetMap contributors (ODbL)" in text:
            # 문구가 조금 달라 손대지 못한 파일 — 조용히 넘기지 않는다.
            missed.append(path.relative_to(ROOT).as_posix())

    print(f"바꾼 파일 {total}개")
    if missed:
        print("손대지 못한 파일 (문구 불일치):")
        for m in missed:
            print("  -", m)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
