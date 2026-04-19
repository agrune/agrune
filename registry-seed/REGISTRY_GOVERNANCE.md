# agrune/maps Registry Governance

_Last updated: 2026-04-20 (Phase 18 v0.5 kickoff)_

이 문서는 agrune 공개 manifest registry (`github.com/agrune/maps`) 의 normative 거버넌스 스펙이다. PR bot (`.github/workflows/pr-bot.yml`, Phase 18 Plan 04 구현) 과 weekly health check 는 이 문서의 규칙을 **코드로 집행**한다. 이 문서와 bot 사이에 괴리가 생기면 bot 을 수정하는 것이 원칙이고, 이 문서가 single source of truth 이다.

## Tiers

모든 manifest 는 `registry.tier` 필드로 세 tier 중 하나에 속한다. Tier 는 `@agrune/registry` schema 의 `RegistryTierSchema` 로 타입 레벨 enforce 되며, tier × `allowedEnvironments` cross-field 제약은 `RegistryEntrySchema.superRefine` 에서 거부된다 (Phase 18 Plan 01).

### verified

- 2 명 이상 maintainer review 통과 + 주간 health check 12 주 중 12 주 green
- `allowedEnvironments: ['dev', 'prod']` 허용 — 프로덕션 번들에서 root-import 활성화 가능
- Tier promotion 조건: community 에서 3 개월 stable + incidents.json 해당 host entry 0 건
- 본 seed (10 개) 는 **초기 프로젝트 직접 기여** 로 예외적으로 verified 로 시작 (author="agrune-maintainers") — 일반 기여자 경로와 구분

### community

- PR bot schema pass + maintainer 1 명 review
- `allowedEnvironments: ['dev']` 강제 (schema superRefine 에서 `['dev','prod']` 거부 — Pitfall 7 구조적 차단)
- 모든 **신규 외부 기여** 의 기본 tier

### unlisted

- 과거 verified/community 였으나 incident 확정 또는 revocation 을 받은 경우
- CLI `agrune maps add` 는 경고 + 접근 차단
- `incidents.json` 에 `{ host, affectedVersions, reason, reportedAt, confirmedBy, action: 'unlisted' }` 기록
- CLI `agrune maps doctor --refresh` 가 incidents.json fetch 후 해당 host 의 lockfile entry 에 `disabled: { reason: 'revoked', at: ... }` 기록

## Velocity Limit

신규 저자 (첫 GitHub interaction with `agrune/maps`) 의 첫 3 PR 에는 다음 제약이 자동 적용된다:

- PR 간 최소 간격 **30 일** (spray attack / 악성 manifest 대량 업로드 방지)
- PR bot 이 `velocity:holddown` 라벨 자동 부착 → branch protection 이 병합 지연
- 4 번째 PR 부터 자동 해제
- `maintainers.json` allow-list 에 등록된 GitHub handle 은 holddown 면제 (Pitfall 3 false positive 방지)

PR bot 의 velocity 검사 기준은 `github.event.pull_request.user.login` 을 PR 생성자로 보고 `agrune/maps` 내 해당 저자의 merged PR 수와 first-PR 시각을 조회한다.

## Revocation Path

Revocation 은 개별 manifest 또는 특정 version range 에 대해 긴급 접근 차단을 수행하는 경로다.

1. **Incident 보고** — 누구나 `agrune/maps` 의 issues 에 `incident` 라벨로 신고. 보고 내용에는 host / affected versions / 재현 방법 / 보안 영향 포함.
2. **Maintainer triage** — maintainer 1 명이 24 ~ 72 시간 안에 확인. 확정 시 다음 PR 을 제출:
   - `incidents.json` 에 entry 추가 (`{ host, affectedVersions, reason, reportedAt, confirmedBy, action: 'unlisted' }`)
   - 해당 `manifests/<host>@<ver>.json` 의 `registry.tier` 를 `unlisted` 로 변경
   - `registry.staleSince` 필드 추가 (ISO 타임스탬프)
3. **Client 반영** — 사용자 로컬 CLI 가 `agrune maps doctor --refresh` 실행 시:
   - `incidents.json` fetch
   - 매칭되는 host + version 의 lockfile entry 에 `disabled: { reason: 'revoked', at: ISO }` 기록
   - 다음 `agrune maps add <host>` 시도 시 경고 + confirm 요구

CODEOWNERS 는 `/incidents.json` 변경을 maintainer-only 로 gate 한다 — 악성 PR 이 incidents 를 **삭제** 하는 경로를 차단 (T-18-22).

## Maintainer Absence Default

거버넌스는 maintainer 가 계속 유지 보수한다는 전제로 설계되었다. 전원 무응답 시 fail-safe:

- **30 일 무응답** — 모든 `verified` tier manifest 를 자동 `community` 로 강등 (PR bot scheduled workflow `.github/workflows/maintainer-absence.yml`, Phase 18 Plan 04 포함 예정). 이 트리거 기준은 `maintainers.json` 의 GitHub handle 중 누구도 30 일간 issue/PR/review 활동이 없을 때.
- **60 일 무응답** — CLI `agrune maps doctor` 가 "registry maintainer absence > 60 days" 경고 출력. 신규 `agrune maps add` 시도 시 confirm 요구 (`--yes` 로 우회 가능).

이 기본값은 solo maintainer 단계 (v0.5 초기) 에서는 자주 발동할 수 있다. Transition 트리거: review backlog > 2 주 또는 동일 author 다중 PR 감지 시 solo → multi-maintainer 전환 검토.

## Tier Transition Triggers

| From | To | Trigger | Who approves |
|------|----|---------|--------------|
| 신규 PR | community | PR bot schema pass + 1 maintainer review | Maintainer (단일) |
| community | verified | 3 개월 stable + 0 incidents + 2 maintainers + health check green 12/12주 | Maintainer ×2 |
| any | unlisted | Incident 확정 또는 revocation vote | Maintainer ×1 (emergency) |
| verified | community | Maintainer absence 30 일 (자동) | Bot |
| unlisted | community | Incident 원인 해결 PR + re-review | Maintainer ×2 |

Promotion 은 autopilot 이 아니다. "community → verified" 는 maintainer 가 PR 에 `tier: community` → `tier: verified` 변경을 제출하고 다른 maintainer 가 approve 해야 한다. PR bot 은 변경을 감지하면 `tier-escalation` 라벨을 부착해 reviewer 주의를 유도한다 (Pitfall 8 보조).

## Staleness Detection

Weekly selector health check (`.github/workflows/health-check.yml`, Phase 18 Plan 04) 가 매주 월요일 06:00 UTC 에 실행되어, 각 manifest 의 seedUrl 을 열고 selector ladder 샘플 3 개를 resolve 시도한다 (snapshot only — 실제 click/fill 은 수행하지 않음, Pitfall Health-check action abuse).

| State | Trigger | bot action | CLI 반응 |
|-------|---------|-----------|---------|
| fresh | fetchedAt 이내 7 일 | — | no-op |
| week_old | 7 ~ 28 일 | — | `doctor` info 메시지 |
| stale (server side) | health check 2 주 연속 fail | `stale` 라벨 + `registry.staleSince` 필드 자동 추가 PR | `doctor` warning + `--auto-disable` 제안 |
| auto_disabled (client side) | fetchedAt 이후 56 일 OR registry unlisted | — | lockfile 에 `disabled: { reason: 'stale'\|'revoked', at: ... }` |
| retired (server side) | health check 8 주 연속 fail | manifest 를 `unlisted` tier 로 자동 이동 PR (maintainer approval 필요) | 동일 auto_disabled |

Client-side threshold 는 `@agrune/registry` 의 `STALENESS_THRESHOLDS` 상수 (`7 / 28 / 56` 일) 와 일치한다 — governance doc 과 코드가 같은 숫자를 공유.

## Security Guardrails

거버넌스는 다음 공격 경로를 구조적으로 차단한다:

- **Pitfall 3 (velocity false positive)** — `maintainers.json` allow-list 로 같은 합법 maintainer 의 연속 PR 을 holddown 면제.
- **Pitfall 4 (seed URL privacy leak)** — PR bot 이 `seedUrl` 필드에 대해 public-resolvable host 만 허용 (localhost / private IP / `*.internal` / `*.local` 거부). 10 개 seed 도 전부 public apex/WWW 도메인.
- **Pitfall 5 (staleness thrashing)** — two-strike rule: 1 주 fail 은 경고 없음, 2 주 연속 fail 만 `stale` 라벨. 4 주 fail → staleSince 기록, 8 주 fail → retired 제안.
- **Pitfall 7 (prod root-import abuse)** — schema superRefine 이 community/unlisted + `['dev','prod']` 를 타입 레벨 거부. PR bot 이 tier × allowedEnvironments 이중 검사.
- **Pitfall 8 (sensitive false bypass)** — PR bot 이 git diff 에서 `sensitive: true` 필드 **삭제** 및 `sensitive: false` 전환을 모두 `requires-human-review:sensitive` 라벨로 강제. Branch protection 이 해당 라벨에서 reviewer 2 명 요구.
- **`incidents.json` / `maintainers.json` 조작** — CODEOWNERS 로 maintainer-only 변경만 허용 (T-18-22/T-18-23).
- **Submit token abuse (Pitfall 2)** — `agrune maps submit` CLI 는 device flow 토큰을 디스크 저장 금지. 매 submit 마다 fresh OAuth. PAT override 는 `AGRUNE_GITHUB_TOKEN` env var 로만 (사용자 explicit opt-in).
- **submit scope 최소화** — device flow 는 `public_repo` scope 만 요구. `repo` (private 포함) 는 요구하지 않음.

## Reporting a Security Issue

보안 관련 vulnerability (예: 특정 manifest 가 cross-origin 데이터 유출 경로를 포함) 는 별도 경로로 처리한다:

- **v0.5 초기** — `agrune/maps` issues 에 `security` + `incident` 라벨로 제출. 상세 정보는 issue body 에 포함. Maintainer 가 24 시간 내 triage 후 incident path (위 "Revocation Path") 를 따라 처리.
- **v0.6+** — 별도 `SECURITY.md` + private security advisory 경로 (GitHub Security tab) 준비 예정.

Public sensitive detail (예: 악용 가능한 구체적 selector 경로) 은 issue 본문에 포함하지 말고, maintainer 가 요청 시 non-public 채널 (GitHub Security advisory) 로 공유.
