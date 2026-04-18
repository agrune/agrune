# Roadmap: agrune

## Milestones

- ✅ **v1.0 Research** — Phases 1-4 (shipped 2026-04-18) — [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Browser Completion** — Phases 5-10 (defining 2026-04-18)

## Phases

<details>
<summary>✅ v1.0 Research (Phases 1-4) — SHIPPED 2026-04-18</summary>

- [x] Phase 1: Channel Inventory and Constraints (3/3 plans)
- [x] Phase 2: Annotation Methods Report (2/2 plans)
- [x] Phase 3: Annotation Alternatives Report (2/2 plans)
- [x] Phase 4: Product Synthesis and Recommendation (2/2 plans)

</details>

### v1.1 Browser Completion

- [ ] **Phase 5: Input Reliability** — `agrune_fill`을 CDP Input 도메인 기반으로 통일하여 controlled/contenteditable/masked 입력을 결정적으로 처리
- [ ] **Phase 6: Stability & Recovery** — CDP 연결 손실·Chrome crash에 대한 self-healing 루프와 manifest resync 도입
- [ ] **Phase 7: Multi-Tab Session UX** — active session 개념과 `agrune_focus` 도구로 다중 탭 의도를 명확화
- [ ] **Phase 8: DevTools Webapp** — 명령 로그·HITL 제어·실패 진단·세션 선택 UX로 devtools 웹앱 완성
- [ ] **Phase 9: Quality Infrastructure** — Playwright 기반 E2E 프레임과 annotation build-linter를 CI에 연결
- [ ] **Phase 10: Docs & Distribution** — 문서·조직 프로필·CLI·automation profile UX를 CDP-only 현실에 맞게 정리

## Phase Details

### Phase 5: Input Reliability
**Goal**: `agrune_fill`이 controlled input·contenteditable·masked input 시나리오에서 결정적으로 작동한다
**Depends on**: Phase 4 (v1.0 완료) — 피봇 후 `CdpDriver` 단일 구현체 위에서 동작
**Requirements**: INPUT-01, INPUT-02, INPUT-03, INPUT-04
**Success Criteria** (what must be TRUE):
  1. 사용자가 React/Vue/Angular controlled input이 포함된 페이지에서 `agrune_fill`을 호출하면 프레임워크 state가 실제 입력값을 반영한다
  2. 사용자가 `contenteditable` 영역을 대상으로 `agrune_fill`을 호출하면 입력된 텍스트가 그대로 유지된다
  3. 사용자가 전화번호·카드번호 같은 masked input을 대상으로 채워도 포맷이 깨지지 않고 최종 값이 유지된다
  4. 사용자가 기존 값을 지우고 새 값을 입력하는 옵션을 명시적으로 요청할 수 있으며 결과가 일관되다
**Plans**: TBD

### Phase 6: Stability & Recovery
**Goal**: CDP 연결 손실과 Chrome crash를 자동 복구하고 실패 시 명확한 에러 신호를 제공한다
**Depends on**: Phase 5 (입력 경로가 CDP Input 도메인으로 통일된 뒤 재연결 후 동작 검증이 의미 있음)
**Requirements**: HEAL-01, HEAL-02, HEAL-03, HEAL-04
**Success Criteria** (what must be TRUE):
  1. CDP 연결이 끊어지면 사용자가 아무 조작 없이 자동 재연결을 관찰하며 MCP 응답에 복구 상태가 기록된다
  2. Chrome 프로세스가 죽으면 launcher가 자동으로 재시작하고 기존 세션이 재연결된 상태로 복귀한다
  3. 재연결 직후 첫 도구 호출이 런타임 주입·manifest 상태 resync 없이도 정상 동작한다
  4. 자동 복구가 실패했을 때 사용자는 MCP 응답만 보고 원인과 다음 액션을 알 수 있다
**Plans**: TBD

### Phase 7: Multi-Tab Session UX
**Goal**: 사용자가 여러 탭을 열어도 의도한 탭이 조작되고 탭 간 포커스를 명시적으로 전환할 수 있다
**Depends on**: Phase 6 (resync 경로가 준비되어야 active session 전환 시 런타임 상태가 깨지지 않음)
**Requirements**: SESS-01, SESS-02, SESS-03
**Success Criteria** (what must be TRUE):
  1. `tabId`를 지정하지 않고 호출해도 가장 최근 상호작용한 탭(active session)이 선택된다
  2. `agrune_focus`로 특정 세션을 active로 전환하면 이후 도구 호출이 그 세션을 대상으로 실행된다
  3. 여러 탭을 동시에 열어도 MCP 응답에서 어느 세션이 active였는지 추적할 수 있다
**Plans**: TBD

### Phase 8: DevTools Webapp
**Goal**: 사용자가 devtools 웹앱만 열어두고도 자동화 세션의 상태를 관찰하고 HITL 개입할 수 있다
**Depends on**: Phase 7 (active session 개념이 먼저 존재해야 devtools UI가 그 상태를 표출·전환할 수 있음)
**Requirements**: SESS-04, DEVT-01, DEVT-02, DEVT-03, DEVT-04
**Success Criteria** (what must be TRUE):
  1. 사용자가 devtools 웹앱에서 실행된 MCP 명령 로그를 시간순으로 확인하고 필터링할 수 있다
  2. 사용자가 devtools 웹앱에서 실행 중인 자동화를 일시정지·재개·스킵(HITL 제어)할 수 있다
  3. 명령이 실패하면 devtools 웹앱에서 원인·대상 노드·어노테이션 상태가 한 화면에 진단 표시된다
  4. 사용자가 devtools 웹앱의 세션 목록에서 active session을 확인하고 다른 세션으로 전환할 수 있다 (SESS-04 UI 표면)
**Plans**: TBD
**UI hint**: yes

### Phase 9: Quality Infrastructure
**Goal**: Overlay/modal 포함 자동화 시나리오와 annotation 정합성이 실제 브라우저 + CI에서 자동 검증된다
**Depends on**: Phase 8 (E2E 시나리오를 돌리려면 입력·복구·세션·devtools가 충분히 안정화되어 있어야 함)
**Requirements**: QUAL-01, QUAL-02, QUAL-03
**Success Criteria** (what must be TRUE):
  1. 레포에서 `pnpm test:e2e`(또는 동등 명령)가 실제 브라우저로 overlay/modal 시나리오를 실행한다
  2. CI 파이프라인이 해당 E2E를 실행하고 실패 시 PR을 블록한다
  3. 사용자가 `data-agrune-*` 어노테이션을 잘못 작성하면 build-linter가 빌드 타임에 중복/누락/오타를 보고한다
  4. build-linter 실패가 CI에서 블록 조건으로 동작한다
**Plans**: TBD

### Phase 10: Docs & Distribution
**Goal**: 외부 사용자가 README·조직 프로필·CLI `--help`만으로 CDP-only 현실의 agrune를 이해하고 시작할 수 있다
**Depends on**: Phase 9 (실제 동작 표면이 확정된 뒤 문서를 맞춰야 drift가 재발하지 않음)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. `agrune/README.md`·`AGENTS.md`·`docs/notes/`·`docs/improvement-notes.md`에 extension mode 잔재 표현이 남아있지 않다
  2. `.github/profile/README.md`(별도 git repo `/Users/chenjing/dev/agrune/.github/.git`에서 관리)가 CDP-only·`@agrune/mcp` 메시지로 갱신되어 github.com/agrune 조직 프로필에 반영된다
  3. 사용자가 `agrune --help`를 실행하면 `--headless`·`--attach`·`--port`·`--no-devtools`와 기본 포트 47654가 문서화되어 보인다
  4. 사용자가 README만 보고 automation profile을 import하거나 복제하는 단계를 따라할 수 있다
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Channel Inventory and Constraints | v1.0 | 3/3 | Complete | 2026-04-07 |
| 2. Annotation Methods Report | v1.0 | 2/2 | Complete | 2026-04-07 |
| 3. Annotation Alternatives Report | v1.0 | 2/2 | Complete | 2026-04-07 |
| 4. Product Synthesis and Recommendation | v1.0 | 2/2 | Complete | 2026-04-07 |
| 5. Input Reliability | v1.1 | 0/TBD | Not started | - |
| 6. Stability & Recovery | v1.1 | 0/TBD | Not started | - |
| 7. Multi-Tab Session UX | v1.1 | 0/TBD | Not started | - |
| 8. DevTools Webapp | v1.1 | 0/TBD | Not started | - |
| 9. Quality Infrastructure | v1.1 | 0/TBD | Not started | - |
| 10. Docs & Distribution | v1.1 | 0/TBD | Not started | - |

---

Roadmap v1.1 created 2026-04-18. Next: `/gsd-plan-phase 5`.
