const REPEATED_TARGET_KEY_DELIMITER = '__agrune_repeatKey_'

export { REPEATED_TARGET_KEY_DELIMITER }

export class AgentTargetIdParseError extends Error {
  constructor(
    public readonly input: string,
    message: string,
  ) {
    super(message)
    this.name = 'AgentTargetIdParseError'
  }
}

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
