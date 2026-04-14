# Installer CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@agrune/cli` npm package that installs agrune runtime via `pnpm dlx @agrune/cli setup`

**Architecture:** Single npm package bundling pre-built mcp-server artifacts. CLI uses @clack/prompts for TUI. Five subcommands: setup, doctor, repair, update, uninstall. Doctor/repair share a check interface. `~/.agrune/version.json` tracks install state.

**Tech Stack:** TypeScript, tsup, @clack/prompts, vitest

**Spec:** `docs/superpowers/specs/2026-03-25-installer-cli-design.md`

---

## File Structure

```
packages/cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── bin/
│   └── agrune.ts              # Entrypoint — parse subcommand, dispatch
├── src/
│   ├── constants.ts           # CWS_EXTENSION_ID, HOST_NAME, AGRUNE_HOME paths
│   ├── commands/
│   │   ├── setup.ts           # TUI wizard → install selected components
│   │   ├── doctor.ts          # Run all checks, print results
│   │   ├── repair.ts          # Run all checks, auto-fix failures
│   │   ├── update.ts          # Version compare → re-install if needed
│   │   └── uninstall.ts       # TUI select → remove selected components
│   ├── checks/
│   │   ├── types.ts           # Check interface, CheckResult type
│   │   ├── index.ts           # runChecks() — iterate all checks
│   │   ├── runtime-files.ts   # Check ~/.agrune/mcp-server/ exists
│   │   ├── native-host.ts     # Check native host manifest + wrapper perms
│   │   └── mcp-config.ts      # Check Claude/Codex MCP config
│   └── utils/
│       ├── paths.ts           # AGRUNE_HOME, getNativeHostManifestPath(), getClaudeConfigPath()
│       ├── platform.ts        # getPlatform(), assertSupported()
│       ├── version.ts         # readVersion(), writeVersion()
│       ├── fs-helpers.ts      # copyDir(), backupFile()
│       └── native-host.ts     # installNativeHost(), getNativeHostManifest()
└── __tests__/
    ├── checks.test.ts         # Check interface tests
    ├── setup.test.ts          # Setup command tests
    ├── doctor.test.ts         # Doctor command tests
    ├── uninstall.test.ts      # Uninstall command tests
    ├── version.test.ts        # Version read/write tests
    └── native-host.test.ts    # Native host manifest tests
```

Existing files to modify:
- `packages/mcp/bin/agrune-mcp.ts` — remove `install` subcommand block (lines 12-18)
- `packages/mcp/tsup.config.ts` — remove `src/install.ts` from entry
- `pnpm-workspace.yaml` — already includes `packages/*`, no change needed
- `package.json` (root) — add `build:cli` script

---

### Task 1: Scaffold packages/cli with package.json and build config

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `packages/cli/bin/agrune.ts` (minimal stub)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@agrune/cli",
  "version": "0.1.0",
  "description": "Installer CLI for agrune browser automation",
  "type": "module",
  "bin": {
    "agrune": "./dist/bin/agrune.js"
  },
  "files": [
    "dist/",
    "assets/"
  ],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@clack/prompts": "^0.9"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "tsup": "^8.5.1",
    "typescript": "^5.9.3",
    "vitest": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["bin", "src", "__tests__"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['bin/agrune.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'es2022',
  noExternal: [/.*/],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
})
```

- [ ] **Step 4: Create minimal bin/agrune.ts stub**

```typescript
#!/usr/bin/env node

const command = process.argv[2]

const COMMANDS = ['setup', 'doctor', 'repair', 'update', 'uninstall'] as const

if (!command || !COMMANDS.includes(command as typeof COMMANDS[number])) {
  console.log(`Usage: agrune <command>

Commands:
  setup       Install agrune components
  doctor      Check installation health
  repair      Auto-fix installation issues
  update      Update installed runtime
  uninstall   Remove agrune components`)
  process.exit(command ? 1 : 0)
}

console.log(`agrune ${command}: not implemented yet`)
```

- [ ] **Step 5: Install dependencies and verify build**

Run: `cd /Users/laonpeople/dev/agrune && pnpm install && pnpm -C packages/cli build`
Expected: Build succeeds, `packages/cli/dist/bin/agrune.js` exists

- [ ] **Step 6: Verify CLI runs**

Run: `node packages/cli/dist/bin/agrune.js`
Expected: Prints usage help

- [ ] **Step 7: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): scaffold @agrune/cli package with build config"
```

---

### Task 2: Utils — paths, platform, fs-helpers, constants

**Files:**
- Create: `packages/cli/src/constants.ts`
- Create: `packages/cli/src/utils/paths.ts`
- Create: `packages/cli/src/utils/platform.ts`
- Create: `packages/cli/src/utils/fs-helpers.ts`
- Create: `packages/cli/src/utils/native-host.ts`
- Create: `packages/cli/src/utils/version.ts`
- Test: `packages/cli/__tests__/version.test.ts`
- Test: `packages/cli/__tests__/native-host.test.ts`

- [ ] **Step 1: Write version.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readVersionFile, writeVersionFile } from '../src/utils/version.js'

describe('version', () => {
  const testDir = join(tmpdir(), 'agrune-test-version')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns null when version.json does not exist', () => {
    expect(readVersionFile(join(testDir, 'version.json'))).toBeNull()
  })

  it('writes and reads version.json round-trip', () => {
    const path = join(testDir, 'version.json')
    const data = {
      version: '0.1.0',
      installedAt: '2026-03-25T00:00:00Z',
      updatedAt: '2026-03-25T00:00:00Z',
      components: {
        'mcp-server': true,
        'native-host': true,
        'claude-mcp': true,
        'codex-mcp': false,
        'chrome-extension': false,
      },
    }
    writeVersionFile(path, data)
    expect(readVersionFile(path)).toEqual(data)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/cli test`
Expected: FAIL — modules not found

- [ ] **Step 3: Write native-host.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { getNativeHostManifest, deriveExtensionIdFromManifestKey } from '../src/utils/native-host.js'

describe('native-host', () => {
  it('creates correct manifest shape', () => {
    const manifest = getNativeHostManifest('/path/to/binary', 'abcdefghijklmnop')
    expect(manifest).toEqual({
      name: 'com.agrune.agrune',
      description: 'agrune MCP server native messaging host',
      path: '/path/to/binary',
      type: 'stdio',
      allowed_origins: ['chrome-extension://abcdefghijklmnop/'],
    })
  })

  it('derives extension ID from manifest key', () => {
    // Use the actual key from packages/extension/manifest.json
    const key = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqLVmjeM2Lfnlwtas6edYoGZwPYZeRe8AnI1zmbkJWpskfHMGga9t9k4tfn99EEsV4Ebsoh+H9lCHyp6AHsaM1t3cAUlXALNBJzcpVts6PFOvMMlVI78NSshwbX79YoA2KP5UFCTk7ulqNbHPm5s/zcp6Q2eO+DH+PGGmjDGDFUiWXOJiWrCiLs7rRe1aibTOVktYKaobdKgLEvBrUO7JItRvyp9mMwaZbUl+6NWyhjfvivmjJ+qslvWrr+zlXsp8RKkN+0mlURnhsR1CPZA9arI1QKjt5007w99oOCXZ6Auuc5O8pYugZrj0EojjUW8dp2UX8ys2PcojSzTffzkVpQIDAQAB'
    const id = deriveExtensionIdFromManifestKey(key)
    expect(id).toMatch(/^[a-p]{32}$/)
    // ID should be deterministic
    expect(deriveExtensionIdFromManifestKey(key)).toBe(id)
  })
})
```

- [ ] **Step 4: Write constants.ts**

```typescript
import { join } from 'node:path'
import { homedir } from 'node:os'

export const HOST_NAME = 'com.agrune.agrune'
export const AGRUNE_HOME = join(homedir(), '.agrune')

// Derived from packages/extension/manifest.json key field.
// This is deterministic — the same key always produces the same ID.
// Update this if the extension key changes.
export const CLI_VERSION = '0.1.0'

export const CWS_EXTENSION_ID = '' // Will be set after deriving in Task 2 step 8
```

- [ ] **Step 5: Write paths.ts**

```typescript
import { join } from 'node:path'
import { AGRUNE_HOME, HOST_NAME } from '../constants.js'
import { homedir } from 'node:os'

export const MCP_SERVER_DIR = join(AGRUNE_HOME, 'mcp-server')
export const VERSION_FILE = join(AGRUNE_HOME, 'version.json')
export const NATIVE_HOST_WRAPPER = join(AGRUNE_HOME, 'native-host')
export const MCP_SERVER_ENTRY = join(AGRUNE_HOME, 'mcp-server/bin/agrune-mcp.js')

const MANIFEST_FILENAME = `${HOST_NAME}.json`

export function getNativeHostManifestPath(): string {
  const home = homedir()

  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', MANIFEST_FILENAME)
    case 'linux':
      return join(home, '.config', 'google-chrome', 'NativeMessagingHosts', MANIFEST_FILENAME)
    default:
      throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

export function getClaudeConfigPath(): string {
  const home = homedir()

  switch (process.platform) {
    case 'darwin':
      return join(home, '.claude', 'settings.json')
    case 'linux':
      return join(home, '.claude', 'settings.json')
    default:
      throw new Error(`Unsupported platform: ${process.platform}`)
  }
}
```

- [ ] **Step 6: Write platform.ts**

```typescript
export type SupportedPlatform = 'darwin' | 'linux'

export function getPlatform(): SupportedPlatform {
  const p = process.platform
  if (p === 'darwin' || p === 'linux') return p
  throw new Error(`Unsupported platform: ${p}. Only macOS and Linux are supported.`)
}
```

- [ ] **Step 7: Write fs-helpers.ts**

```typescript
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'

export function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

export function backupFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  const bakPath = `${filePath}.bak`
  copyFileSync(filePath, bakPath)
  return bakPath
}

export function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, 'utf-8')
  return JSON.parse(content) as T
}

export function writeJsonFile(filePath: string, data: unknown): void {
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}
```

- [ ] **Step 8: Write native-host.ts**

Port from `packages/mcp/src/install.ts` — the pure functions only.

```typescript
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HOST_NAME } from '../constants.js'
import { getNativeHostManifestPath, MCP_SERVER_ENTRY, NATIVE_HOST_WRAPPER } from './paths.js'

export function getNativeHostManifest(binaryPath: string, extensionId: string) {
  return {
    name: HOST_NAME,
    description: 'agrune MCP server native messaging host',
    path: binaryPath,
    type: 'stdio' as const,
    allowed_origins: [`chrome-extension://${extensionId}/`],
  }
}

export function deriveExtensionIdFromManifestKey(key: string): string {
  const publicKeyBytes = Buffer.from(key, 'base64')
  if (publicKeyBytes.length === 0) {
    throw new Error('Extension manifest key is empty or invalid')
  }

  const hash = createHash('sha256').update(publicKeyBytes).digest()
  let extensionId = ''

  for (const byte of hash.subarray(0, 16)) {
    extensionId += String.fromCharCode('a'.charCodeAt(0) + (byte >> 4))
    extensionId += String.fromCharCode('a'.charCodeAt(0) + (byte & 0x0f))
  }

  return extensionId
}

export function installNativeHostWrapper(): string {
  const wrapper = [
    '#!/bin/sh',
    '# agrune native messaging host',
    '# Generated by @agrune/cli — do not edit manually',
    `exec node "${MCP_SERVER_ENTRY}" --native-host`,
    '',
  ].join('\n')

  mkdirSync(dirname(NATIVE_HOST_WRAPPER), { recursive: true })
  writeFileSync(NATIVE_HOST_WRAPPER, wrapper, { mode: 0o755 })
  return NATIVE_HOST_WRAPPER
}

export function installNativeHostManifest(extensionId: string): string {
  const manifestPath = getNativeHostManifestPath()
  const manifest = getNativeHostManifest(NATIVE_HOST_WRAPPER, extensionId)

  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  return manifestPath
}
```

- [ ] **Step 9: Write version.ts**

```typescript
import { readJsonFile, writeJsonFile } from './fs-helpers.js'

export interface VersionData {
  version: string
  installedAt: string
  updatedAt: string
  components: {
    'mcp-server': boolean
    'native-host': boolean
    'claude-mcp': boolean
    'codex-mcp': boolean
    'chrome-extension': boolean
  }
}

export function readVersionFile(path: string): VersionData | null {
  return readJsonFile<VersionData>(path)
}

export function writeVersionFile(path: string, data: VersionData): void {
  writeJsonFile(path, data)
}
```

- [ ] **Step 10: Derive CWS_EXTENSION_ID and update constants.ts**

Run: `node -e "
const crypto = require('crypto');
const key = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqLVmjeM2Lfnlwtas6edYoGZwPYZeRe8AnI1zmbkJWpskfHMGga9t9k4tfn99EEsV4Ebsoh+H9lCHyp6AHsaM1t3cAUlXALNBJzcpVts6PFOvMMlVI78NSshwbX79YoA2KP5UFCTk7ulqNbHPm5s/zcp6Q2eO+DH+PGGmjDGDFUiWXOJiWrCiLs7rRe1aibTOVktYKaobdKgLEvBrUO7JItRvyp9mMwaZbUl+6NWyhjfvivmjJ+qslvWrr+zlXsp8RKkN+0mlURnhsR1CPZA9arI1QKjt5007w99oOCXZ6Auuc5O8pYugZrj0EojjUW8dp2UX8ys2PcojSzTffzkVpQIDAQAB';
const bytes = Buffer.from(key, 'base64');
const hash = crypto.createHash('sha256').update(bytes).digest();
let id = '';
for (const b of hash.subarray(0, 16)) {
  id += String.fromCharCode(97 + (b >> 4));
  id += String.fromCharCode(97 + (b & 0x0f));
}
console.log(id);
"`

Use the output to fill in `CWS_EXTENSION_ID` in constants.ts.

- [ ] **Step 11: Run tests to verify they pass**

Run: `pnpm -C packages/cli test`
Expected: All tests pass

- [ ] **Step 12: Commit**

```bash
git add packages/cli/src/ packages/cli/__tests__/
git commit -m "feat(cli): add utils — paths, platform, version, native-host, fs-helpers"
```

---

### Task 3: Check interface and doctor/repair shared logic

**Files:**
- Create: `packages/cli/src/checks/types.ts`
- Create: `packages/cli/src/checks/runtime-files.ts`
- Create: `packages/cli/src/checks/native-host.ts`
- Create: `packages/cli/src/checks/mcp-config.ts`
- Create: `packages/cli/src/checks/index.ts`
- Test: `packages/cli/__tests__/checks.test.ts`

- [ ] **Step 1: Write checks.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runtimeFilesCheck } from '../src/checks/runtime-files.js'

describe('runtimeFilesCheck', () => {
  const testDir = join(tmpdir(), 'agrune-test-checks')
  const mcpServerDir = join(testDir, 'mcp-server')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('fails when mcp-server dir does not exist', async () => {
    const check = runtimeFilesCheck(testDir)
    const result = await check.check()
    expect(result.ok).toBe(false)
  })

  it('passes when mcp-server dir exists with entry file', async () => {
    mkdirSync(join(mcpServerDir, 'bin'), { recursive: true })
    writeFileSync(join(mcpServerDir, 'bin/agrune-mcp.js'), '')
    const check = runtimeFilesCheck(testDir)
    const result = await check.check()
    expect(result.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/cli test`
Expected: FAIL — module not found

- [ ] **Step 3: Write types.ts**

```typescript
export interface CheckResult {
  ok: boolean
  message: string
}

export interface Check {
  name: string
  check: () => Promise<CheckResult>
  fix: () => Promise<void>
}
```

- [ ] **Step 4: Write runtime-files.ts**

```typescript
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Check } from './types.js'

export function runtimeFilesCheck(agruneHome: string): Check {
  const entryFile = join(agruneHome, 'mcp-server/bin/agrune-mcp.js')

  return {
    name: 'Runtime files',
    async check() {
      if (!existsSync(entryFile)) {
        return { ok: false, message: `${entryFile} not found` }
      }
      return { ok: true, message: 'mcp-server files present' }
    },
    async fix() {
      // Fix requires re-running setup — cannot self-repair without assets
      throw new Error('Runtime files missing. Run `pnpm dlx @agrune/cli setup --force` to reinstall.')
    },
  }
}
```

- [ ] **Step 5: Write native-host.ts check**

```typescript
import { existsSync, accessSync, constants, readFileSync } from 'node:fs'
import type { Check } from './types.js'
import { getNativeHostManifestPath, NATIVE_HOST_WRAPPER } from '../utils/paths.js'
import { installNativeHostWrapper, installNativeHostManifest } from '../utils/native-host.js'
import { CWS_EXTENSION_ID } from '../constants.js'

export function nativeHostManifestCheck(): Check {
  return {
    name: 'Native host manifest',
    async check() {
      const manifestPath = getNativeHostManifestPath()
      if (!existsSync(manifestPath)) {
        return { ok: false, message: 'Native host manifest not found' }
      }
      try {
        const content = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (content.name !== 'com.agrune.agrune') {
          return { ok: false, message: 'Native host manifest has wrong name' }
        }
        return { ok: true, message: 'Native host manifest valid' }
      } catch {
        return { ok: false, message: 'Native host manifest is not valid JSON' }
      }
    },
    async fix() {
      installNativeHostManifest(CWS_EXTENSION_ID)
    },
  }
}

export function nativeHostWrapperCheck(): Check {
  return {
    name: 'Native host wrapper',
    async check() {
      if (!existsSync(NATIVE_HOST_WRAPPER)) {
        return { ok: false, message: 'Native host wrapper not found' }
      }
      try {
        accessSync(NATIVE_HOST_WRAPPER, constants.X_OK)
        return { ok: true, message: 'Native host wrapper executable' }
      } catch {
        return { ok: false, message: 'Native host wrapper not executable' }
      }
    },
    async fix() {
      installNativeHostWrapper()
    },
  }
}
```

- [ ] **Step 6: Write mcp-config.ts check**

```typescript
import { existsSync, readFileSync } from 'node:fs'
import type { Check } from './types.js'
import { getClaudeConfigPath, MCP_SERVER_ENTRY } from '../utils/paths.js'
import { readJsonFile, writeJsonFile, backupFile } from '../utils/fs-helpers.js'

export function claudeMcpCheck(): Check {
  return {
    name: 'Claude MCP config',
    async check() {
      const configPath = getClaudeConfigPath()
      if (!existsSync(configPath)) {
        return { ok: false, message: 'Claude settings.json not found' }
      }
      const config = readJsonFile<Record<string, unknown>>(configPath)
      const servers = (config as any)?.mcpServers
      if (!servers?.agrune) {
        return { ok: false, message: 'mcpServers.agrune not registered' }
      }
      return { ok: true, message: 'Claude MCP configured' }
    },
    async fix() {
      const configPath = getClaudeConfigPath()
      backupFile(configPath)
      const config = readJsonFile<Record<string, unknown>>(configPath) ?? {}
      const servers = ((config as any).mcpServers ?? {}) as Record<string, unknown>
      servers.agrune = {
        command: 'node',
        args: [MCP_SERVER_ENTRY],
      }
      ;(config as any).mcpServers = servers
      writeJsonFile(configPath, config)
    },
  }
}

export function codexMcpCheck(): Check {
  return {
    name: 'Codex MCP config',
    async check() {
      // Check if codex CLI is available, then check if agrune is registered
      try {
        const { execSync } = await import('node:child_process')
        const output = execSync('codex mcp list', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
        if (output.includes('agrune')) {
          return { ok: true, message: 'Codex MCP configured' }
        }
        return { ok: false, message: 'agrune not in Codex MCP list' }
      } catch {
        return { ok: false, message: 'Codex CLI not available or agrune not registered' }
      }
    },
    async fix() {
      const { execSync } = await import('node:child_process')
      execSync(`codex mcp add agrune --command "node" --args "${MCP_SERVER_ENTRY}"`, {
        stdio: 'inherit',
      })
    },
  }
}
```

- [ ] **Step 7: Write checks/index.ts**

```typescript
import type { Check, CheckResult } from './types.js'

export type { Check, CheckResult }

export interface CheckRunResult {
  check: Check
  result: CheckResult
}

export async function runAllChecks(checks: Check[]): Promise<CheckRunResult[]> {
  const results: CheckRunResult[] = []
  for (const check of checks) {
    const result = await check.check()
    results.push({ check, result })
  }
  return results
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm -C packages/cli test`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/checks/ packages/cli/__tests__/checks.test.ts
git commit -m "feat(cli): add doctor/repair check interface and check implementations"
```

---

### Task 4: Setup command

**Files:**
- Create: `packages/cli/src/commands/setup.ts`
- Modify: `packages/cli/bin/agrune.ts`
- Test: `packages/cli/__tests__/setup.test.ts`

- [ ] **Step 1: Write setup.test.ts**

Test the core install logic (not TUI), using a temp directory as AGRUNE_HOME.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installRuntime } from '../src/commands/setup.js'

describe('installRuntime', () => {
  const testHome = join(tmpdir(), 'agrune-test-setup')
  const fakeAssets = join(tmpdir(), 'agrune-test-assets')

  beforeEach(() => {
    mkdirSync(testHome, { recursive: true })
    // Create fake mcp-server assets
    mkdirSync(join(fakeAssets, 'mcp-server/bin'), { recursive: true })
    writeFileSync(join(fakeAssets, 'mcp-server/bin/agrune-mcp.js'), '// stub')
  })

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true })
    rmSync(fakeAssets, { recursive: true, force: true })
  })

  it('copies mcp-server assets to target directory', () => {
    installRuntime(fakeAssets, testHome)
    expect(existsSync(join(testHome, 'mcp-server/bin/agrune-mcp.js'))).toBe(true)
  })

  it('writes version.json', () => {
    installRuntime(fakeAssets, testHome)
    const versionPath = join(testHome, 'version.json')
    expect(existsSync(versionPath)).toBe(true)
    const data = JSON.parse(readFileSync(versionPath, 'utf-8'))
    expect(data.version).toBeDefined()
    expect(data.components['mcp-server']).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/cli test`
Expected: FAIL — `installRuntime` not found

- [ ] **Step 3: Write setup.ts**

```typescript
import * as p from '@clack/prompts'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { copyDir } from '../utils/fs-helpers.js'
import { writeVersionFile, readVersionFile, type VersionData } from '../utils/version.js'
import { installNativeHostWrapper, installNativeHostManifest } from '../utils/native-host.js'
import { CWS_EXTENSION_ID, CLI_VERSION, AGRUNE_HOME } from '../constants.js'
import { MCP_SERVER_ENTRY } from '../utils/paths.js'
import { readJsonFile, writeJsonFile, backupFile } from '../utils/fs-helpers.js'
import { getClaudeConfigPath } from '../utils/paths.js'
import { getPlatform } from '../utils/platform.js'

export function getAssetsDir(): string {
  const thisDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
  // dist/bin/agrune.js -> assets/
  return resolve(thisDir, '..', '..', 'assets')
}

/** Core install logic — testable without TUI */
export function installRuntime(assetsDir: string, agruneHome: string): void {
  const mcpServerSrc = join(assetsDir, 'mcp-server')
  const mcpServerDest = join(agruneHome, 'mcp-server')

  mkdirSync(agruneHome, { recursive: true })

  if (existsSync(mcpServerDest)) {
    rmSync(mcpServerDest, { recursive: true })
  }
  copyDir(mcpServerSrc, mcpServerDest)

  const versionPath = join(agruneHome, 'version.json')
  const existing = readVersionFile(versionPath)
  const now = new Date().toISOString()

  const data: VersionData = {
    version: CLI_VERSION,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
    components: existing?.components ?? {
      'mcp-server': true,
      'native-host': false,
      'claude-mcp': false,
      'codex-mcp': false,
      'chrome-extension': false,
    },
  }
  data.components['mcp-server'] = true
  writeVersionFile(versionPath, data)
}

export async function runSetup(opts: { force?: boolean } = {}): Promise<void> {
  getPlatform() // throws on unsupported platform

  if (!process.stdout.isTTY) {
    console.error('Error: setup requires an interactive terminal. Do not run in CI or piped environments.')
    process.exit(1)
  }

  p.intro('agrune installer v' + CLI_VERSION)

  const options = await p.multiselect({
    message: '설치할 항목을 선택하세요',
    options: [
      { value: 'chrome-extension', label: 'Chrome Extension (CWS에서 설치)' },
      { value: 'claude-mcp', label: 'Claude MCP' },
      { value: 'codex-mcp', label: 'Codex MCP' },
    ],
    initialValues: ['chrome-extension', 'claude-mcp'],
  })

  if (p.isCancel(options)) {
    p.cancel('설치 취소됨')
    process.exit(0)
  }

  const selected = options as string[]
  const assetsDir = getAssetsDir()

  // 1. Always install runtime + native host
  const s = p.spinner()
  s.start('런타임 설치 중...')
  installRuntime(assetsDir, AGRUNE_HOME)
  s.stop('런타임 설치 완료')

  // 2. Native host
  s.start('네이티브 호스트 등록 중...')
  installNativeHostWrapper()
  installNativeHostManifest(CWS_EXTENSION_ID)
  s.stop('네이티브 호스트 등록 완료')

  // Update components
  const versionPath = join(agruneHome, 'version.json')
  const vData = readVersionFile(versionPath)!
  vData.components['native-host'] = true

  // 3. Chrome Extension
  if (selected.includes('chrome-extension')) {
    p.note('Chrome Web Store에서 agrune 확장을 설치해주세요.', 'Chrome Extension')
    // Open CWS page
    try {
      const url = `https://chromewebstore.google.com/detail/${CWS_EXTENSION_ID}`
      if (process.platform === 'darwin') {
        execSync(`open "${url}"`)
      } else {
        execSync(`xdg-open "${url}"`)
      }
    } catch {
      // Ignore — user can open manually
    }
    vData.components['chrome-extension'] = true
  }

  // 4. Claude MCP
  if (selected.includes('claude-mcp')) {
    s.start('Claude MCP 설정 중...')
    const configPath = getClaudeConfigPath()
    backupFile(configPath)
    const config = readJsonFile<Record<string, unknown>>(configPath) ?? {}
    const servers = ((config as any).mcpServers ?? {}) as Record<string, unknown>
    servers.agrune = {
      command: 'node',
      args: [MCP_SERVER_ENTRY],
    }
    ;(config as any).mcpServers = servers
    writeJsonFile(configPath, config)
    s.stop('Claude MCP 설정 완료')
    vData.components['claude-mcp'] = true
  }

  // 5. Codex MCP
  if (selected.includes('codex-mcp')) {
    s.start('Codex MCP 설정 중...')
    try {
      execSync(`codex mcp add agrune --command "node" --args "${MCP_SERVER_ENTRY}"`, {
        stdio: 'pipe',
      })
      s.stop('Codex MCP 설정 완료')
      vData.components['codex-mcp'] = true
    } catch {
      s.stop('Codex MCP 설정 실패 — codex CLI를 확인하세요')
    }
  }

  writeVersionFile(versionPath, vData)

  p.outro('설치 완료! `pnpm dlx @agrune/cli doctor`로 상태를 확인하세요.')
}
```

- [ ] **Step 4: Wire setup into bin/agrune.ts**

Replace the stub with command dispatch:

```typescript
#!/usr/bin/env node

const command = process.argv[2]

const COMMANDS = ['setup', 'doctor', 'repair', 'update', 'uninstall'] as const
type Command = typeof COMMANDS[number]

if (!command || !COMMANDS.includes(command as Command)) {
  console.log(`Usage: agrune <command>

Commands:
  setup       Install agrune components
  doctor      Check installation health
  repair      Auto-fix installation issues
  update      Update installed runtime
  uninstall   Remove agrune components`)
  process.exit(command ? 1 : 0)
}

switch (command as Command) {
  case 'setup': {
    const force = process.argv.includes('--force')
    const { runSetup } = await import('../src/commands/setup.js')
    await runSetup({ force })
    break
  }
  case 'doctor': {
    const { runDoctor } = await import('../src/commands/doctor.js')
    await runDoctor()
    break
  }
  case 'repair': {
    const { runRepair } = await import('../src/commands/repair.js')
    await runRepair()
    break
  }
  case 'update': {
    const { runUpdate } = await import('../src/commands/update.js')
    await runUpdate()
    break
  }
  case 'uninstall': {
    const { runUninstall } = await import('../src/commands/uninstall.js')
    await runUninstall()
    break
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -C packages/cli test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/setup.ts packages/cli/bin/agrune.ts packages/cli/__tests__/setup.test.ts
git commit -m "feat(cli): add setup command with TUI wizard"
```

---

### Task 5: Doctor command

**Files:**
- Create: `packages/cli/src/commands/doctor.ts`
- Test: `packages/cli/__tests__/doctor.test.ts`

- [ ] **Step 1: Write doctor.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { runAllChecks, type Check } from '../src/checks/index.js'

describe('runAllChecks', () => {
  it('collects results from all checks', async () => {
    const checks: Check[] = [
      {
        name: 'passing check',
        check: async () => ({ ok: true, message: 'good' }),
        fix: async () => {},
      },
      {
        name: 'failing check',
        check: async () => ({ ok: false, message: 'bad' }),
        fix: async () => {},
      },
    ]

    const results = await runAllChecks(checks)
    expect(results).toHaveLength(2)
    expect(results[0].result.ok).toBe(true)
    expect(results[1].result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (uses existing runAllChecks)**

Run: `pnpm -C packages/cli test`
Expected: PASS

- [ ] **Step 3: Write doctor.ts**

```typescript
import * as p from '@clack/prompts'
import { runAllChecks } from '../checks/index.js'
import { runtimeFilesCheck } from '../checks/runtime-files.js'
import { nativeHostManifestCheck, nativeHostWrapperCheck } from '../checks/native-host.js'
import { claudeMcpCheck, codexMcpCheck } from '../checks/mcp-config.js'
import { readVersionFile } from '../utils/version.js'
import { VERSION_FILE } from '../utils/paths.js'
import { AGRUNE_HOME, CLI_VERSION } from '../constants.js'

function getAllChecks() {
  return [
    runtimeFilesCheck(AGRUNE_HOME),
    nativeHostManifestCheck(),
    nativeHostWrapperCheck(),
    claudeMcpCheck(),
    codexMcpCheck(),
  ]
}

export { getAllChecks }

export async function runDoctor(): Promise<void> {
  p.intro('agrune doctor')

  const results = await runAllChecks(getAllChecks())

  let issues = 0
  for (const { check, result } of results) {
    if (result.ok) {
      p.log.success(`${check.name}: ${result.message}`)
    } else {
      p.log.error(`${check.name}: ${result.message}`)
      issues++
    }
  }

  // Version check
  const versionData = readVersionFile(VERSION_FILE)
  if (versionData && versionData.version !== CLI_VERSION) {
    p.log.warning(`버전 ${versionData.version} → ${CLI_VERSION} 업데이트 가능`)
  }

  if (issues > 0) {
    p.outro(`${issues}개 문제 발견. \`pnpm dlx @agrune/cli repair\`로 복구할 수 있습니다.`)
  } else {
    p.outro('모든 항목 정상!')
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/doctor.ts packages/cli/__tests__/doctor.test.ts
git commit -m "feat(cli): add doctor command"
```

---

### Task 6: Repair command

**Files:**
- Create: `packages/cli/src/commands/repair.ts`

- [ ] **Step 1: Write repair.ts**

```typescript
import * as p from '@clack/prompts'
import { runAllChecks } from '../checks/index.js'
import { getAllChecks } from './doctor.js'

export async function runRepair(): Promise<void> {
  p.intro('agrune repair')

  const checks = getAllChecks()
  const results = await runAllChecks(checks)

  const failures = results.filter(r => !r.result.ok)

  if (failures.length === 0) {
    p.outro('문제가 없습니다. 모든 항목 정상!')
    return
  }

  p.log.warning(`${failures.length}개 문제 발견:`)
  for (const { check, result } of failures) {
    p.log.error(`  ${check.name}: ${result.message}`)
  }

  const shouldFix = await p.confirm({
    message: '자동으로 복구하시겠습니까?',
  })

  if (p.isCancel(shouldFix) || !shouldFix) {
    p.cancel('복구 취소됨')
    return
  }

  let fixed = 0
  for (const { check, result } of failures) {
    const s = p.spinner()
    s.start(`${check.name} 복구 중...`)
    try {
      await check.fix()
      s.stop(`${check.name} 복구 완료`)
      fixed++
    } catch (err) {
      s.stop(`${check.name} 복구 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  p.outro(`${fixed}/${failures.length}개 항목 복구 완료`)
}
```

- [ ] **Step 2: Build and verify**

Run: `pnpm -C packages/cli build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/repair.ts
git commit -m "feat(cli): add repair command"
```

---

### Task 7: Update command

**Files:**
- Create: `packages/cli/src/commands/update.ts`

- [ ] **Step 1: Write update.ts**

```typescript
import * as p from '@clack/prompts'
import { readVersionFile } from '../utils/version.js'
import { VERSION_FILE } from '../utils/paths.js'
import { AGRUNE_HOME, CLI_VERSION, CWS_EXTENSION_ID } from '../constants.js'
import { installRuntime, getAssetsDir } from './setup.js'
import { installNativeHostWrapper, installNativeHostManifest } from '../utils/native-host.js'

export async function runUpdate(): Promise<void> {
  p.intro('agrune update')

  const versionData = readVersionFile(VERSION_FILE)

  if (!versionData) {
    p.log.error('agrune이 설치되어 있지 않습니다. `setup`을 먼저 실행하세요.')
    p.outro('')
    return
  }

  if (versionData.version === CLI_VERSION) {
    p.outro(`이미 최신 버전입니다 (${CLI_VERSION})`)
    return
  }

  p.log.info(`${versionData.version} → ${CLI_VERSION} 업데이트`)

  const s = p.spinner()

  s.start('런타임 업데이트 중...')
  installRuntime(getAssetsDir(), AGRUNE_HOME)
  s.stop('런타임 업데이트 완료')

  s.start('네이티브 호스트 재등록 중...')
  installNativeHostWrapper()
  installNativeHostManifest(CWS_EXTENSION_ID)
  s.stop('네이티브 호스트 재등록 완료')

  p.outro(`${CLI_VERSION}으로 업데이트 완료!`)
}
```

- [ ] **Step 2: Build and verify**

Run: `pnpm -C packages/cli build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/update.ts packages/cli/src/commands/setup.ts
git commit -m "feat(cli): add update command"
```

---

### Task 8: Uninstall command

**Files:**
- Create: `packages/cli/src/commands/uninstall.ts`
- Test: `packages/cli/__tests__/uninstall.test.ts`

- [ ] **Step 1: Write uninstall.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { removeRuntimeFiles } from '../src/commands/uninstall.js'

describe('removeRuntimeFiles', () => {
  const testDir = join(tmpdir(), 'agrune-test-uninstall')

  beforeEach(() => {
    mkdirSync(join(testDir, 'mcp-server/bin'), { recursive: true })
    writeFileSync(join(testDir, 'mcp-server/bin/agrune-mcp.js'), '')
    writeFileSync(join(testDir, 'version.json'), '{}')
    writeFileSync(join(testDir, 'native-host'), '')
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('removes ~/.agrune directory contents', () => {
    removeRuntimeFiles(testDir)
    expect(existsSync(testDir)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/cli test`
Expected: FAIL — `removeRuntimeFiles` not found

- [ ] **Step 3: Write uninstall.ts**

```typescript
import * as p from '@clack/prompts'
import { existsSync, rmSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { AGRUNE_HOME } from '../constants.js'
import { getNativeHostManifestPath, getClaudeConfigPath } from '../utils/paths.js'
import { readJsonFile, writeJsonFile, backupFile } from '../utils/fs-helpers.js'
import { readVersionFile } from '../utils/version.js'
import { join } from 'node:path'

/** Testable core logic */
export function removeRuntimeFiles(agruneHome: string): void {
  if (existsSync(agruneHome)) {
    rmSync(agruneHome, { recursive: true })
  }
}

export function removeNativeHostManifest(): void {
  const manifestPath = getNativeHostManifestPath()
  if (existsSync(manifestPath)) {
    unlinkSync(manifestPath)
  }
}

export function removeClaudeMcpConfig(): void {
  const configPath = getClaudeConfigPath()
  if (!existsSync(configPath)) return
  backupFile(configPath)
  const config = readJsonFile<Record<string, unknown>>(configPath)
  if (!config) return
  const servers = (config as any).mcpServers
  if (servers?.agrune) {
    delete servers.agrune
    writeJsonFile(configPath, config)
  }
}

export function removeCodexMcpConfig(): void {
  try {
    execSync('codex mcp remove agrune', { stdio: 'pipe' })
  } catch {
    // codex CLI not available or agrune not registered — ignore
  }
}

export async function runUninstall(): Promise<void> {
  p.intro('agrune uninstall')

  const versionData = readVersionFile(join(AGRUNE_HOME, 'version.json'))

  const options = await p.multiselect({
    message: '제거할 항목을 선택하세요',
    options: [
      { value: 'runtime', label: '런타임 파일 (~/.agrune/)' },
      { value: 'native-host', label: '네이티브 호스트 매니페스트' },
      { value: 'claude-mcp', label: 'Claude MCP 설정' },
      { value: 'codex-mcp', label: 'Codex MCP 설정' },
      { value: 'chrome-extension', label: 'Chrome Extension (수동 제거 안내)' },
    ],
    initialValues: ['runtime', 'native-host'],
  })

  if (p.isCancel(options)) {
    p.cancel('제거 취소됨')
    return
  }

  const selected = options as string[]

  if (selected.includes('claude-mcp')) {
    removeClaudeMcpConfig()
    p.log.success('Claude MCP 설정 제거 완료')
  }

  if (selected.includes('codex-mcp')) {
    removeCodexMcpConfig()
    p.log.success('Codex MCP 설정 제거 완료')
  }

  if (selected.includes('native-host')) {
    removeNativeHostManifest()
    p.log.success('네이티브 호스트 매니페스트 제거 완료')
  }

  if (selected.includes('runtime')) {
    removeRuntimeFiles(AGRUNE_HOME)
    p.log.success('런타임 파일 제거 완료')
  }

  if (selected.includes('chrome-extension')) {
    p.note('chrome://extensions 에서 agrune 확장을 직접 제거해주세요.', 'Chrome Extension')
  }

  p.outro('제거 완료')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C packages/cli test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/uninstall.ts packages/cli/__tests__/uninstall.test.ts
git commit -m "feat(cli): add uninstall command"
```

---

### Task 9: Build pipeline and remove legacy install from mcp-server

**Files:**
- Modify: `packages/mcp/bin/agrune-mcp.ts:12-18` — remove install block
- Modify: `packages/mcp/tsup.config.ts` — remove `src/install.ts` from entry
- Delete: `packages/mcp/src/install.ts` — logic moved to cli package
- Modify: `package.json` (root) — add `build:cli` script

- [ ] **Step 1: Remove install subcommand from agrune-mcp.ts**

Remove lines 12-18 in `packages/mcp/bin/agrune-mcp.ts`:

```typescript
// DELETE THIS BLOCK:
if (args[0] === 'install') {
  const { runInstall } = await import('../src/install.js')
  const extensionIdArg = args.find(a => a.startsWith('--extension-id='))
  const extensionId = extensionIdArg?.split('=')[1]
  await runInstall({ extensionId })
  process.exit(0)
}
```

- [ ] **Step 2: Remove install.ts from tsup entry**

In `packages/mcp/tsup.config.ts`, change entry to:

```typescript
entry: ['src/index.ts', 'bin/agrune-mcp.ts'],
```

(Remove `'src/install.ts'`)

- [ ] **Step 3: Delete packages/mcp/src/install.ts**

Run: `rm packages/mcp/src/install.ts`

- [ ] **Step 4: Add build:cli script to root package.json**

Add to root `package.json` scripts:

```json
"build:cli": "pnpm -r build && mkdir -p packages/cli/assets && cp -r packages/mcp/dist packages/cli/assets/mcp-server && pnpm -C packages/cli build"
```

- [ ] **Step 5: Verify full build**

Run: `cd /Users/laonpeople/dev/agrune && pnpm run build:cli`
Expected: All packages build, assets copied, cli builds

- [ ] **Step 6: Verify mcp-server still works without install**

Run: `node packages/mcp/dist/bin/agrune-mcp.js --help 2>&1 || true`
Expected: Does not crash, enters MCP mode or shows no install option

- [ ] **Step 7: Run all tests**

Run: `pnpm test`
Expected: All tests pass across all packages

- [ ] **Step 8: Commit**

```bash
git add packages/mcp/ package.json
git commit -m "refactor: move install to @agrune/cli, remove from mcp-server"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Full build from clean**

Run: `cd /Users/laonpeople/dev/agrune && pnpm run build:cli`
Expected: Succeeds

- [ ] **Step 2: Verify CLI binary works**

Run: `node packages/cli/dist/bin/agrune.js`
Expected: Prints usage with all 5 commands

Run: `node packages/cli/dist/bin/agrune.js doctor`
Expected: Runs doctor checks (some may fail in dev environment, that's expected)

- [ ] **Step 3: Verify assets are bundled**

Run: `ls packages/cli/assets/mcp-server/bin/`
Expected: `agrune-mcp.js` exists

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 5: Verify npm pack includes correct files**

Run: `cd packages/cli && pnpm pack --dry-run`
Expected: Lists `dist/` and `assets/` files, no source files

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "chore(cli): e2e verification fixes"
```
