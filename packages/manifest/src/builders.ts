import type {
  ActionKind,
  AgruneManifest,
  ManifestGroup,
  ManifestMacro,
  ManifestRepeat,
  ManifestTarget,
  SelectorLadder,
} from './schema.js'

export function defineTarget<TId extends string>(input: {
  targetId: TId
  name?: string
  desc?: string
  actionKinds: ActionKind[]
  selector: SelectorLadder
  /** sensitive는 OR-only 계약: true만 허용. false를 넘기면 컴파일 타임 에러 — MANIFEST-04 */
  sensitive?: true
}): ManifestTarget & { readonly targetId: TId } {
  return input as ManifestTarget & { readonly targetId: TId }
}

export function defineGroup<
  TTargets extends ReadonlyArray<ManifestTarget & { readonly targetId: string }>,
>(input: {
  groupId: string
  name?: string
  desc?: string
  route?: string
  targets: TTargets
  repeats?: ManifestRepeat[]
}): ManifestGroup & {
  readonly __targetIds: TTargets[number]['targetId']
} {
  return input as unknown as ManifestGroup & { readonly __targetIds: TTargets[number]['targetId'] }
}

export function defineRepeat(input: ManifestRepeat): ManifestRepeat {
  return input
}

export function defineMacro(input: ManifestMacro): ManifestMacro {
  return input
}

export function defineManifest<
  TGroups extends ReadonlyArray<ManifestGroup & { __targetIds: string }>,
>(input: {
  groups: TGroups
  macros?: ManifestMacro[]
}): AgruneManifest & {
  readonly __targetIds: TGroups[number]['__targetIds']
} {
  const manifest: AgruneManifest = {
    version: 3,
    groups: input.groups as unknown as ManifestGroup[],
    ...(input.macros ? { macros: input.macros } : {}),
  }
  return manifest as AgruneManifest & { readonly __targetIds: TGroups[number]['__targetIds'] }
}
