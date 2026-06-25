// CLI_VERSION is injected at build time via tsup `define` (`__AGRUNE_CLI_VERSION__`).
// When running un-bundled (tests / tsx) the global is undefined, so fall back to '0.0.0'
// per SPEC §9. Used for `--version` and daemon version-skew restart (§7.2 / A.1.9).
declare const __AGRUNE_CLI_VERSION__: string | undefined

export const CLI_VERSION: string =
  typeof __AGRUNE_CLI_VERSION__ === 'string' ? __AGRUNE_CLI_VERSION__ : '0.0.0'
