# QA 테스트 시트 자동 생성 설계

작성일: 2026-04-02

## 배경

agrune 어노테이션에는 이미 모든 인터랙티브 요소의 action, name, desc, key가 명시되어 있다.
하지만 요소 간 관계("A 클릭 → B 노출")는 어노테이션에 없어서, QA 테스트 시나리오를 정적으로 뽑을 수 없다.

어노테이션에 관계를 추가하면 개발자 부담이 크고, 코드가 이미 아는 정보를 중복 기술하게 된다.

## 목표

- 어노테이션을 건드리지 않고 요소 간 관계를 확보
- AI 탐색은 1회성, 이후 디터미니스틱하게 테스트 시트 생성
- 사람이 읽을 수 있고 기계가 실행할 수 있는 이중 출력
- CI/CD에서 자동 실행 가능

## 설계 원칙

- **어노테이션 무변경**: 관계 정보는 오직 `.agrune/flows.json`에 저장. 어노테이션은 요소 단위 유지.
- **Explore once, generate many**: AI 탐색은 1회, 이후는 파일 기반으로 반복 생성.
- **사람 편집 가능**: flows.json은 AI가 생성하지만 사람이 읽고 수정 가능.
- **단일 소스 이중 출력**: flows.json → 마크다운 시트 + 실행 시나리오 JSON.

## 아키텍처

```
Phase A: Explore (AI, 1회성)
  agrune_snapshot(before) → agrune_act → agrune_snapshot(after)
  → before/after diff → 관계 발견 → .agrune/flows.json 저장

Phase B: Generate (디터미니스틱, 반복 가능)
  flows.json + 어노테이션 정보
  → 마크다운 테스트 시트 (사람용)
  → 실행 시나리오 JSON (CI용)

Phase C: Run (선택적)
  시나리오 JSON → agrune MCP 도구로 자동 실행
  → 결과 리포트 (pass/fail/skip)
```

## Phase A: 탐색 전략

### 탐색 알고리즘

```
1. agrune_snapshot(mode="full") → 모든 타겟 수집
2. actionableNow인 타겟을 큐에 넣음
3. 큐에서 하나씩:
   a. 스냅샷 저장 (before)
   b. 액션 실행 (click/fill/etc)
   c. 스냅샷 저장 (after)
   d. before/after diff → flow 엔트리 생성
   e. 새로 나타난 actionable 타겟을 큐에 추가
   f. 원래 상태로 복원 (뒤로가기, 모달 닫기 등)
4. 모든 큐 소진 → flows.json 저장
```

### 탐색 범위 제어

```jsonc
// .agrune/explore-config.json (선택적)
{
  "entryUrl": "https://app.ezplanet.io/workflows",
  "maxDepth": 3,
  "excludeTargets": ["logout-btn"],
  "testData": {
    "email-input": "test@example.com",
    "password-input": "Test1234!"
  }
}
```

### 상태 복원 전략

- **모달/드롭다운**: 닫기 버튼 또는 ESC로 복원
- **네비게이션**: 브라우저 뒤로가기
- **폼 제출**: 제출 전까지만 탐색, 실제 제출은 variants로 기록만
- **복원 불가**: 스냅샷 버전으로 감지 → 해당 시점부터 새로 탐색 재개

### 한계

- 인증이 필요한 영역은 testData에 크레덴셜 제공 필요
- 서버 상태 의존 분기(데이터 유무, 권한)는 해당 상태에서 탐색해야 발견 가능
- 한 번 탐색으로 모든 variant를 발견하긴 어려움 → 사람이 보완

## flows.json 스키마

```jsonc
// .agrune/flows.json
{
  "version": 1,
  "exploredAt": "2026-04-02T10:00:00Z",
  "baseUrl": "https://app.ezplanet.io",

  "flows": [
    {
      "id": "open-login-modal",
      "trigger": {
        "targetId": "login-btn",
        "action": "click"
      },
      "before": {
        "hidden": ["login-modal-group"]
      },
      "after": {
        "shown": ["login-modal-group"],
        "focused": "email-input"
      }
    },
    {
      "id": "submit-login",
      "trigger": {
        "targetId": "login-submit",
        "action": "click"
      },
      "requires": ["email-input", "password-input"],
      "after": {
        "navigates": "/dashboard"
      },
      "variants": [
        {
          "condition": "invalid-email",
          "after": { "shown": ["email-error"] }
        }
      ]
    },
    {
      "id": "tab-switch-members",
      "trigger": {
        "targetId": "members-tab",
        "action": "click"
      },
      "after": {
        "shown": ["members-group"],
        "hidden": ["dashboard-group"]
      }
    }
  ]
}
```

### 필드 설명

- **trigger**: 어떤 타겟에 어떤 액션. 항상 1:1.
- **before/after**: 그룹 또는 타겟 단위로 shown/hidden 변화 기록.
- **requires**: fill 필수인 필드 목록 (폼 플로우).
- **variants**: 입력/상태에 따라 결과가 달라지는 경우. AI 탐색 시 발견한 만큼만 기록, 사람이 추가 가능.
- **navigates**: URL 변경이 있는 경우.

## Phase B: 테스트 시트 생성

### 시나리오 빌드 로직

flows.json의 flow들을 그래프로 연결해서 시나리오 체인을 만든다:

```
flow A의 after.shown에 flow B의 trigger.targetId가 포함
→ A → B 순서로 연결
```

고립된 flow(다른 flow와 연결 안 되는 것)는 독립 시나리오로 생성.

### 마크다운 출력

```markdown
# QA Test Sheet — app.ezplanet.io
Generated: 2026-04-02 | Source: .agrune/flows.json v1

## Scenario 1: 로그인 → 대시보드
Entry: https://app.ezplanet.io

| # | Action | Target | Input | Expected |
|---|--------|--------|-------|----------|
| 1 | click | Login 버튼 | - | 로그인 모달 노출, email-input 포커스 |
| 2 | fill | 이메일 입력 | {{test_email}} | - |
| 3 | fill | 비밀번호 입력 | {{test_password}} | - |
| 4 | click | 로그인 제출 | - | /dashboard 이동 |

### Variant 1-a: 잘못된 이메일
| # | Action | Target | Input | Expected |
|---|--------|--------|-------|----------|
| 1-3 | (위와 동일, email = invalid) | | |
| 4 | click | 로그인 제출 | - | email-error 노출 |
```

### 실행 시나리오 출력

```jsonc
// .agrune/scenarios/scenario-1-login.json
{
  "id": "scenario-1-login",
  "name": "로그인 → 대시보드",
  "entryUrl": "https://app.ezplanet.io",
  "steps": [
    { "act": "click", "targetId": "login-btn",
      "expect": { "shown": ["login-modal-group"], "focused": "email-input" } },
    { "fill": "email-input", "value": "{{test_email}}" },
    { "fill": "password-input", "value": "{{test_password}}" },
    { "act": "click", "targetId": "login-submit",
      "expect": { "navigates": "/dashboard" } }
  ]
}
```

### 변수 처리

테스트 데이터는 explore-config.json의 testData에서 주입. 시나리오 파일에는 `{{변수}}` 플레이스홀더만 남겨서 환경별로 다른 값 주입 가능.

## Phase C: 실행 및 리포트

### 실행 흐름

```
시나리오 JSON 로드
→ step별 순차 실행
  → agrune_act / agrune_fill / agrune_drag
  → expect 검증 (스냅샷 비교)
  → pass / fail / skip 판정
→ 리포트 출력
```

### 검증 방식

| expect 필드 | 검증 방법 |
|-------------|-----------|
| shown | 해당 그룹/타겟의 actionableNow가 true로 변경 |
| hidden | actionableNow가 false로 변경 |
| navigates | snapshot.url이 기대 경로와 일치 |
| focused | 해당 타겟이 document.activeElement인지 확인 |

검증 전에 agrune_wait으로 상태 안정화 대기.

### 리포트 출력

```markdown
# QA Run Report
Date: 2026-04-02 10:30 | Duration: 47s

## Summary
- Total: 12 steps across 3 scenarios
- Pass: 10 | Fail: 1 | Skip: 1

## Failures
### Scenario 1, Step 4: 로그인 제출
- Expected: navigates → /dashboard
- Actual: stayed on /login, email-error shown
- Screenshot: .agrune/reports/2026-04-02/fail-s1-step4.png

## Skipped
### Scenario 2, Step 1: members-tab click
- Reason: blocked by Scenario 1 failure (requires /dashboard)
```

### CI 연동

```yaml
# GitHub Actions 예시
- name: Run agrune QA
  run: |
    agrune qa run --scenarios .agrune/scenarios/
    agrune qa report --format markdown --output qa-report.md
```

fail이 있으면 exit code 1 → CI 실패.

## 산출물 요약

| 파일 | 생성 주체 | 용도 |
|------|-----------|------|
| `.agrune/explore-config.json` | 사람 | 탐색 범위/테스트 데이터 설정 |
| `.agrune/flows.json` | AI (Phase A) | 요소 간 관계 저장소. 단일 소스. |
| `.agrune/scenarios/*.json` | Generator (Phase B) | 실행 가능한 시나리오 |
| `.agrune/reports/*.md` | Runner (Phase C) | 실행 결과 리포트 |
| `qa-test-sheet.md` | Generator (Phase B) | 사람용 테스트 시트 |
