# Phase 9: Quality Infrastructure - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Overlay/modal 포함 자동화 시나리오와 `data-agrune-*` 어노테이션 정합성이 실제 브라우저 + CI에서 자동 검증되도록 두 개의 파이프라인을 세운다:

1. **E2E 프레임 (Playwright)** — `pnpm test:e2e` 또는 동등 명령이 실제 Chrome을 띄워 overlay/modal 시나리오를 돌리고, CI에서 실행된다.
2. **Annotation build-linter** — `docs/superpowers/specs/2026-03-29-build-linter-design.md` 스펙을 구현. 빌드 타임에 어노테이션 중복/누락/오타 검증, CI 실패 조건으로 동작.

**Depends on**: Phase 8 (입력·복구·세션·devtools가 충분히 안정화된 뒤).

Requirements: QUAL-01, QUAL-02, QUAL-03.

또한 본 phase는 누적된 **pre-existing tech debt**를 정리:
- `@agrune/mcp` `devtools-server.spec.ts` 테스트 4개 race condition 복구
- Phase 6에서 미뤘던 low-severity 리뷰 지적(unused vars 등)
- Phase 8 UI-review 22/24 잔여 -1 × 2 (toolbar padding·group-header font-weight 정합) 정리

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
공유 규칙:

- **E2E 프레임워크**: Playwright 선택(이미 의존성 등록돼 있지 않아도 추가 허용). 모노레포 루트에 `packages/e2e/` 또는 `tests/e2e/` 중 저장소 컨벤션에 맞는 위치에 배치.
- **시나리오 타겟**: 단위 테스트로 커버가 어려운 overlay/modal 케이스 중심. 별도 fixture HTML 페이지를 `tests/e2e/fixtures/` 에 두고, `agrune_fill`·`agrune_act`·`agrune_focus`·HITL 시나리오를 브라우저 대상으로 검증.
- **CI 통합**: 기존 CI(`.github/workflows/*.yml`)에 e2e job 추가. lint/unit 통과 후 직렬 실행. headless 모드 기본.
- **Build-linter**: `@agrune/runtime` 또는 `@agrune/core`에 별도 하위 모듈로 구현. AST 레벨(정적 분석)으로 `data-agrune-*` annotation 스캔 → 중복/누락/오타 보고.
- **Linter 연결**: `pnpm build` (Turbo/nx 여부에 따라 조정) 흐름에 hook 또는 별도 `pnpm lint:annotations` 명령 후 CI 에서 required step.
- **기술부채 정리**: 같은 phase 범위 내에서 해결. 단 범위를 벗어나는 리팩터는 하지 않음.
- **Spec 참조**: `docs/superpowers/specs/2026-03-29-build-linter-design.md`를 전체 읽고 반영.

</decisions>

<canonical_refs>
## Canonical References

### Project docs
- `.planning/REQUIREMENTS.md` §"Quality Infrastructure" — QUAL-01~03
- `.planning/ROADMAP.md` §"Phase 9" — Success Criteria
- `.planning/PROJECT.md` — v1.1 방향

### Code surfaces
- `packages/mcp/tests/devtools-server.spec.ts` — pre-existing race conditions
- `packages/browser/` — Phase 6 잔여 unused vars
- `packages/devtools/src/panel.css` — Phase 8 UI-review 지적 대상

### 외부 스펙
- `docs/superpowers/specs/2026-03-29-build-linter-design.md` — build-linter 설계 본문 (필수)
- Playwright 공식 문서

</canonical_refs>

<code_context>
## Existing Code Insights

Will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

- Playwright headless 모드 기본, `PWDEBUG=1`로 headed 가능.
- CI matrix는 현재 설정 그대로 확장. Node 버전/OS 추가는 범위 밖.

</specifics>

<deferred>
## Deferred Ideas

- 본격적인 visual regression (screenshot diff)은 범위 밖.
- Windows CI runner는 v1.2+.

</deferred>

---

*Phase: 09-quality-infrastructure*
*Context gathered: 2026-04-18*
