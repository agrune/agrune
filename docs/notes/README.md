# agrune/docs/notes — 아카이브

> **상태: v1.0 아카이브 (2026-04-15 이전 시점)**
>
> 이 디렉터리의 모든 문서는 2026-04-15 CDP-only 피봇 이전에 작성되었습니다.
> `extension`, `native messaging`, `backend daemon` 같은 표현은 당시 아키텍처를 설명한 것이며,
> 현재 (v1.1) agrune 은 `CdpDriver + @agrune/mcp` 조합만 사용합니다.
>
> 최신 아키텍처는 상위 `agrune/README.md` 와 `agrune/AGENTS.md` 를 참고하세요.

## 목차

| 파일 | 주제 | 현재 상태 |
|------|------|-----------|
| `[통합문서] agrune-notes.md` | v1.0 시점의 전체 설계 메모 통합본 | 참고용 |
| `[통합됨] 1-mcp-warmup-resync-todo.md` | MCP 웜업/리싱크 할일 | 완료 (v1.0) |
| `[통합됨] 2-tab-selection-todo.md` | 탭 선택 UX 할일 | Phase 7 에서 `agrune_focus` 로 해결 |
| `[통합됨] 3-overlay-e2e-todo.md` | 오버레이 E2E 할일 | Phase 9 E2E 하네스로 대체 |
| `[통합됨] 4-extension-improvement-ideas.md` | 확장 개선 아이디어 | **폐기** (extension 경로 제거) |
| `[통합됨] 5-extension-update-ux-todo.md` | 확장 업데이트 UX 할일 | **폐기** |
| `[통합됨] 6-installer-cli-plan.md` | 인스톨러 CLI 설계 | 부분 반영 (`agrune --attach`/`--port`) |
| `[통합됨] 7-release-pipeline-todo.md` | 릴리스 파이프라인 할일 | v1.1 에서 Playwright E2E + annotation lint 으로 보강 |
| `[통합됨] 8-annotation-validation-package.md` | annotation validation 패키지 | Phase 9 `@agrune/core` linter 로 반영 |
| `[통합됨] 9-multi-action-support.md` | multi-action 어노테이션 | 반영 (`data-agrune-action="click,dblclick"`) |
| `[통합됨] 10-canvas-pointer-cdp.md` | canvas 포인터 CDP 메모 | 반영 |
| `[통합됨] 11-cdp-migration-issues.md` | CDP 마이그레이션 이슈 | 해결 (v1.1 CDP-only) |
| `[통합됨] 12-cdp-remaining-tasks.md` | CDP 잔여 작업 | 완료 |
| `[통합됨] 13-canvas-support-strategy.md` | 캔버스 지원 전략 | 반영 |
| `[통합됨] 14-roadmap-ideas.md` | 초기 로드맵 아이디어 | 일부 v1.1/v1.2 로 이관 |
| `[통합됨] 15-main-followups-2026-03-30.md` | main 브랜치 후속 작업 | 완료 (2026-04) |
| `[통합됨] 16-cdp-quick-mode-option.md` | CDP quick mode 옵션 설계 | 반영 (단, 현재는 quick mode 가 아닌 기본 모드) |

---

*Archive index generated 2026-04-18 as part of v1.1 Phase 10 (Docs & Distribution).*
