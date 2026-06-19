// Thin wrapper over the REAL @playwright/cli binary (via the Codex skill's
// wrapper script), driving a persistent headless session. This is the genuine
// "Playwright CLI" baseline: snapshot → eN refs → act by ref → re-snapshot when
// refs go stale. Each command is a subprocess that talks to the background
// browser session, so page state persists across calls.

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const SCRIPT = process.env.PWCLI_SCRIPT ||
  resolve(homedir(), '.codex/skills/playwright/scripts/playwright_cli.sh')

export class PwCli {
  constructor(session) {
    this.session = session
    this.env = { ...process.env, PLAYWRIGHT_CLI_HEADED: '0' }
  }

  _run(args, timeout = 60000) {
    try {
      return execFileSync(SCRIPT, ['--session', this.session, ...args], {
        env: this.env, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024,
      })
    } catch (e) {
      const out = (e.stdout || '') + (e.stderr || '')
      const err = new Error(`pwcli ${args[0]} failed: ${String(e.message || e).slice(0, 120)}`)
      err.output = out
      throw err
    }
  }

  open(url) { return this._run(['open', url], 90000) }
  resize(w, h) { try { return this._run(['resize', String(w), String(h)], 30000) } catch { /* best effort */ } }
  reload() { return this._run(['reload'], 60000) }
  close() { try { this._run(['close'], 30000) } catch { /* ignore */ } }

  // Returns the raw snapshot text (### Page … ```yaml …```), refs included.
  snapshot() { return this._run(['snapshot'], 60000) }

  // Map our model-agnostic verb to a playwright-cli command.
  act(verb, ref, value) {
    switch (verb) {
      case 'click': case 'select': return this._run(['click', ref])
      case 'dblclick': return this._run(['dblclick', ref])
      case 'hover': return this._run(['hover', ref])
      case 'fill': return this._run(['fill', ref, String(value ?? '')])
      case 'type': return this._run(['type', String(value ?? '')])
      case 'press': return this._run(['press', String(value || 'Enter')])
      default: throw new Error('unsupported verb ' + verb)
    }
  }

  // eval and return the parsed JS value. pwcli prints the result between a
  // "### Result" header and the "### Ran Playwright code" block (objects are
  // pretty-printed JSON; strings are JSON-encoded).
  evalValue(expr) {
    const out = this._run(['eval', expr], 30000)
    let body = out
    const ri = body.indexOf('### Result')
    if (ri >= 0) body = body.slice(ri + '### Result'.length)
    body = body.split('### Ran')[0].trim()
    if (!body || body === 'undefined') return undefined
    let v
    try { v = JSON.parse(body) } catch { return body }
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
    return v
  }

  // Fresh seed: open the page, clear storage, re-open so React re-seeds from an
  // empty store, then poll until the board renders. open() (fresh navigation) is
  // more robust than reload() across a persistent session.
  async reset(url) {
    try { this.open(url) } catch { /* retry below */ }
    // Match the agrune side's 1280x1200 viewport so the tall task-detail dialog's
    // footer (Save) is on-screen for the cli baseline too — fairness parity.
    this.resize(1280, 1200)
    try { this.evalValue('localStorage.clear()') } catch { /* no page yet */ }
    try { this.open(url) } catch { try { this.open(url) } catch { /* poll anyway */ } }
    this.resize(1280, 1200)
    for (let i = 0; i < 14; i++) {
      let snap = ''
      try { snap = this.snapshot() } catch { /* retry */ }
      if (/Kanban Board/i.test(snap) || /tab "Board"/i.test(snap)) return
      await new Promise(r => setTimeout(r, 500))
    }
    throw new Error('pwcli reset: board did not render')
  }

  // Ground truth read from localStorage (same shape as the agrune side).
  readState() {
    return this.evalValue(
      "({" +
      "tasks: JSON.parse(localStorage.getItem('pm-tasks')||'[]')," +
      "members: JSON.parse(localStorage.getItem('pm-members')||'[]')," +
      "messages: JSON.parse(localStorage.getItem('pm-messages')||'{}')" +
      "})",
    ) || { tasks: [], members: [], messages: {} }
  }
}
