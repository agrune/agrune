---
phase: 05-input-reliability
plan: "02"
subsystem: runtime-handler
tags: [runtime, fill, cdp]
provides:
  - CDP Input 도메인으로 통일된 handleFill
  - contenteditable/masked input/clear 옵션 지원
affects:
  - packages/runtime/src/runtime/command-handlers.ts
  - packages/runtime/tests/runtime.spec.ts (기존 fill 테스트 업데이트)
tech-stack:
  added: []
  patterns:
    - strategy=auto에서 masked input heuristic 기반 분기
key-files:
  created: []
  modified:
    - packages/runtime/src/runtime/command-handlers.ts
    - packages/runtime/tests/runtime.spec.ts
key-decisions:
  - HTMLSelectElement은 CDP Input 경로 밖에 있으므로 early-return으로 기존 setElementValue 유지
  - clear 기본값은 true — 기존 호출자(v1.0 DOM setter 경로)가 전체 치환하던 동작과 동등하도록 호환성 보장
  - setElementValue는 삭제하지 않고 strategy='dom-setter' fallback으로 보존 (헤드리스 focus drop 등 긴급 대응용)
  - masked 감지 heuristic: data-agrune-masked, type=tel, inputmode+pattern 조합, cleave/masked/imask class name
patterns-established:
  - performFill 클로저 안에서 focus/selection 준비 → clear 여부에 따라 selectAllAndDelete → strategy별 insertText/typeText 순서
duration: inline
completed: 2026-04-18
---

# Phase 5 Plan 02 Summary: Rewrite handleFill for CDP Input Domain

## Accomplishments
- `handleFill`을 재작성해 CDP `Input.insertText`/`Input.dispatchKeyEvent` 기반으로 동작
- contenteditable 요소 지원 (selection preparation 포함)
- masked input heuristic → `strategy='keystroke'`로 자동 전환
- `clear` 옵션 (기본 true) → `selectAllAndDelete` 시퀀스로 기존 값 제거
- `<select>` 요소는 DOM setter 경로로 early-return (CDP Input 대상 아님)
- `detectMaskedInput` 헬퍼 추가
- 기존 runtime 테스트 `fill은 input/change 이벤트를 발생시키고 값이 반영된다`를 CDP 기대값 기반으로 재작성 (테스트 이름도 `fill은 CDP Input 도메인으로 insertText를 보낸다`로 변경)

## Files Modified
- `packages/runtime/src/runtime/command-handlers.ts` — handleFill 재작성, detectMaskedInput 추가, canReceiveTextInput·isContentEditableElement import
- `packages/runtime/tests/runtime.spec.ts` — 기존 fill 테스트 CDP 기대값으로 교체

## Verification
- `pnpm --filter @agrune/runtime build` → pass
- `pnpm --filter @agrune/runtime test` → 65 → 69 (새 fill-cdp 테스트 4개 포함 전부 green)

## Next Plan
Plan 03가 MCP 도구 스키마에 clear/strategy를 노출하고 fill-cdp.spec.ts로 CDP 경로를 잠근다.
