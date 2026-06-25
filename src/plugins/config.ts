// Optional-plugin gating (SPEC §8). Every plugin is OFF by default so the core loop runs
// unchanged with all plugins ABSENT (A.0.4). Each is enabled via an env flag, read once per
// daemon process.

function on(name: string): boolean {
  const v = process.env[name]
  return v === '1' || v === 'on' || v === 'true'
}

/** Default-ON gate: enabled unless explicitly turned off. For resilience features whose
 * detection cost is ~zero and that the agent cannot reasonably track for itself. */
function onByDefault(name: string): boolean {
  const v = process.env[name]
  if (v === undefined) return true
  return !(v === '0' || v === 'off' || v === 'false')
}

export interface PluginConfig {
  /** §8.1 self-heal — re-ground a drifted target from author intent. */
  selfHeal: boolean
  /** §8.2 deterministic action feedback (changed bit + onSuccess/onNoEffect + screen delta + nudge). */
  feedback: boolean
  /** §8.3 unmapped-control detection (set-difference; perf-sensitive). */
  unmapped: boolean
  /** §8.6 manifest-drift detection + scoped a11y fallback. Default ON (zero-cost detection;
   * full a11y attached only on confirmed drift). AGRUNE_DRIFT=off disables. */
  drift: boolean
  /** §8.2 settle: poll for async-effect quiescence after an action. 0 = off (default). */
  settleAfterActionMs: number
}

export function loadPluginConfig(): PluginConfig {
  const settle = Number(process.env.AGRUNE_SETTLE_MS ?? '0')
  return {
    // self-heal: ON unless explicitly disabled when AGRUNE_SELF_HEAL is set; default OFF (core
    // works without it). Accept `on`/`1` to enable, `off` to keep disabled.
    selfHeal: on('AGRUNE_SELF_HEAL'),
    feedback: on('AGRUNE_FEEDBACK'),
    unmapped: on('AGRUNE_UNMAPPED'),
    drift: onByDefault('AGRUNE_DRIFT'),
    settleAfterActionMs: Number.isFinite(settle) && settle > 0 ? settle : 0,
  }
}
