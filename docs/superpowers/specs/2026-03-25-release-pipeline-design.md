# Release Pipeline Design

## Context

agrune is a pnpm monorepo with three npm-publishable packages and one Chrome Web Store extension. Manual publishing has been completed (npm v0.1.0, CWS submitted). This spec defines the automated release pipeline via GitHub Actions.

## Packages

| Package | Registry | Publish Order |
|---|---|---|
| `@agrune/core` | npm | 1st |
| `@agrune/build-core` | npm | 2nd (depends on core) |
| `@agrune/cli` | npm | 3rd (bundles mcp-server) |
| `@agrune/extension` | Chrome Web Store | parallel |

## Decisions

- **Trigger**: Git tag push (`v*`)
- **Versioning**: Single version across all packages, managed manually
- **CWS**: Deployed from the same tag, not a separate workflow
- **Tooling**: No changesets or release-please — manual version bump + tag
- **Publish tool**: `pnpm publish` (not `npm publish`) — resolves `workspace:*` protocol automatically

## Pre-requisite: Align Versions

Before implementing, align all package versions. `@agrune/build-core` is currently at `0.2.0` while others are at `0.1.0`. All publishable packages must share a single version going forward.

## Workflow: `.github/workflows/release.yml`

### Trigger

```yaml
on:
  push:
    tags:
      - 'v*'
```

### Job 1: `publish-npm`

**Runs on**: `ubuntu-latest`

**Steps**:
1. Checkout repo
2. Setup Node.js 22 + pnpm 10
3. `pnpm install --frozen-lockfile`
4. Version validation: extract version from tag, verify ALL publishable `package.json` files match (root, core, build-core, cli, extension, mcp-server)
5. Build mcp-server + copy to cli/assets + build cli:
   ```bash
   pnpm --filter @agrune/core --filter @agrune/build-core --filter @agrune/mcp-server run build
   mkdir -p packages/cli/assets
   cp -r packages/mcp-server/dist packages/cli/assets/mcp-server
   pnpm --filter @agrune/cli run build
   ```
6. `pnpm publish --access public --no-git-checks` for each package in order:
   - `packages/core`
   - `packages/build-core`
   - `packages/cli`

**Auth**: `NPM_TOKEN` secret set via `.npmrc` in CI:
```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

**Partial failure recovery**: npm publish is idempotent per version — re-running the workflow after a partial failure will skip already-published packages (409 Conflict). The workflow should use `|| true` for already-published checks or check version existence before publishing.

### Job 2: `publish-cws`

**Runs on**: `ubuntu-latest` (parallel with publish-npm)

**Steps**:
1. Checkout repo
2. Setup Node.js 22 + pnpm 10
3. `pnpm install --frozen-lockfile`
4. Build extension only:
   ```bash
   pnpm --filter @agrune/core --filter @agrune/build-core --filter @agrune/extension run build
   ```
5. Package extension zip with this exact structure:
   ```
   extension.zip/
     manifest.json      ← key field removed via jq
     icon-128.png
     dist/
       content.js
       service-worker.js
       popup.js
       page-runtime.js
     src/
       popup/
         popup.html
   ```
6. Upload via `npx chrome-webstore-upload-cli` (not a devDependency, invoked via npx):
   ```bash
   npx chrome-webstore-upload-cli upload \
     --source extension.zip \
     --extension-id $CWS_EXTENSION_ID \
     --client-id $CWS_CLIENT_ID \
     --client-secret $CWS_CLIENT_SECRET \
     --refresh-token $CWS_REFRESH_TOKEN
   ```
   Upload only — does NOT auto-publish. Manual review submission in CWS dashboard is required as a safety gate.

**Auth**: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` secrets

### Secrets Required

| Secret | Source | Purpose |
|---|---|---|
| `NPM_TOKEN` | npm granular access token (agrune-publish) | npm publish |
| `CWS_CLIENT_ID` | Google Cloud Console OAuth | CWS API auth |
| `CWS_CLIENT_SECRET` | Google Cloud Console OAuth | CWS API auth |
| `CWS_REFRESH_TOKEN` | OAuth flow | CWS API auth |
| `CWS_EXTENSION_ID` | CWS developer dashboard | Target extension |

### Version Validation

Extracts version from git tag and verifies ALL package.json files match:

```bash
TAG_VERSION="${GITHUB_REF#refs/tags/v}"
for pkg in . packages/core packages/build-core packages/cli packages/extension packages/mcp-server; do
  PKG_VERSION=$(node -p "require('./$pkg/package.json').version")
  if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
    echo "ERROR: $pkg version ($PKG_VERSION) does not match tag ($TAG_VERSION)"
    exit 1
  fi
done
```

## Release Process (Manual Steps)

1. Update version in ALL `package.json` files: root, core, build-core, cli, extension, mcp-server
2. Commit: `chore: bump version to X.Y.Z`
3. Tag: `git tag vX.Y.Z`
4. Push: `git push && git push --tags`
5. GitHub Actions runs automatically (npm publish + CWS upload)
6. Go to CWS developer dashboard and submit for review (manual safety gate)

## Out of Scope

- Demo repo separation (task #5 in release pipeline todo)
- CWS API key provisioning (manual setup, one-time)
- Automated changelog generation
- Test step in release workflow (handled by separate CI on PRs)
