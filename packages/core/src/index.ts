import type { ActionKind } from './manifest.js'
import type { SelectorLadder } from './manifest.js'
export type { ActionKind } from './manifest.js'
export type { SelectorLadder } from './manifest.js'
export {
  AgentTargetIdParseError,
  REPEATED_TARGET_KEY_DELIMITER,
  normalizeAgentTargetId,
  toAgentTargetRef,
} from './target-ref.js'
export type {
  BrowserDriver,
  CloseTabResult,
  ConsoleLevel,
  ConsoleMessageEntry,
  ConsoleMessagesQuery,
  DialogHandleOptions,
  DialogHandleResult,
  DialogInfo,
  DialogType,
  DropData,
  DropResult,
  EvaluateOptions,
  EvaluateResult,
  FileChooserInfo,
  FileUploadResult,
  FillFormField,
  FillFormFieldType,
  FillFormFieldValue,
  FillFormResult,
  FocusResult,
  NavigationResult,
  NetworkRequestDetail,
  NetworkRequestPart,
  NetworkRequestSummary,
  NetworkRequestsQuery,
  OpenTabResult,
  PressKeyResult,
  ResizeResult,
  RunCodeUnsafeResult,
  ScreenshotImageType,
  ScreenshotOptions,
  ScreenshotResult,
  SelectOptionResult,
  Session,
  TypeTextOptions,
  TypeTextResult,
} from './driver.js'

export const COMMAND_ERROR_CODES = [
  'STALE_SNAPSHOT',
  'TARGET_NOT_FOUND',
  'NOT_VISIBLE',
  'DISABLED',
  'FLOW_BLOCKED',
  'TIMEOUT',
  'SESSION_NOT_ACTIVE',
  'AGENT_STOPPED',
  'INVALID_TARGET',
  'INVALID_COMMAND',
  'INVALID_MANIFEST',
  'MACRO_NOT_FOUND',              // Phase 14-03
  'MACRO_CIRCUIT_OPEN',           // Phase 14-03
  'MACRO_PRECONDITION_FAILED',    // Phase 14-03
  'MACRO_POSTCONDITION_FAILED',   // Phase 14-03
  'REPEAT_INDEX_OUT_OF_RANGE',    // Phase 15-01 (REPEAT-02)
  'CANVAS_PAN_FAILED',
  // A canvas drag destination maps outside the visible canvas pane. We reject
  // up front rather than auto-pan (a wheel "pan" is read as zoom by React Flow
  // and most canvas libs, corrupting the scale for an LLM agent's next move).
  'DESTINATION_OUTSIDE_CANVAS',
  'CONNECTION_LOST',
  'CHROME_CRASHED',
  'RECOVERY_FAILED',
  'TAB_NOT_FOUND',
  'DIALOG_NOT_FOUND',
  'FILE_CHOOSER_NOT_FOUND',
  'NETWORK_REQUEST_NOT_FOUND',
  'NETWORK_RESPONSE_NOT_FOUND',
] as const

export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number]

export type DragPlacement = 'before' | 'inside' | 'after'
export type WaitState = 'visible' | 'hidden' | 'enabled' | 'disabled'
export type CommandKind = 'act' | 'drag' | 'fill' | 'wait' | 'read' | 'pointer'
export type FillStrategy = 'insert' | 'keystroke' | 'auto'
export type ClickButton = 'left' | 'middle' | 'right'
export type ClickModifier = 'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'
export type AuroraTheme = 'dark' | 'light'
export type PageTargetReason =
  | 'ready'
  | 'hidden'
  | 'offscreen'
  | 'covered'
  | 'disabled'
  | 'sensitive'

export interface AgruneRuntimeConfig {
  clickDelayMs: number
  pointerDurationMs: number
  pointerAnimation: boolean
  autoScroll: boolean
  cursorName: string
  auroraGlow: boolean
  auroraTheme: AuroraTheme
  /**
   * Surface app-authored on-screen messages (validation errors, toasts) that
   * appear after an action by diffing the accessibility tree frame-to-frame.
   * Deterministic (no model in the loop). Adds one aria snapshot per action.
   */
  surfaceScreenMessages: boolean
  /**
   * Detect interactive controls present on screen but NOT covered by the manifest
   * and surface them with raw `x`-refs (graceful degradation when the manifest is
   * stale/incomplete). Deterministic. Adds per-snapshot DOM enumeration cost.
   */
  detectUnmapped: boolean
  /**
   * After an action, wait up to this many ms for the page signature to stabilize
   * before capturing the snapshot — so async effects (debounced validation, a
   * button that enables after a fetch, a next-tick re-render) are reflected rather
   * than missed by an immediate capture. Volatile targets are excluded from the
   * signature, so a ticking clock does not defeat the wait. 0 disables it (the
   * immediate-capture default). Trade-off: a settled action costs an extra
   * snapshot build, so this compounds with detectUnmapped — enable it for
   * async-heavy apps rather than universally.
   */
  settleAfterActionMs: number
  /**
   * After an act/fill, surface `pendingRequired` — the names of visible required
   * fillable fields still empty — so the agent learns WHICH inputs gate a
   * Create/Next/Submit instead of inferring it from a disabled button (Problem 3).
   * Deterministic and effectively free (a filter over the already-captured
   * snapshot targets — no extra DOM/snapshot cost).
   */
  surfaceRequiredFields: boolean
  /**
   * Pixels to nudge the pointer PAST a canvas framework's drag threshold before
   * the interpolated motion of a coordinate drag, so the grab origin is pinned
   * and the node lands EXACTLY at the destination. d3-drag (React Flow/xyflow)
   * only starts the drag once the pointer moves past `nodeDragThreshold` (default
   * 1px); that trip-point becomes the grab origin, so an uncompensated drag lands
   * short by ~1/steps. Apps that set `nodeDragThreshold={0}` (like this demo) need
   * NO nudge — the grab origin is the pointerdown point — so this defaults to 0.
   * Set it just above the app's threshold (e.g. 2) for canvases you do not control.
   */
  canvasDragNudgePx: number
}

export const DEFAULT_RUNTIME_CONFIG: AgruneRuntimeConfig = {
  clickDelayMs: 300,
  pointerDurationMs: 600,
  pointerAnimation: true,
  autoScroll: true,
  cursorName: 'default',
  auroraGlow: true,
  auroraTheme: 'light',
  surfaceScreenMessages: true,
  detectUnmapped: true,
  settleAfterActionMs: 0,
  surfaceRequiredFields: true,
  canvasDragNudgePx: 0,
}

export interface ViewportTransform {
  translateX: number
  translateY: number
  scale: number
}

/**
 * A canvas (e.g. React Flow / xyflow) viewport transform plus the absolute
 * screen origin of its pane. `translateX/Y` and `scale` come from the
 * `.react-flow__viewport` element's CSS matrix; `paneLeft/Top` is the
 * `getBoundingClientRect()` top-left of the (non-transformed) pane the viewport
 * sits in. Together they map a stable canvas coordinate to a live viewport
 * pixel and back. The pane origin shifts with page scroll, so it must be read
 * FRESH at drag time — never cached in a snapshot — whereas `ViewportTransform`
 * (pan/zoom only) is stable enough to surface to the agent per snapshot.
 */
export interface CanvasViewportTransform extends ViewportTransform {
  paneLeft: number
  paneTop: number
}

/**
 * Canvas coordinate → live viewport pixel. A node at flow-position (cx, cy)
 * renders at paneOrigin + viewportTranslate + flowPos*scale (the CSS matrix
 * `[[scale,0,tx],[0,scale,ty]]` applied to the flow point, then offset by the
 * pane's screen position). Pure; the inverse is `viewportToCanvas`.
 */
export function canvasToViewport(
  cx: number,
  cy: number,
  t: CanvasViewportTransform,
): { x: number; y: number } {
  return {
    x: t.paneLeft + t.translateX + cx * t.scale,
    y: t.paneTop + t.translateY + cy * t.scale,
  }
}

/** Live viewport pixel → canvas coordinate. Inverse of `canvasToViewport`. */
export function viewportToCanvas(
  vx: number,
  vy: number,
  t: CanvasViewportTransform,
): { x: number; y: number } {
  const scale = t.scale || 1
  return {
    x: (vx - t.paneLeft - t.translateX) / scale,
    y: (vy - t.paneTop - t.translateY) / scale,
  }
}

/**
 * Whether a viewport pixel falls inside the canvas pane's screen rect
 * (inclusive bounds). Used to reject a canvas drag whose destination maps
 * outside the visible pane instead of dragging a node into nowhere.
 */
export function isPointInsidePaneRect(
  vx: number,
  vy: number,
  pane: { left: number; top: number; right: number; bottom: number },
): boolean {
  return vx >= pane.left && vy >= pane.top && vx <= pane.right && vy <= pane.bottom
}

export interface PageSnapshotGroup {
  groupId: string
  groupName?: string
  groupDesc?: string
  targetIds: string[]
  viewportTransform?: ViewportTransform
  meta?: unknown
  /** Phase 15-01 (REPEAT-03): Repeat summary — instanceCount는 snapshot에 포함된 가시 인스턴스 수,
   *  logicalSize는 aria-rowcount 기반 (null=unknown). */
  repeats?: Array<{
    repeatId: string
    strategy: 'dom' | 'virtualized'
    instanceCount: number
    logicalSize: number | null
  }>
}

export interface PageTarget {
  targetId: string
  groupId: string
  groupName?: string
  groupDesc?: string
  name: string
  description: string
  actionKinds: ActionKind[]
  selector: SelectorLadder
  visible: boolean
  inViewport: boolean
  enabled: boolean
  covered: boolean
  actionableNow: boolean
  reason: PageTargetReason
  overlay: boolean
  sensitive: boolean
  textContent?: string
  valuePreview?: string | null
  center?: { x: number; y: number }
  size?: { w: number; h: number }
  coordSpace?: 'viewport' | 'canvas'
  sourceFile: string
  sourceLine: number
  sourceColumn: number
  /** Whether the target's selector resolved to a live DOM element when the snapshot was captured. */
  domResolved?: boolean
  /** Phase 15-01 (REPEAT-03): Repeat instance context — defined only for targets from ManifestRepeat expansion. */
  repeatInstance?: {
    repeatId: string
    index: number
    key: string
  }
  /**
   * Authored post-action feedback carried from the manifest target. NOT rendered
   * into the agent-facing snapshot text (zero token cost per turn) — read by the
   * driver after an action to emit a feedback line, gated on a snapshot-version
   * delta (onSuccess when the screen changed, onNoEffect when it did not).
   */
  onSuccess?: string
  onNoEffect?: string
  /** Pin this target's description to render even in compact/no-desc modes. */
  alwaysDesc?: boolean
  /**
   * Exclude this target's text/value from the snapshot signature so its own churn
   * (clock, live counter, relative timestamp) does not bump the snapshot version.
   * Carried from the manifest `volatile` flag. Still rendered; just not a change.
   */
  volatile?: boolean
  /**
   * Whether a fillable target currently holds a non-empty value. Feeds the
   * snapshot signature so that filling a SENSITIVE field (whose `valuePreview`
   * stays null to avoid leaking the secret) still registers as a screen change.
   * Not rendered into the agent-facing snapshot.
   */
  hasValue?: boolean
  /**
   * Whether this fillable target is required (DOM `required`/`aria-required`, or
   * authored `required` in the manifest). Combined with `hasValue` it powers the
   * deterministic "still-needed fields" nudge so the agent learns WHICH required
   * inputs gate a Create/Next/Submit instead of inferring it from a disabled
   * button. Only carried when true.
   */
  required?: boolean
}

export interface PageSnapshot {
  /** Protocol schema version. v3 = SelectorLadder ladder on PageTarget.selector. Breaking change vs v2 (see Phase 12 RESOLVE-03). */
  schemaVersion: 3
  version: number
  capturedAt: number
  url: string
  title: string
  groups: PageSnapshotGroup[]
  targets: PageTarget[]
}

export interface CommandErrorShape {
  code: CommandErrorCode
  message: string
  details?: Record<string, unknown>
}

export interface BaseCommandRequest {
  commandId: string
  config?: Partial<AgruneRuntimeConfig>
}

export interface ActCommandRequest extends BaseCommandRequest {
  kind: 'act'
  targetId: string
  action?: 'click' | 'dblclick' | 'contextmenu' | 'hover' | 'longpress'
  button?: ClickButton
  doubleClick?: boolean
  modifiers?: ClickModifier[]
  expectedVersion?: number
}

export interface DragCommandRequest extends BaseCommandRequest {
  kind: 'drag'
  sourceTargetId: string
  destinationTargetId?: string
  destinationCoords?: { x: number; y: number }
  /**
   * Coordinate space for `destinationCoords`. Omit to let the backend infer:
   * 'canvas' when the source target belongs to a canvas group (coords are stable
   * flow positions, auto-converted to viewport px before the drag), 'viewport'
   * otherwise. Set explicitly to override the inference.
   */
  coordSpace?: 'viewport' | 'canvas'
  placement?: DragPlacement
  expectedVersion?: number
}

export interface FillCommandRequest extends BaseCommandRequest {
  kind: 'fill'
  targetId: string
  value: string
  clear?: boolean
  strategy?: FillStrategy
  expectedVersion?: number
}

export type WaitCommandRequest =
  | (BaseCommandRequest & {
      kind: 'wait'
      targetId: string
      state: WaitState
      timeoutMs?: number
    })
  | (BaseCommandRequest & {
      kind: 'wait'
      text: string
      timeoutMs?: number
    })
  | (BaseCommandRequest & {
      kind: 'wait'
      textGone: string
      timeoutMs?: number
    })
  | (BaseCommandRequest & {
      kind: 'wait'
      timeMs: number
    })

export interface ReadCommandRequest extends BaseCommandRequest {
  kind: 'read'
  selector?: string
  expectedVersion?: number
}

export type PointerActionType = 'pointerdown' | 'pointermove' | 'pointerup' | 'wheel'

export type PointerAction =
  | { type: 'pointerdown'; x: number; y: number; delayMs?: number }
  | { type: 'pointermove'; x: number; y: number; delayMs?: number }
  | { type: 'pointerup'; x: number; y: number; delayMs?: number }
  | { type: 'wheel'; x: number; y: number; deltaY: number; ctrlKey?: boolean; delayMs?: number; steps?: number; durationMs?: number }

export interface PointerCommandRequest extends BaseCommandRequest {
  kind: 'pointer'
  targetId?: string
  selector?: string
  coords?: { x: number; y: number }
  actions: PointerAction[]
}

export type CommandRequest =
  | ActCommandRequest
  | DragCommandRequest
  | FillCommandRequest
  | WaitCommandRequest
  | ReadCommandRequest
  | PointerCommandRequest

export interface CommandExecutionMetadata {
  snapshotVersion?: number
  snapshot?: PageSnapshot
}

export interface CommandResultSuccess extends CommandExecutionMetadata {
  commandId: string
  ok: true
  result?: Record<string, unknown>
}

export interface CommandResultFailure extends CommandExecutionMetadata {
  commandId: string
  ok: false
  error: CommandErrorShape
}

export type CommandResult = CommandResultSuccess | CommandResultFailure

export function mergeRuntimeConfig(
  base: AgruneRuntimeConfig,
  patch?: Partial<AgruneRuntimeConfig> | null,
): AgruneRuntimeConfig {
  if (!patch) {
    return { ...base }
  }

  return normalizeRuntimeConfig({
    clickDelayMs: patch.clickDelayMs ?? base.clickDelayMs,
    pointerDurationMs: patch.pointerDurationMs ?? base.pointerDurationMs,
    pointerAnimation: patch.pointerAnimation ?? base.pointerAnimation,
    autoScroll: patch.autoScroll ?? base.autoScroll,
    cursorName: patch.cursorName ?? base.cursorName,
    auroraGlow: patch.auroraGlow ?? base.auroraGlow,
    auroraTheme: patch.auroraTheme ?? base.auroraTheme,
    surfaceScreenMessages: patch.surfaceScreenMessages ?? base.surfaceScreenMessages,
    detectUnmapped: patch.detectUnmapped ?? base.detectUnmapped,
    settleAfterActionMs: patch.settleAfterActionMs ?? base.settleAfterActionMs,
    surfaceRequiredFields: patch.surfaceRequiredFields ?? base.surfaceRequiredFields,
    canvasDragNudgePx: patch.canvasDragNudgePx ?? base.canvasDragNudgePx,
  })
}

export function normalizeRuntimeConfig(
  input: Partial<AgruneRuntimeConfig> | undefined,
): AgruneRuntimeConfig {
  const clickDelayMs = Number(input?.clickDelayMs ?? DEFAULT_RUNTIME_CONFIG.clickDelayMs)
  const pointerDurationMs = Number(input?.pointerDurationMs ?? DEFAULT_RUNTIME_CONFIG.pointerDurationMs)

  return {
    clickDelayMs:
      Number.isFinite(clickDelayMs) && clickDelayMs >= 0
        ? Math.floor(clickDelayMs)
        : DEFAULT_RUNTIME_CONFIG.clickDelayMs,
    pointerDurationMs:
      Number.isFinite(pointerDurationMs) && pointerDurationMs >= 0
        ? Math.floor(pointerDurationMs)
        : DEFAULT_RUNTIME_CONFIG.pointerDurationMs,
    pointerAnimation:
      typeof input?.pointerAnimation === 'boolean'
        ? input.pointerAnimation
        : DEFAULT_RUNTIME_CONFIG.pointerAnimation,
    autoScroll:
      typeof input?.autoScroll === 'boolean'
        ? input.autoScroll
        : DEFAULT_RUNTIME_CONFIG.autoScroll,
    cursorName:
      typeof input?.cursorName === 'string' && input.cursorName.trim()
        ? input.cursorName.trim()
        : DEFAULT_RUNTIME_CONFIG.cursorName,
    auroraGlow:
      typeof input?.auroraGlow === 'boolean'
        ? input.auroraGlow
        : DEFAULT_RUNTIME_CONFIG.auroraGlow,
    auroraTheme:
      input?.auroraTheme === 'light' || input?.auroraTheme === 'dark'
        ? input.auroraTheme
        : DEFAULT_RUNTIME_CONFIG.auroraTheme,
    surfaceScreenMessages:
      typeof input?.surfaceScreenMessages === 'boolean'
        ? input.surfaceScreenMessages
        : DEFAULT_RUNTIME_CONFIG.surfaceScreenMessages,
    detectUnmapped:
      typeof input?.detectUnmapped === 'boolean'
        ? input.detectUnmapped
        : DEFAULT_RUNTIME_CONFIG.detectUnmapped,
    settleAfterActionMs:
      Number.isFinite(Number(input?.settleAfterActionMs)) && Number(input?.settleAfterActionMs) >= 0
        ? Math.floor(Number(input?.settleAfterActionMs))
        : DEFAULT_RUNTIME_CONFIG.settleAfterActionMs,
    surfaceRequiredFields:
      typeof input?.surfaceRequiredFields === 'boolean'
        ? input.surfaceRequiredFields
        : DEFAULT_RUNTIME_CONFIG.surfaceRequiredFields,
    canvasDragNudgePx:
      Number.isFinite(Number(input?.canvasDragNudgePx)) && Number(input?.canvasDragNudgePx) >= 0
        ? Math.floor(Number(input?.canvasDragNudgePx))
        : DEFAULT_RUNTIME_CONFIG.canvasDragNudgePx,
  }
}

export function createCommandError(
  code: CommandErrorCode,
  message: string,
  details?: Record<string, unknown>,
): CommandErrorShape {
  return { code, message, details }
}

export function isCommandErrorCode(value: unknown): value is CommandErrorCode {
  return typeof value === 'string' && COMMAND_ERROR_CODES.includes(value as CommandErrorCode)
}

export function isCommandResultOk(result: CommandResult): result is CommandResultSuccess {
  return result.ok
}

export * from './driver.js'
export * from './manifest.js'
