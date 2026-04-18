---
phase: 05-input-reliability
reviewed: 2026-04-18
depth: standard
status: passed_with_notes
findings:
  blockers: 0
  high: 0
  medium: 0
  low: 4
  info: 3
---

# Phase 5 Code Review — Input Reliability

## Scope
Files changed in commit `958b015` (+ pre-existing review against this scope):

- `packages/core/src/index.ts`
- `packages/runtime/src/runtime/event-sequences.ts`
- `packages/runtime/src/runtime/dom-utils.ts`
- `packages/runtime/src/runtime/command-handlers.ts`
- `packages/mcp/src/tools.ts`
- `packages/mcp/src/mcp-tools.ts`
- `packages/runtime/tests/runtime.spec.ts` (existing test updated)
- `packages/runtime/tests/fill-cdp.spec.ts` (new)

## Findings

### LOW-1: `flashPointerOverlay` fire-and-forget of async fill
**File:** `packages/runtime/src/runtime/command-handlers.ts:615`
**Issue:** `performFill` returns `Promise<void>` but `flashPointerOverlay`'s `onPress?: () => void` drops the promise. The cursor press animation completes before `insertText`/`typeText` finishes.
**Impact:** Order of animation vs fill is "begin async → press → settle snapshot". Visual correctness is unchanged (this matches the existing `setElementValue` sync behavior in the legacy path); however, `captureSettledSnapshot(2)` might race if CDP insertText is slow on the first call. Mitigated by the 2-frame settle.
**Suggestion:** Consider broadening `onPress` to `() => void | Promise<void>` and awaiting inside `animateCursorTo` in a follow-up. Not blocking for this phase.
**Severity:** LOW (acceptable — matches existing click behavior).

### LOW-2: Redundant `selectAllAndDelete` on already-empty inputs
**File:** `packages/runtime/src/runtime/command-handlers.ts:589-591`
**Issue:** `clear=true` always dispatches Meta+A / Delete, even on empty inputs.
**Impact:** Wasted 4 CDP round-trips per fill. Harmless but could be optimized if profiling shows cost.
**Suggestion:** Later optimization: `if (clear && (element as HTMLInputElement).value !== '') { … }`. Not blocking.
**Severity:** LOW.

### LOW-3: `detectMaskedInput` className regex over-eager
**File:** `packages/runtime/src/runtime/command-handlers.ts` (detectMaskedInput)
**Issue:** `/\b(cleave|masked|imask)\b/i` matches any element whose class contains those tokens. A component using `text-masked` CSS utility would be mis-classified.
**Impact:** False positive routes fill through `typeText` (slower per-char). No correctness issue — just performance.
**Mitigation:** `data-agrune-masked="true"` and `data-agrune-masked="false"` overrides available. Developers using annotation have explicit control.
**Severity:** LOW.

### LOW-4: `keyFromChar` fallback for non-ASCII produces empty `code`
**File:** `packages/runtime/src/runtime/event-sequences.ts` (keyFromChar)
**Issue:** For characters outside `[a-zA-Z0-9 ]` (e.g., Korean, emoji, symbols), `keyFromChar` returns `{ key: ch, code: '' }`. Some sites' `keydown` handlers reject events with empty `code`.
**Impact:** `typeText` is only triggered for masked inputs (tel/card/numeric), which are ASCII by contract. Non-ASCII goes through `insertText` (default path), which does not use `keyFromChar`.
**Severity:** LOW (scoped to keystroke strategy + non-ASCII — unlikely in practice).

### INFO-1: contenteditable focus not verified
**File:** `packages/runtime/src/runtime/command-handlers.ts:576`
**Note:** The focus-landing check `document.activeElement !== element && !isContentEditable` skips the retry for contenteditable. `Selection.addRange` normally focuses the element, so this is generally fine.

### INFO-2: 1000+ char masked strings may exceed CDP timeout
**Note:** `typeText` sends 2 CDP events per char. CDP client has 5s timeout per event. A 1000-char masked fill is theoretically feasible within the 5s per-event budget but not ideal.
**Not addressed:** Acknowledged in `05-RESEARCH.md` §8. Real-world masked inputs are ≤20 chars (phone/card).

### INFO-3: `selectAllAndDelete` uses Meta modifier unconditionally
**Note:** We rely on Chromium's `commands: ['selectAll']` hint, which is OS-agnostic at the CDP layer. The `modifiers: 4` (Meta) is redundant on Linux/Windows but ignored because Chromium prefers `commands`. Matches Puppeteer behavior.

## Verification Cross-Check

| Claim | Evidence |
|-------|----------|
| INPUT-01 covered | `fill-cdp.spec.ts "INPUT-01"` + runtime.spec.ts insertText test |
| INPUT-02 covered | `fill-cdp.spec.ts "INPUT-02"` |
| INPUT-03 covered | `fill-cdp.spec.ts "INPUT-03"` |
| INPUT-04 covered | `fill-cdp.spec.ts "INPUT-04"` (both clear=false and clear=true) |
| Existing tests green | 69/69 runtime, 12/12 core, 28/28 browser, 15/15 mcp-public |
| Pre-existing ws build fail | Confirmed via `git stash` → identical error. Unrelated to Phase 5. |

## Verdict

**status: passed_with_notes**

모든 Phase 5 요구사항(INPUT-01..04)이 단위 테스트로 잠겼다. Blocker/High/Medium finding은 없고 Low 4건 + Info 3건 모두 follow-up 또는 수용 가능 수준. `ws` 빌드 실패는 pre-existing이라 Phase 5 리뷰 스코프 밖.

다음 phase로 진행 가능.
