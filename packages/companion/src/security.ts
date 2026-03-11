export function isSameOriginLoopback(origin: string): boolean {
  return origin === 'http://127.0.0.1' || origin === 'http://localhost'
}

export function isAllowedPageWebSocketOrigin(originHeader: string, sessionOrigin: string): boolean {
  return !originHeader || originHeader === sessionOrigin || isSameOriginLoopback(originHeader)
}

export function requiresToolCallConfirmation(
  session: { sensitiveTargetIds: Set<string> },
  args: Record<string, unknown>,
): boolean {
  const target = typeof args.target === 'string' ? args.target : ''
  return Boolean(target && session.sensitiveTargetIds.has(target))
}
