import * as p from '@clack/prompts'
import { runAllChecks } from '../checks/index.js'
import { getAllChecks } from './doctor.js'

export async function runRepair(): Promise<void> {
  p.intro('agrune repair')

  const checks = getAllChecks()
  const results = await runAllChecks(checks)

  const failures = results.filter(r => !r.result.ok)

  if (failures.length === 0) {
    p.outro('문제가 없습니다. 모든 항목 정상!')
    return
  }

  p.log.warning(`${failures.length}개 문제 발견:`)
  for (const { check, result } of failures) {
    p.log.error(`  ${check.name}: ${result.message}`)
  }

  const shouldFix = await p.confirm({
    message: '자동으로 복구하시겠습니까?',
  })

  if (p.isCancel(shouldFix) || !shouldFix) {
    p.cancel('복구 취소됨')
    return
  }

  let fixed = 0
  for (const { check } of failures) {
    const s = p.spinner()
    s.start(`${check.name} 복구 중...`)
    try {
      await check.fix()
      s.stop(`${check.name} 복구 완료`)
      fixed++
    } catch (err) {
      s.stop(`${check.name} 복구 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  p.outro(`${fixed}/${failures.length}개 항목 복구 완료`)
}
