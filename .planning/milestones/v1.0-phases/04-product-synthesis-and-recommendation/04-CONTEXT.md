# Phase 4: Product Synthesis and Recommendation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

이 phase 는 앞선 두 보고서의 direct methods 와 alternatives 를 하나의 product decision package 로 합친다. 새로운 케이스를 추가하지 않고, 이미 정의된 6개 케이스를 같은 기준으로 비교해 agrune 의 go/no-go 와 prototype order 를 제안한다.

</domain>

<decisions>
## Implementation Decisions

### Synthesis Rules
- direct tier 와 coverage tier 를 분리한 채 비교한다.
- one-size-fits-all 결론을 피하고, product promise 와 actual coverage 를 분리해서 쓴다.
- 구현 세부안보다 go/no-go, prototype order, user viability 판단을 우선한다.

### Expected Outcome
- 6개 케이스 비교 matrix
- recommended hybrid architecture
- first prototype order
- general-user viability verdict

### the agent's Discretion
- matrix 의 열 구성과 priority wording 은 이해하기 쉬운 형태로 조정할 수 있다.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- current agrune 는 browser-first MCP surface 를 이미 가진다.
- Phase 1/2/3 산출물에 비교 프레임과 case taxonomy 가 정리되어 있다.

### Established Patterns
- deterministic-first
- local-first
- trust-through-guidance-and-verification

### Integration Points
- 최종 recommendation 은 future implementation 시 `@agrune/core` contract generalization, native helper, overlay layer, verification loop 순서에 연결된다.

</code_context>

<specifics>
## Specific Ideas

일반 사용자 이용 가능성은 “zero setup” 기준이 아니라 “permission/dev mode 를 감수한 뒤 실제 사용은 간단한가” 기준으로 판단한다.

</specifics>

<deferred>
## Deferred Ideas

- implementation milestone planning
- app-specific compatibility matrix publication

</deferred>
