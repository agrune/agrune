# Milestones

## v1.1 Browser Completion (Shipped: 2026-04-18)

**Phases completed:** 6 phases, 19 plans

**Key accomplishments:**

- `agrune_fill`이 CDP `Input.insertText` / `dispatchKeyEvent` 경로로 통일되어 React/Vue/Angular controlled input·contenteditable·masked input을 결정적으로 처리 (INPUT-01..04)
- CDP 연결 손실·Chrome crash에 대한 `RecoverySupervisor` 자동 복구 루프 + `reprepareAllTargets` resync + `CONNECTION_LOST`/`CHROME_CRASHED`/`RECOVERY_FAILED` 에러 코드 추가 (HEAL-01..04)
- `SessionManager` active session 추적·`agrune_focus` MCP 도구·모든 도구 응답의 `session.{wasActive,becameActive}` 메타로 다중 탭 의도 명확화 (SESS-01..03)
- DevTools 웹앱 완성: 500-event FIFO 명령 로그 + tool/session/status 필터, `HitlController` pause/resume/step/skip, 실패 진단 카드, 세션 선택·Focus UI (SESS-04, DEVT-01..04)
- Playwright 기반 `packages/e2e/` (8 specs, overlay/modal + HITL) + annotation build-linter (`packages/core/src/annotation-lint/`)를 CI `build-test` + `e2e` 잡으로 블록 조건 배선 (QUAL-01..03)
- README·AGENTS·improvement-notes에서 extension mode 잔재 제거, CLI `--help` 플래그 문서화, automation profile import/clone/attach UX 추가, `.github/profile/README.md` CDP-only 재작성 (DOCS-01..04)
- 외부 `/Users/chenjing/dev/agrune/.github` repo 커밋 `7cea367` 생성 (push는 사용자 수동 후속 조치)

**Known deferred items at close:**
- 마스크 입력 heuristic 커버리지가 좁음 (library-custom masks는 `strategy='keystroke'` override 필요)
- Live-browser relaunch-and-reconnect E2E 시나리오 (Phase 9 E2E 프레임에 구조만 배선됨)
- GitHub branch-protection required-check 토글 (레포 외부 설정)
- 외부 `.github` repo push (사용자 수동)

---

## v1.0 Research (Shipped: 2026-04-18)

**Phases completed:** 4 phases, 9 plans, 9 tasks

**Key accomplishments:**

- Current agrune의 브라우저 gold path 를 기준점으로 고정해 desktop research 가 regression 을 일으키지 않도록 정리했다.
- DOM/CDP, AX, Apple events, ScreenCapture, Vision, manual profiles를 하나의 capability matrix 로 정리했다.
- 이후 연구 phase 전체에 공통 적용할 perception/action 정책과 product truths 를 고정했다.
- “앱에 직접 annotation”을 세 가지 다른 integration model 로 분해해 direct methods taxonomy 를 만들었다.
- 직접 어노테이션 전략만으로는 universal desktop coverage 가 안 되며, 현실적 조합은 accessibility-carrier + embedded web bridge 라고 결론냈다.
- 직접 어노테이션이 없을 때의 대체 전략을 AX harvesting, manual profiles, vision fallback 으로 분리했다.
- 대체 전략의 핵심은 후보 생성보다 verification loop 라는 점을 정리하고, AX default / manual profile rescue / vision last resort 구도를 제안했다.
- 여섯 케이스를 한 비교판에 올리고, 제품이 안전하게 약속할 수 있는 범위를 분리했다.
- 최종 결론은 ‘browser precision 유지 + AX-first hybrid expansion 은 GO, universal direct annotation 과 vision-first positioning 은 NO-GO’다.

---
