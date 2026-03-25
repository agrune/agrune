import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// src/activity-block-stack.ts
var ActivityBlockStack = class {
  constructor(onActiveChange) {
    this.onActiveChange = onActiveChange;
  }
  blocks = [];
  counter = 0;
  expiryTimer = null;
  active = false;
  pushGuard(kind) {
    const id = this.nextId(kind);
    this.blocks.push({ id, kind, expiresAt: null });
    this.sync();
    return id;
  }
  pushTimed(kind, ttlMs) {
    const id = this.nextId(kind);
    this.blocks.push({ id, kind, expiresAt: Date.now() + ttlMs });
    this.sync();
    return id;
  }
  release(id) {
    const next = this.blocks.filter((block) => block.id !== id);
    if (next.length === this.blocks.length) {
      return;
    }
    this.blocks = next;
    this.sync();
  }
  hasActiveBlocks() {
    this.pagruneExpired();
    return this.blocks.length > 0;
  }
  getBlocks() {
    this.pagruneExpired();
    return [...this.blocks];
  }
  nextId(kind) {
    this.counter += 1;
    return `${kind}-${this.counter}`;
  }
  pagruneExpired() {
    const now = Date.now();
    const next = this.blocks.filter((block) => block.expiresAt == null || block.expiresAt > now);
    if (next.length !== this.blocks.length) {
      this.blocks = next;
    }
  }
  sync() {
    this.pagruneExpired();
    this.scheduleNextExpiry();
    const nextActive = this.blocks.length > 0;
    if (nextActive !== this.active) {
      this.active = nextActive;
      this.onActiveChange(nextActive);
    }
  }
  scheduleNextExpiry() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    const nextExpiry = this.blocks.map((block) => block.expiresAt).filter((expiresAt) => expiresAt != null).sort((left, right) => left - right)[0];
    if (nextExpiry == null) {
      return;
    }
    const delay = Math.max(0, nextExpiry - Date.now());
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      this.sync();
    }, delay);
  }
};

// src/command-queue.ts
var CommandQueue = class {
  sender = null;
  pending = /* @__PURE__ */ new Map();
  senderWaiters = [];
  counter = 0;
  setSender(sender) {
    this.sender = sender;
    if (sender) {
      const waiters = this.senderWaiters.splice(0);
      for (const w of waiters) w();
    }
  }
  sendRaw(msg) {
    if (this.sender) this.sender(msg);
  }
  hasSender() {
    return this.sender !== null;
  }
  waitForSender(timeoutMs) {
    if (this.sender) return Promise.resolve(true);
    return new Promise((resolve) => {
      const onReady = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        const idx = this.senderWaiters.indexOf(onReady);
        if (idx !== -1) this.senderWaiters.splice(idx, 1);
        resolve(false);
      }, timeoutMs);
      this.senderWaiters.push(onReady);
    });
  }
  enqueue(tabId, command, opts) {
    const timeoutMs = opts?.timeoutMs ?? 3e4;
    const commandId = `cmd-${++this.counter}-${Date.now()}`;
    const msg = {
      type: "command_request",
      tabId,
      commandId,
      command
    };
    if (this.sender) {
      this.sender(msg);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(commandId);
        reject(new Error("Command timed out"));
      }, timeoutMs);
      this.pending.set(commandId, { resolve, reject, timer });
    });
  }
  resolve(commandId, result) {
    const entry = this.pending.get(commandId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(commandId);
    entry.resolve(result);
  }
};

// src/public-shapes.ts
function toPublicSession(session) {
  return {
    tabId: session.tabId,
    url: session.url,
    title: session.title || session.snapshot?.title || "",
    hasSnapshot: session.snapshot !== null,
    snapshotVersion: session.snapshot?.version ?? null
  };
}
function toPublicTarget(target, includeTextContent) {
  return {
    targetId: target.targetId,
    groupId: target.groupId,
    name: target.name,
    description: target.description,
    actionKind: target.actionKind,
    ...target.reason !== "ready" ? { reason: target.reason } : {},
    ...target.sensitive ? { sensitive: true } : {},
    ...includeTextContent && target.textContent ? { textContent: target.textContent } : {}
  };
}
function getActiveContext(snapshot) {
  const actionableTargets = snapshot.targets.filter((target) => target.actionableNow);
  const overlayTargets = actionableTargets.filter((target) => target.overlay);
  if (overlayTargets.length > 0) {
    return {
      context: "overlay",
      targets: overlayTargets
    };
  }
  return {
    context: "page",
    targets: actionableTargets
  };
}
function toPublicGroups(targets) {
  const groups = /* @__PURE__ */ new Map();
  for (const target of targets) {
    const existing = groups.get(target.groupId);
    if (existing) {
      existing.targets.push(target);
      continue;
    }
    groups.set(target.groupId, {
      groupId: target.groupId,
      groupName: target.groupName,
      groupDesc: target.groupDesc,
      targets: [target]
    });
  }
  return Array.from(groups.values()).map((group) => ({
    groupId: group.groupId,
    groupName: group.groupName,
    groupDesc: group.groupDesc,
    targetCount: group.targets.length,
    actionKinds: [...new Set(group.targets.map((target) => target.actionKind))],
    sampleTargetNames: group.targets.map((target) => target.name).filter((name) => name.length > 0).slice(0, 3)
  }));
}
function toPublicSnapshot(snapshot, options = {}) {
  const activeContext = getActiveContext(snapshot);
  const requestedGroupIds = new Set(options.groupIds ?? []);
  const includeTargets = requestedGroupIds.size > 0 || options.mode === "full";
  const expandedTargets = requestedGroupIds.size > 0 ? activeContext.targets.filter((target) => requestedGroupIds.has(target.groupId)) : activeContext.targets;
  const includeGroups = !includeTargets;
  return {
    version: snapshot.version,
    url: snapshot.url,
    title: snapshot.title,
    context: activeContext.context,
    ...includeGroups ? { groups: toPublicGroups(activeContext.targets) } : {},
    ...includeTargets ? { targets: expandedTargets.map((t) => toPublicTarget(t, options.includeTextContent ?? false)) } : {}
  };
}
function toPublicCommandResult(result) {
  if (result.ok) {
    return {
      commandId: result.commandId,
      ok: true,
      ...result.result ? { result: result.result } : {}
    };
  }
  return {
    commandId: result.commandId,
    ok: false,
    error: result.error
  };
}

// src/session-manager.ts
var SessionManager = class {
  sessions = /* @__PURE__ */ new Map();
  snapshotWaiters = [];
  openSession(tabId, url, title) {
    this.sessions.set(tabId, {
      tabId,
      url,
      title,
      snapshot: null,
      openedAt: Date.now()
    });
  }
  closeSession(tabId) {
    this.sessions.delete(tabId);
  }
  getSession(tabId) {
    return this.sessions.get(tabId) ?? null;
  }
  getSessions() {
    return [...this.sessions.values()];
  }
  updateSnapshot(tabId, snapshot) {
    const session = this.sessions.get(tabId);
    if (session) {
      session.snapshot = snapshot;
      this.notifyWaiters();
    }
  }
  getSnapshot(tabId) {
    return this.sessions.get(tabId)?.snapshot ?? null;
  }
  hasReadySession() {
    for (const session of this.sessions.values()) {
      if (session.snapshot !== null) return true;
    }
    return false;
  }
  waitForSnapshot(timeoutMs) {
    if (this.hasReadySession()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const onReady = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        const idx = this.snapshotWaiters.indexOf(onReady);
        if (idx !== -1) this.snapshotWaiters.splice(idx, 1);
        resolve(false);
      }, timeoutMs);
      this.snapshotWaiters.push(onReady);
    });
  }
  notifyWaiters() {
    if (!this.hasReadySession()) return;
    const waiters = this.snapshotWaiters.splice(0);
    for (const waiter of waiters) waiter();
  }
};

// src/backend.ts
var ACTIVITY_TAIL_BLOCK_MS = 5e3;
var ENSURE_READY_TIMEOUT_MS = 1e4;
var AgagruneBackend = class {
  sessions = new SessionManager();
  commands = new CommandQueue();
  activityBlocks = new ActivityBlockStack((active) => {
    this.commands.sendRaw({ type: "agent_activity", active });
  });
  manualAgentBlockId = null;
  lastAgentActivityAt = null;
  onActivity = null;
  pendingResync = null;
  setNativeSender(sender) {
    this.commands.setSender(sender);
  }
  handleNativeMessage(msg) {
    switch (msg.type) {
      case "session_open":
        this.sessions.openSession(msg.tabId, msg.url, msg.title);
        break;
      case "session_close":
        this.sessions.closeSession(msg.tabId);
        break;
      case "snapshot_update":
        this.sessions.updateSnapshot(msg.tabId, msg.snapshot);
        break;
      case "command_result":
        this.commands.resolve(msg.commandId, msg.result);
        break;
      case "ping":
        this.commands.sendRaw({ type: "pong" });
        break;
      case "get_status":
        this.commands.sendRaw(this.createStatusResponse());
        break;
      case "resync_request":
      case "pong":
      case "status_response":
        break;
    }
  }
  async handleToolCall(name, args) {
    this.lastAgentActivityAt = Date.now();
    this.onActivity?.();
    if (name !== "agrune_config") {
      const readyError = await this.ensureReady();
      if (readyError) return readyError;
    }
    switch (name) {
      case "agrune_sessions": {
        const list = this.sessions.getSessions();
        return this.textResult(JSON.stringify(list.map(toPublicSession), null, 2));
      }
      case "agrune_snapshot": {
        const tabId = this.resolveTabId(args);
        if (tabId == null) {
          return this.textResult("No active sessions.", true);
        }
        return this.withActivityBlocks("snapshot", async () => {
          const snapshot = this.sessions.getSnapshot(tabId);
          if (!snapshot) {
            return this.textResult(`No snapshot available for tab ${tabId}.`, true);
          }
          return this.textResult(JSON.stringify(toPublicSnapshot(snapshot, this.resolveSnapshotOptions(args)), null, 2));
        });
      }
      case "agrune_act":
      case "agrune_fill":
      case "agrune_drag":
      case "agrune_wait":
      case "agrune_guide": {
        const tabId = this.resolveTabId(args);
        if (tabId == null) {
          return this.textResult("No active sessions.", true);
        }
        return this.withActivityBlocks(name.replace("agrune_", ""), async () => {
          const command = {
            kind: name.replace("agrune_", ""),
            ...args
          };
          delete command.tabId;
          const result = await this.commands.enqueue(tabId, command);
          return this.textResult(JSON.stringify(toPublicCommandResult(result), null, 2));
        });
      }
      case "agrune_config": {
        const config = {};
        if (typeof args.pointerAnimation === "boolean") config.pointerAnimation = args.pointerAnimation;
        if (typeof args.auroraGlow === "boolean") config.auroraGlow = args.auroraGlow;
        if (typeof args.auroraTheme === "string") {
          config.auroraTheme = args.auroraTheme;
        }
        if (typeof args.clickDelayMs === "number") config.clickDelayMs = args.clickDelayMs;
        if (typeof args.pointerDurationMs === "number") config.pointerDurationMs = args.pointerDurationMs;
        if (typeof args.autoScroll === "boolean") config.autoScroll = args.autoScroll;
        if (Object.keys(config).length > 0) {
          this.commands.sendRaw({ type: "config_update", config });
        }
        if (typeof args.agentActive === "boolean") {
          this.setManualAgentActivity(args.agentActive);
        }
        return this.textResult("Configuration updated.");
      }
      default:
        return this.textResult(`Unknown tool: ${name}`, true);
    }
  }
  resolveTabId(args) {
    if (typeof args.tabId === "number") return args.tabId;
    const all = this.sessions.getSessions();
    return all.length > 0 ? all[0].tabId : null;
  }
  resolveSnapshotOptions(args) {
    const groupIds = /* @__PURE__ */ new Set();
    if (typeof args.groupId === "string" && args.groupId.trim()) {
      groupIds.add(args.groupId.trim());
    }
    if (Array.isArray(args.groupIds)) {
      for (const value of args.groupIds) {
        if (typeof value === "string" && value.trim()) {
          groupIds.add(value.trim());
        }
      }
    }
    return {
      mode: args.mode === "full" ? "full" : "outline",
      ...groupIds.size > 0 ? { groupIds: [...groupIds] } : {},
      ...args.includeTextContent === true ? { includeTextContent: true } : {}
    };
  }
  async ensureReady() {
    const deadline = Date.now() + ENSURE_READY_TIMEOUT_MS;
    if (!this.commands.hasSender()) {
      const connected = await this.commands.waitForSender(ENSURE_READY_TIMEOUT_MS);
      if (!connected) {
        return this.textResult(
          "Native host not connected. Ensure the browser extension is installed and running.",
          true
        );
      }
    }
    if (this.sessions.hasReadySession()) return null;
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) {
      return this.textResult(
        "No browser sessions available. Ensure a page with agrune annotations is open.",
        true
      );
    }
    if (!this.pendingResync) {
      this.commands.sendRaw({ type: "resync_request" });
      this.pendingResync = this.sessions.waitForSnapshot(remaining).finally(() => {
        this.pendingResync = null;
      });
    }
    const ready = await this.pendingResync;
    if (!ready) {
      return this.textResult(
        "No browser sessions available. Ensure a page with agrune annotations is open.",
        true
      );
    }
    return null;
  }
  async withActivityBlocks(kind, effect) {
    const guardId = this.activityBlocks.pushGuard(`${kind}:guard`);
    try {
      return await effect();
    } finally {
      this.activityBlocks.pushTimed(`${kind}:tail`, ACTIVITY_TAIL_BLOCK_MS);
      this.activityBlocks.release(guardId);
    }
  }
  setManualAgentActivity(active) {
    if (active) {
      if (!this.manualAgentBlockId) {
        this.manualAgentBlockId = this.activityBlocks.pushGuard("manual:agent");
      }
      return;
    }
    if (!this.manualAgentBlockId) {
      return;
    }
    this.activityBlocks.release(this.manualAgentBlockId);
    this.manualAgentBlockId = null;
  }
  textResult(text, isError = false) {
    return { text, ...isError ? { isError: true } : {} };
  }
  createStatusResponse() {
    return {
      type: "status_response",
      status: {
        hostName: "com.agrune.agrune",
        phase: "connected",
        connected: true,
        lastError: null,
        sessionCount: this.sessions.getSessions().length,
        mcpConnected: this.isAgentRecentlyActive() || this.activityBlocks.hasActiveBlocks()
      }
    };
  }
  isAgentRecentlyActive() {
    return this.lastAgentActivityAt != null && Date.now() - this.lastAgentActivityAt <= ACTIVITY_TAIL_BLOCK_MS;
  }
};

export {
  CommandQueue,
  SessionManager,
  AgagruneBackend
};
//# sourceMappingURL=chunk-EPNT365Y.js.map