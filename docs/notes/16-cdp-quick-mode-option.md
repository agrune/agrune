# CDP Quick Mode 옵션 전략

작성일: 2026-04-01

## 배경

현재 agrune은 실질적으로 아래 구조를 사용한다.

- agent -> MCP server
- MCP server -> backend daemon
- backend daemon -> native host
- native host -> Chrome extension
- extension -> page runtime

실행 경로를 보면, 브라우저 연결 transport는 extension에 강하게 묶여 있지만, 실제 조작 엔진은 이미 상당 부분 CDP를 사용한다.

- 클릭/드래그/포인터/휠 등 저수준 입력은 CDP 기반
- page runtime은 페이지 내부에서 스냅샷과 명령 실행을 담당
- DOM 스캔과 manifest 생성은 extension 전용이라기보다 페이지 런타임 부팅 로직에 가까움

문제는 제품 UX다.

- 첫 사용자가 확장 설치부터 강제당함
- "맛보기" 진입 비용이 높음
- quick demo, headless QA, 단일 앱 자동화에는 구조가 과함

따라서 기본 진입 경로로 `CDP quick mode`를 제공하고, 기존 extension 경로는 `full browser integration` 옵션으로 유지하는 방향을 검토한다.

## 목표

- 확장 설치 없이 agrune을 바로 체험할 수 있어야 한다.
- 기존 MCP 도구 인터페이스는 유지한다.
- extension mode는 제거하지 않고 옵션으로 유지한다.
- headless QA 실행이 가능해야 한다.
- 이후에도 extension 기반 진단/통합 UX를 계속 발전시킬 수 있어야 한다.

## 비목표

- 첫 단계에서 quick mode와 extension mode의 완전한 기능 동등성을 보장하지 않는다.
- Chrome for Testing 도입을 지금 당장 기본값으로 삼지 않는다.
- 기존 사용자 Chrome 프로필과 자동화 프로필의 live sync를 지원하지 않는다.

## 핵심 판단

### 1. 브라우저 자동화 코어는 CDP-only로 가능하다

다음 영역은 extension이 없어도 구현 가능하다.

- `data-agrune-*` 스캔
- manifest 생성
- snapshot 생성
- `agrune_act`, `agrune_fill`, `agrune_drag`, `agrune_pointer`, `agrune_wait`, `agrune_read`
- 새 탭/새 창/`window.open()` 팝업 추적
- headless 브라우저 QA

즉 "MCP 변환 때문에 extension이 필수"는 아니다. 현재 구현이 extension 중심으로 설계되어 있을 뿐이다.

### 2. 현재 구조는 "extension transport + CDP execution" 하이브리드다

핵심 조작은 이미 CDP에 기대고 있다. 따라서 extension을 완전히 버리는 문제가 아니라, browser transport를 옵션화하는 문제로 보는 편이 맞다.

### 3. extension은 자동화 엔진보다 브라우저 통합 UX에 더 큰 가치가 있다

extension mode가 계속 유리한 영역:

- popup / devtools panel / side panel
- 세션 선택기
- 명령 로그와 실패 진단
- 타깃 인스펙터
- 기존 Chrome에 설치형으로 상주하는 경험
- 브라우저 탭/창 포커스 UX

즉 앞으로도 extension은 없애는 대상이 아니라, 고급 통합 모드로 유지할 가치가 있다.

## 제품 방향

### Quick Mode

- 확장 설치 없이 시작
- CDP로 브라우저에 직접 연결
- quick demo / 단일 앱 자동화 / headless QA 용도

### Full Browser Integration Mode

- 기존 extension + native host 경로 유지
- 설치형 브라우저 통합 UX 제공
- 세션 선택, 진단 UI, inspector, popup/devtools panel 강화

## 권장 UX 문구

- `Quick Start`
  확장 설치 없이 바로 사용
- `Full Browser Integration`
  기존 Chrome 통합 기능 사용, 확장 설치 필요

주의:

- `기본판/고급판`처럼 들리게 하지 않는다.
- quick mode도 제품의 정식 진입 경로로 취급한다.

## 현재 기준 아키텍처 방향

### 권장 방향

한 MCP API 뒤에 드라이버 2개를 둔다.

- `ExtensionDriver`
- `CdpDriver`

다만 1차 구현은 더 단순하게 갈 수 있다.

- `CdpDriver`가 기존 extension/native-host가 쓰는 메시지 계약과 유사한 형태를 말하게 만든다.
- MCP tool 계층은 가능한 한 그대로 둔다.
- 이후 안정화되면 정식 `BrowserDriver` 인터페이스로 정리한다.

### 유지 가능한 계층

- `packages/core`
- `packages/build-core`
- `packages/mcp-server/src/mcp-tools.ts`

### 공용화가 필요한 계층

현재 extension 내부에 있지만 사실상 공용이어야 하는 것:

- `packages/extension/src/content/dom-scanner.ts`
- `packages/extension/src/content/manifest-builder.ts`
- `packages/extension/src/runtime/page-runtime.ts`

이 셋은 quick mode에서도 재사용 가능해야 한다.

## 기능별 영향 판단

### quick mode에서 바로 노릴 기능

- `snapshot`
- `act`
- `fill`
- `read`
- `wait`
- `guide`
- headless screenshot
- pointer overlay가 남는 QA screenshot

### quick mode에서도 충분히 가능한 기능

- 새 탭/팝업 추적
- `window.open()` 기반 플로우
- headless QA

### extension mode가 계속 강한 기능

- popup / devtools panel / side panel
- 세션 선택기
- 명령 로그
- 타깃 인스펙터
- 브라우저 상주형 진단 UX

## headless QA 판단

- CDP-only는 headless에서도 가능하다.
- 현재 손가락 포인터는 OS 커서가 아니라 DOM overlay이므로 screenshot에 함께 남길 수 있다.
- 다만 screenshot 시점에 overlay가 visible 상태여야 한다.
- 안정성을 위해 나중에 `capture with pointer locked` 같은 QA 전용 모드를 추가하는 것이 좋다.

## Chrome for Testing 판단

지금 당장은 우선순위가 낮다.

- 장점: 브라우저 버전 고정, CI 재현성
- 단점: 초기 제품 복잡도 증가

현재 단계에서는 아래가 먼저다.

- CDP quick mode
- attach / reconnect / popup 추적
- 입력 신뢰성

Chrome for Testing은 아래 시점에 재검토한다.

- CI에서 브라우저 버전 차이로 flaky 이슈가 반복될 때
- visual regression 기준을 엄격하게 운영할 때
- 팀 단위 사용에서 로컬/CI 환경 차이가 비용이 되기 시작할 때

## 프로필 전략

### 원칙

CDP 자동화는 기본 Chrome 프로필에 직접 붙는 것보다, 별도 automation profile을 쓰는 방향이 안전하다.

### 설치 UX 제안

quick mode 초기 설정에서 아래 선택지를 제공한다.

- 빈 자동화 프로필로 시작
- 기존 Chrome 프로필을 복제해서 시작
- 다른 프로필 디렉터리를 선택해서 복제

### 권장 방식

- `복제(copy)` 또는 가능하면 copy-on-write clone 사용
- 결과물은 agrune 전용 `user-data-dir`에 저장

### 비권장 방식

- 기존 프로필 디렉터리 전체를 symlink로 연결
- 일반 Chrome과 자동화 Chrome이 같은 프로필을 동시에 공유
- "실시간 연동"으로 보이는 표현 사용

### 권장 명칭

- `프로필 가져오기`
- `프로필 복제`
- `자동화용 프로필 만들기`

`연동`이라는 표현은 live sync를 기대하게 만들 수 있으므로 피한다.

## 단계별 작업 목록

### P0. quick mode 최소 진입선

- `CDP quick mode` 제품 방향 문구 정리
- 브라우저 연결 방식 선택용 설정 추가
- quick mode용 브라우저 launch / attach 경로 추가
- 새 탭 / 새 창 / popup target auto-attach 추가
- page runtime 부팅에 필요한 공용 코드 분리
- headless screenshot + pointer overlay 확인 루프 추가

### P1. quick mode 자동화 신뢰성

- `fill`의 CDP 입력 경로 통일
- reconnect / crash / closed target 복구 경로 추가
- active session 선택 정책 재정리
- screenshot 전 pointer/aurora 상태 제어 추가
- profile import UX 추가

### P2. mode 간 역할 정리

- `ExtensionDriver` / `CdpDriver` 추상화 정리
- quick mode와 extension mode의 capability matrix 문서화
- setup / doctor / repair를 mode-aware 구조로 개편

### P3. extension mode 강화

- 세션 선택기
- 명령 로그
- 실패 진단
- 타깃 인스펙터
- 포커스 전환 UX

## 권장 구현 순서

1. 공용화 가능한 runtime 부팅 코드를 extension 밖으로 분리
2. quick mode에서 `snapshot / act / fill / read / wait / guide` 연결
3. popup/new window 추적 추가
4. headless QA screenshot 흐름 정리
5. profile import 추가
6. 이후에 `drag / pointer`의 세부 안정화 및 드라이버 추상화 진행

## 운영 원칙

- quick mode를 임시 데모 경로로 취급하지 않는다.
- extension mode는 제거 대상이 아니라 선택적 고급 통합 모드다.
- 초기에 두 모드의 완전한 parity를 약속하지 않는다.
- 기능 설명과 설치 UX에서 "지금 바로 써보기"를 최우선으로 둔다.

## 한 줄 결론

agrune의 다음 단계는 `extension 필수 제품`에서 `CDP quick mode를 기본 진입으로 제공하고 extension mode를 옵션으로 유지하는 제품`으로 가는 것이다.
