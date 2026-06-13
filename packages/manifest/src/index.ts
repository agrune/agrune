export {
  defineManifest,
  defineGroup,
  defineTarget,
  defineRepeat,
  defineMacro,
} from './builders.js'

export {
  validateManifest,
  SelectorForbiddenError,
  assertNoHashClass,
  assertNoNthChild,
  HASH_CLASS_PATTERN,
  NTH_CHILD_PATTERN,
} from './validator.js'

export type {
  ValidateResult,
  ValidateOk,
  ValidateFail,
} from './validator.js'

export {
  ManifestSchema,
  SelectorLadderSchema,
  TargetSchema,
  GroupSchema,
  RepeatSchema,
  MacroSchema,
  MacroStepSchema,
  ActionKindSchema,
} from './schema.js'

export type {
  ActionKind,
  SelectorLadder,
  ManifestTarget,
  ManifestGroup,
  ManifestRepeat,
  ManifestMacro,
  MacroStep,
  AgruneManifest,
} from './schema.js'

export {
  generatePlaywrightTests,
  selectorToLocatorExpr,
  actionToCallExpr,
} from './codegen.js'
export type { CodegenOptions } from './codegen.js'
