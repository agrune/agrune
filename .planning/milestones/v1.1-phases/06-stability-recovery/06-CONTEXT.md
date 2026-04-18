# Phase 6: Stability & Recovery - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

CDP 연결 손실과 Chrome crash를 자동 복구하고, 복구 실패 시 명확한 에러 신호를 제공한다. 재연결 후 `CdpRuntimeInjector`와 manifest 상태가 resync 되어 사용자가 아무 조작 없이 다음 도구 호출이 정상 동작하도록 한다.

**Depends on**: Phase 5 (입력 경로가 CDP Input 도메인으로 통일된 뒤 재연결 후 동작 검증이 의미 있음).

Requirements: HEAL-01, HEAL-02, HEAL-03, HEAL-04.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
모든 구현 선택 Claude 재량. `workflow.skip_discuss=true`. 공유 규칙:

- **감지 지점**: `CdpConnection`의 WebSocket close/error 이벤트에서 연결 손실을 감지. Chrome launcher의 process exit에서 crash 감지.
- **복구 전략**: exponential backoff + 최대 재시도 회수(예: 5회). 회수 초과 시 HEAL-04 에러 코드로 종결.
- **Resync**: 재연결 후 기존 `SessionManager`/`CdpTargetManager`가 알고 있던 target/frame id가 변경되었을 수 있으므로 target 재조회 → `CdpRuntimeInjector`로 runtime 재주입 → manifest 재빌드.
- **API surface**: 기존 MCP 도구들은 그대로 유지. 내부에서 복구 단계가 자동으로 수행되고 MCP 응답의 메타에 `recovered: true` 또는 에러 시 구조화된 원인을 실음.
- **로깅**: devtools 웹앱에 복구 이벤트를 stream 하기 위해 기존 event bus를 사용(이미 존재하지 않으면 Phase 8이 처리).
- **테스트**: 실제 WebSocket 드랍·Chrome kill 시뮬레이션은 E2E로 어렵기에, 단위 테스트는 `CdpConnection` mock + launcher mock으로 작성하고 실제 브라우저 시나리오는 Phase 9 QUAL-01 E2E로 연기.

</decisions>

<canonical_refs>
## Canonical References

### Project docs
- `.planning/REQUIREMENTS.md` §"Stability & Recovery" — HEAL-01~04
- `.planning/ROADMAP.md` §"Phase 6" — Success Criteria 4개
- `.planning/PROJECT.md` — CDP-only 원칙, `CdpConnection` 위치

### Code surfaces
- `packages/browser/src/cdp-connection.ts` (또는 동등) — WebSocket 연결
- `packages/browser/src/chrome-launcher.ts` — Chrome 프로세스 관리
- `packages/browser/src/session-manager.ts` — 세션 상태
- `packages/browser/src/cdp-target-manager.ts` — target lifecycle
- `packages/browser/src/cdp-runtime-injector.ts` — runtime 주입
- `packages/core/src/errors.ts` — 에러 코드 목록

### 외부 레퍼런스
- Chrome DevTools Protocol `Target.attachToTarget`, `Target.setAutoAttach`, `Runtime.addBinding`, `Page.addScriptToEvaluateOnNewDocument` — researcher가 공식 문서 확인

</canonical_refs>

<code_context>
## Existing Code Insights

Will be gathered during plan-phase research. v1.0 codebase maps at `.planning/milestones/v1.0-codebase/`.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss skipped. REQUIREMENTS §Stability & Recovery + ROADMAP success criteria가 본체.

</specifics>

<deferred>
## Deferred Ideas

- 실제 브라우저 E2E 기반 복구 검증은 Phase 9(QUAL-01)에서 수행.
- DevTools 웹앱에서 복구 이벤트 UI는 Phase 8에서 완성.

</deferred>

---

*Phase: 06-stability-recovery*
*Context gathered: 2026-04-18*
