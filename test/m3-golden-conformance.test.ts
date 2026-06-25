// A.7 GOLDEN CONFORMANCE VECTOR. Feeding the pinned PageSnapshot (A.7.1) into formatSnapshot
// must produce A.7.2a (outline) and A.7.2b (full) BYTE-FOR-BYTE. This is the M3 gate.

import { describe, it, expect } from 'vitest'
import { formatSnapshot, type PageSnapshot, type PageTarget } from '../src/snapshot.js'

// Build a full PageTarget from the fields the vector pins (formatSnapshot reads only
// name/targetId/repeatInstance/description/groupId/reason/textContent — the rest are defaults).
function t(partial: Partial<PageTarget> & { targetId: string; groupId: string; name: string }): PageTarget {
  return {
    description: '',
    actionKinds: ['click'],
    selector: { css: '#x' },
    visible: true,
    inViewport: true,
    enabled: true,
    covered: false,
    actionableNow: true,
    reason: 'ready',
    overlay: false,
    sensitive: false,
    sourceFile: 'page-manifest',
    sourceLine: 0,
    sourceColumn: 0,
    ...partial,
  }
}

const D = '__agrune_repeatKey_'

const snapshot: PageSnapshot = {
  schemaVersion: 3,
  version: 7,
  capturedAt: 1750000000000,
  url: 'https://example.test/app',
  title: 'Demo "App"',
  groups: [
    {
      groupId: 'login',
      groupName: 'Login Form',
      groupDesc: 'Authenticate to the app',
      targetIds: ['username_input', 'password_input'],
    },
    {
      groupId: 'todos',
      groupName: undefined,
      groupDesc: undefined,
      targetIds: [
        'new_todo_input',
        `todo_items${D}a1.todo_item_toggle`,
        `todo_items${D}b2.todo_item_toggle`,
        `todo_items${D}a1.todo_item_destroy`,
        `todo_items${D}b2.todo_item_destroy`,
      ],
      repeats: [{ repeatId: 'todo_items', strategy: 'dom', instanceCount: 4, logicalSize: null }],
    },
    { groupId: 'filters', groupName: 'Filters', groupDesc: 'Route buttons', targetIds: ['filter_all'] },
    { groupId: 'empty_group', groupName: 'Empty', groupDesc: undefined, targetIds: [] },
  ],
  targets: [
    t({ targetId: 'username_input', groupId: 'login', name: 'Username', description: 'Your account name', reason: 'ready' }),
    t({ targetId: 'password_input', groupId: 'login', name: 'Password', reason: 'sensitive', sensitive: true, valuePreview: null }),
    t({ targetId: 'new_todo_input', groupId: 'todos', name: 'New todo', reason: 'ready' }),
    t({ targetId: `todo_items${D}a1.todo_item_toggle`, groupId: 'todos', name: 'Buy milk', repeatInstance: { repeatId: 'todo_items', index: 0, key: 'a1' } }),
    t({ targetId: `todo_items${D}b2.todo_item_toggle`, groupId: 'todos', name: 'Walk dog', repeatInstance: { repeatId: 'todo_items', index: 1, key: 'b2' } }),
    t({ targetId: `todo_items${D}a1.todo_item_destroy`, groupId: 'todos', name: 'Buy milk', repeatInstance: { repeatId: 'todo_items', index: 0, key: 'a1' } }),
    t({ targetId: `todo_items${D}b2.todo_item_destroy`, groupId: 'todos', name: 'Walk dog', repeatInstance: { repeatId: 'todo_items', index: 1, key: 'b2' } }),
    t({ targetId: 'filter_all', groupId: 'filters', name: 'All', reason: 'offscreen' }),
  ],
}

const EXPECTED_OUTLINE = `### Page
- Page URL: https://example.test/app
- Page Title: Demo "App"
- Snapshot Version: 7
### Snapshot
\`\`\`yaml
- group "Login Form" [ref=login]:
  - description: "Authenticate to the app"
  - targets: 2
- group "todos" [ref=todos]:
  - targets: 5
- group "Filters" [ref=filters]:
  - description: "Route buttons"
  - targets: 1
- group "Empty" [ref=empty_group]:
  - targets: 0
\`\`\``

const EXPECTED_FULL = `### Page
- Page URL: https://example.test/app
- Page Title: Demo "App"
- Snapshot Version: 7
### Snapshot
\`\`\`yaml
- target "Username" [ref=username_input]:
  - description: "Your account name"
  - group: "login"
- target "Password" [ref=password_input]:
  - group: "login"
  - reason: sensitive
- target "New todo" [ref=new_todo_input]:
  - group: "todos"
- target "Buy milk" [ref=todo_items[key=a1].todo_item_toggle]:
  - group: "todos"
- target "Walk dog" [ref=todo_items[key=b2].todo_item_toggle]:
  - group: "todos"
- target "Buy milk" [ref=todo_items[key=a1].todo_item_destroy]:
  - group: "todos"
- target "Walk dog" [ref=todo_items[key=b2].todo_item_destroy]:
  - group: "todos"
- target "All" [ref=filter_all]:
  - group: "filters"
  - reason: offscreen
\`\`\``

describe('M3 — A.7 golden conformance vector (byte-for-byte)', () => {
  it('A.7.2a — outline mode', () => {
    expect(formatSnapshot(snapshot)).toBe(EXPECTED_OUTLINE)
  })

  it('A.7.2b — full mode', () => {
    expect(formatSnapshot(snapshot, { full: true })).toBe(EXPECTED_FULL)
  })

  it('- none fallback when nothing is rendered', () => {
    const empty: PageSnapshot = { ...snapshot, groups: [], targets: [] }
    expect(formatSnapshot(empty)).toBe(
      `### Page
- Page URL: https://example.test/app
- Page Title: Demo "App"
- Snapshot Version: 7
### Snapshot
\`\`\`yaml
- none
\`\`\``,
    )
  })

  it('single-group filter flips to full mode and restricts output', () => {
    const out = formatSnapshot(snapshot, { groupId: 'login' })
    expect(out).toContain('- target "Username" [ref=username_input]:')
    expect(out).toContain('- target "Password" [ref=password_input]:')
    expect(out).not.toContain('New todo')
  })
})
