import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import type { CommandResult, PageSnapshot, PageTarget, SessionSnapshot } from './types.js'

type TuiAppProps = {
  baseUrl: string
  token: string
  onExit: () => Promise<void> | void
}

type StatusPayload = {
  activeSessionId: string | null
  config: {
    clickDelayMs: number
    pointerAnimation: boolean
    autoScroll: boolean
  }
  sessionCount: number
}

type TuiData = {
  status: StatusPayload | null
  sessions: SessionSnapshot[]
  snapshot: PageSnapshot | null
  logs: Array<{ at: number; message: string; kind: string }>
}

type ActionGroupModel = {
  groupId: string
  label: string
  description?: string
  targets: PageTarget[]
  actionableCount: number
}

type ActionRow =
  | { type: 'group'; group: ActionGroupModel }
  | { type: 'target'; group: ActionGroupModel; target: PageTarget }

function isOverlayLikeTarget(target: PageTarget): boolean {
  const text = `${target.groupId} ${target.groupName ?? ''} ${target.groupDesc ?? ''}`.toLowerCase()
  return (
    target.overlay ||
    text.includes('modal') ||
    text.includes('drawer') ||
    text.includes('dialog') ||
    text.includes('launchpad')
  )
}

function sliceWindow<T>(items: T[], selectedIndex: number, windowSize: number): T[] {
  if (items.length <= windowSize) {
    return items
  }

  const safeIndex = Math.max(0, Math.min(selectedIndex, items.length - 1))
  const half = Math.floor(windowSize / 2)
  const start = Math.max(0, Math.min(safeIndex - half, items.length - windowSize))
  return items.slice(start, start + windowSize)
}

function toPreviewLines(value: string, maxLines = 6, maxWidth = 62): string[] {
  const normalized = value.replace(/\s+$/g, '')
  const rawLines = normalized.split('\n').flatMap(line => {
    if (line.length <= maxWidth) {
      return [line]
    }

    const chunks: string[] = []
    for (let index = 0; index < line.length; index += maxWidth) {
      chunks.push(line.slice(index, index + maxWidth))
    }
    return chunks
  })

  if (rawLines.length <= maxLines) {
    return rawLines
  }

  return [...rawLines.slice(0, maxLines - 1), '...']
}

function getTargetStatus(target: PageTarget): string {
  if (!target.visible) return 'hidden'
  if ((target.inViewport ?? target.visible) === false) return 'offscreen'
  if ((target.covered ?? false) === true) return 'covered'
  if (!target.enabled) return 'disabled'
  return 'ready'
}

function canExecuteTarget(target: PageTarget): boolean {
  return (
    target.actionableNow ??
    (target.visible &&
      target.enabled &&
      (target.inViewport ?? target.visible) &&
      !(target.covered ?? false))
  )
}

async function apiRequest<T>(
  baseUrl: string,
  token: string,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(new URL(pathname, baseUrl), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as T) : ({} as T)
  if (!response.ok) {
    throw new Error(`${response.status} ${text}`)
  }
  return payload
}

async function apiRequestOrNull<T>(
  baseUrl: string,
  token: string,
  pathname: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    return await apiRequest<T>(baseUrl, token, pathname, init)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith('404 ')) {
      return null
    }
    throw error
  }
}

export function CompanionTuiApp({ baseUrl, token, onExit }: TuiAppProps) {
  const { exit } = useApp()
  const [data, setData] = useState<TuiData>({
    status: null,
    sessions: [],
    snapshot: null,
    logs: [],
  })
  const [activePanel, setActivePanel] = useState(1)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedActionRow, setSelectedActionRow] = useState(0)
  const [selectedSetting, setSelectedSetting] = useState(0)
  const [lastResult, setLastResult] = useState<string>('아직 실행 결과가 없습니다.')
  const [fillDraft, setFillDraft] = useState<{ targetId: string; value: string } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const panelLabels = ['Sessions', 'Live Actions', 'Details', 'Settings'] as const

  const selectedSessionIndex = Math.max(
    0,
    data.sessions.findIndex(session => session.id === selectedSessionId),
  )
  const selectedSessionItem =
    (selectedSessionId
      ? data.sessions.find(session => session.id === selectedSessionId)
      : null) ??
    data.sessions[0] ??
    null

  const groupedActions = useMemo<ActionGroupModel[]>(() => {
    if (!data.snapshot) return []

    const sourceTargets = (() => {
      const overlayTargets = data.snapshot.targets.filter(
        target => isOverlayLikeTarget(target) && canExecuteTarget(target),
      )
      if (overlayTargets.length > 0) {
        const overlayGroupIds = new Set(overlayTargets.map(target => target.groupId))
        return data.snapshot.targets.filter(target => overlayGroupIds.has(target.groupId))
      }
      return data.snapshot.targets
    })()

    const byGroup = new Map<string, PageTarget[]>()
    for (const target of sourceTargets) {
      const items = byGroup.get(target.groupId) ?? []
      items.push(target)
      byGroup.set(target.groupId, items)
    }

    const seenGroupIds = new Set<string>()
    return data.snapshot.groups
      .filter(group => {
        if (seenGroupIds.has(group.groupId)) {
          return false
        }
        seenGroupIds.add(group.groupId)
        return true
      })
      .map(group => {
        const seenTargetIds = new Set<string>()
        const targets = (byGroup.get(group.groupId) ?? [])
          .slice()
          .filter(target => {
            if (seenTargetIds.has(target.targetId)) {
              return false
            }
            seenTargetIds.add(target.targetId)
            return true
          })
          .sort((left, right) => left.name.localeCompare(right.name))
        return {
          groupId: group.groupId,
          label: group.groupName ?? group.groupId,
          description: group.groupDesc,
          targets,
          actionableCount: targets.filter(canExecuteTarget).length,
        }
      })
      .filter(group => group.targets.length > 0)
  }, [data.snapshot])

  const actionRows = useMemo<ActionRow[]>(() => {
    return groupedActions.flatMap(group => {
      const header: ActionRow = { type: 'group', group }
      if (collapsedGroups[group.groupId] ?? true) {
        return [header]
      }
      return [header, ...group.targets.map(target => ({ type: 'target' as const, group, target }))]
    })
  }, [collapsedGroups, groupedActions])

  const selectedActionItem = actionRows[selectedActionRow] ?? null
  const selectedTarget = selectedActionItem?.type === 'target' ? selectedActionItem.target : null

  const visibleClickTargets = useMemo(
    () =>
      (data.snapshot?.targets ?? []).filter(
        target => target.actionKind === 'click' && canExecuteTarget(target),
      ),
    [data.snapshot],
  )

  const sessionRows = useMemo(
    () => sliceWindow(data.sessions, selectedSessionIndex, 8),
    [data.sessions, selectedSessionIndex],
  )
  const actionWindow = useMemo(
    () => sliceWindow(actionRows, selectedActionRow, 14),
    [actionRows, selectedActionRow],
  )
  const logRows = useMemo(() => data.logs.slice(0, 8), [data.logs])
  const detailRows = useMemo(() => toPreviewLines(lastResult), [lastResult])

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(current => ({
      ...current,
      [groupId]: !(current[groupId] ?? true),
    }))
  }

  const collapseGroup = (groupId: string) => {
    setCollapsedGroups(current => ({
      ...current,
      [groupId]: true,
    }))
  }

  const expandGroup = (groupId: string) => {
    setCollapsedGroups(current => ({
      ...current,
      [groupId]: false,
    }))
  }

  const refresh = async () => {
    const status = await apiRequest<StatusPayload>(baseUrl, token, '/api/status')
    const sessionsPayload = await apiRequest<{ sessions: SessionSnapshot[] }>(
      baseUrl,
      token,
      '/api/sessions',
    )
    const nextSelectedSession =
      (selectedSessionId
        ? sessionsPayload.sessions.find(session => session.id === selectedSessionId)
        : null) ??
      null
    const activeSession =
      sessionsPayload.sessions.find(session => session.id === status.activeSessionId) ?? null
    const sessionId = nextSelectedSession?.id ?? activeSession?.id ?? null
    const snapshotPayload =
      sessionId === null
        ? { snapshot: null }
        : ((await apiRequestOrNull<{ snapshot: PageSnapshot | null }>(
            baseUrl,
            token,
            `/api/snapshot?sessionId=${encodeURIComponent(sessionId)}`,
          )) ?? { snapshot: null })
    const logsPayload = await apiRequest<{ logs: Array<{ at: number; message: string; kind: string }> }>(
      baseUrl,
      token,
      '/api/logs?limit=20',
    )

    setData({
      status,
      sessions: sessionsPayload.sessions,
      snapshot: snapshotPayload.snapshot,
      logs: logsPayload.logs,
    })
  }

  useEffect(() => {
    void refresh().catch(error => {
      setLastResult(error instanceof Error ? error.message : String(error))
    })
    const timer = setInterval(() => {
      void refresh().catch(error => {
        setLastResult(error instanceof Error ? error.message : String(error))
      })
    }, 750)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (data.sessions.length === 0) {
      if (selectedSessionId !== null) {
        setSelectedSessionId(null)
      }
      return
    }

    const hasSelected =
      selectedSessionId !== null &&
      data.sessions.some(session => session.id === selectedSessionId)
    if (hasSelected) {
      return
    }

    const activeSession =
      (data.status?.activeSessionId
        ? data.sessions.find(session => session.id === data.status?.activeSessionId)
        : null) ?? data.sessions[0]

    if (activeSession) {
      setSelectedSessionId(activeSession.id)
    }
  }, [data.sessions, data.status?.activeSessionId, selectedSessionId])

  useEffect(() => {
    setCollapsedGroups(current => {
      const next: Record<string, boolean> = {}
      for (const group of groupedActions) {
        next[group.groupId] = current[group.groupId] ?? true
      }
      return next
    })
  }, [groupedActions])

  useEffect(() => {
    if (selectedActionRow >= actionRows.length && actionRows.length > 0) {
      setSelectedActionRow(actionRows.length - 1)
    }
  }, [actionRows.length, selectedActionRow])

  useEffect(() => {
    if (!selectedSessionItem || !data.snapshot) {
      return
    }
    if (selectedSessionItem.active && activePanel === 0) {
      setActivePanel(1)
    }
  }, [activePanel, data.snapshot, selectedSessionItem])

  const executeCommand = async (pathname: string, payload: Record<string, unknown>) => {
    const result = await apiRequest<CommandResult>(baseUrl, token, pathname, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setLastResult(JSON.stringify(result, null, 2))
    await refresh()
  }

  const approveSelectedOrigin = async () => {
    if (!selectedSessionItem) return
    await apiRequest(baseUrl, token, '/api/origins/approve', {
      method: 'POST',
      body: JSON.stringify({ origin: selectedSessionItem.origin }),
    })
    setLastResult(`approved origin: ${selectedSessionItem.origin}`)
    await refresh()
  }

  const activateSelectedSession = async () => {
    if (!selectedSessionItem || selectedSessionItem.approvalStatus !== 'approved') return
    await apiRequest(baseUrl, token, '/api/sessions/activate', {
      method: 'POST',
      body: JSON.stringify({ sessionId: selectedSessionItem.id }),
    })
    setLastResult(`active session: ${selectedSessionItem.id}`)
    await refresh()
  }

  const updateConfig = async (patch: Record<string, unknown>) => {
    const result = await apiRequest(baseUrl, token, '/api/config', {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
    setLastResult(JSON.stringify(result, null, 2))
    await refresh()
  }

  const describeBlockedTarget = (target: PageTarget) => {
    setLastResult(
      JSON.stringify(
        {
          targetId: target.targetId,
          status: getTargetStatus(target),
          actionableNow: canExecuteTarget(target),
        },
        null,
        2,
      ),
    )
  }

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      Promise.resolve(onExit()).finally(() => exit())
      return
    }
    if (input === 'q') {
      Promise.resolve(onExit()).finally(() => exit())
      return
    }

    if (fillDraft) {
      if (key.escape) {
        setFillDraft(null)
        return
      }
      if (key.return) {
        void executeCommand('/api/commands/fill', {
          targetId: fillDraft.targetId,
          value: fillDraft.value,
          expectedVersion: data.snapshot?.version,
        })
        setFillDraft(null)
        return
      }
      if (key.backspace || key.delete) {
        setFillDraft(current =>
          current ? { ...current, value: current.value.slice(0, -1) } : current,
        )
        return
      }
      if (input) {
        setFillDraft(current => (current ? { ...current, value: current.value + input } : current))
      }
      return
    }

    if (key.tab || input === '\t') {
      setActivePanel(current => (current + 1) % 4)
      return
    }

    if (input === 'r') {
      void refresh()
      return
    }

    if (/^[1-9]$/.test(input)) {
      const index = Number(input) - 1
      const target = visibleClickTargets[index]
      if (target) {
        void executeCommand('/api/commands/act', {
          targetId: target.targetId,
          expectedVersion: data.snapshot?.version,
        })
      }
      return
    }

    if (activePanel === 0) {
      if (key.upArrow) {
        const nextIndex = Math.max(0, selectedSessionIndex - 1)
        const nextSession = data.sessions[nextIndex]
        if (nextSession) {
          setSelectedSessionId(nextSession.id)
        }
      } else if (key.downArrow) {
        const nextIndex = Math.min(data.sessions.length - 1, selectedSessionIndex + 1)
        const nextSession = data.sessions[nextIndex]
        if (nextSession) {
          setSelectedSessionId(nextSession.id)
        }
      } else if (input === 'a') {
        void approveSelectedOrigin()
      } else if (key.return) {
        void activateSelectedSession()
      }
      return
    }

    if (activePanel === 1) {
      if (key.upArrow) {
        setSelectedActionRow(current => Math.max(0, current - 1))
      } else if (key.downArrow) {
        setSelectedActionRow(current => Math.min(actionRows.length - 1, current + 1))
      } else if (key.leftArrow && selectedActionItem?.type === 'target') {
        const headerIndex = actionRows.findIndex(
          row => row.type === 'group' && row.group.groupId === selectedActionItem.group.groupId,
        )
        collapseGroup(selectedActionItem.group.groupId)
        if (headerIndex >= 0) {
          setSelectedActionRow(headerIndex)
        }
      } else if (key.leftArrow && selectedActionItem?.type === 'group') {
        collapseGroup(selectedActionItem.group.groupId)
      } else if (key.rightArrow && selectedActionItem?.type === 'group') {
        const wasCollapsed = collapsedGroups[selectedActionItem.group.groupId] ?? true
        expandGroup(selectedActionItem.group.groupId)
        if (wasCollapsed && selectedActionItem.group.targets.length > 0) {
          setSelectedActionRow(current => Math.min(actionRows.length, current + 1))
        }
      } else if (key.return && selectedActionItem?.type === 'group') {
        const wasCollapsed = collapsedGroups[selectedActionItem.group.groupId] ?? true
        toggleGroup(selectedActionItem.group.groupId)
        if (wasCollapsed && selectedActionItem.group.targets.length > 0) {
          setSelectedActionRow(current => Math.min(actionRows.length, current + 1))
        }
      } else if (key.return && selectedTarget?.actionKind === 'click') {
        if (!canExecuteTarget(selectedTarget)) {
          describeBlockedTarget(selectedTarget)
          return
        }
        void executeCommand('/api/commands/act', {
          targetId: selectedTarget.targetId,
          expectedVersion: data.snapshot?.version,
        })
      } else if (input === 'e' && selectedTarget?.actionKind === 'fill') {
        if (!canExecuteTarget(selectedTarget)) {
          describeBlockedTarget(selectedTarget)
          return
        }
        setFillDraft({ targetId: selectedTarget.targetId, value: '' })
      }
      return
    }

    if (activePanel === 3) {
      if (key.upArrow) {
        setSelectedSetting(current => Math.max(0, current - 1))
      } else if (key.downArrow) {
        setSelectedSetting(current => Math.min(2, current + 1))
      } else if (selectedSetting === 0 && (key.leftArrow || key.rightArrow)) {
        const delta = key.rightArrow ? 50 : -50
        void updateConfig({
          clickDelayMs: Math.max(0, (data.status?.config.clickDelayMs ?? 0) + delta),
        })
      } else if (selectedSetting === 1 && (key.return || key.leftArrow || key.rightArrow)) {
        void updateConfig({
          pointerAnimation: !(data.status?.config.pointerAnimation ?? false),
        })
      } else if (selectedSetting === 2 && (key.return || key.leftArrow || key.rightArrow)) {
        void updateConfig({
          autoScroll: !(data.status?.config.autoScroll ?? true),
        })
      }
    }
  })

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyanBright">webcli-dom companion</Text>
        <Text>  Tab 전환  Enter 실행/토글  좌우 접기  a 승인  e fill  r 새로고침  q 종료</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="yellow">focus: {panelLabels[activePanel]}</Text>
      </Box>

      <Box>
        <Box flexDirection="column" width="25%" marginRight={1} borderStyle="round" borderColor={activePanel === 0 ? 'cyan' : 'gray'}>
          <Text>Sessions</Text>
          {data.sessions.length === 0 ? <Text color="gray">연결된 세션 없음</Text> : null}
          {sessionRows.map(session => {
            const isSelected = session.id === selectedSessionItem?.id
            return (
              <Text key={session.id} color={isSelected ? 'green' : undefined} wrap="truncate-end">
                {isSelected ? '>' : ' '} {session.title || session.appId} [{session.approvalStatus}]
              </Text>
            )
          })}
          {data.sessions.length > sessionRows.length ? <Text color="gray">... {data.sessions.length} sessions</Text> : null}
        </Box>

        <Box flexDirection="column" width="35%" marginRight={1} borderStyle="round" borderColor={activePanel === 1 ? 'cyan' : 'gray'}>
          <Text>Live Actions</Text>
          {groupedActions.length === 0 ? <Text color="gray">snapshot 없음</Text> : null}
          {actionWindow.map(row => {
            const index = actionRows.findIndex(item =>
              item.type === 'group' && row.type === 'group'
                ? item.group.groupId === row.group.groupId
                : item.type === 'target' && row.type === 'target'
                  ? item.target.targetId === row.target.targetId
                  : false,
            )

            if (row.type === 'group') {
              const collapsed = collapsedGroups[row.group.groupId] ?? true
              return (
                <Text key={`group:${row.group.groupId}`} color={index === selectedActionRow ? 'green' : 'cyan'}>
                  {index === selectedActionRow ? '>' : ' '} {collapsed ? '▸' : '▾'} {row.group.label} [{row.group.actionableCount}/{row.group.targets.length}]
                </Text>
              )
            }

            return (
              <Text key={`target:${row.target.targetId}`} color={index === selectedActionRow ? 'green' : undefined} wrap="truncate-end">
                {index === selectedActionRow ? '>' : ' '}   {row.target.name} ({row.target.actionKind}) [{getTargetStatus(row.target)}]
              </Text>
            )
          })}
          {actionRows.length > actionWindow.length ? <Text color="gray">... {actionRows.length} rows</Text> : null}
        </Box>

        <Box flexDirection="column" width="40%" borderStyle="round" borderColor={activePanel === 2 ? 'cyan' : 'gray'}>
          <Text>Details / Result</Text>
          <Text wrap="truncate-end">session: {selectedSessionItem?.id ?? '-'}</Text>
          <Text>snapshot: {data.snapshot?.version ?? '-'}</Text>
          <Text wrap="truncate-end">
            selected: {selectedTarget?.targetId ?? (selectedActionItem?.type === 'group' ? selectedActionItem.group.groupId : '-')}
          </Text>
          {selectedTarget ? (
            <Text wrap="truncate-end">
              state: {getTargetStatus(selectedTarget)} | actionable: {String(selectedTarget.actionableNow)}
            </Text>
          ) : null}
          {selectedTarget ? (
            <Text wrap="truncate-end">
              derived actionable: {String(canExecuteTarget(selectedTarget))}
            </Text>
          ) : null}
          {fillDraft ? <Text color="yellow" wrap="truncate-end">fill value: {fillDraft.value}</Text> : null}
          {detailRows.map((line, index) => (
            <Text key={`${index}:${line}`} wrap="truncate-end">{line || ' '}</Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Box flexDirection="column" width="50%" marginRight={1} borderStyle="round" borderColor={activePanel === 3 ? 'cyan' : 'gray'}>
          <Text>Settings</Text>
          <Text color={selectedSetting === 0 ? 'green' : undefined}>
            {selectedSetting === 0 ? '>' : ' '} clickDelayMs: {data.status?.config.clickDelayMs ?? 0}
          </Text>
          <Text color={selectedSetting === 1 ? 'green' : undefined}>
            {selectedSetting === 1 ? '>' : ' '} pointerAnimation: {String(data.status?.config.pointerAnimation ?? false)}
          </Text>
          <Text color={selectedSetting === 2 ? 'green' : undefined}>
            {selectedSetting === 2 ? '>' : ' '} autoScroll: {String(data.status?.config.autoScroll ?? true)}
          </Text>
        </Box>

        <Box flexDirection="column" width="50%" borderStyle="round" borderColor="gray">
          <Text>Logs</Text>
          {logRows.map(log => (
            <Text key={`${log.at}:${log.message}`} wrap="truncate-end">
              [{log.kind}] {log.message}
            </Text>
          ))}
          {data.logs.length > logRows.length ? <Text color="gray">... {data.logs.length} logs</Text> : null}
        </Box>
      </Box>
    </Box>
  )
}
