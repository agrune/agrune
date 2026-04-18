# Phase 1: Channel Inventory and Constraints - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

현재 agrune의 브라우저 전용 구조를 기준점으로 삼고, macOS local control 연구에 필요한 제어 채널을 같은 비교 프레임으로 정리한다. 이 phase는 구현안을 고르는 단계가 아니라, 이후 보고서들이 공통으로 참조할 capability / permission / trust baseline을 만드는 단계다.

</domain>

<decisions>
## Implementation Decisions

### Comparison Frame
- 모든 채널은 `deterministic vs probabilistic`, `ownership required`, `permissions`, `setup burden`, `fallback role` 기준으로 비교한다.
- Chrome/Chromium 에 대해서는 기존 `DOM/CDP` 경로를 gold path 로 유지하고, macOS 경로는 그 이후에 덧붙이는 식으로 판단한다.
- 권한, 보안, 사용자 신뢰는 부록이 아니라 핵심 평가 축으로 다룬다.

### Deliverable Shape
- 이 phase의 핵심 산출물은 채널 인벤토리 보고서 하나와 supporting plans/summaries/verification 이다.
- 이후 phase 에서 재사용할 수 있게 용어를 `surface`, `source`, `confidence`, `semantic action`, `fallback action`으로 통일한다.

### the agent's Discretion
- 세부 비교 항목의 문구와 표 구조는 연구 가독성을 우선해 조정할 수 있다.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agrune/README.md` 가 현재 제품의 MCP 표면과 package split 을 잘 설명한다.
- `.planning/codebase/ARCHITECTURE.md` 가 현재 browser/runtime/mcp 분리를 요약한다.

### Established Patterns
- 현재 제품은 semantic annotation 을 명시적으로 우선한다.
- 브라우저에서는 `DOM/CDP` 기반 deterministic control 이 핵심 가치다.

### Integration Points
- future desktop work 는 `@agrune/core` 의 contract shape 일반화와 새 native bridge 추가 지점에 연결된다.
- 연구 문서는 root `.planning/` 아래에 남기고, 실제 제품 코드는 `agrune/` 서브레포를 기준으로 본다.

</code_context>

<specifics>
## Specific Ideas

권한 모델과 사용자 신뢰를 “기능 가능 여부”와 같은 비중으로 다룬다. 셋업은 까다로워도 사용은 쉬워야 한다는 원칙을 각 채널 비교에 반영한다.

</specifics>

<deferred>
## Deferred Ideas

- 실제 native helper 구현
- 앱별 호환성 벤치마크
- 성능 계측 자동화

</deferred>
