# Testing Patterns

**Analysis Date:** 2026-04-07

## Test Framework

**Runner:**
- Vitest 4.x
- Config files:
  - `agrune/packages/core/vitest.config.ts`
  - `agrune/packages/runtime/vitest.config.ts`
  - `agrune/packages/mcp/vitest.config.ts`
  - `agrune/packages/extension/vitest.config.ts`

**Assertion Library:**
- Vitest built-in `expect`
- `describe`, `it`, `beforeEach`, `afterEach`, `vi` directly imported or globals enabled

**Environment:**
- 대부분 Node-like unit tests
- extension tests는 `jsdom` environment 사용

## Run Commands

```bash
cd /Users/chenjing/dev/agrune/agrune && pnpm test
cd /Users/chenjing/dev/agrune/agrune && pnpm --filter @agrune/core test
cd /Users/chenjing/dev/agrune/agrune && pnpm --filter @agrune/runtime test
cd /Users/chenjing/dev/agrune/agrune && pnpm --filter @agrune/extension test
cd /Users/chenjing/dev/agrune/demo && pnpm lint
cd /Users/chenjing/dev/agrune/demo && pnpm typecheck
```

## Test File Organization

**Location:**
- package별 별도 `tests/` 디렉터리
- 예:
  - `agrune/packages/browser/tests/*.spec.ts`
  - `agrune/packages/extension/tests/*.spec.ts`
  - `agrune/packages/extension/tests/background/*.spec.ts`

**Current coverage footprint:**
- `browser`: 6 spec files
- `core`: 2 spec files
- `runtime`: 4 spec files
- `mcp`: 4 spec files
- `extension`: 14 spec files
- `demo`: 자동 테스트 없음

## Test Structure

**Suite Organization:**
- `describe()`로 모듈/기능 단위 구분
- `it()`로 개별 동작 명세
- fake timers가 필요한 경우 `beforeEach/afterEach`에서 `vi.useFakeTimers()` 관리

**Representative patterns:**
- `agrune/packages/browser/tests/extension-driver.spec.ts`
  - session open/close, snapshot update, agent activity tail lease 검증
- `agrune/packages/mcp/tests/tools.spec.ts`
  - 도구 스키마와 required/optional 필드 검증
- `agrune/packages/extension/tests/background/*`
  - extension background 라우팅 로직을 mock chrome API로 검증

## Mocking

**Framework:**
- `vi.fn()`, `vi.mock()`, fake timers

**Patterns:**
- Chrome API mocking:
  - `agrune/packages/extension/tests/background/chrome-mock.ts`
  - `chrome.runtime`, `chrome.tabs`, `chrome.debugger`를 직접 흉내냄
- snapshot fixture 생성:
  - 테스트 파일 안에서 `makeSnapshot()` helper를 정의해 필요한 필드만 override
- async command flow:
  - native message / command_result를 수동 주입해 queue 해소 여부를 검증

**What gets mocked:**
- Chrome extension APIs
- native messaging transport
- time / timers
- CDP event delivery

## Coverage Characteristics

**Strongly covered:**
- MCP 도구 shape와 public contract
- browser driver/session manager/command queue
- extension background/content bootstrap
- runtime command sequencing and snapshot behavior

**Weakly covered:**
- end-to-end browser automation across real Chrome
- release pipeline
- `demo` UI behavior
- `skills/` wrappers와 `workflows/annotate` 문서 흐름

## Test Types in Practice

**Unit Tests:**
- package module 단위 순수 로직 검증
- snapshot/result shape, helper behavior, session state transitions

**Integration-ish Tests:**
- browser/extension 계층에서 여러 모듈을 엮어 command flow를 검증
- 실제 브라우저 대신 mock transport / mock chrome을 사용

**E2E Tests:**
- 저장소 안에 정식 E2E 프레임워크는 아직 없음
- 대신 `demo/`와 수동 extension 검증 절차가 fixture 역할을 수행

## Common Patterns to Match

**Async Success:**
- `await driver.execute(...)`
- 필요한 응답은 테스트 안에서 `handleNativeMessage`나 mock callback으로 직접 주입

**Async Failure / Error Path:**
- `await expect(...).resolves` 또는 `rejects`
- invalid input은 schema/property assertions로 먼저 검증

**Stateful Timers:**
- 시각 효과나 lease 로직은 fake timers로 정확한 시간 경과를 검증

## Practical Guidance

- 제품 로직 수정 시 해당 package `tests/`에 spec 추가가 기본 패턴
- Chrome/DOM 경계 로직은 실제 브라우저 대신 mock layer를 먼저 확장하는 편이 저장소 스타일과 맞음
- UI fixture인 `demo/` 변경은 최소한 `lint`, `typecheck`, `build`까지 돌려서 간접 검증하는 편이 안전

---

*Testing analysis: 2026-04-07*
*Update when E2E coverage, test runners, or package layouts change*
