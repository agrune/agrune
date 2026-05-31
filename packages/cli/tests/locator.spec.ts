import { describe, expect, it, vi } from 'vitest'
import { buildLocatorCandidates, resolveLocator } from '../src/locator'

function fakeLocator(count: number, label: string) {
  const locator = {
    label,
    count: vi.fn(async () => count),
    first: vi.fn(() => locator),
  }
  return locator
}

describe('resolveLocator', () => {
  it('follows runtime selector priority and skips empty candidates', async () => {
    const role = fakeLocator(0, 'role')
    const text = fakeLocator(1, 'text')
    const testId = fakeLocator(1, 'testId')
    const scope = {
      getByRole: vi.fn(() => role),
      getByText: vi.fn(() => text),
      getByTestId: vi.fn(() => testId),
      locator: vi.fn(() => fakeLocator(0, 'css')),
    }

    const resolved = await resolveLocator(scope as never, {
      role: { name: 'button', level: 'Save' },
      text: 'Save',
      testId: 'save-button',
    })

    expect(resolved?.strategy).toBe('text')
    expect(resolved?.locator).toBe(text)
    expect(scope.getByRole).toHaveBeenCalledWith('button', { name: 'Save' })
  })

  it('builds attr and css locators through Playwright locator()', () => {
    const scope = {
      getByRole: vi.fn(),
      getByText: vi.fn(),
      getByTestId: vi.fn(),
      locator: vi.fn(selector => fakeLocator(1, selector)),
    }

    const candidates = buildLocatorCandidates(scope as never, {
      attr: '[data-action="save"]',
      css: '[data-testid="save"]',
    })

    expect(candidates.map(candidate => candidate.strategy)).toEqual(['attr', 'css'])
    expect(scope.locator).toHaveBeenCalledWith('[data-action="save"]')
    expect(scope.locator).toHaveBeenCalledWith('[data-testid="save"]')
  })
})
