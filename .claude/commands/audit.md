---
description: 데이터·화면 불변식 테스트를 돌리고 실패 대조표를 만든다
---

다음을 순서대로 실행하고, 결과를 표 하나로 보고해라. 코드는 고치지 마라.

1. `node --test tests/data/` 실행.
2. `npx playwright test --reporter=list` 실행. (서버가 안 뜨면 `npm run serve` 를 따로 띄우고 재시도)
3. data-auditor 서브에이전트에게 이번 git diff 기준 추가 검수를 맡겨라.
4. 보고 형식:

| ID | 불변식 | 상태 | 실패 건수 | 대표 예시 |
|---|---|---|---|---|

- 상태: PASS / FAIL / 선택자 오류(테스트 쪽 문제)
- "선택자 오류"와 "값 불일치"를 반드시 구분해라. 선택자 오류는 앱 버그가 아니다.
- 마지막 줄: 지난 기준선(.claude/baseline-failures.txt) 대비 늘었는지 줄었는지.

$ARGUMENTS
