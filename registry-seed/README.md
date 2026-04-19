# agrune/maps — Public manifest registry for agrune v0.5+

`agrune/maps` 는 [agrune](https://github.com/agrune/agrune) 브라우저 자동화 플랫폼용 공개 manifest registry 의 seed snapshot 이다. 이 디렉토리는 agrune monorepo 안의 prototype 으로, 실제 공개 repo `github.com/agrune/maps` 의 **day-0 콘텐츠** 로 push 되도록 준비되었다.

## What this is

외부 웹 사이트를 agrune 으로 자동화하려면 `@agrune/manifest` SDK 로 작성된 target mapping 이 필요하다. 개별 사용자가 사이트마다 manifest 를 작성할 수도 있지만, 자주 쓰이는 공개 사이트 (Wikipedia, MDN, Hacker News 등) 는 커뮤니티가 공유 manifest 를 관리하는 편이 효율적이다. 이 공개 registry 는 그 공유 레이어다.

## Why

- **중복 작업 제거** — 각 사용자가 같은 사이트의 selector 를 매번 다시 발견하지 않는다.
- **집단 유지보수** — 사이트 DOM 이 바뀌면 한 번의 PR 로 모든 사용자가 복구를 받는다.
- **검증된 tier** — 주간 health check 와 사람 review 를 통과한 manifest 만 `verified` tier 로 승격 → 프로덕션 환경 사용 허용.
- **투명한 거버넌스** — 승급 / 강등 / revocation 규칙이 `REGISTRY_GOVERNANCE.md` 에 코드 레벨로 명시되고 PR bot 이 집행.

## Directory structure

```
registry-seed/
├── README.md                                    # 이 파일
├── REGISTRY_GOVERNANCE.md                       # tier / velocity / revocation normative spec
├── maintainers.json                             # velocity limit 면제 allow-list
├── incidents.json                               # revocation 기록 (초기 빈 배열)
├── index.json                                   # machine-readable catalog (validate-seed.mjs 로 재생성)
└── manifests/
    ├── news.ycombinator.com@1.0.0.json         # Seed #1
    ├── en.wikipedia.org@1.0.0.json             # Seed #2
    ├── developer.mozilla.org@1.0.0.json        # Seed #3
    ├── docs.python.org@1.0.0.json              # Seed #4
    ├── www.gutenberg.org@1.0.0.json            # Seed #5
    ├── arxiv.org@1.0.0.json                    # Seed #6
    ├── pypi.org@1.0.0.json                     # Seed #7
    ├── hn.algolia.com@1.0.0.json               # Seed #8
    ├── www.wikidata.org@1.0.0.json             # Seed #9
    └── observablehq.com@1.0.0.json             # Seed #10
```

## How to use

registry 가 공개된 이후:

```bash
# 사용자 프로젝트 root 에서
agrune maps add news.ycombinator.com
# → ~/.agrune/maps/news.ycombinator.com@1.0.0.json 에 캐시
# → 프로젝트 root 의 agrune.maps.lock.json 에 contentHash 잠금

agrune maps types
# → .d.ts 타입 선언을 프로젝트에 emit

agrune maps doctor
# → 로컬 lockfile 전 entry 에 대해 staleness 진단 + revocation 체크
#   (incidents.json fetch 후 해당 host 자동 disable 경로 제시)

agrune maps doctor --refresh
# → registry 최신 index.json 과 대조, 사용자가 명시적으로 원할 때만 네트워크 호출
```

`agrune maps` CLI 는 Phase 18 Plan 02 에서 구현된다. 이 seed 가 실제 공개 repo 에 push 된 이후에 link 가 활성화된다.

## How to contribute a new manifest

1. 로컬에서 사이트의 manifest.ts 작성 — `.agents/skills/manifest/SKILL.md` 의 authoring skill 참조.
2. `agrune manifest validate <file>` 로 shape + DOM 매칭 확인.
3. `agrune maps submit <file>` 로 PR 생성 (device flow OAuth — 로그인은 브라우저 한 번).
4. PR bot 이 자동으로 schema / sensitive / velocity / tier 검사 수행.
5. Maintainer 1 명 review → `community` tier merge. 3 개월 무 incident + health check green 12 주 → `verified` 승격 (`REGISTRY_GOVERNANCE.md` Tier Transition 표).

## Tier summary

| Tier | 의미 | allowedEnvironments | 승급 조건 |
|------|------|----------------------|-----------|
| `verified` | Maintainer 2 명 이상 review + 주간 health check green | `['dev','prod']` 허용 | community 에서 3 개월 stable + 0 incidents |
| `community` | PR bot schema pass + maintainer 1 명 review | `['dev']` 강제 | 신규 기여의 기본 tier |
| `unlisted` | 과거 기여에 incident 확정 또는 revocation | 접근 차단 | maintainer ×1 승인으로 이동 |

`REGISTRY_GOVERNANCE.md` 의 "Tiers" 섹션이 normative spec.

## CODEOWNERS 경로

공개 repo 배포 시 `.github/CODEOWNERS` 가 아래 경로를 maintainer-only 변경으로 gate 한다:

- `/REGISTRY_GOVERNANCE.md` — 거버넌스 스펙 자체
- `/incidents.json` — revocation 기록 (공격자가 PR 로 삭제 시도 차단)
- `/maintainers.json` — velocity 면제 allow-list (escalation 방지)
- `/.github/**` — PR bot / health check workflow

`manifests/*.json` 은 CODEOWNERS gate 없음 — 커뮤니티 기여 자유.

## License

- **Manifest JSON 콘텐츠** — MIT (이 repo 의 파일)
- **각 사이트의 ToS 준수** — manifest 가 가리키는 대상 사이트의 이용약관·로봇 정책·저작권을 준수할 책임은 **각 기여자** 에게 있다. agrune 프로젝트는 이를 대리 검증하지 않는다. (단, PR bot 이 public-resolvable host 검증은 수행)
- **Sensitive 필드 정책** — OR-only lock (Phase 11 MANIFEST-04 계약). manifest schema 자체가 `sensitive: false` 를 타입 레벨에서 차단.

## Status

**v0.5 seed (Phase 18 Plan 03)** — 2026-04-20 작성. 이 파일들은 agrune monorepo `feat/v0.5-manifest` 브랜치에서 prototype 되었고, Plan 04 external-sync-instructions 를 따라 `github.com/agrune/maps` 공개 repo 로 push 될 예정이다.
