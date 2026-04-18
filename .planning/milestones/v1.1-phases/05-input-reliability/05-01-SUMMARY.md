---
phase: 05-input-reliability
plan: "01"
subsystem: runtime-primitives
tags: [runtime, cdp, core-types]
provides:
  - CDP Input 도메인 텍스트 입력 프리미티브
  - FillCommandRequest clear/strategy 옵션
  - contenteditable 판별 헬퍼
affects:
  - packages/core
  - packages/runtime
tech-stack:
  added: []
  patterns:
    - CDP Input.insertText / Input.dispatchKeyEvent
key-files:
  created: []
  modified:
    - packages/core/src/index.ts
    - packages/runtime/src/runtime/event-sequences.ts
    - packages/runtime/src/runtime/dom-utils.ts
key-decisions:
  - 기존 isFillableElement 시그니처는 유지하고 canReceiveTextInput 헬퍼를 별도로 추가해 snapshot value 수집 로직에 영향이 없도록 한다
  - Select-all은 OS 의존성을 피하기 위해 modifiers:4(Meta) + commands:['selectAll'] 조합을 사용한다 — Chromium이 modifiers 대신 commands 힌트를 우선 해석
patterns-established:
  - EventSequences 인터페이스가 마우스뿐 아니라 키보드/IME 레벨 입력 프리미티브의 확장 지점
duration: inline
completed: 2026-04-18
---

# Phase 5 Plan 01 Summary: CDP Input Primitives & Core Types

## Accomplishments
- `FillCommandRequest`에 `clear?`·`strategy?` 필드, `FillStrategy` union 타입 추가
- `EventSequences`에 `insertText`/`typeText`/`pressKey`/`selectAllAndDelete` 메서드 + `keyFromChar` 헬퍼 구현
- `dom-utils.ts`에 `isContentEditableElement`·`canReceiveTextInput` 헬퍼 추가

## Files Modified
- `packages/core/src/index.ts` — FillStrategy / FillCommandRequest
- `packages/runtime/src/runtime/event-sequences.ts` — CDP 텍스트 입력 프리미티브
- `packages/runtime/src/runtime/dom-utils.ts` — contenteditable / canReceiveTextInput 헬퍼

## Verification
- `pnpm --filter @agrune/core build` → pass
- `pnpm --filter @agrune/runtime build` → pass
- 기존 runtime 테스트 65개 모두 pass

## Next Plan
Plan 02가 이 프리미티브를 `handleFill`에서 조합해 실제 fill 경로를 CDP 기반으로 재작성한다.
