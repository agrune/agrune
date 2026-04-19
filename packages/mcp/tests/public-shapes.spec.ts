import { describe, expect, it } from 'vitest'
import type { CommandResult, PageSnapshot } from '@agrune/core'
import {
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
          selector: { css: '[data-agrune-key="tab-board"]' },
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
          selector: { css: '[data-agrune-key="tab-docs"]' },
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
          selector: { css: '[data-agrune-key="modal-close"]' },
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

    expect(toPublicSnapshot(snapshot)).toEqual({
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
          actionKinds: ['click'],
          sampleTargetNames: ['Close Modal'],
        },
      ],
    })
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
          selector: { css: '[data-agrune-key="tab-board"]' },
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
          selector: { css: '[data-agrune-key="filter-search"]' },
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

    expect(toPublicSnapshot(snapshot, { groupIds: ['filters'] })).toEqual({
      version: 8,
      url: 'http://localhost:5173',
      title: 'Project Management Tool',
      context: 'page',
      targets: [
        {
          targetId: 'filter-search',
          groupId: 'filters',
          name: 'Search Filter',
          description: 'Filter cards by keyword',
          actionKinds: ['fill'],
        },
      ],
    })
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
