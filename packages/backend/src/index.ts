export { PlaywrightSession } from './playwright-session.js'
export type { PlaywrightConnection, PlaywrightSessionOptions, RepairReport } from './playwright-session.js'
export {
  intentFromTarget,
  rankRepairCandidates,
  similarity,
  serializeRepairOutcome,
} from './self-heal.js'
export type {
  ObservedElement,
  RepairIntent,
  RepairCandidate,
  RepairDecision,
  RepairOutcome,
  RepairOptions,
} from './self-heal.js'
export { PlaywrightDriver } from './playwright-driver.js'
export type { PlaywrightDriverOptions } from './playwright-driver.js'
export { buildLocatorCandidates, resolveLocator, resolveLocatorMulti } from './locator.js'
export type { ResolvedLocator } from './locator.js'
export { buildSnapshotFromManifest, createSnapshotStore, filterSnapshot, formatSnapshot } from './snapshot.js'
export type { SnapshotStore, SnapshotTargetFilterOptions } from './snapshot.js'
export {
  REPEAT_MAX_INSTANCES,
  SENSITIVE_ARIA_LABELS_MULTILANG,
  SENSITIVE_NAME_ATTR,
  SENSITIVE_WORD_BOUNDARY,
  captureElementState,
  expandRepeatRows,
  isSensitive,
  readContainerLogicalSize,
} from './page-functions.js'
export type {
  ElementCapturedState,
  ElementStateOptions,
  RepeatRow,
  RepeatRowArgs,
} from './page-functions.js'
export { loadManifestFromPage, routeApplies } from './manifest-loader.js'
export {
  AgruneBackendError,
  CliError,
  asBackendError,
  asCliError,
  errorResponse,
} from './errors.js'
export type {
  ClickButton,
  ClickModifier,
  ConsoleLevel,
  ConsoleMessageEntry,
  DialogInfo,
  FileChooserInfo,
  FillFormField,
  FillFormFieldType,
  NetworkRequestPart,
  NetworkRequestSummary,
  PublicTab,
} from './types.js'
