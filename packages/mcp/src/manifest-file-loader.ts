import { readFileSync, existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { execFileSync } from 'node:child_process'

export interface LoadedManifest {
  manifest: unknown
  path: string
  kind: 'json' | 'ts'
}

export function loadManifestFile(filePath: string): LoadedManifest {
  const absolute = resolvePath(filePath)
  if (!existsSync(absolute)) {
    throw new Error(`Manifest file not found: ${absolute}`)
  }

  if (absolute.endsWith('.json')) {
    const text = readFileSync(absolute, 'utf-8')
    return { manifest: JSON.parse(text), path: absolute, kind: 'json' }
  }

  if (absolute.endsWith('.ts') || absolute.endsWith('.mts')) {
    return {
      manifest: loadTsManifest(absolute),
      path: absolute,
      kind: 'ts',
    }
  }

  throw new Error(`Unsupported manifest extension: ${absolute}. Use .ts, .mts, or .json.`)
}

/**
 * Resolve tsx/esm loader to an absolute path so the subprocess can load it
 * regardless of CWD.
 *
 * When bundled by tsup, the banner injects:
 *   import { createRequire } from 'module'; const require = createRequire(import.meta.url);
 * so `require` is available globally in the bundle as a CJS-compat shim anchored
 * to the bundle file's directory. We do NOT re-import createRequire here to
 * avoid a duplicate declaration error.
 *
 * At runtime (ts-node / vitest source run), `require` is not injected but
 * import.meta.resolve is available as a fallback.
 */
function resolveTsxEsmLoader(): string {
  // In the tsup bundle, `require` is injected by the banner and is a Node.js
  // require() anchored to the bundle file location — perfect for resolving tsx.
  // We access it via a type assertion to avoid TypeScript errors in source mode.
  const _require = (typeof require !== 'undefined' ? require : null) as
    | ((id: string) => unknown) & { resolve: (id: string) => string }
    | null

  if (_require?.resolve) {
    try {
      return _require.resolve('tsx/esm')
    } catch {
      // fall through to next strategy
    }
  }

  // Fallback for source / ts-node context: use import.meta.resolve if available
  // (Node 20.6+). This is synchronous in Node 22+.
  if (typeof import.meta.resolve === 'function') {
    try {
      // import.meta.resolve returns a file: URL string
      const resolved = import.meta.resolve('tsx/esm')
      return resolved.startsWith('file://') ? resolved.slice(7) : resolved
    } catch {
      // fall through
    }
  }

  throw new Error('Cannot resolve tsx/esm — ensure tsx is installed as a dependency.')
}

function loadTsManifest(absolute: string): unknown {
  /**
   * Strategy: spawn a Node.js subprocess with tsx/esm loader that imports the
   * manifest file and writes JSON.stringify(default-export) to stdout.
   *
   * Security: Author's own manifest file is executed — trust boundary is within
   * author's workspace. subprocess is isolated from parent process (T-11-21).
   *
   * tsx/esm resolution: We resolve tsx/esm to its absolute path so the subprocess
   * `--import` flag receives a stable file:// URL regardless of CWD.
   */
  const fileUrl = pathToFileUrl(absolute)
  const runnerSource = `
import('${fileUrl}').then((mod) => {
  const manifest = mod.default ?? mod.manifest
  if (!manifest) {
    process.stderr.write('Manifest file must default-export the manifest or export it as \`manifest\`.\\n')
    process.exit(2)
  }
  process.stdout.write(JSON.stringify(manifest))
}).catch((err) => {
  process.stderr.write(String(err?.stack ?? err))
  process.exit(3)
})
`.trim()

  let tsxEsmPath: string
  try {
    tsxEsmPath = resolveTsxEsmLoader()
  } catch (err) {
    throw new Error(`Cannot find tsx/esm loader — ensure tsx is installed. ${String(err)}`)
  }

  // Pass the resolved loader as a file:// URL for --import
  const tsxEsmUrl = tsxEsmPath.startsWith('file://') ? tsxEsmPath : pathToFileUrl(tsxEsmPath)

  let out: string
  try {
    out = execFileSync(process.execPath, ['--import', tsxEsmUrl, '--input-type=module', '-e', runnerSource], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err: unknown) {
    const execErr = err as { stderr?: string; message?: string }
    const stderrMsg = execErr.stderr ? `\n${execErr.stderr}` : ''
    throw new Error(`Failed to execute TS manifest: ${execErr.message ?? String(err)}${stderrMsg}`)
  }

  try {
    return JSON.parse(out.trim())
  } catch (err) {
    throw new Error(`Failed to parse TS manifest JSON output: ${String(err)}`)
  }
}

function pathToFileUrl(absolute: string): string {
  return `file://${absolute.replace(/\\/g, '/')}`
}
