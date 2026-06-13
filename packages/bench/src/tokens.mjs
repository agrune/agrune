// Token counting. Prefers a real cl100k_base BPE (gpt-tokenizer); falls back to a
// clearly-flagged character estimate if the dependency is unavailable so the bench
// still runs offline.

let encodeImpl = null
let mode = 'approx'

try {
  const mod = await import('gpt-tokenizer')
  // gpt-tokenizer default model is cl100k_base (GPT-3.5/4 family).
  if (typeof mod.encode === 'function') {
    encodeImpl = mod.encode
    mode = 'cl100k_base'
  }
} catch {
  encodeImpl = null
  mode = 'approx'
}

export const tokenizerMode = mode

/** Count tokens in `text`. Real BPE when available, else ~chars/3.3 estimate. */
export function countTokens(text) {
  if (!text) return 0
  if (encodeImpl) {
    try {
      return encodeImpl(text).length
    } catch {
      // fall through to estimate
    }
  }
  return Math.ceil(text.length / 3.3)
}
