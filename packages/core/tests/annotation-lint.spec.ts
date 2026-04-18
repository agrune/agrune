import { describe, it, expect } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanFile, scanSource } from '../src/annotation-lint/index.js'
import { suggestAttribute, levenshtein } from '../src/annotation-lint/rules.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIX = join(__dirname, '..', 'src', 'annotation-lint', '__fixtures__')

describe('annotation-lint scanner', () => {
  it('clean fixture has zero diagnostics', async () => {
    const diags = await scanFile(join(FIX, 'ok.tsx'))
    expect(diags).toEqual([])
  })

  it('reports missing-name', async () => {
    const diags = await scanFile(join(FIX, 'missing-name.tsx'))
    expect(diags.map(d => d.code)).toContain('missing-name')
  })

  it('reports missing-desc on html', async () => {
    const diags = await scanFile(join(FIX, 'missing-desc.html'))
    expect(diags.map(d => d.code)).toContain('missing-desc')
  })

  it('reports duplicate-key once for each repeat', async () => {
    const diags = await scanFile(join(FIX, 'duplicate-key.tsx'))
    const dupes = diags.filter(d => d.code === 'duplicate-key')
    expect(dupes.length).toBe(1)
  })

  it('reports typo-attribute with suggestion', async () => {
    const diags = await scanFile(join(FIX, 'typo.html'))
    const typo = diags.find(d => d.code === 'typo-attribute')
    expect(typo?.message).toContain('data-agrune-action')
  })

  it('reports invalid-action', async () => {
    const diags = await scanFile(join(FIX, 'invalid-action.tsx'))
    const bad = diags.find(d => d.code === 'invalid-action')
    expect(bad?.message).toContain('tap')
  })

  it('reports orphan-group-meta', async () => {
    const diags = await scanFile(join(FIX, 'group-orphan.tsx'))
    const orph = diags.find(d => d.code === 'orphan-group-meta')
    expect(orph).toBeTruthy()
  })

  it('scanSource is synchronous and pure', () => {
    const diags = scanSource(
      '<button data-agrune-action="click" data-agrune-name="x" data-agrune-desc="y"></button>',
      { file: 'inline.html' },
    )
    expect(diags).toEqual([])
  })

  it('levenshtein distance matches known values', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', 'abc')).toBe(0)
  })

  it('suggestAttribute finds near-miss', () => {
    expect(suggestAttribute('data-agurne-action')).toBe('data-agrune-action')
    expect(suggestAttribute('data-agrune-action')).toBeNull()
    expect(suggestAttribute('data-foo-bar')).toBeNull()
  })
})
