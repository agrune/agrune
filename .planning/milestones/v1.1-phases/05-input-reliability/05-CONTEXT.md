# Phase 5: Input Reliability - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

`agrune_fill`이 controlled input(React/Vue/Angular)·contenteditable·masked input(tel, card number)에서 결정적으로 동작하도록 CDP `Input` 도메인 경로(`Input.insertText`·`Input.dispatchKeyEvent`)로 통일한다. 기존 DOM setter + `input`/`change` 이벤트 경로(`runtime/command-handlers.ts:289-306`)를 대체한다.

v1.1 `Depends on`: Phase 4 (v1.0 완료) — `CdpDriver` 단일 구현체 위에서 동작.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택은 Claude 재량. `workflow.skip_discuss=true`에 따라 discuss 단계를 생략했고, 다음 합의된 규칙을 따른다:

- **CDP 단일 경로**: `CdpDriver`를 통해 `Input.insertText`/`Input.dispatchKeyEvent`를 사용. DOM setter 경로는 제거하거나 fallback으로만 유지.
- **Controlled input(React/Vue/Angular) 대응**: native setter 호출 + 네이티브 input event 디스패치 대신, CDP로 실제 키 이벤트/텍스트 삽입을 수행해 프레임워크 state가 자연스럽게 갱신되도록 한다.
- **Contenteditable**: `document.execCommand('insertText', …)`를 폴백으로 두되 기본은 `Input.insertText`로 가도록 한다.
- **Masked input**: 한 글자씩 `Input.dispatchKeyEvent(keyDown/char/keyUp)`을 사용해 masking 라이브러리가 자연스럽게 포매팅을 반영하도록 한다.
- **기존 값 clear 옵션(INPUT-04)**: `agrune_fill` 파라미터로 `clear: boolean` (기본 false) 또는 동등한 옵션을 제공. clear=true일 때 `Select-All` → `Delete` 또는 CDP `Input.dispatchKeyEvent`로 `Meta+A`/`Backspace` 시퀀스.
- **에러 처리**: target 요소를 결정적으로 찾지 못하거나 timeout 시 기존 `@agrune/core` 에러 코드를 따라 구체 에러로 종결한다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project docs
- `agrune/.planning/PROJECT.md` — CDP-only 아키텍처 원칙, 현재 패키지 구조
- `agrune/.planning/REQUIREMENTS.md` §"Input Reliability" — INPUT-01~04 acceptance criteria
- `agrune/.planning/ROADMAP.md` §"Phase 5: Input Reliability" — Success Criteria

### Code surfaces (현재 fill 구현)
- `agrune/packages/runtime/src/command-handlers.ts:289-306` — 기존 fill 핸들러 (DOM setter 경로)
- `agrune/packages/core/src/driver.ts` — `BrowserDriver` 인터페이스
- `agrune/packages/browser/src/cdp-driver.ts` — `CdpDriver` 구현체
- `agrune/packages/mcp/src/tools/fill.ts` (또는 동등) — MCP `agrune_fill` 도구 정의

### CDP 레퍼런스 (외부)
- Chrome DevTools Protocol `Input` domain: `Input.insertText`, `Input.dispatchKeyEvent`, `Input.dispatchMouseEvent` — researcher가 공식 문서 확인

</canonical_refs>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. v1.0 codebase maps available at `.planning/milestones/v1.0-codebase/` for architecture baseline.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss skipped. ROADMAP success criteria + REQUIREMENTS §Input Reliability이 명세 본체.

</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped.

</deferred>

---

*Phase: 05-input-reliability*
*Context gathered: 2026-04-18*
