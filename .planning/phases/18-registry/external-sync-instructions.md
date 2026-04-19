# Phase 18 External Repository Sync Instructions

**Generated:** 2026-04-20 (Phase 18 Wave 3, Plan 18-04)
**Status:** Awaiting user manual action — repo 생성 / 초기 push / OAuth App / placeholder 교체
**Pattern:** 17-04 external-sync-instructions.md 재사용 (MEMORY: "외부 repo push 는 사용자 수동 후속 조치")

Phase 18 REGISTRY 는 `registry-seed/` 를 agrune 모노레포 내부에 완성했다. 실제 `github.com/agrune/maps` 공개는 **4 단계 사용자 수동 액션** 이 필요하다 — autonomous 무인 실행 제약으로 Claude 는 외부 repo 생성/push 를 수행하지 않는다. 아래 절차를 사용자 로컬 shell 에서 실행한다.

---

## 1. `github.com/agrune/maps` 공개 repo 생성 + 초기 push

### 1A. 새 public repo 생성 (GitHub UI 또는 gh CLI)

```bash
gh repo create agrune/maps \
  --public \
  --description "Manifest registry for agrune v0.5+" \
  --homepage https://github.com/agrune/agrune
```

UI 를 선호하면 `https://github.com/new` 에서 `agrune/maps` 를 public 으로 만든다. README / .gitignore / license 는 생성하지 말 것 (초기 push 에서 제공).

### 1B. `registry-seed/` 컨텐츠 복사

```bash
cd /tmp
rm -rf agrune-maps
git init agrune-maps
cd agrune-maps

# registry-seed/ 전체 (dot files 포함) 를 복사
rsync -a --exclude='.git' \
  /Users/chenjing/dev/agrune/agrune/registry-seed/ .

# 복사 결과 확인
ls -la
# 다음이 전부 보여야 한다:
#   .github/  .gitignore  CODEOWNERS  README.md
#   REGISTRY_GOVERNANCE.md  incidents.json  index.json
#   maintainers.json  manifests/
```

### 1C. CODEOWNERS / maintainers.json placeholder 교체

```bash
# CODEOWNERS 의 @agrune-solo 를 실제 GitHub handle 로 교체
#   (예시: @chenjing 또는 @agrune/maintainers team)
YOUR_HANDLE="chenjing"    # <-- 실제 handle 로 수정

# macOS (BSD sed) 기준
sed -i '' "s/@agrune-solo/@${YOUR_HANDLE}/g" CODEOWNERS

# Linux (GNU sed) 기준
# sed -i "s/@agrune-solo/@${YOUR_HANDLE}/g" CODEOWNERS

# maintainers.json 의 "agrune-solo" 도 동일 교체
python3 -c "
import json, sys
p = json.load(open('maintainers.json'))
p['maintainers'] = ['${YOUR_HANDLE}']
p['updatedAt'] = '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'
json.dump(p, open('maintainers.json','w'), indent=2, ensure_ascii=False)
print('✓ maintainers.json updated')
"

# 확인
grep "${YOUR_HANDLE}" CODEOWNERS
cat maintainers.json | python3 -m json.tool
```

### 1D. 초기 commit + push

```bash
git add -A
git commit -m "chore: initial seed from agrune/agrune registry-seed (Phase 18)"
git branch -M main
git remote add origin https://github.com/agrune/maps.git
git push -u origin main
```

### 1E. Verification

push 후 GitHub 웹에서:

- **Files:** `manifests/` 10 개 JSON, `.github/workflows/` 3 개 YAML, `.github/scripts/` 4 개 mjs + package.json, root level 에 `CODEOWNERS` / `REGISTRY_GOVERNANCE.md` / `README.md` / `incidents.json` / `index.json` / `maintainers.json` / `.gitignore` 존재.
- **Actions 탭:** `Weekly Health Check` / `PR Bot` / `Validate Schema` 3 workflow 가 나열됨 (초기에는 run 없음).
- **CODEOWNERS 적용:** `.github/workflows/` 또는 `incidents.json` 을 수정하는 테스트 PR 을 열면 자동으로 실제 handle 이 reviewer 로 지정됨.

---

## 2. Branch protection 설정 (GitHub Settings, 수동)

```
Settings → Branches → Branch protection rules → Add rule

  Branch name pattern: main

  ☑ Require a pull request before merging
    ☑ Require approvals: 1
    ☑ Dismiss stale pull request approvals when new commits are pushed
    ☑ Require review from Code Owners
  ☑ Require status checks to pass before merging
    ☑ Require branches to be up to date before merging
    Status checks (PR 1개 이상 merge 후 이름이 등록됨):
      - 'validate' (from .github/workflows/validate-schema.yml)
      - 'analyze'  (from .github/workflows/pr-bot.yml)
  ☑ Require conversation resolution before merging
  ☑ Restrict who can push to matching branches
    Allow: CODEOWNERS + maintainers team
  ☑ Do not allow bypassing the above settings
```

### 특별 룰: tier escalation 또는 sensitive PR 2 명 승인

`requires-human-review:sensitive` / `tier-escalation` 라벨이 붙은 PR 은 maintainer **2 명** 수동 승인이 필요하지만, GitHub UI 는 label 기반 approval count 를 기본 지원하지 않는다. 운영 체크리스트로 보완:

- REGISTRY_GOVERNANCE.md § Security Guardrails 에 명시 (이미 완료)
- `Require approvals: 1` 기본값 + 라벨 존재 시 maintainer rotation 에서 두 번째 승인자 수동 태그

v0.6+ 개선 경로: label-based required-approvals 를 강제하는 GitHub App (예: `pull-request-approval-required`) 를 추가.

---

## 3. OAuth App 등록 (`agrune maps submit` 용)

`agrune maps submit` 은 GitHub device flow 로 PR 을 생성한다. placeholder `AGRUNE_DEVICE_FLOW_CLIENT_ID` 는 실제 App 등록 후 교체:

```
GitHub → Settings → Developer settings → OAuth Apps → New OAuth App

  Application name: agrune-maps-submit
  Homepage URL: https://github.com/agrune/agrune
  Application description: CLI helper that opens PRs against github.com/agrune/maps
  Authorization callback URL: https://github.com/agrune/maps   (device flow 에서 실제로 사용되지 않음)
  ☑ Enable Device Flow
```

등록 후 `Client ID` 를 복사 — `AGRUNE_OAUTH_CLIENT_ID` 환경변수로 주입:

```bash
# ~/.zshrc (또는 ~/.bashrc) 에 영구 설정
export AGRUNE_OAUTH_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx

# 새 shell 에서 확인
echo $AGRUNE_OAUTH_CLIENT_ID
```

대안: 빠른 로컬 테스트는 PAT 로:

```bash
# Settings → Developer settings → Personal access tokens → Fine-grained tokens
# scope: public_repo (agrune/maps 에 대한 Pull requests: Write)
export AGRUNE_GITHUB_TOKEN=github_pat_xxxxxxxxxxxx
```

`AGRUNE_GITHUB_TOKEN` 이 있으면 device flow 를 건너뛴다 (Plan 02 submit.ts 순서).

---

## 4. CLI base URL 전환

`@agrune/registry` 의 `DEFAULT_REGISTRY_BASE_URL` 은 `https://raw.githubusercontent.com/agrune/maps/main` 로 이미 하드코딩되어 있다 (Plan 01, `packages/registry/src/registry-client.ts`). repo 가 public 되면 별도 설정 없이 `agrune maps add <host>` 가 동작한다.

fork / mirror 를 사용하려면:

```bash
export AGRUNE_REGISTRY_BASE_URL=https://raw.githubusercontent.com/<your-fork>/maps/main
```

---

## 5. Boundary declaration

Plan 18-04 가 in-tree (`registry-seed/`) 에서 수행한 작업:

- `.github/workflows/` 3 개 GitHub Actions YAML (pr-bot / validate-schema / health-check)
- `.github/scripts/` 4 개 Node mjs (_schema / validate-schema / pr-bot / health-check) + package.json
- `CODEOWNERS` (placeholder `@agrune-solo`) + `.github/pull_request_template.md` + `.gitignore`
- Phase 18 종료 ceremony: ROADMAP / REQUIREMENTS / STATE 업데이트, 18-04-SUMMARY.md 작성
- 로컬 `pnpm lint:no-legacy` / `pnpm validate:seed` 10/10 pass / `pnpm -r test` 그린 유지

수행하지 않은 작업 (사용자 수동):

- `github.com/agrune/maps` public repo 생성 + 초기 push (§ 1)
- Branch protection 설정 (§ 2)
- OAuth App 등록 + `AGRUNE_OAUTH_CLIENT_ID` 주입 (§ 3)
- `CODEOWNERS` + `maintainers.json` 의 `@agrune-solo` / `"agrune-solo"` placeholder 실제 handle 교체 (§ 1C)

MEMORY 근거: "외부 repo push = 사용자 수동 후속 조치" + "Autonomous 무인 실행 — safe default (defer/accept/skip) 로 끝까지 진행".

---

## 6. Post-push verification (smoke test)

push 완료 후 사용자가 확인할 end-to-end 체크리스트:

### 6A. CLI add 가 실제 registry 에서 fetch 성공

```bash
cd /tmp && mkdir -p test-agrune-maps && cd test-agrune-maps
node /Users/chenjing/dev/agrune/agrune/packages/mcp/dist/bin/agrune-mcp.js \
  maps add news.ycombinator.com

# Expected:
#   ✓ cache:  ~/.agrune/maps/news.ycombinator.com@1.0.0.json
#   ✓ lockfile: ./agrune.maps.lock.json
#   ✓ content hash: sha256:...
```

### 6B. Types emit

```bash
node /Users/chenjing/dev/agrune/agrune/packages/mcp/dist/bin/agrune-mcp.js maps types

# Expected:
#   node_modules/.agrune/maps.d.ts 생성
#   AgruneMapsHost = 'news.ycombinator.com'
#   AgruneMapsTargetIds[...] 인터페이스 emit
```

### 6C. Doctor (offline)

```bash
node /Users/chenjing/dev/agrune/agrune/packages/mcp/dist/bin/agrune-mcp.js maps doctor

# Expected:
#   news.ycombinator.com@1.0.0 — fresh (0 days old)
```

### 6D. Doctor --refresh (incidents.json 조회)

```bash
node /Users/chenjing/dev/agrune/agrune/packages/mcp/dist/bin/agrune-mcp.js maps doctor --refresh

# Expected: incidents.json (빈 배열) fetch 성공 + classification 동일
```

### 6E. Submit dry-run

```bash
# 테스트 manifest 준비
cat > /tmp/test-manifest.json <<'JSON'
{
  "registry": {
    "host": "example.com",
    "version": "1.0.0",
    "tier": "community",
    "author": "your-handle",
    "submittedAt": "2026-04-20T00:00:00.000Z",
    "allowedEnvironments": ["dev"],
    "seedUrl": "https://example.com"
  },
  "manifest": {
    "version": 3,
    "groups": [
      {
        "groupId": "g1",
        "targets": [
          {"targetId": "t1", "actionKinds": ["click"], "selector": {"role": {"name": "link"}}}
        ]
      }
    ]
  }
}
JSON

node /Users/chenjing/dev/agrune/agrune/packages/mcp/dist/bin/agrune-mcp.js \
  maps submit /tmp/test-manifest.json --dry-run

# Expected: device flow user_code 출력 + fork/PR plan JSON (실 생성 X)
```

### 6F. Workflow 첫 실행 검증

`agrune/maps` repo 에 임의 community tier PR (예: `manifests/example.com@1.0.0.json` 추가) 을 열면:

- **Validate Schema workflow** → RegistryEntrySchema 통과 시 green, 실패 시 schema-fail 라벨
- **PR Bot workflow** → community tier + `allowedEnvironments:["dev"]` 면 라벨 0, `sensitive:true` 가 변경되면 `requires-human-review:sensitive`
- **Weekly Health Check** → `Actions → Weekly Health Check → Run workflow` 버튼으로 즉시 트리거해 10 seed resolve 확인

---

## 7. Schema sync checklist (v0.6 블로커)

`registry-seed/.github/scripts/_schema.mjs` 는 현재 **inline RegistryEntrySchema 사본** 이다 (v0.5 는 `@agrune/registry` npm publish 전, external repo 가 workspace 밖이라 `workspace:*` resolve 불가).

**SYNC 책임 (v0.5 기간):**

main agrune repo 에서 아래 파일 중 하나라도 변경되면 `registry-seed/.github/scripts/_schema.mjs` 도 같은 PR 에서 업데이트한다:

- `packages/manifest/src/schema.ts` (ManifestSchema + ActionKind + Group/Target/Repeat/Macro/MacroStep/SelectorLadder)
- `packages/registry/src/schema.ts` (RegistryMetadataSchema + RegistryEntrySchema + tier × env superRefine)
- `packages/registry/src/content-hash.ts` (sha256 + fast-json-stable-stringify)

**REMOVAL (v0.6+):**

`@agrune/registry` 를 npm publish 한 후:

1. `registry-seed/.github/scripts/package.json` 의 dependencies 에 `"@agrune/registry": "^0.6.0"` 추가, `zod` / `fast-json-stable-stringify` 제거
2. `_schema.mjs` 내용을 `export { RegistryEntrySchema, contentHash } from '@agrune/registry'` 한 줄로 축소
3. `validate-schema.mjs` + `pr-bot.mjs` 의 `import { ... } from './_schema.mjs'` 는 그대로 유지 (재내보내기 파일 역할만 변경)

이 블로커는 STATE.md Pending Todos 에 **"@agrune/registry npm publish (v0.6 milestone) — scripts inline schema 제거"** 로 등록.

---

## 8. Pending todos after push (carry forward)

STATE.md Pending Todos 에 추가된 항목 요약 (참고용):

- `github.com/agrune/maps` public repo 생성 + 초기 push (§ 1) — **사용자**
- Branch protection 설정 + label-based approval 룰 (§ 2) — **사용자**
- OAuth App 등록 + `AGRUNE_OAUTH_CLIENT_ID` export (§ 3) — **사용자**
- `CODEOWNERS` + `maintainers.json` 의 `@agrune-solo` placeholder 실제 GitHub handle 로 교체 (§ 1C) — **사용자**
- Post-push smoke test (§ 6A–F) 6 단계 실행 — **사용자**
- `@agrune/registry` npm publish (v0.6 milestone) — scripts inline schema 제거 (§ 7) — **v0.6 kickoff 시점**
- 초기 community 기여 들어온 후 REGISTRY_GOVERNANCE.md threshold (30일 holddown / 7·28·56 staleness / 30·60일 absence) 재검토 (LOW confidence A2/A3/A7) — **3 개월 후 재평가**

---

## 9. Rollback

push 후 심각한 문제 발견 시 (예: schema drift 로 모든 PR fail):

```bash
cd /tmp/agrune-maps

# 로컬에서 복구
git revert HEAD --no-edit

# 또는 repo archive
# Settings → General → Archive this repository
```

agrune CLI 사용자는 `AGRUNE_REGISTRY_BASE_URL` env 로 fork 를 임시 사용할 수 있다 (§ 4).

agrune 본 repo 의 동작은 영향 없음 — `DEFAULT_REGISTRY_BASE_URL` 상수는 배포 후에도 override 가능하다.
