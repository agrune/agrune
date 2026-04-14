import type { CdpConnection, CdpEventCallback } from './cdp-connection.js'

interface RawTargetInfo {
  targetId: string
  type?: string
  title?: string
  url?: string
}

export interface TargetInfo {
  tabId: number
  targetId: string
  sessionId: string | null
  title: string
  url: string
  type: string
}

export class CdpTargetManager {
  private connection: CdpConnection | null = null
  private targets = new Map<string, TargetInfo>()
  private nextTabId = 1
  private targetCreatedCbs: Array<(target: TargetInfo) => void> = []
  private targetDestroyedCbs: Array<(target: TargetInfo) => void> = []
  private targetInfoChangedCbs: Array<(target: TargetInfo) => void> = []
  private listeners: Array<[string, CdpEventCallback]> = []

  async start(connection: CdpConnection): Promise<void> {
    this.stop()
    this.connection = connection

    this.listen('Target.targetCreated', (params) => {
      const info = this.toRawTargetInfo(params.targetInfo)
      if (!info || info.type !== 'page') return
      const { target, created } = this.upsertTarget(info)
      if (created) {
        this.targetCreatedCbs.forEach(cb => cb({ ...target }))
      }
      void this.attachTarget(info.targetId)
    })

    this.listen('Target.targetInfoChanged', (params) => {
      const info = this.toRawTargetInfo(params.targetInfo)
      if (!info || info.type !== 'page') return
      const { target, created } = this.upsertTarget(info)
      if (created) {
        this.targetCreatedCbs.forEach(cb => cb({ ...target }))
        void this.attachTarget(info.targetId)
        return
      }
      this.targetInfoChangedCbs.forEach(cb => cb({ ...target }))
    })

    this.listen('Target.targetDestroyed', (params) => {
      const targetId = typeof params.targetId === 'string' ? params.targetId : null
      if (!targetId) return
      const existing = this.targets.get(targetId)
      if (!existing) return
      this.targets.delete(targetId)
      this.targetDestroyedCbs.forEach(cb => cb({ ...existing }))
    })

    this.listen('Target.attachedToTarget', (params) => {
      const info = this.toRawTargetInfo(params.targetInfo)
      const sessionId = typeof params.sessionId === 'string' ? params.sessionId : null
      if (!info || info.type !== 'page' || !sessionId) return
      const { target } = this.upsertTarget(info)
      target.sessionId = sessionId
      this.targetInfoChangedCbs.forEach(cb => cb({ ...target }))
    })

    this.listen('Target.detachedFromTarget', (params) => {
      const sessionId = typeof params.sessionId === 'string' ? params.sessionId : null
      if (!sessionId) return
      const target = this.getTargetBySessionId(sessionId)
      if (!target) return
      target.sessionId = null
      this.targetInfoChangedCbs.forEach(cb => cb({ ...target }))
    })

    await connection.send('Target.setDiscoverTargets', { discover: true })
    await connection.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    })

    const result = await connection.send('Target.getTargets')
    const targetInfos = Array.isArray(result.targetInfos)
      ? result.targetInfos
      : []

    for (const raw of targetInfos) {
      const info = this.toRawTargetInfo(raw)
      if (!info || info.type !== 'page') continue
      const { target, created } = this.upsertTarget(info)
      if (created) {
        this.targetCreatedCbs.forEach(cb => cb({ ...target }))
      }
      await this.attachTarget(info.targetId)
    }
  }

  stop(): void {
    if (this.connection) {
      for (const [event, callback] of this.listeners) {
        this.connection.off(event, callback)
      }
    }
    this.listeners = []
    this.connection = null
    this.targets.clear()
    this.nextTabId = 1
  }

  getTargets(): TargetInfo[] {
    return [...this.targets.values()].sort((a, b) => a.tabId - b.tabId)
  }

  getTarget(tabId: number): TargetInfo | null {
    return this.getTargets().find(target => target.tabId === tabId) ?? null
  }

  getTargetBySessionId(sessionId: string): TargetInfo | null {
    return this.getTargets().find(target => target.sessionId === sessionId) ?? null
  }

  onTargetCreated(cb: (target: TargetInfo) => void): void {
    this.targetCreatedCbs.push(cb)
  }

  onTargetDestroyed(cb: (target: TargetInfo) => void): void {
    this.targetDestroyedCbs.push(cb)
  }

  onTargetInfoChanged(cb: (target: TargetInfo) => void): void {
    this.targetInfoChangedCbs.push(cb)
  }

  private listen(event: string, callback: CdpEventCallback): void {
    this.connection?.on(event, callback)
    this.listeners.push([event, callback])
  }

  private async attachTarget(targetId: string): Promise<void> {
    if (!this.connection) return
    try {
      await this.connection.send('Target.attachToTarget', {
        targetId,
        flatten: true,
      })
    } catch {
      // Closing targets can race with auto-attach; ignore and wait for the next target event.
    }
  }

  private upsertTarget(info: RawTargetInfo): {
    target: TargetInfo
    created: boolean
  } {
    const existing = this.targets.get(info.targetId)
    if (existing) {
      existing.title = info.title ?? existing.title
      existing.url = info.url ?? existing.url
      existing.type = info.type ?? existing.type
      return { target: existing, created: false }
    }

    const target: TargetInfo = {
      tabId: this.nextTabId++,
      targetId: info.targetId,
      sessionId: null,
      title: info.title ?? '',
      url: info.url ?? '',
      type: info.type ?? 'page',
    }
    this.targets.set(info.targetId, target)
    return { target, created: true }
  }

  private toRawTargetInfo(value: unknown): RawTargetInfo | null {
    if (!value || typeof value !== 'object') return null
    const targetInfo = value as Record<string, unknown>
    if (typeof targetInfo.targetId !== 'string') return null
    return {
      targetId: targetInfo.targetId,
      type: typeof targetInfo.type === 'string' ? targetInfo.type : undefined,
      title: typeof targetInfo.title === 'string' ? targetInfo.title : undefined,
      url: typeof targetInfo.url === 'string' ? targetInfo.url : undefined,
    }
  }
}
