# Phase 2: Annotation Methods Report - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

이 phase 는 “앱이나 플랫폼 의미 정보에 기대는 직접 어노테이션 방식”만 다룬다. 접근성 없이 외부에서 긁어오는 방식이나 vision fallback 은 여기서 다루지 않는다. 직접성이란, 대상 앱 또는 플랫폼이 agrune 가 사용할 semantic signal 을 의도적으로 제공한다는 뜻이다.

</domain>

<decisions>
## Implementation Decisions

### Method Qualification Rules
- 각 케이스는 서로 materially different 한 integration point 를 가져야 한다.
- direct method 로 인정되려면 단순 좌표 클릭이 아니라 semantic signal 을 stable 하게 제공해야 한다.
- 각 방법은 `ownership needed`, `coverage`, `security`, `ux`, `performance` 를 같은 표준으로 평가한다.

### Expected Cases
- first-party native SDK embedding
- accessibility semantics as a carrier
- web/electron/internal bridge exposure

### the agent's Discretion
- 케이스 이름과 세부 세분화는 가독성을 위해 조정 가능하다.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- 현재 agrune 의 strongest direct method 는 browser DOM annotation 이다.
- root research docs 에서 이미 channel matrix 와 policy baseline 을 정리했다.

### Established Patterns
- browser path 는 deterministic anchor 다.
- local-first 와 explicit semantics 가 제품 원칙이다.

### Integration Points
- direct methods report 는 이후 synthesis 에서 hybrid architecture 의 semantic tier 로 재사용된다.

</code_context>

<specifics>
## Specific Ideas

“앱에 직접 어노테이션”이라는 표현이 실제로 무엇을 뜻하는지를 ownership 모델별로 분해한다. 즉, 소스를 가진 앱과 없는 앱, Electron 같은 hybrid app 과 pure native app 을 같은 말로 다루지 않는다.

</specifics>

<deferred>
## Deferred Ideas

- 접근성 없는 앱에 대한 fallback
- 비전/ML 기반 대체 전략

</deferred>
