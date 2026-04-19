import { randomUUID } from 'node:crypto'
import type { PendingStore, PendingCaptureFile } from './pending-store.js'

// ─── Shared types (kept local so @agrune/mcp avoids a circular dep on devtools) ──

export type RecorderMode = 'idle' | 'picking' | 'recording-action'

export interface CaptureResult {
  url: string
  fiberPath?: Array<{ componentName: string; key: string | null; index: number }>
  roleSelector?: { role: string; name?: string }
  cssSelector?: string
  sensitive?: true
  autoTargetId: string
}

export interface CommitPayload {
  sessionId: string
  ts: number
  url: string
  targetId: string
  selector: unknown // validated by devtools-server with isValidCommitPayload + ts-morph in Plan 03
  sensitive?: true
}

export type RecorderBroadcast = (
  msg:
    | { type: 'recorder_state'; mode: RecorderMode }
    | { type: 'recorder_captured'; data: CaptureResult }
    | { type: 'recorder_error'; code: string; message: string },
) => void

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * Server-side recorder session orchestrator. Owns the authoritative mode and
 * routes `recorder_toggle`/`recorder_commit` from the WS layer to the
 * PendingStore. Generates a UUID sessionId the first time picking starts and
 * reuses it until the next idle transition so that multiple captures within
 * one picking flow land in the same `<sessionId>` directory.
 *
 * Reconnect safety (Pitfall 6 server-side): `reset()` is called when the last
 * WS client disconnects, snapping back to idle.
 */
export class RecorderController {
  private mode: RecorderMode = 'idle'
  private sessionId: string | null = null

  constructor(
    private readonly pending: PendingStore,
    private readonly broadcast: RecorderBroadcast,
  ) {}

  getMode(): RecorderMode {
    return this.mode
  }

  /**
   * Toggle idle ↔ picking. When transitioning into picking we mint a fresh
   * sessionId so that pending files land under a new directory.
   */
  handleToggle(): void {
    if (this.mode === 'idle') {
      this.mode = 'picking'
      this.sessionId = sanitizedUuid()
    } else {
      // picking or recording-action → idle
      this.mode = 'idle'
      this.sessionId = null
    }
    this.broadcast({ type: 'recorder_state', mode: this.mode })
  }

  /**
   * Update mode to recording-action and fan out the captured selectors.
   * Called by the runtime integration when page-context picking finds a
   * click target.
   */
  handleCaptured(result: CaptureResult): void {
    this.mode = 'recording-action'
    this.broadcast({ type: 'recorder_captured', data: result })
  }

  /**
   * Persist the capture into pending storage. On success resets to idle;
   * on validation failure emits a recorder_error and leaves mode untouched.
   *
   * WR-03: `recording-action` 모드에서만 commit 을 허용한다. 이를 통해
   * 인증 없는 WS 엔드포인트로 붙은 악성 클라이언트가 idle 상태에서
   * recorder_commit 을 쏴서 pending 디렉터리를 채우는 경로를 차단한다.
   * 정상 플로우는 반드시 handleCaptured → handleCommit 순서이며, 그 외
   * 시점의 commit 은 RECORDER_NOT_RECORDING error 로 거절된다.
   */
  async handleCommit(payload: CommitPayload): Promise<void> {
    if (this.mode !== 'recording-action') {
      this.broadcast({
        type: 'recorder_error',
        code: 'RECORDER_NOT_RECORDING',
        message: 'cannot commit: recorder is not in recording-action mode',
      })
      return
    }
    // Prefer the in-flight sessionId over whatever the client echoed.
    const sessionId = this.sessionId ?? sanitizedUuid()

    // 1. targetId sanitize at the MCP boundary (T-16-03). Use dynamic import
    //    to avoid a circular import in commonjs toolchains.
    const { PendingStore: Store } = await import('./pending-store.js')
    let safeTargetId: string
    try {
      safeTargetId = Store.sanitizeTargetId(payload.targetId)
    } catch (err) {
      this.broadcast({
        type: 'recorder_error',
        code: 'RECORDER_INVALID_TARGET_ID',
        message: err instanceof Error ? err.message : String(err),
      })
      return
    }

    // 2. sessionId sanitize (UUID format already, but keep defense-in-depth).
    let safeSessionId: string
    try {
      safeSessionId = Store.sanitizeSessionId(sessionId)
    } catch (err) {
      this.broadcast({
        type: 'recorder_error',
        code: 'RECORDER_INVALID_SESSION_ID',
        message: err instanceof Error ? err.message : String(err),
      })
      return
    }

    const file: PendingCaptureFile = {
      ts: typeof payload.ts === 'number' && Number.isFinite(payload.ts) ? payload.ts : Date.now(),
      sessionId: safeSessionId,
      url: typeof payload.url === 'string' ? payload.url : '',
      targets: [
        {
          targetId: safeTargetId,
          selector: payload.selector,
          ...(payload.sensitive ? { sensitive: true as const } : {}),
        },
      ],
    }

    try {
      await this.pending.writePending(safeSessionId, file)
    } catch (err) {
      this.broadcast({
        type: 'recorder_error',
        code: 'RECORDER_WRITE_FAILED',
        message: err instanceof Error ? err.message : String(err),
      })
      return
    }

    this.mode = 'idle'
    this.sessionId = null
    this.broadcast({ type: 'recorder_state', mode: this.mode })
  }

  /** Force-reset mode to idle. Called when the last WS client disconnects. */
  reset(): void {
    this.mode = 'idle'
    this.sessionId = null
    this.broadcast({ type: 'recorder_state', mode: this.mode })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Produce a sessionId-safe string from randomUUID. UUID v4 uses `[0-9a-f-]`
 * which already passes the PendingStore sanitizer, but we explicitly strip
 * anything outside the allowlist just in case the Node crypto impl ever
 * changes its output alphabet.
 */
function sanitizedUuid(): string {
  return randomUUID().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128)
}
