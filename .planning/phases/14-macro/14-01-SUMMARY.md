---
phase: "14"
plan: "01"
subsystem: runtime/dom-heuristic
tags: [sensitive, dom-heuristic, i18n, word-boundary, regex, security, tdd]
completed: "2026-04-19T09:40:30Z"
duration_seconds: 162

dependency_graph:
  requires:
    - "11-02: isSensitive OR-only contract (manifestFlag?: true | undefined)"
  provides:
    - "SENSITIVE_WORD_BOUNDARY export — word-boundary regex for placeholder/aria-label"
    - "SENSITIVE_NAME_ATTR export — underscore/dash/dot boundary regex for name/id"
    - "SENSITIVE_ARIA_LABELS_MULTILANG export — ReadonlySet<string> 한/일/중/프/독/스"
    - "isSensitive 5-8단계 확장 (기존 1-4단계 보존)"
  affects:
    - "snapshot.ts valuePreview — isSensitive 결과 자동 전파 (코드 미수정)"

tech_stack:
  added: []
  patterns:
    - "TDD RED→GREEN (test commit first, then implementation)"
    - "ReadonlySet<string> for immutable multilang label registry"
    - "word-boundary regex + Set exact-match 분리 (CJK \\b 비작동 우회)"

key_files:
  modified:
    - path: "packages/runtime/src/runtime/dom-utils.ts"
      change: "SENSITIVE_WORD_BOUNDARY / SENSITIVE_NAME_ATTR / SENSITIVE_ARIA_LABELS_MULTILANG export + isSensitive 5-8단계 append"
    - path: "packages/runtime/tests/sensitive-or-only.spec.ts"
      change: "Phase 14 describe 3개 추가 — word-boundary (16 tests) + multilang (14 tests) + regression (5 tests)"

decisions:
  - "CJK aria-label은 \\b regex 대신 Set exact-match 사용 — \\b는 \\w=[a-zA-Z0-9_] 기준이라 CJK에서 단어 경계 인식 불가"
  - "name/id용 SENSITIVE_NAME_ATTR regex는 SENSITIVE_WORD_BOUNDARY와 분리 — underscore·dash·dot을 경계로 처리해야 하기 때문"
  - "ReadonlySet 타입 표기로 모듈 외부에서의 런타임 override 방지 (T-14-06)"
  - "snapshot.ts 미수정 — isSensitive 결과가 state.sensitive → valuePreview null로 자동 전파"

metrics:
  duration: "162s"
  completed: "2026-04-19"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 2
  tests_added: 35
  tests_total_after: 173
---

# Phase 14 Plan 01: isSensitive word-boundary + multilingual ARIA 확장 Summary

**One-liner:** `isSensitive`에 영어 word-boundary regex + 한/일/중/프/독/스 ARIA Set을 추가해 `sensitive:false` manifest 우회(MACRO-03 / T-14-01)를 runtime 레벨에서 차단.

## What Was Built

`packages/runtime/src/runtime/dom-utils.ts`의 `isSensitive` 함수에 4단계 체크(manifestFlag / password type / autocomplete / data-attr) 뒤에 4단계를 추가:

| 단계 | 속성 | 방법 |
|------|------|------|
| 5 | `placeholder` | `SENSITIVE_WORD_BOUNDARY` (`\b(password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)\b/i`) |
| 6 | `name` | `SENSITIVE_NAME_ATTR` (underscore/dash/dot/whitespace 경계) |
| 7 | `id` | `SENSITIVE_NAME_ATTR` (동일) |
| 8 | `aria-label` | Exact phrase match → 공백 토큰 분리 → 영어 word-boundary (3-pass) |

다국어 Set (`SENSITIVE_ARIA_LABELS_MULTILANG`): 비밀번호/패스워드/パスワード/暗証番号/密码/密碼/mot de passe/passwort/kennwort/contraseña 등 14개 엔트리.

## TDD Gate Compliance

- RED commit: `e7fd8fd` — `test(14-01): add failing tests for word-boundary regex + multilang ARIA (TDD RED)`
- GREEN commit: `49515ae` — `feat(14-01): extend isSensitive with word-boundary + multilang ARIA (TDD GREEN)`

RED 단계: 23개 신규 테스트 실패, 기존 150개 통과 확인.
GREEN 단계: 전 173개 통과.

## Deviations from Plan

None — 계획대로 정확히 실행됨.

## Threat Surface

| Mitigation | Status |
|------------|--------|
| T-14-01 Spoofing: manifest `sensitive:false` 우회 | MITIGATED — runtime 8단계 OR 결합 |
| T-14-02 Tampering: regex 오탐 | MITIGATED — `passwordless`/`passwords123`/`crosswords` negative test 확정 |
| T-14-03 Info Disclosure: valuePreview 유출 | MITIGATED — snapshot.ts 미수정, 자동 전파 확인 |
| T-14-04 DoS: ReDoS | MITIGATED — 선형 alternation만 사용 (구조 검증 완료) |
| T-14-05 Homoglyph | ACCEPTED (v0.5 범위 외) |
| T-14-06 Set override | MITIGATED — ReadonlySet 타입 |

## Known Stubs

None.

## Self-Check

- [x] `packages/runtime/src/runtime/dom-utils.ts` — exists, modified
- [x] `packages/runtime/tests/sensitive-or-only.spec.ts` — exists, 320 lines
- [x] RED commit `e7fd8fd` — exists
- [x] GREEN commit `49515ae` — exists
- [x] `SENSITIVE_WORD_BOUNDARY` — 3 matches in dom-utils.ts
- [x] `SENSITIVE_NAME_ATTR` — 3 matches in dom-utils.ts
- [x] `SENSITIVE_ARIA_LABELS_MULTILANG` — 3 matches in dom-utils.ts
- [x] 비밀번호, パスワード, 密码, mot de passe — 각 1+ match
- [x] Phase 14 describe 블록 6 match (3 describe titles × 2 references)
- [x] spec line count: 320 (≥ 180 기준 충족)
- [x] snapshot.ts `isSensitive` match 수 변경 없음 (2 matches, 미수정)

## Self-Check: PASSED
