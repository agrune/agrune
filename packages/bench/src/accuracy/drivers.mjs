// Unified model decision driver for the multi-step bench. Three backends, ONE
// interface, all hitting BARE model endpoints (no agent-wrapper overhead) so the
// per-call token usage is clean and comparable:
//
//   gpt-oss      → ollama  /api/chat            (local 20B)
//   haiku        → claude-code-proxy /v1/messages → real claude-haiku-4-5
//   codex-spark  → claude-code-proxy /v1/messages → real gpt-5.3-codex-spark
//
// The proxy speaks the Anthropic Messages API and routes per-model to its codex
// provider. Auth is the Claude Code OAuth token (keychain) sent as a Bearer with
// the oauth beta header — the same credential the `claude` CLI uses, but here we
// call the model DIRECTLY, bypassing the CLI's ~26k-token system-prompt scaffold
// and its haiku→gpt-5.5-fast remap.
//
// decide(system, user) → { text, thinking, usage:{ input, output, reasoning } }
// Action parsing lives in the orchestrator (protocol is model-agnostic).

import { execFileSync, spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { countTokens } from '../tokens.mjs'

const THINK = process.env.THINK || 'low'

export const MODELS = {
  'gpt-oss': { transport: 'ollama', model: process.env.OLLAMA_MODEL || 'gpt-oss:20b' },
  'haiku': { transport: 'proxy', model: 'claude-haiku-4-5' },
  'codex-spark': { transport: 'proxy', model: 'gpt-5.3-codex-spark' },
  // codex-provider gpt-5.5 runs with minimal reasoning overhead (~tens of output
  // tokens per decision, no reasoning dump) — effectively the "gpt-5.5 low" tier.
  'gpt-5.5': { transport: 'proxy', model: 'gpt-5.5' },
  // Local Codex CLI (gpt-5.5) via `codex exec --json` — no proxy needed. Codex's
  // own ~17k agent scaffold is NOT counted: usage.input is countTokens() of the
  // content WE send, so the numbers stay comparable to the other transports.
  'codex': { transport: 'codex-cli', model: process.env.CODEX_MODEL || 'gpt-5.5' },
}

const CODEX_EFFORT = process.env.CODEX_EFFORT || 'low'

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'

let _proxy = null
function proxyAuth() {
  if (_proxy) return _proxy
  const base = process.env.ANTHROPIC_BASE_URL
  if (!base) throw new Error('ANTHROPIC_BASE_URL not set (claude-code-proxy)')
  let key = process.env.AGRUNE_PROXY_KEY || ''
  if (!key) {
    try {
      const raw = execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { encoding: 'utf8' })
      key = JSON.parse(raw)?.claudeAiOauth?.accessToken || ''
    } catch { /* fall through */ }
  }
  if (!key) throw new Error('no proxy auth token (keychain "Claude Code-credentials" / AGRUNE_PROXY_KEY)')
  _proxy = { base, key }
  return _proxy
}

async function ollamaChat(system, messages) {
  const body = {
    model: MODELS['gpt-oss'].model,
    messages: [{ role: 'system', content: system }, ...messages],
    stream: false,
    think: THINK === 'false' ? false : THINK,
    options: { temperature: 0, num_predict: 1500, seed: 7 },
  }
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(240000),
  })
  if (!res.ok) throw new Error(`ollama HTTP ${res.status}`)
  const j = await res.json()
  const thinking = j.message?.thinking ?? ''
  return {
    text: j.message?.content ?? '',
    thinking,
    usage: {
      input: j.prompt_eval_count ?? 0,
      output: j.eval_count ?? 0,            // includes thinking + visible for gpt-oss
      reasoning: thinking ? countTokens(thinking) : 0,
    },
  }
}

async function proxyChat(modelKey, system, messages) {
  const { base, key } = proxyAuth()
  const body = {
    model: MODELS[modelKey].model,
    max_tokens: 2048,
    system,                                 // codex provider requires non-empty instructions
    messages,                               // full conversation (stateful) — see decide()
    temperature: 0,
  }
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  })
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  if (j.type === 'error') throw new Error(`proxy error: ${JSON.stringify(j.error).slice(0, 200)}`)
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  const u = j.usage || {}
  return {
    text,
    thinking: '',                            // reasoning (codex) is folded into output_tokens; not separable here
    usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, reasoning: null },
  }
}

// Flatten the (system + stateful conversation) into ONE prompt for `codex exec`,
// which takes a single prompt (read from stdin), not a messages array.
function flattenConvo(system, messages) {
  const parts = [system, '']
  for (const m of messages) {
    parts.push(m.role === 'user' ? '=== INPUT ===' : '=== YOUR PRIOR REPLY ===', m.content, '')
  }
  parts.push('=== RESPOND NOW ===', 'Output ONLY the single JSON object specified above. Do NOT run any tools or commands, do NOT explain — JSON only.')
  return parts.join('\n')
}

// Drive the local Codex CLI (gpt-5.5) headlessly. We pipe the prompt to
// `codex exec --json` and parse the final agent_message from the JSONL stream.
// Token accounting uses countTokens() over the content WE send/receive — codex's
// own ~17k system scaffold is excluded so it compares fairly to proxy/ollama.
function codexCliChat(system, messages) {
  return new Promise((resolve) => {
    const prompt = flattenConvo(system, messages)
    const inTok = countTokens(prompt)
    if (process.env.DUMP_PROMPT) { try { writeFileSync(process.env.DUMP_PROMPT + '.' + (globalThis.__dumpN = (globalThis.__dumpN || 0) + 1), prompt) } catch {} }
    const args = [
      'exec', '--skip-git-repo-check', '-s', 'read-only', '--ephemeral', '--json',
      '-C', '/tmp', '-m', MODELS['codex'].model, '-c', `model_reasoning_effort="${CODEX_EFFORT}"`,
      // Pin a valid service_tier so the bench is robust to whatever ~/.codex/config.toml
      // happens to hold (a stale/invalid value there — e.g. "priority", unknown to this
      // CLI version — otherwise fails EVERY exec with a config parse error). Override
      // only; we never touch the user's personal config. fast is the API-accepted tier.
      '-c', `service_tier="${process.env.CODEX_SERVICE_TIER || 'fast'}"`,
      // Surface codex's reasoning SUMMARY as item.completed:reasoning events so we
      // can inspect WHAT the model was thinking each turn (gpt-5.5's raw CoT stays
      // hidden; this is the model-authored summary). Off by config default.
      '-c', 'model_reasoning_summary="detailed"',
    ]
    const child = spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = ''
    const killer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, Number(process.env.CODEX_TIMEOUT_MS || 300000))
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', (e) => { clearTimeout(killer); resolve({ text: '', thinking: '', usage: { input: inTok, output: 0, reasoning: 0 }, error: 'codex_spawn:' + String(e).slice(0, 120) }) })
    child.on('close', () => {
      clearTimeout(killer)
      let text = '', reasoningText = '', reasoning = 0, codexIn = 0, codexOut = 0
      for (const line of out.split('\n')) {
        const s = line.trim(); if (!s.startsWith('{')) continue
        let ev; try { ev = JSON.parse(s) } catch { continue }
        if (ev.type === 'item.completed' && ev.item?.type === 'agent_message') text = ev.item.text || text
        if (ev.type === 'item.completed' && ev.item?.type === 'reasoning' && ev.item.text) reasoningText += (reasoningText ? '\n\n' : '') + ev.item.text
        if (ev.type === 'turn.completed' && ev.usage) { reasoning = ev.usage.reasoning_output_tokens || 0; codexIn = ev.usage.input_tokens || 0; codexOut = ev.usage.output_tokens || 0 }
      }
      // Per-call reasoning dump (DUMP_REASON.<n>): the model's summary + the JSON it
      // ultimately emitted, so a turn's thought and action sit side by side.
      if (process.env.DUMP_REASON) { try { writeFileSync(process.env.DUMP_REASON + '.' + (globalThis.__rdumpN = (globalThis.__rdumpN || 0) + 1), `=== REASONING (summary) ===\n${reasoningText || '(none emitted)'}\n\n=== ANSWER ===\n${text}`) } catch {} }
      if (!text) { resolve({ text: '', thinking: reasoningText, usage: { input: inTok, output: 0, reasoning: 0 }, error: 'codex_no_message:' + (err || out).slice(0, 140) }); return }
      resolve({ text, thinking: reasoningText, usage: { input: inTok, output: countTokens(text), reasoning, codexInput: codexIn, codexOutput: codexOut } })
    })
    child.stdin.write(prompt); child.stdin.end()
  })
}

export function makeDriver(modelKey) {
  const cfg = MODELS[modelKey]
  if (!cfg) throw new Error(`unknown model ${modelKey}`)
  // `input` is EITHER a plain string (legacy, wrapped as one user turn) OR a full
  // [{role,content}] conversation array (stateful single-goal session). The whole
  // array is resent each turn — that growing context IS the realistic session cost.
  return async function decide(system, input) {
    const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return cfg.transport === 'ollama'
          ? await ollamaChat(system, messages)
          : cfg.transport === 'codex-cli'
          ? await codexCliChat(system, messages)
          : await proxyChat(modelKey, system, messages)
      } catch (e) {
        if (attempt === 2) return { text: '', thinking: '', usage: { input: 0, output: 0, reasoning: 0 }, error: String(e).slice(0, 200) }
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
      }
    }
    return { text: '', thinking: '', usage: { input: 0, output: 0, reasoning: 0 } }
  }
}
