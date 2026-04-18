import type { PageSnapshot, PageTarget, Session } from '@agrune/core'
import type { TabId, InboundMessage } from './types.js'
import { DevtoolsWsClient } from './ws-client.js'
import { LogsView } from './logs-view.js'
import { SessionsView } from './sessions-view.js'
import { HitlToolbar } from './hitl-toolbar.js'

// --- Snapshot state (unchanged semantics) ---
let snapshot: PageSnapshot | null = null
let selectedTargetId: string | null = null
let paused = false
const collapsedGroups = new Set<string>()
let sessions: Session[] = []
let subscribedTabId: number | null = null

// --- DOM refs ---
const connectionStatus = document.getElementById('connectionStatus') as HTMLSpanElement
const tabSelect = document.getElementById('tabSelect') as HTMLSelectElement
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
const snapshotInfo = document.getElementById('snapshotInfo') as HTMLSpanElement
const reasonFilter = document.getElementById('reasonFilter') as HTMLSelectElement
const actionFilter = document.getElementById('actionFilter') as HTMLSelectElement
const searchInput = document.getElementById('searchInput') as HTMLInputElement
const targetList = document.getElementById('targetList') as HTMLDivElement
const detailPane = document.getElementById('detailPane') as HTMLDivElement
const tabBar = document.getElementById('tabBar') as HTMLDivElement
const hitlRoot = document.getElementById('hitlToolbar') as HTMLDivElement
const logsRoot = document.getElementById('logsRoot') as HTMLDivElement
const sessionsRoot = document.getElementById('sessionsRoot') as HTMLDivElement
const viewNodes = Array.from(document.querySelectorAll<HTMLElement>('.view'))
const tabButtons = Array.from(tabBar.querySelectorAll<HTMLButtonElement>('.tab-btn'))

// --- WebSocket ---
const ws = new DevtoolsWsClient()
ws.onStatusChange((connected) => setConnectionStatus(connected))
ws.onMessage((msg) => handleMessage(msg))

// --- Subviews ---
const logsView = new LogsView(logsRoot)
const sessionsView = new SessionsView(sessionsRoot, ws)
const hitlToolbar = new HitlToolbar(hitlRoot, ws)

// --- Tab switching ---
function setTab(tab: TabId): void {
  tabButtons.forEach(btn => {
    btn.classList.toggle('tab-active', btn.dataset.tab === tab)
  })
  viewNodes.forEach(node => {
    const isActive = node.dataset.view === tab
    node.hidden = !isActive
    node.classList.toggle('view-active', isActive)
  })
}
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab as TabId | undefined
    if (tab) setTab(tab)
  })
})

function setConnectionStatus(connected: boolean): void {
  connectionStatus.className = connected ? 'status-dot connected' : 'status-dot disconnected'
  connectionStatus.title = connected ? 'Connected' : 'Disconnected. Retrying…'
}

function handleMessage(msg: InboundMessage): void {
  switch (msg.type) {
    case 'sessions_update': {
      sessions = msg.data
      updateTabSelect()
      sessionsView.update(sessions)
      return
    }
    case 'snapshot_update': {
      const payload = msg.data as { tabId: number; snapshot: PageSnapshot }
      if (!paused) {
        snapshot = payload.snapshot
        render()
      }
      return
    }
    case 'command_event': {
      logsView.ingest(msg.data)
      return
    }
    case 'command_backfill': {
      logsView.ingestBackfill(msg.data)
      return
    }
    case 'hitl_state': {
      hitlToolbar.update(msg.data)
      return
    }
  }
}

function updateTabSelect(): void {
  const currentValue = tabSelect.value
  tabSelect.innerHTML = sessions.length === 0
    ? '<option value="">No sessions</option>'
    : sessions.map(s =>
        `<option value="${s.tabId}"${String(s.tabId) === currentValue ? ' selected' : ''}>${escapeText(s.title || s.url)} (tab ${s.tabId})</option>`
      ).join('')

  if (sessions.length > 0 && (subscribedTabId == null || !sessions.some(s => s.tabId === subscribedTabId))) {
    tabSelect.value = String(sessions[0].tabId)
    subscribeToTab(sessions[0].tabId)
  }
}

function subscribeToTab(tabId: number): void {
  subscribedTabId = tabId
  snapshot = null
  selectedTargetId = null
  render()
  ws.send({ type: 'subscribe', tabId })
}

tabSelect.addEventListener('change', () => {
  const tabId = Number(tabSelect.value)
  if (!isNaN(tabId) && tabId > 0) subscribeToTab(tabId)
})

pauseBtn.addEventListener('click', () => {
  paused = !paused
  pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause'
  pauseBtn.classList.toggle('paused', paused)
})

reasonFilter.addEventListener('change', render)
actionFilter.addEventListener('change', render)
searchInput.addEventListener('input', render)

function reasonClass(reason: string): string {
  if (reason === 'hidden') return 'hidden-reason'
  return reason
}

function render() {
  if (!snapshot) {
    snapshotInfo.textContent = 'Waiting for snapshot...'
    targetList.innerHTML = ''
    detailPane.innerHTML = '<p class="empty-detail">No snapshot yet</p>'
    return
  }

  const elapsed = ((Date.now() - snapshot.capturedAt) / 1000).toFixed(1)
  snapshotInfo.textContent = `v${snapshot.version} · ${elapsed}s ago · ${snapshot.targets.length} targets`

  const reasons = [...new Set(snapshot.targets.map(t => t.reason))]
  const currentReason = reasonFilter.value
  reasonFilter.innerHTML = '<option value="">All reasons</option>' +
    reasons.map(r => `<option value="${r}"${r === currentReason ? ' selected' : ''}>${r}</option>`).join('')

  const actionKinds = [...new Set(snapshot.targets.flatMap(t => t.actionKinds))]
  const currentAction = actionFilter.value
  actionFilter.innerHTML = '<option value="">All actions</option>' +
    actionKinds.map(k => `<option value="${k}"${k === currentAction ? ' selected' : ''}>${k}</option>`).join('')

  const rFilter = reasonFilter.value
  const aFilter = actionFilter.value
  const search = searchInput.value.toLowerCase()

  targetList.innerHTML = ''
  for (const group of snapshot.groups) {
    const groupTargets = group.targetIds
      .map(id => snapshot!.targets.find(t => t.targetId === id))
      .filter((t): t is PageTarget => !!t)
      .filter(t => !rFilter || t.reason === rFilter)
      .filter(t => !aFilter || t.actionKinds.includes(aFilter as PageTarget['actionKinds'][number]))
      .filter(t => !search || t.name.toLowerCase().includes(search) || (t.groupName ?? '').toLowerCase().includes(search) || (t.textContent ?? '').toLowerCase().includes(search))

    if (groupTargets.length === 0) continue

    const collapsed = collapsedGroups.has(group.groupId)

    const header = document.createElement('div')
    header.className = 'group-header'
    header.innerHTML = `<span>${collapsed ? '▸' : '▾'} ${group.groupName ?? group.groupId} <span class="group-desc">${group.groupDesc ? '— ' + group.groupDesc : ''}</span></span><span class="group-count">${groupTargets.length}</span>`
    header.addEventListener('click', () => {
      if (collapsedGroups.has(group.groupId)) collapsedGroups.delete(group.groupId)
      else collapsedGroups.add(group.groupId)
      render()
    })
    targetList.appendChild(header)

    if (collapsed) continue

    for (const target of groupTargets) {
      const row = document.createElement('div')
      row.className = 'target-row' + (target.targetId === selectedTargetId ? ' selected' : '')
      row.innerHTML = `<span class="reason-dot ${reasonClass(target.reason)}">●</span><span class="target-name${target.reason !== 'ready' ? ' not-ready' : ''}">${target.name}</span><span class="target-action">${target.actionKinds.join(', ')}</span><span class="reason-badge ${reasonClass(target.reason)}">${target.reason}</span>`
      row.addEventListener('click', () => {
        selectedTargetId = target.targetId
        render()
        highlightInPage(target)
      })
      targetList.appendChild(row)
    }
  }

  renderDetail()
}

function renderDetail() {
  if (!snapshot || !selectedTargetId) {
    detailPane.innerHTML = '<p class="empty-detail">Select a target</p>'
    return
  }

  const target = snapshot.targets.find(t => t.targetId === selectedTargetId)
  if (!target) {
    detailPane.innerHTML = '<p class="empty-detail">Target not found in current snapshot</p>'
    return
  }

  const boolCell = (v: boolean) => `<span class="${v ? 'detail-bool-true' : 'detail-bool-false'}">${v}</span>`

  detailPane.innerHTML = `
    <div class="detail-name">${target.name}</div>
    <div class="detail-group">${target.groupName ?? target.groupId} group</div>
    <table class="detail-table">
      <tr><td>targetId</td><td>${target.targetId}</td></tr>
      <tr><td>actionKinds</td><td>${target.actionKinds.map(k => `<span class="action-badge">${k}</span>`).join(' ')}</td></tr>
      <tr><td>visible</td><td>${boolCell(target.visible)}</td></tr>
      <tr><td>enabled</td><td>${boolCell(target.enabled)}</td></tr>
      <tr><td>inViewport</td><td>${boolCell(target.inViewport)}</td></tr>
      <tr><td>covered</td><td>${boolCell(target.covered)}</td></tr>
      <tr><td>actionableNow</td><td>${boolCell(target.actionableNow)}</td></tr>
      <tr><td>reason</td><td><span class="reason-badge ${reasonClass(target.reason)}">${target.reason}</span></td></tr>
      <tr><td>sensitive</td><td>${target.sensitive ? '<span class="detail-bool-false">true</span>' : boolCell(false)}</td></tr>
      <tr><td>selector</td><td style="color:#89dceb;font-size:9px;">${target.selector}</td></tr>
      <tr><td>textContent</td><td>${target.textContent ? target.textContent : '<span style="color:#585b70;font-style:italic;">—</span>'}</td></tr>
      <tr><td>valuePreview</td><td>${target.valuePreview ?? '<span style="color:#585b70;font-style:italic;">—</span>'}</td></tr>
    </table>
    <div class="detail-source">
      <div class="detail-source-label">Source</div>
      <div class="detail-source-link">${target.sourceFile}:${target.sourceLine}:${target.sourceColumn}</div>
    </div>
    <button class="highlight-btn" id="highlightBtn">Highlight in Page</button>
  `

  document.getElementById('highlightBtn')?.addEventListener('click', () => {
    highlightInPage(target)
  })
}

function highlightInPage(target: PageTarget) {
  ws.send({ type: 'highlight', targetId: target.targetId })
}

function escapeText(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// --- Inline status dot CSS kept from original panel.ts ---
const style = document.createElement('style')
style.textContent = `
  .status-dot { font-size: 14px; line-height: 1; }
  .status-dot.connected { color: #a6e3a1; }
  .status-dot.disconnected { color: #f38ba8; }
  #tabSelect { max-width: 200px; }
`
document.head.appendChild(style)

// Silence unused import warning for subviews (retained for side-effects only).
void logsView
void sessionsView
void hitlToolbar

// --- Initial boot ---
setTab('snapshot')
render()
ws.connect()
