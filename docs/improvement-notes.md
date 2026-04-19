# 설계 원칙

_Updated 2026-04-19 (v0.5 Manifest Pivot — Phase 17). 이전 버전 (v1.1 기준, 2026-04 CDP-only 피봇 반영) 에서 manifest 경로 반영을 추가하고 legacy inline annotation 언급을 정리._

## 제품 방향

- 제품의 주 제어 표면은 `MCP` 이다 (stdio server).
- 설치/진단용 운영 도구는 핵심 제품 표면이 아니라 보조 수단으로 취급한다.
- 브라우저 조작 능력은 `CdpDriver + @agrune/mcp` 조합으로 제공한다. Chrome 을 직접 CDP 로 제어하며 Chrome 확장/네이티브 메시징 경로는 사용하지 않는다 (2026-04-15 피봇).
- 제어 대상은 외부 `manifest.ts` 파일 (`@agrune/manifest` SDK) 로 선언한다 (v0.5 피봇). 런타임은 페이지 DOM 을 스캔하지 않고 manifest 가 선언한 target 만 resolve 한다.
- 장기적으로는 QA 자동화까지 고려해, 단순 클릭 도구가 아니라 상태 기반 브라우저 런타임으로 발전시킨다.
- 에이전트가 페이지를 분석하려면 manifest 로 등록된 target 외에 visible content 도 읽을 수 있어야 한다. `agrune_read` 는 manifest 와 독립적으로 동작한다.

## 스냅샷 상태 변화

- 페이지 전환 시 새 페이지 기준으로 스냅샷 버전이 바뀌어야 한다.
- 같은 탭이 새 URL로 열리면 이전 snapshot cache는 stale 상태로 보고 비워야 한다.
- 모달/오버레이가 떠 있으면 기본 스냅샷은 배경 요소가 아니라 오버레이 내부의 actionable targets만 보여줘야 한다.
- 모달 컨텍스트에는 클릭만이 아니라 입력 가능한 필드(`fill`)도 포함해야 한다.
- 액션은 가능한 한 `expectedVersion`을 함께 사용해 stale snapshot 사용을 막는다.

## 모달/오버레이

- 오버레이가 활성화되면 배경 타깃 액션은 차단한다.
- MCP도 같은 원칙을 따라, 기본 스냅샷에서는 배경 타깃을 숨긴다.
- QA 자동화 관점에서도 `현재 포커스된 상호작용 영역`만 노출하는 것이 더 안정적이다.

## 액션 타입

- ActionKind 는 `click`, `fill`, `dblclick`, `contextmenu`, `hover`, `longpress` 를 지원한다.
- `agrune_act` 의 `action` 파라미터로 인터랙션 타입을 선택한다. 기본값은 `click`.
- manifest 의 `defineTarget({ actionKinds })` 는 LLM 에게 요소의 주요 인터랙션을 알려주는 힌트이며, 에이전트는 다른 action 을 보낼 수 있다. 단 `fill` 전용 타겟에는 act 커맨드를 거부한다.
- `select` (fill 또는 click+click 으로 대체), `toggle` (click 과 동일), `keypress` (요소 중심 모델에 부적합), `focus` (다른 액션에서 암시적) 는 제외했다.
- 하나의 요소에 복수 인터랙션이 공존하는 경우(drag+dblclick, click+contextmenu 등) manifest 에서 `actionKinds: ['click', 'dblclick']` 처럼 배열로 선언한다. 상세 설계: `docs/notes/9-multi-action-support.md` (v0.4 시점 legacy 속성 기반 설명, manifest 필드명으로 1:1 치환해 읽으면 유효).

## 페이지 콘텐츠 읽기

- `agrune_read` 는 페이지 visible content 를 마크다운으로 변환하여 반환한다.
- manifest 가 비어 있는 페이지에서도 동작한다 (manifest 시스템과 독립).
- CSS 셀렉터로 추출 범위를 지정할 수 있다.
- 출력은 50,000 자로 제한되며, 초과 시 truncation 메시지가 추가된다.
- `read` 는 별도 ActionKind 로 도입하지 않았다 — 모든 텍스트가 읽기 대상이라 경계가 모호하고, manifest 수준에서 자동 추론 규칙 수립이 어렵기 때문.

## Manifest authoring ergonomics (v0.5)

Phase 17 이전 (`data-agrune-*` inline annotation) 방식에서 자주 지적된 ergonomics 이슈는 v0.5 manifest 경로에서 아래처럼 다뤄진다:

- **컴포넌트 소스 수정 비용** — owned React 앱은 root 에 `<AgruneDevtools />` 1 줄 추가만 필요. 개별 element 수정 0. (Phase 13 resolved)
- **외부 사이트 지원** — inline 방식은 소스 접근을 전제했으나 manifest 방식은 `role` / `text` / `testId` / `css` selector fallback 으로 외부 사이트도 커버한다. (Phase 11-12 resolved)
- **리스트 / 가상화 리스트** — `defineRepeat({ keyFrom, nameFrom, strategy })` 로 dom / virtualized 양쪽 지원. (Phase 14 resolved)
- **복합 플로우 (로그인 등)** — `defineMacro` 로 steps 묶어서 `agrune_macro_run` 한 번에 실행. (Phase 14 resolved)
- **recorder precision / selector heuristics** — DevTools RecorderView + `agrune manifest dev` watcher 로 인터랙티브 편집. 추후 v0.6+ 에서 corpus 확대 (Japanese/Korean 민감 레이블, 가상 리스트 인식) 로 개선 여지.
