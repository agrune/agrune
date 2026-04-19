/**
 * target-id-normalizer.ts — Phase 15-03 (REPEAT-03)
 *
 * AI-facing dot-bracket targetId → runtime delimiter 형식으로 정규화.
 *
 * AI 에이전트는 snapshot의 repeatInstance.key를 보고 dot-bracket 경로를 구성:
 *   `posts[postId=abc123].like_btn`
 *
 * MCP layer에서 이를 runtime delimiter 형식으로 변환:
 *   `posts__agrune_repeatKey_abc123.like_btn`
 *
 * Security:
 *   - ReDoS 방어: indexOf/slice 기반 linear-time scan, regex backtracking 없음 (T-15-12 mitigate)
 *   - T-15-14: z.string() 기본 크기 제한 + linear-time scan으로 O(n) 처리
 *   - T-15-17: 이미 runtime 형식이면 passthrough
 */

/**
 * Runtime delimiter — packages/runtime/src/runtime/snapshot.ts의 REPEATED_TARGET_KEY_DELIMITER와 동일.
 * D-06: 필요 시 @agrune/core로 re-export 가능. 현재는 MCP-local 상수로 유지.
 */
const REPEATED_TARGET_KEY_DELIMITER = '__agrune_repeatKey_'

/**
 * AI-facing dot-bracket targetId 파싱 오류 클래스.
 * `input` 필드는 details에만 포함 (T-15-13: message에 직접 echo 최소화).
 */
export class AgentTargetIdParseError extends Error {
  constructor(
    public readonly input: string,
    message: string,
  ) {
    super(message)
    this.name = 'AgentTargetIdParseError'
  }
}

/**
 * AI-facing dot-bracket targetId → runtime delimiter 형식으로 정규화.
 *
 * Accepts:
 *   - `plain_id` → passthrough (bracket 없음)
 *   - `repeatId[keyFromField=value].baseTargetId` → `repeatId__agrune_repeatKey_value.baseTargetId`
 *   - `repeatId__agrune_repeatKey_value.baseTargetId` → passthrough (이미 normalized)
 *
 * Rejects (throws AgentTargetIdParseError):
 *   - bracket 불균형 ([ 있지만 ] 없음 또는 ] 위치가 [ 보다 앞)
 *   - bracket 내부에 `=` 없음
 *   - 빈 key 값
 *   - bracket 후 `.` 없음
 *   - baseTargetId가 비어있음
 *
 * Linear-time: indexOf/slice 단일 pass scan — regex 없음.
 *
 * @param input AI가 전달한 targetId (dot-bracket 형식 또는 일반 형식)
 * @returns runtime delimiter 형식으로 정규화된 targetId
 * @throws {AgentTargetIdParseError} 입력 형식이 유효하지 않을 경우
 */
export function normalizeAgentTargetId(input: string): string {
  // early-return: bracket 미포함 → passthrough (O(1) indexOf)
  const bracketStart = input.indexOf('[')
  if (bracketStart < 0) return input

  // bracket이 맨 앞이면 repeatId 없음 → invalid
  if (bracketStart === 0) {
    throw new AgentTargetIdParseError(input, 'Missing repeatId before "["')
  }

  // 이미 runtime 형식이면 passthrough (REPEATED_TARGET_KEY_DELIMITER 포함 여부로 판단)
  if (input.includes(REPEATED_TARGET_KEY_DELIMITER)) return input

  const repeatId = input.slice(0, bracketStart)

  // rightmost `]` 스캔 — nested bracket 지원 (Test 4: `posts[postId=abc[123]].like_btn`)
  const bracketEnd = input.lastIndexOf(']')
  if (bracketEnd <= bracketStart) {
    throw new AgentTargetIdParseError(input, 'Unbalanced brackets: "[" found but no matching "]"')
  }

  const bracketInner = input.slice(bracketStart + 1, bracketEnd)
  const eqIdx = bracketInner.indexOf('=')
  if (eqIdx < 0) {
    throw new AgentTargetIdParseError(
      input,
      'Bracket must contain "=" to specify key (e.g. posts[postId=abc123].btn)',
    )
  }

  // keyFromField는 검증 목적으로만 읽음 — normalized output에는 value만 사용
  const value = bracketInner.slice(eqIdx + 1).trim()
  if (!value) {
    throw new AgentTargetIdParseError(input, 'Bracket key value cannot be empty')
  }

  const afterBracket = input.slice(bracketEnd + 1)
  if (!afterBracket.startsWith('.')) {
    throw new AgentTargetIdParseError(
      input,
      'Expected "." after "]" to specify baseTargetId (e.g. posts[postId=abc].like_btn)',
    )
  }

  const baseTargetId = afterBracket.slice(1)
  if (!baseTargetId) {
    throw new AgentTargetIdParseError(input, 'baseTargetId after "." cannot be empty')
  }

  // ReDoS 내성: 위 모든 로직은 indexOf/lastIndexOf/slice (O(n)), regex 없음
  return `${repeatId}${REPEATED_TARGET_KEY_DELIMITER}${value}.${baseTargetId}`
}
