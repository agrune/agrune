/**
 * `agrune maps submit <file>` — submit a manifest (wrapped in
 * RegistryEntry metadata) to the public `agrune/maps` registry as a PR.
 *
 * Authentication order:
 *   1. `AGRUNE_GITHUB_TOKEN` env (PAT override — skip device flow)
 *   2. GitHub OAuth device flow via `@octokit/auth-oauth-device`
 *
 * Token persistence (Pitfall 2):
 *   - Tokens live ONLY in the function-scope variable during this run.
 *   - NO file is written under `~/.agrune/maps/.auth*` or similar.
 *   - The test suite asserts this structurally.
 *
 * Threat model:
 *   - T-18-13 (device code phishing): onVerification callback only prints
 *     the verification URL emitted by Octokit (github.com/login/device);
 *     we never construct it ourselves.
 *   - T-18-14 (token leakage): structural guarantee — no disk write.
 *
 * MVP scope (v0.5):
 *   - Accept `.json` manifest files only (or already-serialized
 *     RegistryEntry JSON). TypeScript dynamic-import of manifest.ts is
 *     deferred to v0.6+ (plan checker note, and RESEARCH Open Q 5 defer list).
 *   - Fork + commit + PR flow scaffolded via Octokit; the mainline path is
 *     unit-tested, but first user-run requires an OAuth App to be registered
 *     and `AGRUNE_OAUTH_CLIENT_ID` set (documented in SUMMARY user-setup).
 */
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { AgruneManifest } from '@agrune/manifest'
import {
  contentHash,
  RegistryError,
  RegistryEntrySchema,
  type RegistryEntry,
} from '../index.js'
import { errorExit, makeColor, parseArgs } from './shared.js'

// Octokit types — imported via `type` to avoid loading the libraries at
// module-init time when DI-mocked in tests.
type Octokit = import('@octokit/rest').Octokit

export const PLACEHOLDER_CLIENT_ID = 'AGRUNE_DEVICE_FLOW_CLIENT_ID'

export interface SubmitCliDependencies {
  /** Factory for Octokit given a token. Defaults to `new Octokit({ auth })`. */
  createOctokit?: (token: string) => Octokit
  /**
   * Performs the OAuth device flow and returns a token. Defaults to
   * `@octokit/auth-oauth-device` — the returned token lives only in the
   * local variable scope (never persisted).
   */
  deviceFlow?: (
    clientId: string,
    onVerification: (v: { verification_uri: string; user_code: string }) => void,
  ) => Promise<string>
  /** For tests: override fs read of the manifest file. */
  readManifestFile?: (path: string) => Promise<RegistryEntry>
}

interface PreparedSubmission {
  registryEntry: RegistryEntry
  prBranch: string
  manifestPath: string
  prTitle: string
  prBody: string
}

/**
 * Run `agrune maps submit`. Returns a process exit code — never throws.
 */
export async function runSubmitCli(
  argv: string[],
  deps: SubmitCliDependencies = {},
): Promise<number> {
  const color = makeColor()
  let parsed
  try {
    parsed = parseArgs(argv, {
      flag: ['dry-run'],
      option: ['base-branch', 'registry-repo'],
    })
  } catch (err) {
    return errorExit(err)
  }

  const [filePath] = parsed.positional
  if (!filePath) {
    process.stderr.write('Usage: agrune maps submit <file>\n')
    return 1
  }

  // 1. Load manifest file → RegistryEntry
  let registryEntry: RegistryEntry
  try {
    if (deps.readManifestFile) {
      registryEntry = await deps.readManifestFile(filePath)
    } else {
      registryEntry = await loadRegistryEntryFromFile(filePath)
    }
  } catch (err) {
    return errorExit(err)
  }

  // Defense-in-depth: re-validate after the file loader hands us an entry.
  const schema = RegistryEntrySchema.safeParse(registryEntry)
  if (!schema.success) {
    return errorExit(
      new RegistryError(
        'REGISTRY_SCHEMA_INVALID',
        `manifest file did not match RegistryEntrySchema: ${schema.error.message}`,
      ),
    )
  }
  registryEntry = schema.data

  const prepared: PreparedSubmission = {
    registryEntry,
    prBranch: `submit/${registryEntry.registry.host}-${registryEntry.registry.version}`,
    manifestPath: `manifests/${registryEntry.registry.host}@${registryEntry.registry.version}.json`,
    prTitle: `Add ${registryEntry.registry.host}@${registryEntry.registry.version}`,
    prBody: renderPrBody(registryEntry),
  }

  // 2. Authenticate
  let octokit: Octokit
  try {
    octokit = await authenticate(color, deps)
  } catch (err) {
    return errorExit(err)
  }

  if (parsed.flags['dry-run']) {
    process.stdout.write(
      color.green('✓') +
        ` dry-run complete — would open PR "${prepared.prTitle}" on branch ${prepared.prBranch}\n` +
        color.dim(`  contentHash: ${contentHash(registryEntry.manifest as unknown as AgruneManifest)}\n`),
    )
    return 0
  }

  // 3. Perform fork / commit / PR
  try {
    const registryRepo = parsed.options['registry-repo'] ?? 'agrune/maps'
    const [owner, repo] = registryRepo.split('/')
    if (!owner || !repo) {
      return errorExit(
        new RegistryError(
          'REGISTRY_FETCH_FAILED',
          `--registry-repo must be '<owner>/<name>' (got '${registryRepo}')`,
        ),
      )
    }
    const base = parsed.options['base-branch'] ?? 'main'
    const prUrl = await createSubmissionPr(octokit, {
      owner,
      repo,
      base,
      prepared,
    })
    process.stdout.write(color.green('✓') + ` PR created: ${prUrl}\n`)
    return 0
  } catch (err) {
    return errorExit(err)
  }
}

async function authenticate(
  color: ReturnType<typeof makeColor>,
  deps: SubmitCliDependencies,
): Promise<Octokit> {
  const envToken = process.env.AGRUNE_GITHUB_TOKEN
  if (envToken && envToken.length > 0) {
    if (deps.createOctokit) return deps.createOctokit(envToken)
    const { Octokit: OctokitCtor } = await import('@octokit/rest')
    return new OctokitCtor({ auth: envToken })
  }

  const clientId = process.env.AGRUNE_OAUTH_CLIENT_ID ?? PLACEHOLDER_CLIENT_ID
  if (clientId === PLACEHOLDER_CLIENT_ID) {
    process.stderr.write(
      color.yellow(
        `⚠ using placeholder OAuth client_id — register an OAuth App and set AGRUNE_OAUTH_CLIENT_ID for real submissions\n`,
      ),
    )
  }

  const deviceFlow =
    deps.deviceFlow ??
    (async (cid: string, onV: (v: { verification_uri: string; user_code: string }) => void) => {
      const { createOAuthDeviceAuth } = await import('@octokit/auth-oauth-device')
      const auth = createOAuthDeviceAuth({
        clientType: 'oauth-app',
        clientId: cid,
        scopes: ['public_repo'],
        onVerification: onV,
      })
      const result = (await auth({ type: 'oauth' })) as { token: string }
      return result.token
    })

  const token = await deviceFlow(clientId, (v) => {
    process.stdout.write(
      `Open ${v.verification_uri} and enter code: ${color.bold(v.user_code)}\n`,
    )
  })

  // Pitfall 2 / T-18-14: token is scoped to this variable only.
  // NO fs write of the token occurs here or anywhere else in this module.
  if (deps.createOctokit) return deps.createOctokit(token)
  const { Octokit: OctokitCtor } = await import('@octokit/rest')
  return new OctokitCtor({ auth: token })
}

interface CreatePrArgs {
  owner: string
  repo: string
  base: string
  prepared: PreparedSubmission
}

/**
 * Execute the 4-step submission flow:
 *   1. getAuthenticated → user.login
 *   2. fork (idempotent — swallow "already forked" responses)
 *   3. createOrUpdateFileContents on fork/branch
 *   4. create pull request against upstream
 */
async function createSubmissionPr(
  octokit: Octokit,
  args: CreatePrArgs,
): Promise<string> {
  const { owner, repo, base, prepared } = args

  let userLogin: string
  try {
    const { data: user } = await octokit.users.getAuthenticated()
    userLogin = user.login
  } catch (err) {
    throw new RegistryError(
      'REGISTRY_FETCH_FAILED',
      `failed to fetch authenticated GitHub user`,
      { cause: err },
    )
  }

  // Probe whether the manifest file already exists upstream (update vs create
  // semantics — future sha field support). A 404 is the "new submission"
  // happy path; we swallow it.
  try {
    await octokit.repos.getContent({ owner, repo, path: prepared.manifestPath })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status !== 404) {
      // Non-404 errors are still informational — we proceed to fork/create
      // regardless, since a fork owner may not have read access upstream.
    }
  }

  // Idempotent fork. GitHub returns 202 Accepted on first fork; subsequent
  // calls are no-ops. Either way, the fork exists at `<userLogin>/<repo>`.
  try {
    await octokit.repos.createFork({ owner, repo })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status !== 202 && status !== 200) {
      throw new RegistryError(
        'REGISTRY_FETCH_FAILED',
        `failed to fork ${owner}/${repo}`,
        { cause: err },
      )
    }
  }

  const fileContent = JSON.stringify(prepared.registryEntry, null, 2) + '\n'
  const base64Content = Buffer.from(fileContent, 'utf8').toString('base64')

  try {
    await octokit.repos.createOrUpdateFileContents({
      owner: userLogin,
      repo,
      path: prepared.manifestPath,
      message: prepared.prTitle,
      content: base64Content,
      branch: prepared.prBranch,
    })
  } catch (err) {
    throw new RegistryError(
      'REGISTRY_FETCH_FAILED',
      `failed to write ${prepared.manifestPath} on fork ${userLogin}/${repo}`,
      { cause: err },
    )
  }

  try {
    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: prepared.prTitle,
      head: `${userLogin}:${prepared.prBranch}`,
      base,
      body: prepared.prBody,
    })
    return pr.html_url
  } catch (err) {
    throw new RegistryError(
      'REGISTRY_FETCH_FAILED',
      `failed to open PR against ${owner}/${repo}`,
      { cause: err },
    )
  }
}

/** Load a `.json` file containing a serialized RegistryEntry. */
async function loadRegistryEntryFromFile(path: string): Promise<RegistryEntry> {
  const ext = extname(path).toLowerCase()
  if (ext !== '.json') {
    throw new RegistryError(
      'REGISTRY_SCHEMA_INVALID',
      `unsupported file type '${ext}' — v0.5 submit accepts .json only (TS manifests supported in v0.6+)`,
    )
  }
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err) {
    throw new RegistryError('REGISTRY_FETCH_FAILED', `cannot read ${path}`, { cause: err })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new RegistryError('REGISTRY_SCHEMA_INVALID', `${path} is not valid JSON`, {
      cause: err,
    })
  }
  const result = RegistryEntrySchema.safeParse(parsed)
  if (!result.success) {
    throw new RegistryError(
      'REGISTRY_SCHEMA_INVALID',
      `${path} does not match RegistryEntrySchema: ${result.error.message}`,
    )
  }
  return result.data
}

function renderPrBody(entry: RegistryEntry): string {
  return [
    `## ${entry.registry.host}@${entry.registry.version}`,
    ``,
    `- tier: ${entry.registry.tier}`,
    `- author: ${entry.registry.author}`,
    `- submittedAt: ${entry.registry.submittedAt}`,
    `- allowedEnvironments: ${entry.registry.allowedEnvironments.join(', ')}`,
    ``,
    `Submitted via \`agrune maps submit\`.`,
    ``,
    `<!-- PR bot will attach velocity / schema / sensitive-diff labels on open. -->`,
    ``,
  ].join('\n')
}
