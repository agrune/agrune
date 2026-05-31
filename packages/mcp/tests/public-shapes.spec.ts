import { describe, expect, it } from 'vitest'
import type { CommandResult, PageSnapshot } from '@agrune/core'
import {
  formatPublicSnapshot,
  toPublicCommandResult,
  toPublicSession,
  toPublicSnapshot,
} from '../src/public-shapes.js'

describe('public MCP shapes', () => {
  it('sessions omit embedded snapshots and expose summary fields only', () => {
    const session = {
      tabId: 42,
      url: 'http://localhost:5173',
      title: '',
      openedAt: 1,
      snapshot: {
        schemaVersion: 3,
        version: 3,
        capturedAt: 1,
        url: 'http://localhost:5173',
        title: 'Project Management Tool',
        groups: [],
        targets: [],
      },
    }

    expect(toPublicSession(session)).toEqual({
      tabId: 42,
      url: 'http://localhost:5173',
      title: 'Project Management Tool',
      hasSnapshot: true,
      snapshotVersion: 3,
      active: false,
    })
  })

  it('passes through session.active when provided', () => {
    const session = {
      tabId: 7,
      url: 'https://a.com',
      title: 'A',
      hasSnapshot: false,
      snapshotVersion: null,
      active: true,
    }
    expect(toPublicSession(session)).toEqual({
      tabId: 7,
      url: 'https://a.com',
      title: 'A',
      hasSnapshot: false,
      snapshotVersion: null,
      active: true,
    })
  })

  it('toPublicSessionMeta carries wasActive/becameActive', async () => {
    const { toPublicSessionMeta } = await import('../src/public-shapes.js')
    const session = {
      tabId: 11,
      url: 'https://b.com',
      title: 'B',
      hasSnapshot: false,
      snapshotVersion: null,
    }
    expect(toPublicSessionMeta(session, { wasActive: false, becameActive: true })).toEqual({
      tabId: 11,
      url: 'https://b.com',
      title: 'B',
      wasActive: false,
      becameActive: true,
    })
  })

  it('snapshots default to an active-context group outline', () => {
    const snapshot: PageSnapshot = {
      schemaVersion: 3,
      version: 7,
      capturedAt: 123,
      url: 'http://localhost:5173',
      title: 'Project Management Tool',
      groups: [
        {
          groupId: 'tabs',
          groupName: 'Navigation Tabs',
          groupDesc: 'Main navigation',
          targetIds: ['tab-board', 'tab-docs'],
        },
        {
          groupId: 'modal',
          groupName: 'Share Modal',
          groupDesc: 'Sharing controls',
          targetIds: ['modal-close'],
        },
      ],
      targets: [
        {
          targetId: 'tab-board',
          groupId: 'tabs',
          groupName: 'Navigation Tabs',
          groupDesc: 'Main navigation',
          name: 'Board Tab',
          description: 'Open the board view',
          actionKinds: ['click'],
          selector: { css: '[data-testid="tab-board"]' },
          visible: true,
          inViewport: true,
          enabled: true,
          covered: false,
          actionableNow: true,
          reason: 'ready',
          overlay: false,
          sensitive: false,
          textContent: 'Board',
          valuePreview: null,
          sourceFile: 'App.tsx',
          sourceLine: 10,
          sourceColumn: 4,
        },
        {
          targetId: 'tab-docs',
          groupId: 'tabs',
          groupName: 'Navigation Tabs',
          groupDesc: 'Main navigation',
          name: 'Docs Tab',
          description: 'Open the docs view',
          actionKinds: ['click'],
          selector: { css: '[data-testid="tab-docs"]' },
          visible: true,
          inViewport: true,
          enabled: true,
          covered: true,
          actionableNow: false,
          reason: 'covered',
          overlay: false,
          sensitive: false,
          textContent: 'Docs',
          valuePreview: null,
          sourceFile: 'App.tsx',
          sourceLine: 11,
          sourceColumn: 4,
        },
        {
          targetId: 'modal-close',
          groupId: 'modal',
          groupName: 'Share Modal',
          groupDesc: 'Sharing controls',
          name: 'Close Modal',
          description: 'Close the sharing dialog',
          actionKinds: ['click'],
          selector: { css: '[data-testid="modal-close"]' },
          visible: true,
          inViewport: true,
          enabled: true,
          covered: false,
          actionableNow: true,
          reason: 'ready',
          overlay: true,
          sensitive: false,
          textContent: 'Close',
          valuePreview: null,
          sourceFile: 'Modal.tsx',
          sourceLine: 20,
          sourceColumn: 4,
        },
      ],
    }

    const publicSnapshot = toPublicSnapshot(snapshot)

    expect(publicSnapshot).toEqual({
      version: 7,
      url: 'http://localhost:5173',
      title: 'Project Management Tool',
      context: 'overlay',
      groups: [
        {
          groupId: 'modal',
          groupName: 'Share Modal',
          groupDesc: 'Sharing controls',
          targetCount: 1,
          sampleTargetNames: ['Close Modal'],
        },
      ],
    })
    expect(JSON.stringify(publicSnapshot)).not.toContain('actionKinds')

    const formatted = formatPublicSnapshot(publicSnapshot)
    expect(formatted).toContain('### Page')
    expect(formatted).toContain('```yaml')
    expect(formatted).toContain('- group "Share Modal" [ref=modal]:')
    expect(formatted).toContain('- samples: "Close Modal"')
    expect(formatted).not.toContain('actionKinds')
    expect(formatted).not.toContain('selector')
    expect(formatted).not.toContain('targetId')
  })

  it('snapshots expand only the requested groups within the active context', () => {
    const snapshot: PageSnapshot = {
      schemaVersion: 3,
      version: 8,
      capturedAt: 123,
      url: 'http://localhost:5173',
      title: 'Project Management Tool',
      groups: [
        {
          groupId: 'tabs',
          groupName: 'Navigation Tabs',
          groupDesc: 'Main navigation',
          targetIds: ['tab-board'],
        },
        {
          groupId: 'filters',
          groupName: 'Filters',
          groupDesc: 'Board filters',
          targetIds: ['filter-search'],
        },
      ],
      targets: [
        {
          targetId: 'tab-board',
          groupId: 'tabs',
          groupName: 'Navigation Tabs',
          groupDesc: 'Main navigation',
          name: 'Board Tab',
          description: 'Open the board view',
          actionKinds: ['click'],
          selector: { css: '[data-testid="tab-board"]' },
          visible: true,
          inViewport: true,
          enabled: true,
          covered: false,
          actionableNow: true,
          reason: 'ready',
          overlay: false,
          sensitive: false,
          textContent: 'Board',
          valuePreview: null,
          sourceFile: 'App.tsx',
          sourceLine: 10,
          sourceColumn: 4,
        },
        {
          targetId: 'filter-search',
          groupId: 'filters',
          groupName: 'Filters',
          groupDesc: 'Board filters',
          name: 'Search Filter',
          description: 'Filter cards by keyword',
          actionKinds: ['fill'],
          selector: { css: '[data-testid="filter-search"]' },
          visible: true,
          inViewport: true,
          enabled: true,
          covered: false,
          actionableNow: true,
          reason: 'ready',
          overlay: false,
          sensitive: false,
          textContent: '',
          valuePreview: '',
          sourceFile: 'Filters.tsx',
          sourceLine: 4,
          sourceColumn: 2,
        },
      ],
    }

    const publicSnapshot = toPublicSnapshot(snapshot, { groupIds: ['filters'] })

    expect(publicSnapshot).toEqual({
      version: 8,
      url: 'http://localhost:5173',
      title: 'Project Management Tool',
      context: 'page',
      targets: [
        {
          ref: 'filter-search',
          groupId: 'filters',
          name: 'Search Filter',
          description: 'Filter cards by keyword',
        },
      ],
    })
    expect(JSON.stringify(publicSnapshot)).not.toContain('actionKinds')

    const formatted = formatPublicSnapshot(publicSnapshot)
    expect(formatted).toContain('- group "filters" [ref=filters]:')
    expect(formatted).toContain('  - target "Search Filter" [ref=filter-search]:')
    expect(formatted).toContain('- description: "Filter cards by keyword"')
    expect(formatted).not.toContain('actionKinds')
    expect(formatted).not.toContain('selector')
    expect(formatted).not.toContain('targetId')
  })

  it('full snapshots include manifest targets that are unresolved in the DOM', () => {
    const snapshot: PageSnapshot = {
      schemaVersion: 3,
      version: 9,
      capturedAt: 123,
      url: 'http://localhost:5173',
      title: 'Broken Target',
      groups: [{
        groupId: 'main',
        groupName: 'Main',
        targetIds: ['save_button', 'missing_button'],
      }],
      targets: [
        {
          targetId: 'save_button',
          groupId: 'main',
          groupName: 'Main',
          name: 'Save',
          description: '',
          actionKinds: ['click'],
          selector: { css: '[data-testid="save"]' },
          visible: true,
          inViewport: true,
          enabled: true,
          covered: false,
          actionableNow: true,
          reason: 'ready',
          overlay: false,
          sensitive: false,
          sourceFile: 'App.tsx',
          sourceLine: 1,
          sourceColumn: 1,
        },
        {
          targetId: 'missing_button',
          groupId: 'main',
          groupName: 'Main',
          name: 'Missing',
          description: 'Declared but selector does not match',
          actionKinds: ['click'],
          selector: { css: '[data-testid="missing"]' },
          visible: false,
          inViewport: false,
          enabled: false,
          covered: false,
          actionableNow: false,
          domResolved: false,
          reason: 'hidden',
          overlay: false,
          sensitive: false,
          sourceFile: 'App.tsx',
          sourceLine: 2,
          sourceColumn: 1,
        },
      ],
    }

    const publicSnapshot = toPublicSnapshot(snapshot, { mode: 'full' })
    expect(publicSnapshot.targets?.map(target => target.ref)).toEqual(['save_button', 'missing_button'])
    expect(publicSnapshot.targets?.find(target => target.ref === 'missing_button')).toMatchObject({
      unresolved: true,
      reason: 'hidden',
    })

    const formatted = formatPublicSnapshot(publicSnapshot)
    expect(formatted).toContain('- target "Save" [ref=save_button]:')
    expect(formatted).toContain('- target "Missing" [ref=missing_button] [unresolved reason=hidden]:')
  })

  it('command results omit embedded snapshots', () => {
    const result: CommandResult = {
      commandId: 'tab-board',
      ok: true,
      result: { actionKind: 'click', targetId: 'tab-board' },
      snapshotVersion: 9,
      snapshot: {
        schemaVersion: 3,
        version: 9,
        capturedAt: 1,
        url: 'http://localhost:5173',
        title: 'Project Management Tool',
        groups: [],
        targets: [],
      },
    }

    expect(toPublicCommandResult(result)).toEqual({
      commandId: 'tab-board',
      ok: true,
      result: { actionKind: 'click', targetId: 'tab-board' },
    })
  })
})
