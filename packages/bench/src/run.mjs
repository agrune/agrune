// agrune token benchmark — raw a11y snapshot (full + depth-tuned) vs the agrune
// manifest snapshot, measured through the REAL agent-facing serializer
// (@agrune/mcp toPublicSnapshot + formatPublicSnapshot). No browser required.
//
// Honest framing (per strategy review): the load-bearing baseline is the
// DEPTH-TUNED raw snapshot, not the full one — Playwright's `depth` knob already
// recovers a large fraction of tokens for free. We report reductions against BOTH
// so the manifest's marginal value is not overstated.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toPublicSnapshot, formatPublicSnapshot } from '@agrune/mcp'
import { countTokens, tokenizerMode } from './tokens.mjs'
import { parseAriaDump } from './parse-aria.mjs'
import { buildSnapshotFromParsed } from './build-snapshot.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.AGRUNE_BENCH_DATA || resolve(__dirname, '../../../..')
const OUT_DIR = resolve(DATA_DIR, 'output')

const DATASETS = [
  { key: 'gov24', label: '정부24 홈', full: 'gov24-full.md', depthTuned: 'gov24-depth8.md', url: 'https://www.gov.kr/', title: '정부24' },
  { key: 'github', label: 'GitHub PR', full: 'github-playwright-mcp-full.md', depthTuned: null, url: 'https://github.com/', title: 'GitHub' },
]

function serialize(snapshot, options) {
  return formatPublicSnapshot(toPublicSnapshot(snapshot, options))
}

function pct(from, to) {
  if (!from || from <= 0) return null
  return Math.round(((from - to) / from) * 1000) / 10
}

function n(value) {
  return value === null || value === undefined ? '—' : value.toLocaleString('en-US')
}

async function measure(ds) {
  const fullPath = resolve(DATA_DIR, ds.full)
  if (!existsSync(fullPath)) return { ...ds, missing: true }

  const rawFull = await readFile(fullPath, 'utf8')
  const rawFullTokens = countTokens(rawFull)

  let rawDepthTokens = null
  if (ds.depthTuned && existsSync(resolve(DATA_DIR, ds.depthTuned))) {
    rawDepthTokens = countTokens(await readFile(resolve(DATA_DIR, ds.depthTuned), 'utf8'))
  }

  const parsed = parseAriaDump(rawFull)
  const snapshot = buildSnapshotFromParsed(parsed, { url: ds.url, title: ds.title })

  const outlineText = serialize(snapshot, {})
  const agruneFullText = serialize(snapshot, { mode: 'full' })
  const outlineTokens = countTokens(outlineText)
  const agruneFullTokens = countTokens(agruneFullText)

  // Realistic working set: the agent reads the outline first, then expands the
  // single largest group to act. That two-step cost is what actually competes
  // with handing the model a raw snapshot up front.
  const largest = [...snapshot.groups].sort((a, b) => b.targetIds.length - a.targetIds.length)[0]
  const expandedText = largest ? serialize(snapshot, { groupIds: [largest.groupId] }) : ''
  const expandedTokens = countTokens(expandedText)
  const workingSetTokens = outlineTokens + expandedTokens

  return {
    ...ds,
    missing: false,
    actionableCount: parsed.length,
    groupCount: snapshot.groups.length,
    rawFullTokens,
    rawDepthTokens,
    outlineTokens,
    agruneFullTokens,
    expandedGroup: largest ? largest.groupName : null,
    expandedTargetCount: largest ? largest.targetIds.length : 0,
    expandedTokens,
    workingSetTokens,
  }
}

function reductionLine(label, value, rawFull, rawDepth) {
  const vsFull = pct(rawFull, value)
  const vsDepth = rawDepth ? pct(rawDepth, value) : null
  return `| ${label} | ${n(value)} | ${vsFull === null ? '—' : vsFull + '%'} | ${vsDepth === null ? '—' : vsDepth + '%'} |`
}

function renderDataset(r) {
  if (r.missing) return [`### ${r.label}\n\n_원본 덤프 누락: \`${r.full}\` — 스킵._\n`]
  const lines = []
  lines.push(`### ${r.label}  (\`${r.full}\`)`)
  lines.push('')
  lines.push(`- 액션 가능 노드: **${n(r.actionableCount)}개**, 그룹: ${n(r.groupCount)}개`)
  lines.push(`- 최대 그룹 expand: "${r.expandedGroup}" (${n(r.expandedTargetCount)} targets, ${n(r.expandedTokens)} tokens)`)
  lines.push('')
  lines.push('| 표현 | 토큰 | full 대비 절감 | depth-tuned 대비 절감 |')
  lines.push('|---|---:|---:|---:|')
  lines.push(`| raw a11y (full) | ${n(r.rawFullTokens)} | — | — |`)
  if (r.rawDepthTokens !== null) {
    lines.push(`| raw a11y (depth-tuned, baseline) | ${n(r.rawDepthTokens)} | ${pct(r.rawFullTokens, r.rawDepthTokens)}% | — |`)
  }
  lines.push(reductionLine('agrune OUTLINE (그룹+카운트+샘플)', r.outlineTokens, r.rawFullTokens, r.rawDepthTokens))
  lines.push(reductionLine('agrune OUTLINE + 최대그룹 expand (working set)', r.workingSetTokens, r.rawFullTokens, r.rawDepthTokens))
  lines.push(reductionLine('agrune FULL (전체 target ref 덤프)', r.agruneFullTokens, r.rawFullTokens, r.rawDepthTokens))
  lines.push('')
  return lines
}

async function main() {
  const results = []
  for (const ds of DATASETS) results.push(await measure(ds))

  const header = [
    '# agrune 토큰 벤치 리포트',
    '',
    `- 토크나이저: **${tokenizerMode}**${tokenizerMode === 'approx' ? ' ⚠️ (gpt-tokenizer 미설치 — chars/3.3 근사치)' : ''}`,
    `- 측정 경로: 실제 에이전트 직렬화기 \`@agrune/mcp · toPublicSnapshot → formatPublicSnapshot\``,
    `- 데이터: \`${DATA_DIR}\`의 a11y 덤프에서 액션 노드를 파싱 → 동일 집합을 agrune 스냅샷으로 직렬화 (apples-to-apples, 브라우저 불필요)`,
    '',
    '> **정직성 주의**: 핵심 baseline은 full이 아니라 **depth-tuned**다. Playwright `depth` 노브가 공짜로 절반 이상을 회수하므로, manifest의 진짜 가치는 *depth-tuned 대비* 추가 절감 + (별도 검증할) 정확도 향상이다.',
    '',
    '> **범위**: 이 벤치는 *토큰*만 측정한다. "작은 모델 정확도↑"는 라이브 모델 + 과제 실행이 필요한 별도 단계(90일 플랜 1단계의 정확도 축)로 남아 있다.',
    '',
  ]

  const body = results.flatMap(renderDataset)

  // Data-driven findings (no hardcoded numbers) from the dataset that has a
  // depth-tuned baseline — the honest comparison the strategy review demanded.
  const findings = ['## 핵심 발견 (데이터 기반)', '']
  const withBaseline = results.find(r => !r.missing && r.rawDepthTokens)
  if (withBaseline) {
    const r = withBaseline
    const outlineVsDepth = pct(r.rawDepthTokens, r.outlineTokens)
    const wsVsDepth = pct(r.rawDepthTokens, r.workingSetTokens)
    const fullVsDepth = pct(r.agruneFullTokens, r.rawDepthTokens) // negative if agrune full bigger
    findings.push(
      `1. **OUTLINE 단계 노출은 압도적 우위** — \`${r.label}\`에서 agrune outline ${n(r.outlineTokens)} 토큰은 depth-tuned baseline(${n(r.rawDepthTokens)}) 대비 **${outlineVsDepth}% 절감**. 첫 훑기/네비게이션에서 작은 모델에 줄 컨텍스트가 거의 무료에 가깝다.`,
      `2. **working set(outline + 한 그룹 expand)은 depth-tuned 대비 ${wsVsDepth}% 절감** — 실제로 act하려고 한 그룹을 펼치면 우위가 ${outlineVsDepth}%에서 ${wsVsDepth}%로 크게 줄어든다.`,
      `3. **전체 target을 한 번에 덤프하면(agrune FULL ${n(r.agruneFullTokens)}) 우위는 depth-tuned 대비 약 ${pct(r.rawDepthTokens, r.agruneFullTokens)}%에 불과** — raw 압축만으로는 moat가 약하다.`,
      '',
      '**결론**: manifest의 토큰 가치는 *전체 덤프를 압축*하는 데서가 아니라 **scoped/progressive disclosure(outline → 필요한 그룹만 expand)**에서 나온다. 따라서 차별화 서사는 "더 짧은 스냅샷"이 아니라 "작은 모델이 한 번에 봐야 할 surface를 좁혀 정확도를 올린다"여야 하고, 그 **정확도 우위는 이 토큰 벤치로는 증명되지 않으며 라이브 모델 + 과제 실행으로 별도 측정해야 한다.**',
      '',
    )
  } else {
    findings.push('_depth-tuned baseline이 있는 데이터셋이 없어 절감 비교를 생략함._', '')
  }

  const consoleLines = ['', `agrune token bench (tokenizer: ${tokenizerMode})`, '']
  for (const r of results) {
    if (r.missing) { consoleLines.push(`${r.label}: MISSING ${r.full}`); continue }
    consoleLines.push(
      `${r.label}: actionable=${r.actionableCount} groups=${r.groupCount}`,
      `  raw full        ${String(r.rawFullTokens).padStart(8)}`,
      `  raw depth-tuned ${String(r.rawDepthTokens ?? '—').padStart(8)}  (baseline)`,
      `  agrune outline  ${String(r.outlineTokens).padStart(8)}  vsDepth ${r.rawDepthTokens ? pct(r.rawDepthTokens, r.outlineTokens) + '%' : '—'}`,
      `  outline+expand  ${String(r.workingSetTokens).padStart(8)}  vsDepth ${r.rawDepthTokens ? pct(r.rawDepthTokens, r.workingSetTokens) + '%' : '—'}`,
      `  agrune full     ${String(r.agruneFullTokens).padStart(8)}  vsDepth ${r.rawDepthTokens ? pct(r.rawDepthTokens, r.agruneFullTokens) + '%' : '—'}`,
      '',
    )
  }
  console.log(consoleLines.join('\n'))

  await mkdir(OUT_DIR, { recursive: true })
  const reportPath = resolve(OUT_DIR, 'agrune-bench-report.md')
  await writeFile(reportPath, [...header, ...findings, ...body].join('\n'), 'utf8')
  console.log(`\nReport written: ${reportPath}`)
}

main().catch(err => {
  console.error('bench failed:', err)
  process.exitCode = 1
})
