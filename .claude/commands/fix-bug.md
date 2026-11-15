---
description: 버그 하나를 "실패하는 테스트 먼저 → 수정 → 전체 테스트" 순서로 고친다
argument-hint: <버그 설명 또는 불변식 ID, 예: D-32 신사역 은평구 매칭>
---

버그: $ARGUMENTS

규칙대로 진행해라. 단계마다 결과를 짧게 보고해라.

1. **재현**: 버그를 명령이나 테스트로 재현한다. 재현 못 하면 멈추고 보고한다.
2. **실패하는 테스트 먼저**:
   - 이미 불변식 테스트(D-xx, E-xx)가 있으면 그것이 실패하는지만 확인한다.
   - 없으면 `tests/data/regression/<짧은-이름>.test.mjs` 또는 `tests/e2e/regression/<짧은-이름>.spec.mjs` 를 새로 만든다.
   - `tests/data/invariants.test.mjs`, `tests/e2e/invariants.spec.mjs` 는 수정 금지(설정으로 막혀 있다).
3. **원인 위치**: 데이터 문제면 `scripts/`(데이터 생성)에서 고친다. `data/` 결과 파일을 손으로 고치지 않는다.
4. **최소 수정**: 이 버그와 상관없는 리팩터링·기능 추가 금지.
5. **확인**: `node --test tests/data/` 전체 실행. 관련 e2e 가 있으면 그것도 실행.
6. **기록**: CHANGELOG.md 에 한 줄 (날짜 · ID · 무엇을 · 왜). 코드에 날짜 주석을 달지 않는다.
7. 커밋 메시지: `fix(<ID>): <한 줄>`
