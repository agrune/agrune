# Phase 3: Annotation Alternatives Report - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

이 phase 는 direct annotation 이 없거나 불가능한 경우에 사용할 대체 전략만 다룬다. 접근성/스크립팅/브리지처럼 앱이 의도적으로 semantics 를 제공하는 경우는 direct tier 로 보고, 여기서는 외부 합성 또는 외부 구조화 전략을 본다.

</domain>

<decisions>
## Implementation Decisions

### Alternative Qualification Rules
- direct annotation 이 없어도 사용할 수 있어야 한다.
- 단순 OCR-only 전략은 독립 케이스로 인정하지 않는다.
- 각 대체 방법은 target acquisition, verification, recovery model 을 명시해야 한다.

### Expected Cases
- external AX harvesting + synthetic annotation
- manual external profile + structural locator graph
- screen capture + local vision / ML + verification loop

### the agent's Discretion
- 각 대체 방식의 명칭은 제품적 가독성을 우선해 다듬을 수 있다.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 에서 channel inventory 와 deterministic-first policy 를 확정했다.
- current agrune 는 이미 pointer, guide, snapshot 같은 공통 verb 를 가진다.

### Established Patterns
- fallback 은 semantic path 를 대체하지 않고 보완해야 한다.
- user trust 를 위해 visible guidance 와 verification 이 필요하다.

### Integration Points
- 대체 전략은 synthesis 에서 coverage tier 로 들어간다.
- manual profile 과 vision fallback 은 future desktop overlay layer 와 연결된다.

</code_context>

<specifics>
## Specific Ideas

유저가 위치를 계속 바꾸기 때문에 absolute coordinates 와 OCR-only 는 main strategy 가 될 수 없다는 점을 보고서의 전제로 둔다.

</specifics>

<deferred>
## Deferred Ideas

- cross-platform fallback generalization
- model training / benchmark suite

</deferred>
