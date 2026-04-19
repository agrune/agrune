/**
 * isProdEnabled — 2단계 prod guard
 *
 * Guard 1: process.env.AGRUNE_PROD_ENABLED 점 표기법 (bundler dead-code-elim 친화)
 *   - bracket notation `process.env['AGRUNE_PROD_ENABLED']` 금지
 *   - esbuild/webpack/vite/rollup 모두 점 표기법으로만 정적 분석 가능 (A1 assumption)
 *
 * Guard 2: localStorage 런타임 token
 *   - localStorage 접근 시 SSR/privacy mode ReferenceError 방어를 위해 try/catch 필수
 */
export function isProdEnabled(mode: 'dev' | 'prod'): boolean {
  if (mode === 'dev') return true
  // Guard 1: dot notation — 정적 분석 친화 (dead-code-elim)
  if (process.env.AGRUNE_PROD_ENABLED !== 'true') return false
  // Guard 2: localStorage runtime token
  try {
    return localStorage.getItem('agrune.prod.consent') === 'true'
  } catch {
    return false
  }
}
