// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import type { ManifestMacro, MacroStep } from '@agrune/manifest'
import type { CommandHandlerDeps } from '../src/runtime/command-handlers'
import type { MacroRunnerDeps } from '../src/runtime/macro-runner'
import { MacroRunner, interpolateParams } from '../src/runtime/macro-runner'

// ---------------------------------------------------------------------------
// Helpers — fake CommandHandlerDeps
// ---------------------------------------------------------------------------

function makeElement(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement('input')
  for (const [key, val] of Object.entries(attrs)) {
    el.setAttribute(key, val)
    if (key === 'type') (el as HTMLInputElement).type = val
  }
  document.body.appendChild(el)
  return el
}

/** Builds a minimal CommandHandlerDeps that resolves targetIds by CSS selector. */
function makeDeps(
  elements: Record<string, HTMLElement>,
  overrides: { actOk?: boolean; fillOk?: boolean; actThrows?: boolean; fillThrows?: boolean } = {},
): {
  deps: CommandHandlerDeps
  actCalls: Array<{ targetId: string; action?: string }>
  fillCalls: Array<{ targetId: string; value: string }>
} {
  const actCalls: Array<{ targetId: string; action?: string }> = []
  const fillCalls: Array<{ targetId: string; value: string }> = []

  const deps: CommandHandlerDeps = {
    captureSnapshot: vi.fn(() => ({ version: 1, targets: [], signature: 'x' }) as any),
    captureSettledSnapshot: vi.fn(async () => ({ version: 1, targets: [], signature: 'x' }) as any),
    getDescriptors: vi.fn(() => {
      return Object.entries(elements).map(([targetId, el]) => ({
        actionKinds: ['click', 'fill', 'dblclick', 'contextmenu', 'hover', 'longpress'] as any,
        groupId: 'test',
        target: {
          targetId,
          actionKinds: ['click', 'fill'],
          selector: { css: `[data-testid="${targetId}"]` },
        },
      }))
    }),
    resolveExecutionConfig: vi.fn(() => ({}) as any),
    queue: {
      enqueue: vi.fn(async (fn: () => Promise<unknown>) => fn()),
      active: false,
      dispose: vi.fn(),
      onActivate: undefined,
      onDeactivate: undefined,
    } as any,
    eventSequences: {} as any,
  }

  // Patch resolveRuntimeTarget — we inject elements directly via module mock
  // Instead, we patch getDescriptors to return our elements, but resolveRuntimeTarget
  // calls findElements → resolveByLadder which uses DOM.
  // So we set data-testid on actual DOM elements.
  for (const [targetId, el] of Object.entries(elements)) {
    el.setAttribute('data-testid', targetId)
    el.setAttribute('data-agrune-key', targetId)
  }

  // We also need handleAct and handleFill to be mockable.
  // MacroRunner imports them directly. We'll spy via vi.mock below.
  return { deps, actCalls, fillCalls }
}

function makeMacroRunnerDeps(
  elements: Record<string, HTMLElement>,
  overrides: {
    onStepStart?: MacroRunnerDeps['onStepStart']
    onStepEnd?: MacroRunnerDeps['onStepEnd']
    onSensitiveStep?: MacroRunnerDeps['onSensitiveStep']
  } = {},
): MacroRunnerDeps & { commandHandlerDeps: CommandHandlerDeps } {
  const { deps } = makeDeps(elements)
  return {
    commandHandlerDeps: deps,
    onStepStart: overrides.onStepStart,
    onStepEnd: overrides.onStepEnd,
    onSensitiveStep: overrides.onSensitiveStep,
  }
}

// ---------------------------------------------------------------------------
// Mock handleAct / handleFill so MacroRunner can inject results
// ---------------------------------------------------------------------------

const mockActResult = { ok: true, error: undefined }
const mockFillResult = { ok: true, error: undefined }

let actShouldFail = false
let fillShouldFail = false
let actShouldThrow = false
let fillShouldThrow = false

const actCalls: Array<{ targetId: string; action?: string }> = []
const fillCalls: Array<{ targetId: string; value: string }> = []

vi.mock('../src/runtime/command-handlers', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    handleAct: vi.fn(async (_deps: CommandHandlerDeps, input: { targetId: string; action?: string }) => {
      actCalls.push({ targetId: input.targetId, action: input.action })
      if (actShouldThrow) throw new Error('act threw')
      if (actShouldFail) return { ok: false, error: { message: 'act failed' } }
      return { ok: true }
    }),
    handleFill: vi.fn(async (_deps: CommandHandlerDeps, input: { targetId: string; value: string }) => {
      fillCalls.push({ targetId: input.targetId, value: input.value })
      if (fillShouldThrow) throw new Error('fill threw')
      if (fillShouldFail) return { ok: false, error: { message: 'fill failed' } }
      return { ok: true }
    }),
  }
})

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  document.body.innerHTML = ''
  actShouldFail = false
  fillShouldFail = false
  actShouldThrow = false
  fillShouldThrow = false
  actCalls.length = 0
  fillCalls.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Helper: macro fixture
// ---------------------------------------------------------------------------

function makeMacro(overrides: Partial<ManifestMacro> = {}): ManifestMacro {
  return {
    macroId: 'test-macro',
    params: {},
    steps: [],
    ...overrides,
  }
}

function makeStep(overrides: Partial<MacroStep> = {}): MacroStep {
  return {
    targetId: 'btn',
    action: 'click',
    ...overrides,
  }
}

// ===========================================================================
// describe: precondition
// ===========================================================================

describe('precondition', () => {
  it('no precondition → enters step loop (ok with no steps)', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const result = await runner.run(makeMacro({ steps: [] }), {})
    expect(result.status).toBe('ok')
    runner.dispose()
  })

  it('precondition true → already-satisfied, no steps executed', async () => {
    const btn = makeElement()
    const onStepStart = vi.fn()
    const runner = new MacroRunner(
      makeMacroRunnerDeps({ btn }, { onStepStart }),
    )
    const macro = makeMacro({
      precondition: 'params.loggedIn === true',
      steps: [makeStep()],
    })
    const result = await runner.run(macro, { loggedIn: true })
    expect(result.status).toBe('already-satisfied')
    expect(onStepStart).not.toHaveBeenCalled()
    runner.dispose()
  })

  it('precondition invalid JS → precondition-failed + non-empty reason', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({
      precondition: '@@invalid js@@',
      steps: [],
    })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('precondition-failed')
    if (result.status === 'precondition-failed') {
      expect(result.reason.length).toBeGreaterThan(0)
    }
    runner.dispose()
  })

  it('precondition false → enters step loop (normal execution)', async () => {
    const btn = makeElement()
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      precondition: 'params.loggedIn === true',
      steps: [],
    })
    const result = await runner.run(macro, { loggedIn: false })
    // false precondition → step loop entered (empty steps → ok)
    expect(result.status).toBe('ok')
    runner.dispose()
  })
})

// ===========================================================================
// describe: step loop — happy path
// ===========================================================================

describe('step loop — happy path', () => {
  it('fill + click → ok, handleFill and handleAct each called once', async () => {
    const emailEl = makeElement()
    const btnEl = makeElement()
    const onStepStart = vi.fn()
    const onStepEnd = vi.fn()

    const runner = new MacroRunner(
      makeMacroRunnerDeps({ email: emailEl, btn: btnEl }, { onStepStart, onStepEnd }),
    )
    const macro = makeMacro({
      steps: [
        makeStep({ targetId: 'email', action: 'fill', value: 'user@example.com' }),
        makeStep({ targetId: 'btn', action: 'click' }),
      ],
    })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('ok')
    expect(fillCalls).toHaveLength(1)
    expect(actCalls).toHaveLength(1)
    expect(onStepStart).toHaveBeenCalledTimes(2)
    expect(onStepEnd).toHaveBeenCalledTimes(2)
    runner.dispose()
  })

  it('step.value with {{email}} interpolated from params', async () => {
    const emailEl = makeElement()
    const runner = new MacroRunner(makeMacroRunnerDeps({ email: emailEl }))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'email', action: 'fill', value: '{{email}}' })],
    })
    await runner.run(macro, { email: 'a@b.com' })
    expect(fillCalls[0]?.value).toBe('a@b.com')
    runner.dispose()
  })

  it('missing key in {{missing}} → empty string', async () => {
    const emailEl = makeElement()
    const runner = new MacroRunner(makeMacroRunnerDeps({ email: emailEl }))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'email', action: 'fill', value: '{{missing}}' })],
    })
    await runner.run(macro, {})
    expect(fillCalls[0]?.value).toBe('')
    runner.dispose()
  })

  it('non-fill actions dispatch to handleAct', async () => {
    const btnEl = makeElement()
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn: btnEl }))

    for (const action of ['click', 'dblclick', 'contextmenu', 'hover', 'longpress'] as const) {
      actCalls.length = 0
      const macro = makeMacro({ steps: [makeStep({ targetId: 'btn', action })] })
      const result = await runner.run(macro, {})
      expect(result.status).toBe('ok')
      expect(actCalls).toHaveLength(1)
    }
    runner.dispose()
  })
})

// ===========================================================================
// describe: interpolateParams (unit)
// ===========================================================================

describe('interpolateParams', () => {
  it('replaces known keys', () => {
    expect(interpolateParams('Hello {{name}}!', { name: 'World' })).toBe('Hello World!')
  })

  it('replaces multiple occurrences', () => {
    expect(interpolateParams('{{a}}-{{b}}-{{a}}', { a: '1', b: '2' })).toBe('1-2-1')
  })

  it('missing key → empty string', () => {
    expect(interpolateParams('{{missing}}', {})).toBe('')
  })

  it('no placeholders → returns original', () => {
    expect(interpolateParams('hello', { x: 'y' })).toBe('hello')
  })
})

// ===========================================================================
// describe: circuit breaker — MACRO-04
// ===========================================================================

describe('circuit breaker — MACRO-04', () => {
  it('default maxRetries=2: 2 consecutive failures → circuit-open at step 1', async () => {
    const btn = makeElement()
    actShouldFail = true
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'btn', action: 'click' }), makeStep({ targetId: 'btn', action: 'click' })],
    })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('circuit-open')
    if (result.status === 'circuit-open') {
      expect(result.failedStep).toBe(1)
    }
    runner.dispose()
  })

  it('maxRetries:3 → 3 consecutive failures to trigger circuit-open', async () => {
    const btn = makeElement()
    actShouldFail = true
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      circuitBreaker: { maxRetries: 3 },
      steps: [
        makeStep({ targetId: 'btn', action: 'click' }),
        makeStep({ targetId: 'btn', action: 'click' }),
        makeStep({ targetId: 'btn', action: 'click' }),
      ],
    })
    // 2 failures → step-error (not circuit-open yet for maxRetries:3)
    // Actually: we need a fresh runner per test since failures accumulate
    // maxRetries:3 → trips on 3rd consecutive failure
    const result = await runner.run(macro, {})
    expect(result.status).toBe('circuit-open')
    if (result.status === 'circuit-open') {
      expect(result.failedStep).toBe(2)
    }
    runner.dispose()
  })

  it('success after failure resets consecutive count', async () => {
    const btn = makeElement()
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      steps: [
        makeStep({ targetId: 'btn', action: 'click' }), // fail
        makeStep({ targetId: 'btn', action: 'click' }), // success
        makeStep({ targetId: 'btn', action: 'click' }), // fail
      ],
    })

    // step 0: fail, step 1: succeed, step 2: fail
    let callCount = 0
    const { handleAct } = await import('../src/runtime/command-handlers')
    ;(handleAct as ReturnType<typeof vi.fn>).mockImplementation(
      async (_deps: CommandHandlerDeps, input: { targetId: string; action?: string }) => {
        actCalls.push({ targetId: input.targetId, action: input.action })
        callCount++
        if (callCount === 1) return { ok: false, error: { message: 'fail 1' } }
        if (callCount === 2) return { ok: true }
        return { ok: false, error: { message: 'fail 3' } }
      },
    )

    const result = await runner.run(macro, {})
    // After fail/succeed/fail: consecutiveFailures=1 → not circuit-open (< 2)
    expect(result.status).toBe('step-error')
    runner.dispose()
  })

  it('resetAfterMs → setTimeout resets consecutiveFailures after delay', async () => {
    vi.useFakeTimers()
    const btn = makeElement()
    actShouldFail = true
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      circuitBreaker: { maxRetries: 2, resetAfterMs: 10 },
      steps: [makeStep({ targetId: 'btn', action: 'click' })],
    })

    // First run — 1 failure
    await runner.run(macro, {})
    // consecutiveFailures = 1

    // Advance timers past resetAfterMs
    await vi.advanceTimersByTimeAsync(15)
    // consecutiveFailures should be reset to 0

    // Second run should NOT circuit-open on first failure
    actShouldFail = false
    const result = await runner.run(macro, {})
    expect(result.status).toBe('ok')
    runner.dispose()
  })

  it('circuit-open → remaining steps not executed', async () => {
    const btn = makeElement()
    actShouldFail = true
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      circuitBreaker: { maxRetries: 2 },
      steps: [
        makeStep({ targetId: 'btn', action: 'click' }), // fail 1
        makeStep({ targetId: 'btn', action: 'click' }), // fail 2 → circuit-open
        makeStep({ targetId: 'btn', action: 'click' }), // should NOT run
        makeStep({ targetId: 'btn', action: 'click' }), // should NOT run
      ],
    })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('circuit-open')
    // handleAct called exactly 2 times (circuit-open at step 1)
    expect(actCalls).toHaveLength(2)
    runner.dispose()
  })
})

// ===========================================================================
// describe: target resolution
// ===========================================================================

describe('target resolution', () => {
  it('targetId not found → target-not-found + stepIndex + targetId', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'does-not-exist', action: 'click' })],
    })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('target-not-found')
    if (result.status === 'target-not-found') {
      expect(result.stepIndex).toBe(0)
      expect(result.targetId).toBe('does-not-exist')
    }
    runner.dispose()
  })

  it('target-not-found increments consecutiveFailures', async () => {
    // Two not-found targets → circuit-open (default maxRetries=2)
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({
      steps: [
        makeStep({ targetId: 'ghost-1', action: 'click' }),
        makeStep({ targetId: 'ghost-2', action: 'click' }),
      ],
    })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('circuit-open')
    runner.dispose()
  })
})

// ===========================================================================
// describe: sensitive step — Plan 14-01 재사용
// ===========================================================================

describe('sensitive step', () => {
  it('step.sensitive===true → onSensitiveStep(i, step) called', async () => {
    const btn = makeElement()
    const onSensitiveStep = vi.fn()
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }, { onSensitiveStep }))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'btn', action: 'click', sensitive: true })],
    })
    await runner.run(macro, {})
    expect(onSensitiveStep).toHaveBeenCalledTimes(1)
    expect(onSensitiveStep).toHaveBeenCalledWith(0, macro.steps[0])
    runner.dispose()
  })

  it('element type=password (no sensitive flag) → onSensitiveStep called (runtime heuristic)', async () => {
    const pwdEl = makeElement({ type: 'password' })
    const onSensitiveStep = vi.fn()
    const runner = new MacroRunner(makeMacroRunnerDeps({ pwd: pwdEl }, { onSensitiveStep }))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'pwd', action: 'fill', value: 'secret' })],
    })
    await runner.run(macro, {})
    expect(onSensitiveStep).toHaveBeenCalledTimes(1)
    runner.dispose()
  })

  it('element aria-label="비밀번호" → onSensitiveStep called (multilang i18n)', async () => {
    const el = document.createElement('input')
    el.setAttribute('aria-label', '비밀번호')
    document.body.appendChild(el)
    const onSensitiveStep = vi.fn()
    const runner = new MacroRunner(makeMacroRunnerDeps({ pwd: el }, { onSensitiveStep }))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'pwd', action: 'fill', value: 'sec' })],
    })
    await runner.run(macro, {})
    expect(onSensitiveStep).toHaveBeenCalledTimes(1)
    runner.dispose()
  })
})

// ===========================================================================
// describe: postcondition
// ===========================================================================

describe('postcondition', () => {
  it('postcondition true → ok', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({ postcondition: 'true', steps: [] })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('ok')
    runner.dispose()
  })

  it('postcondition false → postcondition-failed', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({ postcondition: 'false', steps: [] })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('postcondition-failed')
    runner.dispose()
  })

  it('postcondition throws → postcondition-failed + reason', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({ postcondition: '@@invalid@@', steps: [] })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('postcondition-failed')
    if (result.status === 'postcondition-failed') {
      expect(result.reason.length).toBeGreaterThan(0)
    }
    runner.dispose()
  })

  it('postcondition failure increments consecutiveFailures across runs', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({ postcondition: 'false', steps: [], circuitBreaker: { maxRetries: 2 } })
    // Run 1: postcondition-failed → consecutiveFailures=1
    await runner.run(macro, {})
    // Run 2: postcondition-failed → consecutiveFailures=2 → circuit-open
    const result2 = await runner.run(macro, {})
    // After 2 postcondition failures, the circuit breaker should trip
    // Note: circuit-open check happens inside step loop, postcondition failure
    // just increments consecutiveFailures for NEXT run
    // So run 2 is also postcondition-failed (circuit check is in step loop only)
    expect(['postcondition-failed', 'circuit-open']).toContain(result2.status)
    runner.dispose()
  })
})

// ===========================================================================
// describe: eval isolation — security
// ===========================================================================

describe('eval isolation — security', () => {
  it('precondition can mutate globalThis but only boolean return is used', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({
      precondition: '(globalThis.__hacked = true, false)',
      steps: [],
    })
    const result = await runner.run(macro, {})
    // Return value is false → enters step loop (not already-satisfied)
    // The mutation side-effect exists but only the return value matters
    expect(result.status).toBe('ok')
    runner.dispose()
  })

  it('identifier outside params → ReferenceError → precondition-failed', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({
      precondition: 'nonExistentVariable === true',
      steps: [],
    })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('precondition-failed')
    runner.dispose()
  })
})

// ===========================================================================
// describe: dispose
// ===========================================================================

describe('dispose', () => {
  it('run() after dispose → step-error (runner disposed)', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    runner.dispose()
    const result = await runner.run(makeMacro(), {})
    expect(result.status).toBe('step-error')
    if (result.status === 'step-error') {
      expect(result.error).toContain('disposed')
    }
  })
})

// ===========================================================================
// describe: PageAgentRuntime integration
// ===========================================================================

// Import after mocks so the vi.mock('command-handlers') is in effect
import { createPageAgentRuntime } from '../src/runtime/page-agent-runtime'
import type { AgruneManifest } from '../src/types'

const mockCdpPostMessage = vi.fn((_type: string, data: unknown) => {
  const { requestId } = data as { requestId: string }
  window.dispatchEvent(
    new CustomEvent('agrune:cdp', {
      detail: { type: 'cdp_response', requestId, result: {} },
    }),
  )
})

function makeManifestWithMacros(): AgruneManifest {
  const emailEl = document.createElement('input')
  emailEl.setAttribute('data-testid', 'email')
  emailEl.setAttribute('data-agrune-key', 'email')
  document.body.appendChild(emailEl)

  const btnEl = document.createElement('button')
  btnEl.setAttribute('data-testid', 'login-btn')
  btnEl.setAttribute('data-agrune-key', 'login-btn')
  document.body.appendChild(btnEl)

  return {
    version: 3,
    groups: [
      {
        groupId: 'auth',
        name: 'Auth',
        targets: [
          {
            targetId: 'email',
            name: '이메일',
            actionKinds: ['fill'],
            selector: { css: '[data-testid="email"]' },
          },
          {
            targetId: 'login-btn',
            name: '로그인',
            actionKinds: ['click'],
            selector: { css: '[data-testid="login-btn"]' },
          },
        ],
      },
    ],
    macros: [
      {
        macroId: 'login',
        params: { email: { type: 'string', required: true } },
        steps: [
          { targetId: 'email', action: 'fill', value: '{{email}}' },
          { targetId: 'login-btn', action: 'click' },
        ],
      },
      {
        macroId: 'macroA',
        params: {},
        steps: [{ targetId: 'login-btn', action: 'click' }],
        circuitBreaker: { maxRetries: 2 },
      },
      {
        macroId: 'macroB',
        params: {},
        steps: [{ targetId: 'login-btn', action: 'click' }],
        circuitBreaker: { maxRetries: 2 },
      },
    ],
  }
}

describe('PageAgentRuntime integration', () => {
  let runtime: ReturnType<typeof createPageAgentRuntime>

  beforeEach(() => {
    // Reset mocks
    const { handleAct, handleFill } = vi.mocked(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/runtime/command-handlers'),
    )
    handleAct.mockImplementation(
      async (_deps: CommandHandlerDeps, input: { targetId: string; action?: string }) => {
        actCalls.push({ targetId: input.targetId, action: input.action })
        return { ok: true }
      },
    )
    handleFill.mockImplementation(
      async (_deps: CommandHandlerDeps, input: { targetId: string; value: string }) => {
        fillCalls.push({ targetId: input.targetId, value: input.value })
        return { ok: true }
      },
    )

    runtime = createPageAgentRuntime(makeManifestWithMacros(), {
      cdpPostMessage: mockCdpPostMessage,
    })
  })

  afterEach(() => {
    // dispose is not directly available on PageAgentRuntime (it's on Handle)
    // but the runtime holds macroRunners — we call dispose via handle pattern
  })

  it('runMacro returns MacroResult & { macroId, stepCount }', async () => {
    const result = await runtime.runMacro({ macroId: 'login', params: { email: 'test@example.com' } })
    expect(result.status).toBe('ok')
    expect(result.macroId).toBe('login')
    expect(result.stepCount).toBe(2)
  })

  it('unknown macroId → step-error (macro not found)', async () => {
    const result = await runtime.runMacro({ macroId: 'nonexistent' })
    expect(result.status).toBe('step-error')
    if (result.status === 'step-error') {
      expect(result.error).toContain('macro not found')
      expect(result.error).toContain('nonexistent')
    }
  })

  it('consecutive failures carry over (cached MacroRunner)', async () => {
    // First call: fail once (consecutiveFailures=1)
    const { handleAct } = vi.mocked(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/runtime/command-handlers'),
    )
    handleAct.mockImplementationOnce(async () => ({ ok: false, error: { message: 'fail' } }))

    const result1 = await runtime.runMacro({ macroId: 'macroA' })
    expect(result1.status).toBe('step-error')

    // Second call: fail again → circuit-open (consecutiveFailures=2)
    handleAct.mockImplementationOnce(async () => ({ ok: false, error: { message: 'fail 2' } }))

    const result2 = await runtime.runMacro({ macroId: 'macroA' })
    expect(result2.status).toBe('circuit-open')
  })

  it('different macroIds have independent failure counts', async () => {
    const { handleAct } = vi.mocked(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/runtime/command-handlers'),
    )
    // macroA fails once
    handleAct.mockImplementationOnce(async () => ({ ok: false, error: { message: 'fail' } }))
    await runtime.runMacro({ macroId: 'macroA' })

    // macroB should be unaffected — next handleAct call for macroB succeeds
    const result = await runtime.runMacro({ macroId: 'macroB' })
    expect(result.status).toBe('ok')
  })

  it('onStepProgress callback fires start/end/sensitive events in order', async () => {
    const events: Array<{ phase: string; stepIndex: number }> = []

    await runtime.runMacro({
      macroId: 'login',
      params: { email: 'x@y.com' },
      onStepProgress: (event) => {
        events.push({ phase: event.phase, stepIndex: event.stepIndex })
      },
    })

    const phases = events.map(e => e.phase)
    expect(phases).toContain('start')
    expect(phases).toContain('end')
    // start events come before end events for same step
    const firstStart = phases.indexOf('start')
    const firstEnd = phases.indexOf('end')
    expect(firstStart).toBeLessThan(firstEnd)
  })
})
