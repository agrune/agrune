# Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate npm and CWS publishing via a single GitHub Actions workflow triggered by git tag push.

**Architecture:** One workflow file with two parallel jobs (publish-npm, publish-cws). Version validation ensures all package.json files match the tag before publishing. pnpm publish resolves workspace:* protocols.

**Tech Stack:** GitHub Actions, pnpm 10, Node.js 22, chrome-webstore-upload-cli

**Spec:** `docs/superpowers/specs/2026-03-25-release-pipeline-design.md`

---

### Task 1: Align Package Versions

**Files:**
- Modify: `packages/build-core/package.json:3` (version 0.2.0 → 0.1.0)

- [ ] **Step 1: Fix build-core version**

Change version in `packages/build-core/package.json`:

```json
"version": "0.1.0",
```

Note: This package was already published as 0.2.0 on npm. The next release will bump all packages together. For now, align to 0.1.0 in source so the version validation works. The next tag push (e.g. v0.2.0) will bump all packages to 0.2.0 together.

- [ ] **Step 2: Verify all versions match**

Run:
```bash
for pkg in . packages/core packages/build-core packages/cli packages/extension packages/mcp-server; do
  echo "$pkg: $(node -p "require('./$pkg/package.json').version")"
done
```

Expected: All show `0.1.0`

- [ ] **Step 3: Commit**

```bash
git add packages/build-core/package.json
git commit -m "chore: align build-core version to 0.1.0 for unified versioning"
```

---

### Task 2: Create the Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create .github/workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write the workflow file**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-npm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Validate versions
        run: |
          TAG_VERSION="${GITHUB_REF#refs/tags/v}"
          for pkg in . packages/core packages/build-core packages/cli packages/extension packages/mcp-server; do
            PKG_VERSION=$(node -p "require('./$pkg/package.json').version")
            if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
              echo "::error::$pkg version ($PKG_VERSION) does not match tag ($TAG_VERSION)"
              exit 1
            fi
          done
          echo "All versions match: $TAG_VERSION"

      - name: Build packages
        run: |
          pnpm --filter @agrune/core --filter @agrune/build-core --filter @agrune/mcp-server run build
          mkdir -p packages/cli/assets
          cp -r packages/mcp-server/dist packages/cli/assets/mcp-server
          pnpm --filter @agrune/cli run build

      - name: Setup npm auth
        run: echo "//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}" > ~/.npmrc

      - name: Publish @agrune/core
        run: pnpm --filter @agrune/core publish --access public --no-git-checks
        continue-on-error: true

      - name: Publish @agrune/build-core
        run: pnpm --filter @agrune/build-core publish --access public --no-git-checks
        continue-on-error: true

      - name: Publish @agrune/cli
        run: pnpm --filter @agrune/cli publish --access public --no-git-checks
        continue-on-error: true

  publish-cws:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Build extension
        run: pnpm --filter @agrune/core --filter @agrune/build-core --filter @agrune/extension run build

      - name: Package extension zip
        working-directory: packages/extension
        run: |
          mkdir -p /tmp/ext-pkg/dist /tmp/ext-pkg/src/popup
          jq 'del(.key)' manifest.json > /tmp/ext-pkg/manifest.json
          cp icon-128.png /tmp/ext-pkg/
          cp dist/content.js dist/service-worker.js dist/popup.js dist/page-runtime.js /tmp/ext-pkg/dist/
          cp src/popup/popup.html /tmp/ext-pkg/src/popup/
          cd /tmp/ext-pkg && zip -r /tmp/extension.zip .

      - name: Upload to Chrome Web Store
        run: |
          npx chrome-webstore-upload-cli upload \
            --source /tmp/extension.zip \
            --extension-id ${{ secrets.CWS_EXTENSION_ID }} \
            --client-id ${{ secrets.CWS_CLIENT_ID }} \
            --client-secret ${{ secrets.CWS_CLIENT_SECRET }} \
            --refresh-token ${{ secrets.CWS_REFRESH_TOKEN }}
```

- [ ] **Step 3: Verify YAML syntax**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow for npm and CWS publishing"
```

---

### Task 3: Add NPM_TOKEN Secret to GitHub

**Files:** None (GitHub settings)

- [ ] **Step 1: Add NPM_TOKEN secret**

```bash
gh secret set NPM_TOKEN
```

When prompted, paste the npm granular access token (`npm_zYAY...khKc`).

- [ ] **Step 2: Verify secret was set**

```bash
gh secret list
```

Expected: `NPM_TOKEN` appears in the list.

---

### Task 4: Dry-Run Validation

**Files:** None

- [ ] **Step 1: Push commits to remote**

```bash
git push origin main
```

- [ ] **Step 2: Test version validation locally**

```bash
TAG_VERSION="0.1.0"
for pkg in . packages/core packages/build-core packages/cli packages/extension packages/mcp-server; do
  PKG_VERSION=$(node -p "require('./$pkg/package.json').version")
  if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
    echo "FAIL: $pkg version ($PKG_VERSION) does not match tag ($TAG_VERSION)"
  else
    echo "OK: $pkg"
  fi
done
```

Expected: All show `OK`

- [ ] **Step 3: Test build pipeline locally**

```bash
pnpm --filter @agrune/core --filter @agrune/build-core --filter @agrune/mcp-server run build && \
mkdir -p packages/cli/assets && \
cp -r packages/mcp-server/dist packages/cli/assets/mcp-server && \
pnpm --filter @agrune/cli run build
```

Expected: Build succeeds without errors.

- [ ] **Step 4: Test CWS zip packaging locally**

```bash
cd packages/extension && \
mkdir -p /tmp/ext-pkg/dist /tmp/ext-pkg/src/popup && \
jq 'del(.key)' manifest.json > /tmp/ext-pkg/manifest.json && \
cp icon-128.png /tmp/ext-pkg/ && \
cp dist/content.js dist/service-worker.js dist/popup.js dist/page-runtime.js /tmp/ext-pkg/dist/ && \
cp src/popup/popup.html /tmp/ext-pkg/src/popup/ && \
cd /tmp/ext-pkg && zip -r /tmp/extension-test.zip . && \
echo "Zip contents:" && unzip -l /tmp/extension-test.zip && \
rm -rf /tmp/ext-pkg /tmp/extension-test.zip
```

Expected: Zip contains manifest.json (no key), icon-128.png, dist/ with 4 JS files, src/popup/popup.html.

---

### Task 5: Push and Verify Workflow Appears

**Files:** None

- [ ] **Step 1: Push all changes**

```bash
git push origin main
```

- [ ] **Step 2: Verify workflow is visible on GitHub**

```bash
gh workflow list
```

Expected: `Release` workflow appears in the list.

- [ ] **Step 3: Commit notes update**

Mark release pipeline tasks 1-4 as done in `docs/notes/7-release-pipeline-todo.md`:

```bash
git add docs/notes/7-release-pipeline-todo.md
git commit -m "docs: mark release pipeline tasks 1-4 as complete"
```

---

## CWS Secrets (Deferred)

CWS secrets (`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`) require manual OAuth setup in Google Cloud Console. This is a one-time process documented in the spec. Until these secrets are set, the `publish-cws` job will fail — this is expected. The `publish-npm` job works independently.
