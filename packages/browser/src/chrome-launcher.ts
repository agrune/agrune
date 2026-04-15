import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface LaunchOptions {
  chromePath?: string
  headless?: boolean
  userDataDir?: string
  args?: string[]
  startUrl?: string
}

export interface LaunchResult {
  wsEndpoint: string
  process: ChildProcess
  userDataDir: string
}

export class ChromeLauncher {
  private child: ChildProcess | null = null
  private userDataDir: string | null = null
  private createdUserDataDir = false

  static findChromePath(): string | null {
    const envPath = process.env.AGRUNE_CHROME_PATH
    if (envPath && existsSync(envPath)) {
      return envPath
    }

    const candidates =
      process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : process.platform === 'win32'
          ? [
              'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
              'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            ]
          : [
              '/usr/bin/google-chrome',
              '/usr/bin/google-chrome-stable',
              '/usr/bin/chromium',
              '/usr/bin/chromium-browser',
            ]

    return candidates.find(candidate => existsSync(candidate)) ?? null
  }

  async launch(options: LaunchOptions = {}): Promise<LaunchResult> {
    if (this.child) {
      throw new Error('ChromeLauncher already has a running Chrome process.')
    }

    const chromePath = options.chromePath ?? ChromeLauncher.findChromePath()
    if (!chromePath) {
      throw new Error('Could not find Chrome. Set AGRUNE_CHROME_PATH to override the executable path.')
    }

    const userDataDir =
      options.userDataDir ?? await mkdtemp(join(tmpdir(), 'agrune-quick-'))
    this.userDataDir = userDataDir
    this.createdUserDataDir = options.userDataDir == null

    const args = [
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(options.headless ? ['--headless=new'] : []),
      ...(options.args ?? []),
      options.startUrl ?? 'about:blank',
    ]

    const child = spawn(chromePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child

    try {
      const wsEndpoint = await this.waitForWsEndpoint(child)
      return { wsEndpoint, process: child, userDataDir }
    } catch (error) {
      await this.kill()
      throw error
    }
  }

  async kill(): Promise<void> {
    const child = this.child
    this.child = null

    if (child) {
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.killed) {
          resolve()
          return
        }

        child.once('exit', () => resolve())
        child.kill('SIGTERM')
        setTimeout(() => {
          if (child.exitCode === null && !child.killed) {
            child.kill('SIGKILL')
          }
        }, 2_000)
      })
    }

    const userDataDir = this.userDataDir
    const shouldRemove = this.createdUserDataDir
    this.userDataDir = null
    this.createdUserDataDir = false

    if (userDataDir && shouldRemove) {
      await rm(userDataDir, { recursive: true, force: true })
    }
  }

  private async waitForWsEndpoint(child: ChildProcess): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let stderr = ''
      let stdout = ''
      let settled = false

      const cleanup = () => {
        child.stdout?.off('data', handleStdout)
        child.stderr?.off('data', handleStderr)
        child.off('exit', handleExit)
        child.off('error', handleError)
      }

      const maybeResolve = (chunk: string) => {
        const match = chunk.match(/DevTools listening on (ws:\/\/[^\s]+)/)
        if (!match || settled) return
        settled = true
        cleanup()
        resolve(match[1])
      }

      const handleStdout = (chunk: Buffer | string) => {
        stdout += chunk.toString()
        maybeResolve(stdout)
      }

      const handleStderr = (chunk: Buffer | string) => {
        stderr += chunk.toString()
        maybeResolve(stderr)
      }

      const handleExit = (code: number | null) => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(`Chrome exited before exposing a DevTools endpoint (code: ${code ?? 'unknown'}).`))
      }

      const handleError = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }

      child.stdout?.on('data', handleStdout)
      child.stderr?.on('data', handleStderr)
      child.once('exit', handleExit)
      child.once('error', handleError)
    })
  }
}
