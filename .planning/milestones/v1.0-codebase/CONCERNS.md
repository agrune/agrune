# Codebase Concerns

**Analysis Date:** 2026-04-07

## Tech Debt

**Stale installation documentation:**
- Issue: 현재 제품 방향과 맞지 않는 설치 경로 문서가 남아 있음
- Files: `agrune/docs/agent-setup.md`, `demo/README.md`
- Why: 최근 `@agrune/cli` 제거와 package restructure 이후 문서 정리가 완전히 끝나지 않음
- Impact: 새 기여자가 폐기된 `@agrune/cli`, `packages/mcp-server` 경로를 따라갈 수 있음
- Fix approach: 현행 진입점 `@agrune/mcp`, `workflows/annotate`, extension install 흐름으로 문서 일괄 정리

**Workspace as multi-repo bundle:**
- Issue: 작업 디렉터리 아래에 `agrune`, `demo`, `skills`, `.github`가 각각 독립 git repo로 존재
- Why: 제품 본체, fixture, plugin, org-profile를 병렬 운영
- Impact: 자동화 도구가 루트를 단일 repo로 가정하면 commit/status/branch 흐름이 흔들릴 수 있음
- Fix approach: 루트 orchestration 규칙을 문서화하거나 상위 메타 저장소 여부를 명확히 정의

## Known Bugs / Likely Breakages

**Release workflow references outdated package paths:**
- Symptoms: tag release 시 버전 검증이나 build 단계가 깨질 가능성
- Trigger: `agrune/.github/workflows/release.yml` 실행
- Root cause: workflow가 `packages/server` 같은 현재 존재하지 않는 경로를 계속 참조
- Workaround: 수동 release 검증
- Fix approach: 현재 package graph(`core/runtime/browser/mcp/devtools/extension`) 기준으로 workflow 정리

**Release automation conflicts with stated policy:**
- Symptoms: 릴리스 문서/결정과 실제 CI 구현이 불일치
- Trigger: Chrome Web Store 업로드 job 확인
- Root cause: `release.yml`이 `npx chrome-webstore-upload-cli`를 사용하지만 `CLAUDE.md`에는 비공식 CLI 사용 금지 결정이 기록돼 있음
- Workaround: 수동 배포
- Fix approach: 공식 CWS REST API 또는 수동 절차 중 하나로 통일

## Security Considerations

**Local native-host trust boundary:**
- Risk: native host, backend daemon, extension 사이 로컬 메시징이 핵심 제어 경로이므로 설치/allowed origins가 어긋나면 오작동하거나 의도치 않은 연결이 생길 수 있음
- Current mitigation: host name 고정, local-only architecture, extension/native host pairing
- Recommendations: 설치/검증 스크립트와 allowed origin 검증을 더 자동화

**Release secrets are concentrated in GitHub Actions:**
- Risk: npm/CWS 자격 증명 유출 시 배포 채널이 손상됨
- Current mitigation: GitHub Actions secrets 사용
- Recommendations: release workflow 단순화, 불필요한 제3자 CLI 제거, 최소 권한 토큰 사용

## Performance Bottlenecks

**Periodic snapshot loop on every annotated tab:**
- Problem: content script가 800ms 간격으로 snapshot 요청을 반복
- Files: `agrune/packages/extension/src/content/index.ts`
- Cause: 실시간 상태 업데이트를 polling 기반으로 유지
- Impact: 복잡한 DOM이나 다수 탭에서 스캔 비용이 누적될 수 있음
- Improvement path: mutation-driven refresh 비중 확대, adaptive interval, active tab 우선 전략

**Full DOM scan and snapshot recomputation:**
- Problem: runtime이 `data-agrune-action` 전체를 스캔하고 relevant mutation마다 snapshot signature를 재평가
- Files: `agrune/packages/runtime/src/runtime/snapshot.ts`, `agrune/packages/runtime/src/runtime/page-agent-runtime.ts`
- Cause: semantic correctness 우선 설계
- Improvement path: incremental diff, group-level invalidation, large-page heuristics

## Fragile Areas

**Extension/native host/backend handshake:**
- Why fragile: content script, background, native host, backend daemon이 모두 살아 있어야 extension mode가 완성됨
- Common failures: sender 미연결, stale snapshot, extension reload 후 context invalidation
- Safe modification: `ExtensionDriver.ensureReady`, `message-router`, `agrune-mcp.ts`를 함께 읽고 수정
- Test coverage: unit/integration-style tests는 있으나 실제 설치 환경 E2E는 부족

**CDP runtime injection path:**
- Why fragile: attach/launch, binding registration, page runtime bootstrap 순서가 중요
- Common failures: 이미 열린 탭 주입 누락, session detach, snapshot 초기화 실패
- Safe modification: `cdp-driver.ts`, `cdp-runtime-injector.ts`, runtime binding flow를 같이 검토
- Test coverage: package tests 존재하지만 실제 Chrome matrix 테스트는 없음

**Annotation quality enforcement split:**
- Why fragile: `demo`는 Vite lint 플러그인으로 annotation 품질을 검사하지만 실제 제품 저장소 전체에는 동일한 강제 장치가 없음
- Common failures: 누락된 group/name/desc, ambiguous target naming
- Safe modification: workflow + lint + fixture를 같이 갱신

## Missing Critical Features

**Automated E2E / overlay verification:**
- Problem: 문서상 우선순위에 overlay E2E가 있으나 저장소엔 정식 E2E 스위트가 없음
- Blocks: 실제 Chrome 상의 end-to-end confidence
- Implementation complexity: medium

**Desktop / OS-level automation path:**
- Problem: 현재 구조는 browser-first이며 OS-level surface abstraction은 아직 없음
- Blocks: 접근성/vision 기반 데스크톱 확장 아이디어 실험
- Implementation complexity: high

## Test Coverage Gaps

**`demo/` application:**
- What's not tested: UI flows, drag-and-drop, iframe viewer, localStorage persistence
- Risk: fixture가 깨져도 제품 패키지 테스트만으로는 감지되지 않음
- Priority: High

**`skills/` and annotate workflow wrappers:**
- What's not tested: onboarding/annotation wrapper behavior
- Risk: 제품 본체와 wrapper 문서가 드리프트할 수 있음
- Priority: Medium

**Release pipeline:**
- What's not tested: tag build, publish packaging, Chrome Web Store upload path
- Risk: 릴리스 시점에만 실패 발견
- Priority: High

---

*Concerns audit: 2026-04-07*
*Update as release/docs/runtime issues are fixed or new fragile areas appear*
