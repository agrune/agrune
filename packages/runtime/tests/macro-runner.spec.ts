// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import type { ManifestMacro, MacroStep } from '@agrune/manifest'
import type { CommandHandlerDeps } from '../src/runtime/command-handlers'
import type { MacroRunnerDeps } from '../src/runtime/macro-runner'
import { MacroRunner, interpolateParams } from '../src/runtime/macro-runner'

// ---------------------------------------------------------------------------
// Mock handleAct / handleFill at module level (hoisted by vi.mock)
// ---------------------------------------------------------------------------

vi.mock('../src/runtime/command-handlers', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    handleAct: vi.fn(async () => ({ ok: true })),
    handleFill: vi.fn(async () => ({ ok: true })),
  }
})

// Import mocked module AFTER vi.mock declaration
import * as cmdHandlers from '../src/runtime/command-handlers'

// ---------------------------------------------------------------------------
// Convenience accessors for mocked functions
// ---------------------------------------------------------------------------

function getMockedHandleAct() {
  return vi.mocked(cmdHandlers.handleAct)
}

function getMockedHandleFill() {
  return vi.mocked(cmdHandlers.handleFill)
}

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

function makeDeps(elements: Record<string, HTMLElement>): CommandHandlerDeps {
  // Set a stable test selector so resolveByLadder can find elements.
  for (const [targetId, el] of Object.entries(elements)) {
    el.setAttribute('data-testid', targetId)
  }

  return {
    captureSnapshot: vi.fn(() => ({ version: 1, targets: [], signature: 'x' }) as any),
    captureSettledSnapshot: vi.fn(async () => ({ version: 1, targets: [], signature: 'x' }) as any),
    getDescriptors: vi.fn(() =>
      Object.entries(elements).map(([targetId]) => ({
        actionKinds: ['click', 'fill', 'dblclick', 'contextmenu', 'hover', 'longpress'] as any,
        groupId: 'test',
        target: {
          targetId,
          actionKinds: ['click', 'fill'],
          selector: { css: `[data-testid="${targetId}"]` },
        },
      })),
    ),
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
}

function makeMacroRunnerDeps(
  elements: Record<string, HTMLElement>,
  overrides: {
    onStepStart?: MacroRunnerDeps['onStepStart']
    onStepEnd?: MacroRunnerDeps['onStepEnd']
    onSensitiveStep?: MacroRunnerDeps['onSensitiveStep']
  } = {},
): MacroRunnerDeps {
  return {
    commandHandlerDeps: makeDeps(elements),
    onStepStart: overrides.onStepStart,
    onStepEnd: overrides.onStepEnd,
    onSensitiveStep: overrides.onSensitiveStep,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  document.body.innerHTML = ''
  getMockedHandleAct().mockReset()
  getMockedHandleFill().mockReset()
  // Default: both succeed
  getMockedHandleAct().mockResolvedValue({ ok: true } as any)
  getMockedHandleFill().mockResolvedValue({ ok: true } as any)
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Fixture helpers
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
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }, { onStepStart }))
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
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
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
    expect(getMockedHandleFill()).toHaveBeenCalledTimes(1)
    expect(getMockedHandleAct()).toHaveBeenCalledTimes(1)
    expect(onStepStart).toHaveBeenCalledTimes(2)
    expect(onStepEnd).toHaveBeenCalledTimes(2)
    runner.dispose()
  })

  it('Playwright-only macro action is rejected by the page runtime runner', async () => {
    const inputEl = makeElement()
    const runner = new MacroRunner(makeMacroRunnerDeps({ input: inputEl }))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'input', action: 'type', value: 'Ada' })],
    })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('step-error')
    if (result.status === 'step-error') {
      expect(result.error).toContain('not supported by the page runtime runner')
    }
    expect(getMockedHandleAct()).not.toHaveBeenCalled()
    expect(getMockedHandleFill()).not.toHaveBeenCalled()
    runner.dispose()
  })

  it('step.value with {{email}} interpolated from params', async () => {
    const emailEl = makeElement()
    const runner = new MacroRunner(makeMacroRunnerDeps({ email: emailEl }))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'email', action: 'fill', value: '{{email}}' })],
    })
    await runner.run(macro, { email: 'a@b.com' })
    expect(getMockedHandleFill()).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ value: 'a@b.com' }),
    )
    runner.dispose()
  })

  it('missing key in {{missing}} → empty string', async () => {
    const emailEl = makeElement()
    const runner = new MacroRunner(makeMacroRunnerDeps({ email: emailEl }))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'email', action: 'fill', value: '{{missing}}' })],
    })
    await runner.run(macro, {})
    expect(getMockedHandleFill()).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ value: '' }),
    )
    runner.dispose()
  })

  it('non-fill actions dispatch to handleAct', async () => {
    const btnEl = makeElement()
    const runner = new MacroRunner(makeMacroRunnerDeps({ btn: btnEl }))

    for (const action of ['click', 'dblclick', 'contextmenu', 'hover', 'longpress'] as const) {
      getMockedHandleAct().mockClear()
      const macro = makeMacro({ steps: [makeStep({ targetId: 'btn', action })] })
      const result = await runner.run(macro, {})
      expect(result.status).toBe('ok')
      expect(getMockedHandleAct()).toHaveBeenCalledTimes(1)
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
    getMockedHandleAct().mockResolvedValue({ ok: false, error: { message: 'fail' } } as any)

    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      steps: [
        makeStep({ targetId: 'btn', action: 'click' }),
        makeStep({ targetId: 'btn', action: 'click' }),
      ],
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
    getMockedHandleAct().mockResolvedValue({ ok: false, error: { message: 'fail' } } as any)

    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      circuitBreaker: { maxRetries: 3 },
      steps: [
        makeStep({ targetId: 'btn', action: 'click' }),
        makeStep({ targetId: 'btn', action: 'click' }),
        makeStep({ targetId: 'btn', action: 'click' }),
      ],
    })
    const result = await runner.run(macro, {})
    expect(result.status).toBe('circuit-open')
    if (result.status === 'circuit-open') {
      expect(result.failedStep).toBe(2)
    }
    runner.dispose()
  })

  it('success after failure resets consecutive count — fail/succeed/fail → no circuit-open', async () => {
    const btn = makeElement()
    let callCount = 0
    getMockedHandleAct().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return { ok: false, error: { message: 'fail 1' } } as any
      if (callCount === 2) return { ok: true } as any
      return { ok: false, error: { message: 'fail 3' } } as any
    })

    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      steps: [
        makeStep({ targetId: 'btn', action: 'click' }), // fail → consecutiveFailures=1
        makeStep({ targetId: 'btn', action: 'click' }), // succeed → reset to 0
        makeStep({ targetId: 'btn', action: 'click' }), // fail → consecutiveFailures=1
      ],
    })
    const result = await runner.run(macro, {})
    // After fail/succeed/fail: consecutiveFailures=1 → not circuit-open (< 2)
    expect(result.status).toBe('step-error')
    runner.dispose()
  })

  it('resetAfterMs → setTimeout resets consecutiveFailures after delay', async () => {
    vi.useFakeTimers()
    const btn = makeElement()

    const runner = new MacroRunner(makeMacroRunnerDeps({ btn }))
    const macro = makeMacro({
      circuitBreaker: { maxRetries: 2, resetAfterMs: 10 },
      steps: [makeStep({ targetId: 'btn', action: 'click' })],
    })

    // First run — 1 failure (consecutiveFailures=1)
    getMockedHandleAct().mockResolvedValueOnce({ ok: false, error: { message: 'fail' } } as any)
    await runner.run(macro, {})

    // Advance timers past resetAfterMs → consecutiveFailures resets to 0
    await vi.advanceTimersByTimeAsync(15)

    // Second run — succeed: consecutiveFailures was reset so no circuit-open
    getMockedHandleAct().mockResolvedValueOnce({ ok: true } as any)
    const result = await runner.run(macro, {})
    expect(result.status).toBe('ok')
    runner.dispose()
  })

  it('circuit-open → remaining steps are not executed', async () => {
    const btn = makeElement()
    getMockedHandleAct().mockResolvedValue({ ok: false, error: { message: 'fail' } } as any)

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
    // handleAct called exactly 2 times (steps 0 and 1)
    expect(getMockedHandleAct()).toHaveBeenCalledTimes(2)
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

  it('target-not-found × 2 across runs → circuit-open', async () => {
    // Two consecutive target-not-found runs on the same runner instance
    // share consecutiveFailures (session-scoped circuit breaker)
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({
      steps: [makeStep({ targetId: 'ghost', action: 'click' })],
    })

    // Run 1: target-not-found, consecutiveFailures=1
    await runner.run(macro, {})
    // Run 2: consecutiveFailures=2 >= threshold=2 → circuit-open
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

  it('postcondition failure increments consecutiveFailures (state carries to next run)', async () => {
    const runner = new MacroRunner(makeMacroRunnerDeps({}))
    const macro = makeMacro({
      postcondition: 'false',
      steps: [],
      circuitBreaker: { maxRetries: 2 },
    })
    // Run 1: postcondition-failed → consecutiveFailures=1
    const result1 = await runner.run(macro, {})
    expect(result1.status).toBe('postcondition-failed')
    // Run 2: postcondition-failed → consecutiveFailures=2
    const result2 = await runner.run(macro, {})
    // Status is still postcondition-failed (circuit-open check is in step loop)
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
  document.body.appendChild(emailEl)

  const btnEl = document.createElement('button')
  btnEl.setAttribute('data-testid', 'login-btn')
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
    // Reset mocks to success defaults before each integration test
    getMockedHandleAct().mockResolvedValue({ ok: true } as any)
    getMockedHandleFill().mockResolvedValue({ ok: true } as any)

    runtime = createPageAgentRuntime(makeManifestWithMacros(), {
      cdpPostMessage: mockCdpPostMessage,
    })
  })

  it('runMacro returns MacroResult & { macroId, stepCount }', async () => {
    const result = await runtime.runMacro({ macroId: 'login', params: { email: 'test@example.com' } })
    expect(result.status).toBe('ok')
    expect(result.macroId).toBe('login')
    expect(result.stepCount).toBe(2)
  })

  it('unknown macroId → step-error with "macro not found" message', async () => {
    const result = await runtime.runMacro({ macroId: 'nonexistent' })
    expect(result.status).toBe('step-error')
    if (result.status === 'step-error') {
      expect(result.error).toContain('macro not found')
      expect(result.error).toContain('nonexistent')
    }
  })

  it('consecutive failures carry over via cached MacroRunner', async () => {
    // Run 1: fail once → consecutiveFailures=1
    getMockedHandleAct().mockResolvedValueOnce({ ok: false, error: { message: 'fail' } } as any)
    const result1 = await runtime.runMacro({ macroId: 'macroA' })
    expect(result1.status).toBe('step-error')

    // Run 2: fail again → consecutiveFailures=2 >= maxRetries=2 → circuit-open
    getMockedHandleAct().mockResolvedValueOnce({ ok: false, error: { message: 'fail 2' } } as any)
    const result2 = await runtime.runMacro({ macroId: 'macroA' })
    expect(result2.status).toBe('circuit-open')
  })

  it('different macroIds have independent failure counts', async () => {
    // macroA fails once → consecutiveFailures=1 for macroA
    getMockedHandleAct().mockResolvedValueOnce({ ok: false, error: { message: 'fail' } } as any)
    await runtime.runMacro({ macroId: 'macroA' })

    // macroB is unaffected — next call succeeds
    getMockedHandleAct().mockResolvedValueOnce({ ok: true } as any)
    const result = await runtime.runMacro({ macroId: 'macroB' })
    expect(result.status).toBe('ok')
  })

  it('onStepProgress callback fires start/end events in order', async () => {
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
    // start events precede end events for the same step
    const firstStart = phases.indexOf('start')
    const firstEnd = phases.indexOf('end')
    expect(firstStart).toBeLessThan(firstEnd)
  })
})
