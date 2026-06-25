// Repeat targetId grammar. SPEC §3.10 (reproduced verbatim from the original target-ref.ts).
//
//   agent form (canonical):  repeatId[key=K].baseTargetId   e.g. posts[key=abc123].like_btn
//   internal form (storage): repeatId__agrune_repeatKey_K.baseTargetId

export const REPEATED_TARGET_KEY_DELIMITER = '__agrune_repeatKey_'

export class AgentTargetIdParseError extends Error {
  constructor(
    public readonly input: string,
    message: string,
  ) {
    super(message)
    this.name = 'AgentTargetIdParseError'
  }
}

/** Agent form → internal form (idempotent for already-internal / non-repeat ids). */
export function normalizeAgentTargetId(input: string): string {
  const bracketStart = input.indexOf('[')
  if (bracketStart < 0) return input

  if (bracketStart === 0) {
    throw new AgentTargetIdParseError(input, 'Missing repeatId before "["')
  }

  if (input.includes(REPEATED_TARGET_KEY_DELIMITER)) return input

  const repeatId = input.slice(0, bracketStart)
  const bracketEnd = input.lastIndexOf(']')
  if (bracketEnd <= bracketStart) {
    throw new AgentTargetIdParseError(input, 'Unbalanced brackets: "[" found but no matching "]"')
  }

  const bracketInner = input.slice(bracketStart + 1, bracketEnd)
  const eqIdx = bracketInner.indexOf('=')
  if (eqIdx < 0) {
    throw new AgentTargetIdParseError(
      input,
      'Bracket must contain "=" to specify key (e.g. posts[key=abc123].btn)',
    )
  }

  const value = bracketInner.slice(eqIdx + 1).trim()
  if (!value) {
    throw new AgentTargetIdParseError(input, 'Bracket key value cannot be empty')
  }

  const afterBracket = input.slice(bracketEnd + 1)
  if (!afterBracket.startsWith('.')) {
    throw new AgentTargetIdParseError(
      input,
      'Expected "." after "]" to specify baseTargetId (e.g. posts[key=abc].like_btn)',
    )
  }

  const baseTargetId = afterBracket.slice(1)
  if (!baseTargetId) {
    throw new AgentTargetIdParseError(input, 'baseTargetId after "." cannot be empty')
  }

  return `${repeatId}${REPEATED_TARGET_KEY_DELIMITER}${value}.${baseTargetId}`
}

/** Internal form → agent form (inverse). Prefers repeatInstance; falls back to parsing. */
export function toAgentTargetRef(target: {
  targetId: string
  repeatInstance?: { repeatId: string; key: string }
}): string {
  const delimiterIdx = target.targetId.indexOf(REPEATED_TARGET_KEY_DELIMITER)
  if (delimiterIdx < 0) return target.targetId

  const repeatId = target.repeatInstance?.repeatId ?? target.targetId.slice(0, delimiterIdx)
  const restStart = delimiterIdx + REPEATED_TARGET_KEY_DELIMITER.length
  const dotIdx = target.targetId.indexOf('.', restStart)
  if (!repeatId || dotIdx <= restStart) return target.targetId

  const repeatKey = target.repeatInstance?.key ?? target.targetId.slice(restStart, dotIdx)
  const baseTargetId = target.targetId.slice(dotIdx + 1)
  if (!repeatKey || !baseTargetId) return target.targetId

  return `${repeatId}[key=${repeatKey}].${baseTargetId}`
}

/** Parse an internal repeat targetId into its parts, or null if not a repeat id. */
export function parseRepeatedTargetId(
  targetId: string,
): { repeatId: string; baseTargetId: string } | null {
  const delimiterIndex = targetId.indexOf(REPEATED_TARGET_KEY_DELIMITER)
  if (delimiterIndex <= 0) return null
  const repeatId = targetId.slice(0, delimiterIndex)
  const rest = targetId.slice(delimiterIndex + REPEATED_TARGET_KEY_DELIMITER.length)
  const dotIndex = rest.indexOf('.')
  if (!repeatId || dotIndex <= 0) return null
  const baseTargetId = rest.slice(dotIndex + 1)
  if (!baseTargetId) return null
  return { repeatId, baseTargetId }
}
