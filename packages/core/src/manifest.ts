/**
 * Agrune manifest v3 types.
 *
 * v3 BREAKING CHANGE (2026-04-19):
 *   - version: 2 → version: 3
 *   - exposureMode removed
 *   - AgruneToolEntry removed — targets hang directly off ManifestGroup
 *   - AgruneToolEntry.action (string) → ManifestTarget.actionKinds (ActionKind[])
 *   - selector string → SelectorLadder { role?, text?, testId?, attr?, css? }
 *   - sensitive?: true added (OR-only, see MANIFEST-04)
 *   - macros top-level + repeats per-group added
 *
 * No v2 adapter — @agrune/core is the sole truth path and re-exports
 * @agrune/manifest schema types.
 */
export type {
  ActionKind,
  SelectorLadder,
  ManifestTarget,
  ManifestGroup,
  ManifestRepeat,
  ManifestMacro,
  MacroStep,
  AgruneManifest,
} from '@agrune/manifest'
