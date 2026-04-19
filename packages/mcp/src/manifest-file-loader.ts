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

function loadTsManifest(absolute: string): unknown {
  /**
   * Strategy: spawn a Node.js subprocess with tsx/esm loader that imports the
   * manifest file and writes JSON.stringify(default-export) to stdout.
   *
   * Security: Author's own manifest file is executed — trust boundary is within
   * author's workspace. subprocess is isolated from parent process (T-11-21).
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

  let out: string
  try {
    out = execFileSync(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e', runnerSource], {
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
