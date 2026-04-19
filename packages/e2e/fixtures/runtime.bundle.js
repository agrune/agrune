"use strict";
var __agrune_runtime__ = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/page-runtime.ts
  var page_runtime_exports = {};
  __export(page_runtime_exports, {
    buildEmptyManifest: () => buildEmptyManifest,
    createPageAgentRuntime: () => createPageAgentRuntime,
    getInstalledPageAgentRuntime: () => getInstalledPageAgentRuntime,
    installPageAgentRuntime: () => installPageAgentRuntime
  });

  // ../core/dist/index.js
  var DEFAULT_RUNTIME_CONFIG = {
    clickDelayMs: 300,
    pointerDurationMs: 600,
    pointerAnimation: true,
    autoScroll: true,
    cursorName: "default",
    auroraGlow: true,
    auroraTheme: "light"
  };
  function mergeRuntimeConfig(base, patch) {
    if (!patch) {
      return { ...base };
    }
    return normalizeRuntimeConfig({
      clickDelayMs: patch.clickDelayMs ?? base.clickDelayMs,
      pointerDurationMs: patch.pointerDurationMs ?? base.pointerDurationMs,
      pointerAnimation: patch.pointerAnimation ?? base.pointerAnimation,
      autoScroll: patch.autoScroll ?? base.autoScroll,
      cursorName: patch.cursorName ?? base.cursorName,
      auroraGlow: patch.auroraGlow ?? base.auroraGlow,
      auroraTheme: patch.auroraTheme ?? base.auroraTheme
    });
  }
  function normalizeRuntimeConfig(input) {
    const clickDelayMs = Number(input?.clickDelayMs ?? DEFAULT_RUNTIME_CONFIG.clickDelayMs);
    const pointerDurationMs = Number(input?.pointerDurationMs ?? DEFAULT_RUNTIME_CONFIG.pointerDurationMs);
    return {
      clickDelayMs: Number.isFinite(clickDelayMs) && clickDelayMs >= 0 ? Math.floor(clickDelayMs) : DEFAULT_RUNTIME_CONFIG.clickDelayMs,
      pointerDurationMs: Number.isFinite(pointerDurationMs) && pointerDurationMs >= 0 ? Math.floor(pointerDurationMs) : DEFAULT_RUNTIME_CONFIG.pointerDurationMs,
      pointerAnimation: typeof input?.pointerAnimation === "boolean" ? input.pointerAnimation : DEFAULT_RUNTIME_CONFIG.pointerAnimation,
      autoScroll: typeof input?.autoScroll === "boolean" ? input.autoScroll : DEFAULT_RUNTIME_CONFIG.autoScroll,
      cursorName: typeof input?.cursorName === "string" && input.cursorName.trim() ? input.cursorName.trim() : DEFAULT_RUNTIME_CONFIG.cursorName,
      auroraGlow: typeof input?.auroraGlow === "boolean" ? input.auroraGlow : DEFAULT_RUNTIME_CONFIG.auroraGlow,
      auroraTheme: input?.auroraTheme === "light" || input?.auroraTheme === "dark" ? input.auroraTheme : DEFAULT_RUNTIME_CONFIG.auroraTheme
    };
  }
  function createCommandError(code, message, details) {
    return { code, message, details };
  }

  // src/runtime/action-queue.ts
  var ActionQueue = class {
    idleTimeoutMs;
    entries = [];
    idleTimer = null;
    activeEntry = null;
    _processing = false;
    _paused = false;
    _active = false;
    disposed = false;
    onActivate = null;
    onDeactivate = null;
    constructor(options) {
      this.idleTimeoutMs = options.idleTimeoutMs;
    }
    get length() {
      return this.entries.length;
    }
    get processing() {
      return this._processing;
    }
    get paused() {
      return this._paused;
    }
    get active() {
      return this._active;
    }
    push(block) {
      if (this.disposed) {
        const promise2 = Promise.reject(new Error("Queue disposed"));
        promise2.catch(() => {
        });
        return promise2;
      }
      this.clearIdleTimer();
      if (!this._active) {
        this._active = true;
        this.onActivate?.();
      }
      let entry;
      const promise = new Promise((resolve, reject) => {
        entry = {
          block,
          settled: false,
          resolve,
          reject
        };
        this.entries.push(entry);
      });
      promise.catch(() => {
      });
      if (!this._paused && !this._processing) {
        void this.processLoop();
      }
      return promise;
    }
    pause() {
      if (this.disposed) {
        return;
      }
      this._paused = true;
      this.clearIdleTimer();
    }
    resume() {
      if (this.disposed || !this._paused) {
        return;
      }
      this._paused = false;
      if (this.entries.length > 0 && !this._processing) {
        void this.processLoop();
        return;
      }
      if (this.entries.length === 0 && !this._processing && this._active) {
        this.startIdleTimer();
      }
    }
    clear() {
      if (this.disposed) {
        return;
      }
      for (const entry of this.entries.splice(0)) {
        this.rejectEntry(entry, new Error("Queue cleared"));
      }
      if (!this._paused && !this._processing && this._active) {
        this.startIdleTimer();
      }
    }
    dispose() {
      if (this.disposed) {
        return;
      }
      this.disposed = true;
      this.clearIdleTimer();
      for (const entry of this.entries.splice(0)) {
        this.rejectEntry(entry, new Error("Queue disposed"));
      }
      if (this.activeEntry) {
        this.rejectEntry(this.activeEntry, new Error("Queue disposed"));
        this.activeEntry = null;
      }
      this._processing = false;
      this._paused = false;
      this._active = false;
      this.onActivate = null;
      this.onDeactivate = null;
    }
    async processLoop() {
      if (this._processing || this.disposed) {
        return;
      }
      this._processing = true;
      try {
        while (!this.disposed && !this._paused && this.entries.length > 0) {
          const entry = this.entries.shift();
          if (!entry) {
            break;
          }
          this.activeEntry = entry;
          try {
            await entry.block.execute();
            this.resolveEntry(entry);
          } catch (error) {
            this.rejectEntry(entry, error);
          } finally {
            if (this.activeEntry === entry) {
              this.activeEntry = null;
            }
          }
        }
      } finally {
        this._processing = false;
        if (!this.disposed && !this._paused && this.entries.length === 0 && this._active) {
          this.startIdleTimer();
        }
      }
    }
    startIdleTimer() {
      this.clearIdleTimer();
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        this._active = false;
        this.onDeactivate?.();
      }, this.idleTimeoutMs);
    }
    clearIdleTimer() {
      if (this.idleTimer !== null) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
    }
    resolveEntry(entry) {
      if (entry.settled) {
        return;
      }
      entry.settled = true;
      entry.resolve();
    }
    rejectEntry(entry, reason) {
      if (entry.settled) {
        return;
      }
      entry.settled = true;
      entry.reject(reason);
    }
  };

  // src/runtime/cursors/index.ts
  var CURSOR_ORB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
  <g filter="url(#agrune-orb-glow)">
    <circle cx="24" cy="24" r="14" fill="url(#agrune-orb-bg)" fill-opacity="0.2"/>
    <circle cx="24" cy="24" r="14" stroke="url(#agrune-orb-stroke)" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="4s" repeatCount="indefinite"/>
    </circle>
    <circle cx="24" cy="24" r="6" fill="url(#agrune-orb-stroke)">
      <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="24" cy="24" r="2" fill="#ffffff"/>
  </g>
  <defs>
    <linearGradient id="agrune-orb-bg" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
      <stop stop-color="#a855f7"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
    <linearGradient id="agrune-orb-stroke" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
      <stop stop-color="#d946ef"/>
      <stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
    <filter id="agrune-orb-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
</svg>`;
  var POINTER_FILL_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cg%3E%3Cpath d='M 15 42 L 15 36.99 Q 15 31.99 23.7 31.99 L 28.05 31.99 Q 32.41 31.99 32.41 21.99 L 32.41 17 Q 32.41 12 41.09 16.95 L 76.31 37.05 Q 85 42 76.31 46.95 L 41.09 67.05 Q 32.41 72 32.41 62.01 L 32.41 57.01 Q 32.41 52.01 23.7 52.01 L 19.35 52.01 Q 15 52.01 15 47.01 Z' fill='%23ffffff' stroke='none'/%3E%3C/g%3E%3C/svg%3E";
  var POINTER_BORDER_MASK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'%3E%3Cg%3E%3Cpath d='M 15 42 L 15 36.99 Q 15 31.99 23.7 31.99 L 28.05 31.99 Q 32.41 31.99 32.41 21.99 L 32.41 17 Q 32.41 12 41.09 16.95 L 76.31 37.05 Q 85 42 76.31 46.95 L 41.09 67.05 Q 32.41 72 32.41 62.01 L 32.41 57.01 Q 32.41 52.01 23.7 52.01 L 19.35 52.01 Q 15 52.01 15 47.01 Z' fill='none' stroke='%23000000' stroke-width='6' stroke-miterlimit='10'/%3E%3C/g%3E%3C/svg%3E";
  var CURSOR_REGISTRY = {
    default: { kind: "css-layers", width: 75, height: 75, hotspotX: 0, hotspotY: 0 },
    orb: { kind: "svg-inline", width: 48, height: 48, hotspotX: 24, hotspotY: 24, svg: CURSOR_ORB_SVG }
  };
  var CURSOR_NAMES = Object.keys(CURSOR_REGISTRY);
  var DEFAULT_CURSOR_NAME = "default";
  function getCursorMeta(name) {
    return CURSOR_REGISTRY[name] ?? CURSOR_REGISTRY[DEFAULT_CURSOR_NAME];
  }

  // src/runtime/dom-utils.ts
  var AGRUNE_INTERNAL_SELECTOR = "[data-agrune-aurora], [data-agrune-pointer], #agrune-cursor-style";
  var CURSOR_STYLE_ID = "agrune-cursor-style";
  function isAgruneInternalNode(node) {
    if (!node) return false;
    if (node.nodeType !== 1) {
      return (node.parentElement?.closest?.(AGRUNE_INTERNAL_SELECTOR) ?? null) != null;
    }
    const element = node;
    if (element.id === CURSOR_STYLE_ID) return true;
    if (element.hasAttribute("data-agrune-aurora") || element.hasAttribute("data-agrune-pointer")) {
      return true;
    }
    return element.closest(AGRUNE_INTERNAL_SELECTOR) != null;
  }
  function toRectBounds(rect) {
    return {
      top: Math.min(rect.top, rect.bottom),
      left: Math.min(rect.left, rect.right),
      right: Math.max(rect.left, rect.right),
      bottom: Math.max(rect.top, rect.bottom)
    };
  }
  function intersectRectBounds(rect, other) {
    const top = Math.max(rect.top, other.top);
    const left = Math.max(rect.left, other.left);
    const right = Math.min(rect.right, other.right);
    const bottom = Math.min(rect.bottom, other.bottom);
    if (right - left < 1 || bottom - top < 1) {
      return null;
    }
    return { top, left, right, bottom };
  }
  function isVisible(element) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function isScrollableOverflowValue(value) {
    return value === "auto" || value === "scroll" || value === "overlay";
  }
  function getElementViewportRect(element) {
    let visibleRect = intersectRectBounds(
      toRectBounds(element.getBoundingClientRect()),
      {
        top: 0,
        left: 0,
        right: window.innerWidth,
        bottom: window.innerHeight
      }
    );
    if (!visibleRect) {
      return null;
    }
    let current = element.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      if (isScrollableOverflowValue(style.overflow) || isScrollableOverflowValue(style.overflowX) || isScrollableOverflowValue(style.overflowY)) {
        visibleRect = intersectRectBounds(
          visibleRect,
          toRectBounds(current.getBoundingClientRect())
        );
        if (!visibleRect) {
          return null;
        }
      }
      current = current.parentElement;
    }
    return visibleRect;
  }
  function isElementInViewport(element) {
    return getElementViewportRect(element) !== null;
  }
  function isEnabled(element) {
    if ("disabled" in element) {
      return !element.disabled;
    }
    return true;
  }
  function isPointInsideViewport(x, y) {
    return x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
  }
  function getVisibleSamplePoints(rect) {
    const normalizedRect = toRectBounds(rect);
    if (normalizedRect.right - normalizedRect.left < 1 || normalizedRect.bottom - normalizedRect.top < 1) {
      return [];
    }
    const insetX = Math.min(18, Math.max(4, (normalizedRect.right - normalizedRect.left) * 0.15));
    const insetY = Math.min(18, Math.max(4, (normalizedRect.bottom - normalizedRect.top) * 0.15));
    const left = normalizedRect.left + insetX;
    const centerX = (normalizedRect.left + normalizedRect.right) / 2;
    const right = normalizedRect.right - insetX;
    const top = normalizedRect.top + insetY;
    const centerY = (normalizedRect.top + normalizedRect.bottom) / 2;
    const bottom = normalizedRect.bottom - insetY;
    const orderedPoints = [
      { clientX: centerX, clientY: centerY },
      { clientX: left, clientY: centerY },
      { clientX: right, clientY: centerY },
      { clientX: centerX, clientY: top },
      { clientX: centerX, clientY: bottom },
      { clientX: left, clientY: top },
      { clientX: right, clientY: top },
      { clientX: left, clientY: bottom },
      { clientX: right, clientY: bottom }
    ];
    const uniquePoints = /* @__PURE__ */ new Map();
    for (const point of orderedPoints) {
      const key = `${Math.round(point.clientX * 100) / 100}:${Math.round(point.clientY * 100) / 100}`;
      if (!uniquePoints.has(key)) {
        uniquePoints.set(key, point);
      }
    }
    return Array.from(uniquePoints.values());
  }
  function findInteractablePoint(element) {
    if (typeof document.elementFromPoint !== "function") {
      return getElementCenter(element);
    }
    const viewportRect = getElementViewportRect(element);
    if (!viewportRect) {
      return null;
    }
    const samplePoints = getVisibleSamplePoints(viewportRect);
    for (const point of samplePoints) {
      if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY) || !isPointInsideViewport(point.clientX, point.clientY)) {
        continue;
      }
      const topmost = document.elementFromPoint(point.clientX, point.clientY);
      if (topmost && (topmost === element || element.contains(topmost))) {
        return point;
      }
    }
    return null;
  }
  function isTopmostInteractable(element) {
    if (typeof document.elementFromPoint !== "function") {
      return true;
    }
    return findInteractablePoint(element) !== null;
  }
  function getInteractablePoint(element) {
    return findInteractablePoint(element) ?? getElementCenter(element);
  }
  function getElementCenter(element) {
    const rect = element.getBoundingClientRect();
    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };
  }
  function getDragPlacementCoords(element, placement) {
    const rect = element.getBoundingClientRect();
    const horizontalCenter = rect.left + rect.width / 2;
    const edgeOffset = Math.max(6, Math.min(18, rect.height * 0.2));
    if (placement === "before") {
      return {
        clientX: horizontalCenter,
        clientY: rect.top + edgeOffset
      };
    }
    if (placement === "after") {
      return {
        clientX: horizontalCenter,
        clientY: rect.bottom - edgeOffset
      };
    }
    return {
      clientX: horizontalCenter,
      clientY: rect.top + rect.height / 2
    };
  }
  var AUTOCOMPLETE_SENSITIVE = /* @__PURE__ */ new Set([
    "current-password",
    "new-password",
    "one-time-code",
    "cc-number",
    "cc-csc",
    "cc-exp",
    "cc-exp-month",
    "cc-exp-year"
  ]);
  var SENSITIVE_WORD_BOUNDARY = /\b(password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)\b/i;
  var SENSITIVE_NAME_ATTR = /(?:^|[_\-\s.])(?:password|passwd|pwd|cvv|ssn|secret|pin|otp|passcode)(?:[_\-\s.]|$)/i;
  var SENSITIVE_ARIA_LABELS_MULTILANG = /* @__PURE__ */ new Set([
    // 한국어
    "\uBE44\uBC00\uBC88\uD638",
    "\uD328\uC2A4\uC6CC\uB4DC",
    "\uD540\uBC88\uD638",
    "\uBCF4\uC548\uCF54\uB4DC",
    // 일본어
    "\u30D1\u30B9\u30EF\u30FC\u30C9",
    "\u3071\u3059\u308F\u30FC\u3069",
    "\u6697\u8A3C\u756A\u53F7",
    // 중국어 간체 / 번체
    "\u5BC6\u7801",
    "\u53E3\u4EE4",
    "\u5BC6\u78BC",
    // 프랑스어 (lowercase + trim 형태로 저장 — 비교 시 .toLowerCase() 적용)
    "mot de passe",
    // 독일어
    "passwort",
    "kennwort",
    // 스페인어
    "contrase\xF1a"
  ]);
  function isSensitive(element, manifestFlag) {
    if (manifestFlag === true) return true;
    if (element instanceof HTMLInputElement && element.type === "password") {
      return true;
    }
    const autocomplete = element.getAttribute("autocomplete");
    if (autocomplete) {
      const normalized = autocomplete.toLowerCase().trim();
      if (AUTOCOMPLETE_SENSITIVE.has(normalized)) return true;
    }
    const placeholder = element.getAttribute("placeholder") ?? "";
    if (placeholder && SENSITIVE_WORD_BOUNDARY.test(placeholder)) return true;
    const nameAttr = element.getAttribute("name") ?? "";
    if (nameAttr && SENSITIVE_NAME_ATTR.test(nameAttr)) return true;
    const idAttr = element.id ?? "";
    if (idAttr && SENSITIVE_NAME_ATTR.test(idAttr)) return true;
    const ariaLabelRaw = element.getAttribute("aria-label") ?? "";
    const ariaLabel = ariaLabelRaw.trim().toLowerCase();
    if (ariaLabel) {
      if (SENSITIVE_ARIA_LABELS_MULTILANG.has(ariaLabel)) return true;
      for (const token of ariaLabel.split(/\s+/)) {
        if (token && SENSITIVE_ARIA_LABELS_MULTILANG.has(token)) return true;
      }
      if (SENSITIVE_WORD_BOUNDARY.test(ariaLabelRaw)) return true;
    }
    return false;
  }
  function isOverlayElement(element) {
    let current = element;
    while (current && current !== document.body) {
      const role = current.getAttribute("role");
      const ariaModal = current.getAttribute("aria-modal");
      const style = window.getComputedStyle(current);
      const zIndex = Number(style.zIndex);
      if (role === "dialog" || role === "alertdialog" || ariaModal === "true" || style.position === "fixed" && Number.isFinite(zIndex) && zIndex > 0) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }
  function isFillableElement(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
  }
  function isContentEditableElement(element) {
    return element instanceof HTMLElement && element.isContentEditable === true;
  }
  function canReceiveTextInput(element) {
    return isFillableElement(element) || isContentEditableElement(element);
  }
  function isRelevantSnapshotMutation(mutation) {
    if (mutation.type === "attributes") {
      return !isAgruneInternalNode(mutation.target);
    }
    for (const node of Array.from(mutation.addedNodes)) {
      if (!isAgruneInternalNode(node)) return true;
    }
    for (const node of Array.from(mutation.removedNodes)) {
      if (!isAgruneInternalNode(node)) return true;
    }
    return false;
  }
  function waitForNextFrame() {
    return new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => resolve());
        return;
      }
      window.setTimeout(resolve, 16);
    });
  }
  async function smoothScrollIntoView(element) {
    const isReadyForInteraction = () => {
      return isElementInViewport(element) && isTopmostInteractable(element);
    };
    if (isReadyForInteraction()) {
      return;
    }
    element.scrollIntoView({ block: "center", inline: "center" });
    const deadline = performance.now() + 400;
    let lastRect = element.getBoundingClientRect();
    let stableFrames = 0;
    while (performance.now() < deadline) {
      await waitForNextFrame();
      const nextRect = element.getBoundingClientRect();
      const moved = Math.abs(nextRect.top - lastRect.top) > 0.5 || Math.abs(nextRect.left - lastRect.left) > 0.5 || Math.abs(nextRect.bottom - lastRect.bottom) > 0.5 || Math.abs(nextRect.right - lastRect.right) > 0.5;
      if (!moved) {
        stableFrames++;
      } else {
        stableFrames = 0;
        lastRect = nextRect;
      }
      if (isReadyForInteraction()) {
        if (stableFrames >= 1) {
          break;
        }
        continue;
      }
      if (stableFrames >= 3) {
        break;
      }
    }
  }

  // src/runtime/repeat-expander.ts
  var REPEAT_MAX_INSTANCES = 1e3;
  var RepeatExpander = class {
    /**
     * DOM strategy: container(또는 document) 안에서 row CSS selector로 전체 element 열거.
     * keyFrom은 `new Function('el', expr)` 스코프 격리 실행 (T-14-07).
     */
    expand(repeat, container) {
      const scope = container ?? document;
      const rowCss = this.resolveRowCss(repeat);
      const all = Array.from(scope.querySelectorAll(rowCss));
      const capped = this.applyCap(all, repeat.repeatId);
      return this.buildInstances(capped, repeat.keyFrom, repeat.repeatId);
    }
    /**
     * Virtualized strategy: viewport 내부 row만 반환 + aria-rowcount/setsize READ-ONLY 추출.
     * Pitfall 5: setAttribute 절대 금지.
     */
    expandVirtualized(repeat, container) {
      const scope = container ?? document;
      const rowCss = this.resolveRowCss(repeat);
      const all = Array.from(scope.querySelectorAll(rowCss));
      const visible = all.filter((el) => isElementInViewport(el));
      const capped = this.applyCap(visible, repeat.repeatId);
      const instances = this.buildInstances(capped, repeat.keyFrom, repeat.repeatId);
      const logicalSize = this.readLogicalSize(container ?? null);
      return { instances, logicalSize };
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    /**
     * repeat.targets[0].selector.css를 row CSS selector로 사용.
     * css 없으면 testId → role → '*' 순서로 fallback.
     */
    resolveRowCss(repeat) {
      const firstTarget = repeat.targets[0];
      if (!firstTarget) return "*";
      const ladder = firstTarget.selector;
      if (ladder.css) return ladder.css;
      if (ladder.testId) return `[data-testid="${CSS.escape(ladder.testId)}"]`;
      if (ladder.role) return `[role="${CSS.escape(ladder.role.name)}"]`;
      if (ladder.attr) return `[${ladder.attr}]`;
      return "*";
    }
    /**
     * 리스트를 REPEAT_MAX_INSTANCES 개까지만 허용 (DoS cap, T-15-06).
     * 초과 시 경고 + 앞 1000개만 반환.
     */
    applyCap(list, repeatId) {
      if (list.length <= REPEAT_MAX_INSTANCES) return list;
      console.warn(
        `[agrune] RepeatExpander: repeat "${repeatId}" truncated from ${list.length} to ${REPEAT_MAX_INSTANCES} instances (DoS cap)`
      );
      return list.slice(0, REPEAT_MAX_INSTANCES);
    }
    /**
     * element 배열 → RepeatInstance 배열.
     *
     * keyFrom 평가 순서:
     *   1. `new Function('el', `return String(${expr})`)` 컴파일 시도 (T-15-05 스코프 격리)
     *   2. 컴파일 실패(문법 오류, CSP EvalError) → 경고 + 모든 인스턴스 fallback `__idx_N`
     *   3. 런타임 실행 실패(ReferenceError, 예외) → 해당 인스턴스만 fallback + 경고
     *   4. 결과가 undefined/null/'undefined'/'null' → fallback + 경고
     *   5. 중복 key → `{key}__dup_{index}` suffix + 경고 (Pitfall 3)
     */
    buildInstances(els, keyFromExpr, repeatId) {
      let keyFn = null;
      try {
        keyFn = new Function("el", `return String(${keyFromExpr})`);
      } catch (err) {
        console.warn(
          `[agrune] RepeatExpander: keyFrom compile failed for repeat "${repeatId}":`,
          err
        );
      }
      const seen = /* @__PURE__ */ new Map();
      return els.map((el, index) => {
        let key;
        if (keyFn) {
          try {
            const raw = keyFn(el);
            if (raw === void 0 || raw === null || raw === "undefined" || raw === "null") {
              console.warn(
                `[agrune] RepeatExpander: keyFrom returned ${JSON.stringify(raw)} for repeat "${repeatId}" at index ${index}, using fallback`
              );
              key = `__idx_${index}`;
            } else {
              key = raw;
            }
          } catch (err) {
            console.warn(
              `[agrune] RepeatExpander: keyFrom eval failed for repeat "${repeatId}" at index ${index}:`,
              err
            );
            key = `__idx_${index}`;
          }
        } else {
          key = `__idx_${index}`;
        }
        if (seen.has(key)) {
          const dupKey = `${key}__dup_${index}`;
          console.warn(
            `[agrune] RepeatExpander: duplicate key "${key}" for repeat "${repeatId}" at index ${index}, using "${dupKey}"`
          );
          seen.set(dupKey, index);
          return { el, key: dupKey, index };
        }
        seen.set(key, index);
        return { el, key, index };
      });
    }
    /**
     * container element에서 aria-rowcount/setsize를 READ-ONLY로 읽어 logicalSize 반환.
     * Pitfall 5: setAttribute/setAttributeNS 절대 금지 — T-15-10 mitigate.
     *
     * 우선순위: aria-rowcount > aria-setsize > null
     */
    readLogicalSize(container) {
      if (!container) return null;
      const rowCount = container.getAttribute("aria-rowcount");
      if (rowCount !== null) {
        const n = Number.parseInt(rowCount, 10);
        if (Number.isFinite(n) && n >= 0) return n;
        return null;
      }
      const setSize = container.getAttribute("aria-setsize");
      if (setSize !== null) {
        const n = Number.parseInt(setSize, 10);
        if (Number.isFinite(n) && n >= 0) return n;
      }
      return null;
    }
  };

  // src/runtime/target-resolver.ts
  var HASH_CLASS_PATTERN = /\.[a-zA-Z0-9]{8,}(?![a-zA-Z0-9-])/;
  var NTH_CHILD_PATTERN = /:nth-child\(/;
  var SelectorForbiddenError = class extends Error {
    constructor(selector, message) {
      super(message);
      this.selector = selector;
      this.name = "SelectorForbiddenError";
    }
  };
  function assertNoHashClass(selector) {
    if (HASH_CLASS_PATTERN.test(selector)) {
      throw new SelectorForbiddenError(
        selector,
        `Selector "${selector}" contains a likely hash-based class. Use role, text, testId, or stable attribute instead.`
      );
    }
  }
  function assertNoNthChild(selector) {
    if (NTH_CHILD_PATTERN.test(selector)) {
      throw new SelectorForbiddenError(
        selector,
        `Selector "${selector}" uses :nth-child which is position-dependent. Use a stable identifier instead.`
      );
    }
  }
  function computeAccessibleName(element) {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map((id) => element.ownerDocument?.getElementById(id)).filter((el) => el !== null && el !== void 0).map((el) => el.textContent?.trim() ?? "").filter((s) => s.length > 0);
      if (parts.length > 0) return parts.join(" ");
    }
    return (element.textContent ?? "").trim();
  }
  function resolveByRole(doc, role) {
    const elements = Array.from(
      doc.querySelectorAll(`[role="${cssEscape(role.name)}"]`)
    );
    if (!role.level) return elements;
    return elements.filter((el) => computeAccessibleName(el) === role.level);
  }
  var TEXT_SELECTOR_SCOPE = 'button, a, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"]';
  function resolveByText(doc, text) {
    const candidates = Array.from(doc.querySelectorAll(TEXT_SELECTOR_SCOPE));
    const exact = candidates.filter((el) => {
      const name = computeAccessibleName(el);
      return name === text;
    });
    if (exact.length > 0) return exact;
    return candidates.filter((el) => computeAccessibleName(el).includes(text));
  }
  function resolveByTestId(doc, testId) {
    return Array.from(
      doc.querySelectorAll(`[data-testid="${cssEscape(testId)}"]`)
    );
  }
  function resolveByAttr(doc, attr) {
    assertNoHashClass(attr);
    assertNoNthChild(attr);
    return Array.from(doc.querySelectorAll(attr));
  }
  function resolveByCss(doc, css) {
    assertNoHashClass(css);
    assertNoNthChild(css);
    return Array.from(doc.querySelectorAll(css));
  }
  function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }
  function resolveByLadder(ladder, doc = document) {
    if (ladder.fiber) {
      const bridge = globalThis.__agrune_identity__;
      if (bridge && typeof bridge.resolve === "function") {
        try {
          const el = bridge.resolve(ladder.fiber.path);
          if (el) return [el];
        } catch {
        }
      }
    }
    if (ladder.role) {
      const matched = resolveByRole(doc, ladder.role);
      if (matched.length > 0) return matched;
    }
    if (ladder.text !== void 0 && ladder.text !== "") {
      const matched = resolveByText(doc, ladder.text);
      if (matched.length > 0) return matched;
    }
    if (ladder.testId) {
      const matched = resolveByTestId(doc, ladder.testId);
      if (matched.length > 0) return matched;
    }
    if (ladder.attr) {
      const matched = resolveByAttr(doc, ladder.attr);
      if (matched.length > 0) return matched;
    }
    if (ladder.css) {
      const matched = resolveByCss(doc, ladder.css);
      if (matched.length > 0) return matched;
    }
    return [];
  }

  // src/runtime/snapshot.ts
  var VALID_ACTIONS = /* @__PURE__ */ new Set(["click", "fill", "dblclick", "contextmenu", "hover", "longpress"]);
  var ACT_COMPATIBLE_KINDS = /* @__PURE__ */ new Set(["click", "dblclick", "contextmenu", "hover", "longpress"]);
  var DOM_SETTLE_TIMEOUT_MS = 320;
  var DOM_SETTLE_QUIET_WINDOW_MS = 48;
  var DOM_SETTLE_STABLE_FRAMES = 2;
  var SNAPSHOT_RELEVANT_ATTRIBUTES = [
    "aria-modal",
    "class",
    "disabled",
    "hidden",
    "role",
    "style"
  ];
  var REPEATED_TARGET_ID_DELIMITER = "__agrune_idx_";
  var REPEATED_TARGET_KEY_DELIMITER = "__agrune_repeatKey_";
  var _repeatExpander = new RepeatExpander();
  function collectDescriptors(manifest) {
    const result = [];
    for (const group of manifest.groups) {
      for (const target of group.targets) {
        const kinds = target.actionKinds.filter((k) => VALID_ACTIONS.has(k));
        if (kinds.length === 0) continue;
        result.push({
          actionKinds: [...new Set(kinds)],
          groupId: group.groupId,
          groupName: group.name,
          groupDesc: group.desc,
          target
        });
      }
      for (const repeat of group.repeats ?? []) {
        const { instances, logicalSize } = _expandRepeat(repeat);
        for (const instance of instances) {
          for (const target of repeat.targets) {
            const kinds = target.actionKinds.filter((k) => VALID_ACTIONS.has(k));
            if (kinds.length === 0) continue;
            result.push({
              actionKinds: [...new Set(kinds)],
              groupId: group.groupId,
              groupName: group.name,
              groupDesc: group.desc,
              target,
              repeatInstance: {
                repeatId: repeat.repeatId,
                index: instance.index,
                key: instance.key
              },
              _instanceEl: instance.el,
              _repeatStrategy: repeat.strategy,
              _repeatLogicalSize: logicalSize
            });
          }
        }
      }
    }
    return result.sort((left, right) => left.target.targetId.localeCompare(right.target.targetId));
  }
  function _expandRepeat(repeat) {
    const containerEl = repeat.containerSelector ? resolveByLadder(repeat.containerSelector)[0] ?? void 0 : void 0;
    if (repeat.strategy === "virtualized") {
      const result = _repeatExpander.expandVirtualized(repeat, containerEl);
      return { instances: result.instances, logicalSize: result.logicalSize };
    }
    return { instances: _repeatExpander.expand(repeat, containerEl), logicalSize: null };
  }
  function findElements(descriptor) {
    if (descriptor._instanceEl) {
      const rowEl = descriptor._instanceEl;
      const ladder = descriptor.target.selector;
      if (ladder.css) {
        const scoped = Array.from(rowEl.querySelectorAll(ladder.css));
        if (scoped.length > 0) return scoped;
      }
      return [rowEl];
    }
    return resolveByLadder(descriptor.target.selector);
  }
  function toRuntimeTargetId(baseTargetId, indexOrRepeat, total) {
    if (typeof indexOrRepeat === "object") {
      return `${indexOrRepeat.repeatId}${REPEATED_TARGET_KEY_DELIMITER}${indexOrRepeat.key}.${baseTargetId}`;
    }
    const index = indexOrRepeat;
    const resolvedTotal = total ?? 1;
    if (resolvedTotal <= 1) {
      return baseTargetId;
    }
    return `${baseTargetId}${REPEATED_TARGET_ID_DELIMITER}${index}`;
  }
  function parseRuntimeTargetId(targetId) {
    const keyDelimIdx = targetId.indexOf(REPEATED_TARGET_KEY_DELIMITER);
    if (keyDelimIdx > 0) {
      const repeatId = targetId.slice(0, keyDelimIdx);
      const rest = targetId.slice(keyDelimIdx + REPEATED_TARGET_KEY_DELIMITER.length);
      const dotIdx = rest.indexOf(".");
      if (dotIdx > 0) {
        const repeatKey = rest.slice(0, dotIdx);
        const baseTargetId2 = rest.slice(dotIdx + 1);
        if (repeatId && repeatKey && baseTargetId2) {
          return {
            baseTargetId: baseTargetId2,
            index: 0,
            hasExplicitIndex: false,
            repeatId,
            repeatKey
          };
        }
      }
      return { baseTargetId: targetId, index: 0, hasExplicitIndex: false };
    }
    const markerIndex = targetId.lastIndexOf(REPEATED_TARGET_ID_DELIMITER);
    if (markerIndex < 0) {
      return {
        baseTargetId: targetId,
        index: 0,
        hasExplicitIndex: false
      };
    }
    const baseTargetId = targetId.slice(0, markerIndex);
    const indexText = targetId.slice(markerIndex + REPEATED_TARGET_ID_DELIMITER.length);
    const index = Number(indexText);
    if (!baseTargetId || !Number.isInteger(index) || index < 0) {
      return {
        baseTargetId: targetId,
        index: 0,
        hasExplicitIndex: false
      };
    }
    return {
      baseTargetId,
      index,
      hasExplicitIndex: true
    };
  }
  function resolveRuntimeTarget(descriptors, requestedTargetId) {
    const parsed = parseRuntimeTargetId(requestedTargetId);
    if (parsed.repeatId && parsed.repeatKey) {
      const match = descriptors.find(
        (d) => d.repeatInstance != null && d.repeatInstance.repeatId === parsed.repeatId && d.repeatInstance.key === parsed.repeatKey && d.target.targetId === parsed.baseTargetId
      );
      if (!match) return null;
      const elements2 = findElements(match);
      if (elements2.length === 0) return null;
      return {
        descriptor: match,
        element: elements2[0],
        targetId: requestedTargetId
      };
    }
    const { baseTargetId, index } = parsed;
    const descriptor = descriptors.find((entry) => entry.target.targetId === baseTargetId);
    if (!descriptor) {
      return null;
    }
    const elements = findElements(descriptor);
    const element = elements[index];
    if (!element) {
      return null;
    }
    return {
      descriptor,
      element,
      targetId: toRuntimeTargetId(baseTargetId, index, elements.length)
    };
  }
  function resolveTargetReason(input) {
    if (!input.visible) {
      return "hidden";
    }
    if (!input.inViewport) {
      return "offscreen";
    }
    if (input.covered) {
      return "covered";
    }
    if (!input.enabled) {
      return "disabled";
    }
    if (input.actionKinds.includes("fill") && input.sensitive) {
      return "sensitive";
    }
    return "ready";
  }
  function captureTargetState(actionKinds, element, isCanvasGroup = false) {
    const sensitive = isSensitive(element);
    const visible = isVisible(element);
    const inViewport = visible && isElementInViewport(element);
    const enabled = isEnabled(element);
    const covered = inViewport ? !isTopmostInteractable(element) : false;
    const actionableNow = isCanvasGroup ? visible && enabled : visible && enabled && !covered;
    const overlay = isOverlayElement(element);
    return {
      visible,
      inViewport,
      enabled,
      covered,
      actionableNow,
      overlay,
      sensitive,
      reason: resolveTargetReason({
        actionKinds,
        visible,
        inViewport,
        enabled,
        covered,
        sensitive
      })
    };
  }
  function captureTarget(descriptor, element, targetId) {
    const state = captureTargetState(descriptor.actionKinds, element, false);
    const textContent = element.textContent?.trim() ?? "";
    const valuePreview = isFillableElement(element) && !state.sensitive ? element.value : null;
    const name = descriptor.target.name ?? textContent;
    const description = descriptor.target.desc ?? "";
    let center;
    let size;
    let coordSpace;
    if (state.actionableNow) {
      const domRect = element.getBoundingClientRect();
      const cx = domRect.left + domRect.width / 2;
      const cy = domRect.top + domRect.height / 2;
      center = { x: Math.round(cx), y: Math.round(cy) };
      size = { w: Math.round(domRect.width), h: Math.round(domRect.height) };
      coordSpace = "viewport";
    }
    return {
      actionKinds: descriptor.actionKinds,
      description,
      enabled: state.enabled,
      groupId: descriptor.groupId,
      groupName: descriptor.groupName,
      groupDesc: descriptor.groupDesc,
      name,
      reason: state.reason,
      selector: descriptor.target.selector,
      sensitive: state.sensitive,
      targetId,
      visible: state.visible,
      inViewport: state.inViewport,
      covered: state.covered,
      actionableNow: state.actionableNow,
      overlay: state.overlay,
      textContent,
      valuePreview,
      center,
      size,
      coordSpace,
      sourceFile: descriptor.target.sourceFile ?? "",
      sourceLine: descriptor.target.sourceLine ?? 0,
      sourceColumn: descriptor.target.sourceColumn ?? 0,
      // Phase 15-02 (REPEAT-03): repeatInstance passthrough (T-15-11: _instanceEl은 제외)
      ...descriptor.repeatInstance ? { repeatInstance: descriptor.repeatInstance } : {}
    };
  }
  function makeSnapshot(descriptors, store) {
    const targets = descriptors.flatMap((descriptor) => {
      const elements = findElements(descriptor);
      if (descriptor.repeatInstance) {
        return elements.map(
          (element) => captureTarget(
            descriptor,
            element,
            toRuntimeTargetId(descriptor.target.targetId, {
              repeatId: descriptor.repeatInstance.repeatId,
              key: descriptor.repeatInstance.key
            })
          )
        );
      }
      return elements.map(
        (element, index) => captureTarget(
          descriptor,
          element,
          toRuntimeTargetId(descriptor.target.targetId, index, elements.length)
        )
      );
    });
    const groupRepeatsAgg = /* @__PURE__ */ new Map();
    for (const descriptor of descriptors) {
      if (!descriptor.repeatInstance) continue;
      const { repeatId } = descriptor.repeatInstance;
      if (!groupRepeatsAgg.has(descriptor.groupId)) {
        groupRepeatsAgg.set(descriptor.groupId, /* @__PURE__ */ new Map());
      }
      const groupMap = groupRepeatsAgg.get(descriptor.groupId);
      if (!groupMap.has(repeatId)) {
        groupMap.set(repeatId, {
          strategy: "dom",
          // default — 아래에서 manifest에서 읽어올 수 없으므로 추적 필요
          instanceCount: 0,
          logicalSize: null
        });
      }
      groupMap.get(repeatId).instanceCount += 1;
    }
    const groups = /* @__PURE__ */ new Map();
    for (const target of targets) {
      const group = groups.get(target.groupId);
      if (group) {
        group.targetIds.push(target.targetId);
        continue;
      }
      groups.set(target.groupId, {
        groupId: target.groupId,
        groupName: target.groupName,
        groupDesc: target.groupDesc,
        targetIds: [target.targetId]
      });
    }
    const repeatMetaByKey = /* @__PURE__ */ new Map();
    for (const descriptor of descriptors) {
      if (!descriptor.repeatInstance) continue;
      const metaKey = `${descriptor.groupId}::${descriptor.repeatInstance.repeatId}`;
      if (!repeatMetaByKey.has(metaKey)) {
        repeatMetaByKey.set(metaKey, {
          strategy: descriptor._repeatStrategy ?? "dom",
          logicalSize: descriptor._repeatLogicalSize ?? null
        });
      }
    }
    for (const [groupId, repeatMap] of groupRepeatsAgg) {
      const group = groups.get(groupId);
      if (!group) continue;
      const repeatsArr = Array.from(repeatMap.entries()).map(([repeatId, agg]) => {
        const meta = repeatMetaByKey.get(`${groupId}::${repeatId}`);
        return {
          repeatId,
          strategy: meta?.strategy ?? agg.strategy,
          instanceCount: agg.instanceCount,
          logicalSize: meta?.logicalSize ?? agg.logicalSize
        };
      });
      if (repeatsArr.length > 0) {
        group.repeats = repeatsArr;
      }
    }
    const signature = JSON.stringify({
      targets: targets.map((target) => ({
        actionKinds: target.actionKinds,
        actionableNow: target.actionableNow,
        covered: target.covered,
        enabled: target.enabled,
        inViewport: target.inViewport,
        reason: target.reason,
        sensitive: target.sensitive,
        targetId: target.targetId,
        textContent: target.textContent,
        valuePreview: target.valuePreview,
        visible: target.visible,
        // Phase 15-02: signature에 repeatInstance.key 포함 → row reorder 시 version 증가
        repeatInstance: target.repeatInstance
      })),
      title: document.title,
      url: window.location.href
    });
    if (store.signature !== signature) {
      store.version += 1;
      store.signature = signature;
    }
    const snapshot = {
      schemaVersion: 3,
      capturedAt: Date.now(),
      groups: Array.from(groups.values()).map((group) => ({
        groupId: group.groupId,
        groupName: group.groupName,
        groupDesc: group.groupDesc,
        targetIds: group.targetIds.sort(),
        ...group.repeats && group.repeats.length > 0 ? { repeats: group.repeats } : {}
      })),
      targets,
      title: document.title,
      url: window.location.href,
      version: store.version
    };
    store.latest = snapshot;
    return snapshot;
  }
  function isRunnableSnapshotTarget(target) {
    return target.actionableNow === true;
  }
  function isOverlayFlowLocked(snapshot) {
    return snapshot.targets.some((target) => target.overlay && isRunnableSnapshotTarget(target));
  }
  function findSnapshotTarget(snapshot, targetId) {
    return snapshot.targets.find((target) => target.targetId === targetId);
  }
  function buildFlowBlockedResult(commandId, snapshot, targetId) {
    return buildErrorResult(
      commandId,
      "FLOW_BLOCKED",
      `target is blocked by active overlay flow: ${targetId}`,
      snapshot,
      targetId
    );
  }
  function buildErrorResult(commandId, code, message, snapshot, targetId) {
    return {
      commandId,
      error: createCommandError(code, message, {
        snapshotVersion: snapshot.version,
        targetId
      }),
      ok: false,
      snapshotVersion: snapshot.version,
      snapshot
    };
  }
  function buildSuccessResult(commandId, snapshot, result) {
    return {
      commandId,
      ok: true,
      result,
      snapshotVersion: snapshot.version,
      snapshot
    };
  }

  // ../../node_modules/.pnpm/ai-motion@0.4.8/node_modules/ai-motion/build/Motion.js
  function computeBorderGeometry(pixelWidth, pixelHeight, borderWidth, glowWidth) {
    const shortSide = Math.max(1, Math.min(pixelWidth, pixelHeight));
    const borderWidthPx = Math.min(borderWidth, 20);
    const glowWidthPx = glowWidth;
    const totalThick = Math.min(borderWidthPx + glowWidthPx, shortSide);
    const insetX = Math.min(totalThick, Math.floor(pixelWidth / 2));
    const insetY = Math.min(totalThick, Math.floor(pixelHeight / 2));
    const toClipX = (x) => x / pixelWidth * 2 - 1;
    const toClipY = (y) => y / pixelHeight * 2 - 1;
    const x0 = 0;
    const x1 = pixelWidth;
    const y0 = 0;
    const y1 = pixelHeight;
    const xi0 = insetX;
    const xi1 = pixelWidth - insetX;
    const yi0 = insetY;
    const yi1 = pixelHeight - insetY;
    const X0 = toClipX(x0);
    const X1 = toClipX(x1);
    const Y0 = toClipY(y0);
    const Y1 = toClipY(y1);
    const Xi0 = toClipX(xi0);
    const Xi1 = toClipX(xi1);
    const Yi0 = toClipY(yi0);
    const Yi1 = toClipY(yi1);
    const u0 = 0;
    const v0 = 0;
    const u1 = 1;
    const v1 = 1;
    const ui0 = insetX / pixelWidth;
    const ui1 = 1 - insetX / pixelWidth;
    const vi0 = insetY / pixelHeight;
    const vi1 = 1 - insetY / pixelHeight;
    const positions = new Float32Array([
      // Top strip
      X0,
      Y0,
      X1,
      Y0,
      X0,
      Yi0,
      X0,
      Yi0,
      X1,
      Y0,
      X1,
      Yi0,
      // Bottom strip
      X0,
      Yi1,
      X1,
      Yi1,
      X0,
      Y1,
      X0,
      Y1,
      X1,
      Yi1,
      X1,
      Y1,
      // Left strip
      X0,
      Yi0,
      Xi0,
      Yi0,
      X0,
      Yi1,
      X0,
      Yi1,
      Xi0,
      Yi0,
      Xi0,
      Yi1,
      // Right strip
      Xi1,
      Yi0,
      X1,
      Yi0,
      Xi1,
      Yi1,
      Xi1,
      Yi1,
      X1,
      Yi0,
      X1,
      Yi1
    ]);
    const uvs = new Float32Array([
      // Top strip
      u0,
      v0,
      u1,
      v0,
      u0,
      vi0,
      u0,
      vi0,
      u1,
      v0,
      u1,
      vi0,
      // Bottom strip
      u0,
      vi1,
      u1,
      vi1,
      u0,
      v1,
      u0,
      v1,
      u1,
      vi1,
      u1,
      v1,
      // Left strip
      u0,
      vi0,
      ui0,
      vi0,
      u0,
      vi1,
      u0,
      vi1,
      ui0,
      vi0,
      ui0,
      vi1,
      // Right strip
      ui1,
      vi0,
      u1,
      vi0,
      ui1,
      vi1,
      ui1,
      vi1,
      u1,
      vi0,
      u1,
      vi1
    ]);
    return { positions, uvs };
  }
  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader) || "Unknown shader error";
      gl.deleteShader(shader);
      throw new Error(info);
    }
    return shader;
  }
  function createProgram(gl, vertexSource, fragmentSource) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) || "Unknown link error";
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error(info);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }
  var fragmentShaderSource = `#version 300 es
precision lowp float;
in vec2 vUV;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBorderWidth;
uniform float uGlowWidth;
uniform float uBorderRadius;
uniform vec3 uColors[4];
uniform float uGlowExponent;
uniform float uGlowFactor;
const float PI = 3.14159265359;
const float TWO_PI = 2.0 * PI;
const float HALF_PI = 0.5 * PI;
const vec4 startPositions = vec4(0.0, PI, HALF_PI, 1.5 * PI);
const vec4 speeds = vec4(-1.9, -1.9, -1.5, 2.1);
const vec4 innerRadius = vec4(PI * 0.8, PI * 0.7, PI * 0.3, PI * 0.1);
const vec4 outerRadius = vec4(PI * 1.2, PI * 0.9, PI * 0.6, PI * 0.4);
float random(vec2 st) {
return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}
vec2 random2(vec2 st) {
return vec2(random(st), random(st + 1.0));
}
float aaStep(float edge, float d) {
float width = fwidth(d);
return smoothstep(edge - width * 0.5, edge + width * 0.5, d);
}
float aaFract(float x) {
float f = fract(x);
float w = fwidth(x);
float smooth_f = f * (1.0 - smoothstep(1.0 - w, 1.0, f));
return smooth_f;
}
float sdRoundedBox(in vec2 p, in vec2 b, in float r) {
vec2 q = abs(p) - b + r;
return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
float getInnerGlow(vec2 p, vec2 b, float radius) {
float dist_x = b.x - abs(p.x);
float dist_y = b.y - abs(p.y);
float glow_x = smoothstep(radius, 0.0, dist_x);
float glow_y = smoothstep(radius, 0.0, dist_y);
return 1.0 - (1.0 - glow_x) * (1.0 - glow_y);
}
float getVignette(vec2 uv) {
vec2 vignetteUv = uv;
vignetteUv = vignetteUv * (1.0 - vignetteUv);
float vignette = vignetteUv.x * vignetteUv.y * 25.0;
vignette = pow(vignette, 0.16);
vignette = 1.0 - vignette;
return vignette;
}
float uvToAngle(vec2 uv) {
vec2 center = vec2(0.5);
vec2 dir = uv - center;
return atan(dir.y, dir.x) + PI;
}
void main() {
vec2 uv = vUV;
vec2 pos = uv * uResolution;
vec2 centeredPos = pos - uResolution * 0.5;
vec2 size = uResolution - uBorderWidth;
vec2 halfSize = size * 0.5;
float dBorderBox = sdRoundedBox(centeredPos, halfSize, uBorderRadius);
float border = aaStep(0.0, dBorderBox);
float glow = getInnerGlow(centeredPos, halfSize, uGlowWidth);
float vignette = getVignette(uv);
glow *= vignette;
float posAngle = uvToAngle(uv);
vec4 lightCenter = mod(startPositions + speeds * uTime, TWO_PI);
vec4 angleDist = abs(posAngle - lightCenter);
vec4 disToLight = min(angleDist, TWO_PI - angleDist) / TWO_PI;
float intensityBorder[4];
intensityBorder[0] = 1.0;
intensityBorder[1] = smoothstep(0.4, 0.0, disToLight.y);
intensityBorder[2] = smoothstep(0.4, 0.0, disToLight.z);
intensityBorder[3] = smoothstep(0.2, 0.0, disToLight.w) * 0.5;
vec3 borderColor = vec3(0.0);
for(int i = 0; i < 4; i++) {
borderColor = mix(borderColor, uColors[i], intensityBorder[i]);
}
borderColor *= 1.1;
borderColor = clamp(borderColor, 0.0, 1.0);
float intensityGlow[4];
intensityGlow[0] = smoothstep(0.9, 0.0, disToLight.x);
intensityGlow[1] = smoothstep(0.7, 0.0, disToLight.y);
intensityGlow[2] = smoothstep(0.4, 0.0, disToLight.z);
intensityGlow[3] = smoothstep(0.1, 0.0, disToLight.w) * 0.7;
vec4 breath = smoothstep(0.0, 1.0, sin(uTime * 1.0 + startPositions * PI) * 0.2 + 0.8);
vec3 glowColor = vec3(0.0);
glowColor += uColors[0] * intensityGlow[0] * breath.x;
glowColor += uColors[1] * intensityGlow[1] * breath.y;
glowColor += uColors[2] * intensityGlow[2] * breath.z;
glowColor += uColors[3] * intensityGlow[3] * breath.w * glow;
glow = pow(glow, uGlowExponent);
glow *= random(pos + uTime) * 0.1 + 1.0;
glowColor *= glow * uGlowFactor;
glowColor = clamp(glowColor, 0.0, 1.0);
vec3 color = mix(glowColor, borderColor + glowColor * 0.2, border);
float alpha = mix(glow, 1.0, border);
outColor = vec4(color, alpha);
}`;
  var vertexShaderSource = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
void main() {
vUV = aUV;
gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
  var DEFAULT_COLORS = [
    "rgb(57, 182, 255)",
    "rgb(189, 69, 251)",
    "rgb(255, 87, 51)",
    "rgb(255, 214, 0)"
  ];
  function parseColor(colorStr) {
    const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) {
      throw new Error(`Invalid color format: ${colorStr}`);
    }
    const [, r, g, b] = match;
    return [parseInt(r) / 255, parseInt(g) / 255, parseInt(b) / 255];
  }
  var Motion = class {
    element;
    canvas;
    options;
    running = false;
    disposed = false;
    startTime = 0;
    lastTime = 0;
    rafId = null;
    glr;
    observer;
    constructor(options = {}) {
      this.options = {
        width: options.width ?? 600,
        height: options.height ?? 600,
        ratio: options.ratio ?? window.devicePixelRatio ?? 1,
        borderWidth: options.borderWidth ?? 8,
        glowWidth: options.glowWidth ?? 200,
        borderRadius: options.borderRadius ?? 8,
        mode: options.mode ?? "light",
        ...options
      };
      this.canvas = document.createElement("canvas");
      if (this.options.classNames) {
        this.canvas.className = this.options.classNames;
      }
      if (this.options.styles) {
        Object.assign(this.canvas.style, this.options.styles);
      }
      this.canvas.style.display = "block";
      this.canvas.style.transformOrigin = "center";
      this.canvas.style.pointerEvents = "none";
      this.element = this.canvas;
      this.setupGL();
      if (!this.options.skipGreeting) this.greet();
    }
    start() {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      if (this.running) return;
      if (!this.glr) {
        console.error("WebGL resources are not initialized.");
        return;
      }
      this.running = true;
      this.startTime = performance.now();
      this.resize(this.options.width ?? 600, this.options.height ?? 600, this.options.ratio);
      this.glr.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.glr.gl.useProgram(this.glr.program);
      this.glr.gl.uniform2f(this.glr.uResolution, this.canvas.width, this.canvas.height);
      this.checkGLError(this.glr.gl, "start: after initial setup");
      const loop = () => {
        if (!this.running || !this.glr) return;
        this.rafId = requestAnimationFrame(loop);
        const now = performance.now();
        const delta = now - this.lastTime;
        if (delta < 1e3 / 32) return;
        this.lastTime = now;
        const t = (now - this.startTime) * 1e-3;
        this.render(t);
      };
      this.rafId = requestAnimationFrame(loop);
    }
    pause() {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      this.running = false;
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.running = false;
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      const { gl, vao, positionBuffer, uvBuffer, program } = this.glr;
      if (vao) gl.deleteVertexArray(vao);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (uvBuffer) gl.deleteBuffer(uvBuffer);
      gl.deleteProgram(program);
      if (this.observer) this.observer.disconnect();
      this.canvas.remove();
    }
    resize(width, height, ratio) {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      this.options.width = width;
      this.options.height = height;
      if (ratio) this.options.ratio = ratio;
      if (!this.running) return;
      const { gl, program, vao, positionBuffer, uvBuffer, uResolution } = this.glr;
      const dpr = ratio ?? this.options.ratio ?? window.devicePixelRatio ?? 1;
      const desiredWidth = Math.max(1, Math.floor(width * dpr));
      const desiredHeight = Math.max(1, Math.floor(height * dpr));
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      if (this.canvas.width !== desiredWidth || this.canvas.height !== desiredHeight) {
        this.canvas.width = desiredWidth;
        this.canvas.height = desiredHeight;
      }
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.checkGLError(gl, "resize: after viewport setup");
      const { positions, uvs } = computeBorderGeometry(
        this.canvas.width,
        this.canvas.height,
        this.options.borderWidth * dpr,
        this.options.glowWidth * dpr
      );
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      const aPosition = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      this.checkGLError(gl, "resize: after position buffer update");
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      const aUV = gl.getAttribLocation(program, "aUV");
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
      this.checkGLError(gl, "resize: after UV buffer update");
      gl.useProgram(program);
      gl.uniform2f(uResolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.glr.uBorderWidth, this.options.borderWidth * dpr);
      gl.uniform1f(this.glr.uGlowWidth, this.options.glowWidth * dpr);
      gl.uniform1f(this.glr.uBorderRadius, this.options.borderRadius * dpr);
      this.checkGLError(gl, "resize: after uniform updates");
      const now = performance.now();
      this.lastTime = now;
      const t = (now - this.startTime) * 1e-3;
      this.render(t);
    }
    /**
     * Automatically resizes the canvas to match the dimensions of the given element.
     * @note using ResizeObserver
     */
    autoResize(sourceElement) {
      if (this.observer) {
        this.observer.disconnect();
      }
      this.observer = new ResizeObserver(() => {
        const rect = sourceElement.getBoundingClientRect();
        this.resize(rect.width, rect.height);
      });
      this.observer.observe(sourceElement);
    }
    fadeIn() {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      return new Promise((resolve, reject) => {
        const animation = this.canvas.animate(
          [
            { opacity: 0, transform: "scale(1.2)" },
            { opacity: 1, transform: "scale(1)" }
          ],
          { duration: 300, easing: "ease-out", fill: "forwards" }
        );
        animation.onfinish = () => resolve();
        animation.oncancel = () => reject("canceled");
      });
    }
    fadeOut() {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      return new Promise((resolve, reject) => {
        const animation = this.canvas.animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(1.2)" }
          ],
          { duration: 300, easing: "ease-in", fill: "forwards" }
        );
        animation.onfinish = () => resolve();
        animation.oncancel = () => reject("canceled");
      });
    }
    checkGLError(gl, context) {
      let error = gl.getError();
      if (error !== gl.NO_ERROR) {
        console.group(`\u{1F534} WebGL Error in ${context}`);
        while (error !== gl.NO_ERROR) {
          const errorName = this.getGLErrorName(gl, error);
          console.error(`${errorName} (0x${error.toString(16)})`);
          error = gl.getError();
        }
        console.groupEnd();
      }
    }
    getGLErrorName(gl, error) {
      switch (error) {
        case gl.INVALID_ENUM:
          return "INVALID_ENUM";
        case gl.INVALID_VALUE:
          return "INVALID_VALUE";
        case gl.INVALID_OPERATION:
          return "INVALID_OPERATION";
        case gl.INVALID_FRAMEBUFFER_OPERATION:
          return "INVALID_FRAMEBUFFER_OPERATION";
        case gl.OUT_OF_MEMORY:
          return "OUT_OF_MEMORY";
        case gl.CONTEXT_LOST_WEBGL:
          return "CONTEXT_LOST_WEBGL";
        default:
          return "UNKNOWN_ERROR";
      }
    }
    setupGL() {
      const gl = this.canvas.getContext("webgl2", { antialias: false, alpha: true });
      if (!gl) {
        throw new Error("WebGL2 is required but not available.");
      }
      const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
      this.checkGLError(gl, "setupGL: after createProgram");
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      this.checkGLError(gl, "setupGL: after VAO creation");
      const pw = this.canvas.width || 2;
      const ph = this.canvas.height || 2;
      const { positions, uvs } = computeBorderGeometry(
        pw,
        ph,
        this.options.borderWidth,
        this.options.glowWidth
      );
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      const aPosition = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      this.checkGLError(gl, "setupGL: after position buffer setup");
      const uvBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      const aUV = gl.getAttribLocation(program, "aUV");
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
      this.checkGLError(gl, "setupGL: after UV buffer setup");
      const uResolution = gl.getUniformLocation(program, "uResolution");
      const uTime = gl.getUniformLocation(program, "uTime");
      const uBorderWidth = gl.getUniformLocation(program, "uBorderWidth");
      const uGlowWidth = gl.getUniformLocation(program, "uGlowWidth");
      const uBorderRadius = gl.getUniformLocation(program, "uBorderRadius");
      const uColors = gl.getUniformLocation(program, "uColors");
      const uGlowExponent = gl.getUniformLocation(program, "uGlowExponent");
      const uGlowFactor = gl.getUniformLocation(program, "uGlowFactor");
      gl.useProgram(program);
      gl.uniform1f(uBorderWidth, this.options.borderWidth);
      gl.uniform1f(uGlowWidth, this.options.glowWidth);
      gl.uniform1f(uBorderRadius, this.options.borderRadius);
      if (this.options.mode === "dark") {
        gl.uniform1f(uGlowExponent, 2);
        gl.uniform1f(uGlowFactor, 1.8);
      } else {
        gl.uniform1f(uGlowExponent, 1);
        gl.uniform1f(uGlowFactor, 1);
      }
      const colorVecs = (this.options.colors || DEFAULT_COLORS).map(parseColor);
      for (let i = 0; i < colorVecs.length; i++) {
        gl.uniform3f(gl.getUniformLocation(program, `uColors[${i}]`), ...colorVecs[i]);
      }
      this.checkGLError(gl, "setupGL: after uniform setup");
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.glr = {
        gl,
        program,
        vao,
        positionBuffer,
        uvBuffer,
        uResolution,
        uTime,
        uBorderWidth,
        uGlowWidth,
        uBorderRadius,
        uColors
      };
    }
    render(t) {
      if (!this.glr) return;
      const { gl, program, vao, uTime } = this.glr;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform1f(uTime, t);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 24);
      this.checkGLError(gl, "render: after draw call");
      gl.bindVertexArray(null);
    }
    greet() {
      console.log(
        `%c\u{1F308} ai-motion ${"0.4.8"} \u{1F308}`,
        "background: linear-gradient(90deg, #39b6ff, #bd45fb, #ff5733, #ffd600); color: white; text-shadow: 0 0 2px rgba(0, 0, 0, 0.2); font-weight: bold; font-size: 1em; padding: 2px 12px; border-radius: 6px;"
      );
    }
  };

  // src/runtime/cursor-animator.ts
  var CURSOR_STYLE_ID2 = "agrune-cursor-style";
  var CURSOR_CLICK_PRESS_MS = 100;
  var IDLE_TIMEOUT_MS = 5e3;
  var DEFAULT_POINTER_DURATION_MS = 600;
  function resolvePointerDurationMs(durationMs) {
    return Number.isFinite(durationMs) && durationMs != null && durationMs >= 0 ? durationMs : DEFAULT_POINTER_DURATION_MS;
  }
  var cursorState = null;
  function ensureCursorStyles() {
    if (document.getElementById(CURSOR_STYLE_ID2)) return;
    const style = document.createElement("style");
    style.id = CURSOR_STYLE_ID2;
    style.textContent = `
.agrune-cursor{position:fixed;top:0;left:0;width:75px;height:75px;pointer-events:none;z-index:2147483647;will-change:transform;display:none}
.agrune-cursor-filling{position:absolute;width:100%;height:100%;background-image:url("${POINTER_FILL_SVG}");background-size:100% 100%;background-repeat:no-repeat;filter:drop-shadow(3px 4px 4px rgba(0,0,0,0.4));transform-origin:center;transform:rotate(-135deg) scale(1.2);margin-left:-10px;margin-top:-18px}
.agrune-cursor-border{position:absolute;width:100%;height:100%;background:linear-gradient(45deg,rgb(57,182,255),rgb(189,69,251));-webkit-mask-image:url("${POINTER_BORDER_MASK_SVG}");mask-image:url("${POINTER_BORDER_MASK_SVG}");-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;transform-origin:center;transform:rotate(-135deg) scale(1.2);margin-left:-10px;margin-top:-18px}
.agrune-cursor-ripple{position:absolute;width:100%;height:100%;pointer-events:none;margin-left:-50%;margin-top:-50%}
.agrune-cursor-ripple::after{content:"";opacity:0;position:absolute;inset:0;border:4px solid rgba(57,182,255,1);border-radius:50%}
.agrune-cursor.clicking .agrune-cursor-ripple::after{animation:agrune-ripple 300ms ease-out forwards}
@keyframes agrune-ripple{0%{transform:scale(0);opacity:1}100%{transform:scale(2);opacity:0}}
`;
    document.head.appendChild(style);
  }
  function createPointerCursorElement() {
    ensureCursorStyles();
    const el = document.createElement("div");
    el.className = "agrune-cursor";
    el.setAttribute("data-agrune-pointer", "true");
    const ripple = document.createElement("div");
    ripple.className = "agrune-cursor-ripple";
    const filling = document.createElement("div");
    filling.className = "agrune-cursor-filling";
    const border = document.createElement("div");
    border.className = "agrune-cursor-border";
    el.appendChild(ripple);
    el.appendChild(filling);
    el.appendChild(border);
    return el;
  }
  function createSvgCursorElement(meta) {
    const el = document.createElement("div");
    el.setAttribute("data-agrune-pointer", "true");
    el.innerHTML = meta.svg ?? "";
    Object.assign(el.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      width: `${meta.width}px`,
      height: `${meta.height}px`,
      pointerEvents: "none",
      zIndex: "2147483647",
      willChange: "transform",
      display: "none"
    });
    return el;
  }
  function getOrCreateCursorElement(cursorName) {
    const meta = getCursorMeta(cursorName);
    if (cursorState) {
      if (!cursorState.element.parentElement) {
        document.body.appendChild(cursorState.element);
      }
      if (cursorState.cursorName !== cursorName) {
        cursorState.element.remove();
        const el2 = meta.kind === "css-layers" ? createPointerCursorElement() : createSvgCursorElement(meta);
        document.body.appendChild(el2);
        cursorState.element = el2;
        cursorState.cursorName = cursorName;
      }
      return cursorState;
    }
    const el = meta.kind === "css-layers" ? createPointerCursorElement() : createSvgCursorElement(meta);
    document.body.appendChild(el);
    cursorState = { element: el, cursorName, lastX: null, lastY: null };
    return cursorState;
  }
  function saveCursorPosition(state, x, y) {
    state.lastX = x;
    state.lastY = y;
  }
  function getCursorStartPosition(state) {
    if (state.lastX !== null && state.lastY !== null) {
      return {
        x: state.lastX,
        y: state.lastY
      };
    }
    return {
      x: window.innerWidth + 20,
      y: window.innerHeight / 2
    };
  }
  function getCursorTranslatePosition(coords, meta) {
    return {
      x: coords.clientX - meta.hotspotX,
      y: coords.clientY - meta.hotspotY
    };
  }
  function setCursorTransform(el, x, y, scale = 1) {
    el.style.transform = scale === 1 ? `translate(${x}px, ${y}px)` : `translate(${x}px, ${y}px) scale(${scale})`;
  }
  async function waitForCursorTransition(el) {
    await new Promise((r) => {
      const done = () => {
        el.removeEventListener("transitionend", done);
        r();
      };
      el.addEventListener("transitionend", done, { once: true });
      setTimeout(done, CURSOR_CLICK_PRESS_MS + 50);
    });
  }
  function applyCursorPressStyle(el) {
    el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`;
  }
  function removeCursorPressStyle(el) {
    el.style.transition = "";
  }
  function triggerCursorClick(el) {
    el.classList.remove("clicking");
    void el.offsetHeight;
    el.classList.add("clicking");
  }
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function animateWithRAF(durationMs, onFrame) {
    return new Promise((resolve) => {
      const startTime = performance.now();
      function tick(now) {
        const elapsed = now - startTime;
        const raw = Math.min(elapsed / durationMs, 1);
        onFrame(raw);
        if (raw < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }
  function hidePointerOverlay() {
    if (!cursorState) return;
    cursorState.element.style.display = "none";
    cursorState.element.style.transition = "";
    cursorState.element.classList.remove("clicking");
  }
  function getIdleCursorPosition(meta) {
    return {
      x: window.innerWidth - meta.hotspotX - 32,
      y: 32 - meta.hotspotY
    };
  }
  function showIdlePointerOverlay(cursorName) {
    const meta = getCursorMeta(cursorName);
    const state = getOrCreateCursorElement(cursorName);
    const el = state.element;
    const position = state.lastX != null && state.lastY != null ? { x: state.lastX, y: state.lastY } : getIdleCursorPosition(meta);
    el.style.display = "block";
    el.style.transition = "";
    el.classList.remove("clicking");
    setCursorTransform(el, position.x, position.y);
    state.lastX = position.x;
    state.lastY = position.y;
  }
  async function animateCursorTo(element, cursorName, durationMs, onPress) {
    const animationDurationMs = resolvePointerDurationMs(durationMs);
    const meta = getCursorMeta(cursorName);
    const state = getOrCreateCursorElement(cursorName);
    const el = state.element;
    const { x: endX, y: endY } = getCursorTranslatePosition(getInteractablePoint(element), meta);
    const { x: startX, y: startY } = getCursorStartPosition(state);
    el.style.display = "block";
    setCursorTransform(el, startX, startY);
    await animateWithRAF(animationDurationMs, (raw) => {
      const t = easeOutCubic(raw);
      const cx = startX + (endX - startX) * t;
      const cy = startY + (endY - startY) * t;
      setCursorTransform(el, cx, cy);
    });
    el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`;
    setCursorTransform(el, endX, endY, 0.85);
    await waitForCursorTransition(el);
    triggerCursorClick(el);
    onPress?.();
    setCursorTransform(el, endX, endY, 1);
    await waitForCursorTransition(el);
    el.style.transition = "";
    state.lastX = endX;
    state.lastY = endY;
  }
  async function flashPointerOverlay(element, config, onPress) {
    await animateCursorTo(
      element,
      config.cursorName ?? DEFAULT_CURSOR_NAME,
      config.pointerDurationMs,
      onPress
    );
  }
  var motionInstance = null;
  var motionWrapper = null;
  var currentAuroraTheme = "dark";
  function showAuroraGlow(theme) {
    if (motionInstance && motionWrapper?.isConnected && currentAuroraTheme === theme) return;
    if (motionInstance && !motionWrapper?.isConnected) {
      motionInstance = null;
      motionWrapper = null;
    }
    if (motionWrapper && currentAuroraTheme !== theme) {
      const staleWrapper = motionWrapper;
      try {
        motionInstance?.fadeOut();
      } catch {
      }
      staleWrapper.remove();
      motionInstance = null;
      motionWrapper = null;
    }
    try {
      if (!document.body) return;
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-agrune-aurora", "true");
      Object.assign(wrapper.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483646",
        overflow: "hidden",
        pointerEvents: "none"
      });
      document.body.appendChild(wrapper);
      const motion = new Motion({
        mode: theme,
        borderWidth: 2,
        glowWidth: 800,
        borderRadius: 0,
        styles: { position: "absolute", inset: "0" }
      });
      wrapper.appendChild(motion.element);
      motion.autoResize(wrapper);
      motion.start();
      motion.fadeIn();
      motionInstance = motion;
      motionWrapper = wrapper;
      currentAuroraTheme = theme;
    } catch {
    }
  }
  function hideAuroraGlow() {
    if (!motionInstance || !motionWrapper) return;
    try {
      motionInstance.fadeOut();
    } catch {
    }
    const wrapper = motionWrapper;
    motionInstance = null;
    motionWrapper = null;
    setTimeout(() => wrapper.remove(), 500);
  }

  // src/runtime/command-handlers.ts
  var DEFAULT_OPTIONS = {
    clickAutoScroll: true,
    clickRetryCount: 2,
    clickRetryDelayMs: 120
  };
  var DEFAULT_EXECUTION_CONFIG = {
    ...DEFAULT_RUNTIME_CONFIG
  };
  var MAX_READ_CHARS = 5e4;
  var SKIP_TAGS = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "SVG"
  ]);
  var DRAG_MOVE_STEPS = 12;
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function toCoords(pc) {
    return { x: pc.clientX, y: pc.clientY };
  }
  function raf() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }
  function normalizeExecutionConfig(runtimeOptions, next) {
    return mergeRuntimeConfig(
      {
        ...DEFAULT_EXECUTION_CONFIG,
        autoScroll: runtimeOptions.clickAutoScroll
      },
      next
    );
  }
  function isVisibleForRead(el) {
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }
  function domToMarkdown(root) {
    const parts = [];
    walkNode(root, parts, 0);
    return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
  }
  function walkNode(node, parts, listDepth) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, " ") ?? "";
      if (text.trim()) parts.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    if (!isVisibleForRead(el)) return;
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      const text = el.textContent?.trim() ?? "";
      if (text) parts.push(`

${"#".repeat(level)} ${text}

`);
      return;
    }
    if (tag === "P") {
      parts.push("\n\n");
      Array.from(el.childNodes).forEach((child) => walkNode(child, parts, listDepth));
      parts.push("\n\n");
      return;
    }
    if (tag === "UL" || tag === "OL") {
      parts.push("\n");
      let index = 1;
      Array.from(el.children).forEach((child) => {
        if (child.tagName === "LI") {
          const indent = "  ".repeat(listDepth);
          const bullet = tag === "UL" ? "- " : `${index++}. `;
          parts.push(`${indent}${bullet}`);
          Array.from(child.childNodes).forEach((liChild) => walkNode(liChild, parts, listDepth + 1));
          parts.push("\n");
        }
      });
      parts.push("\n");
      return;
    }
    if (tag === "TABLE") {
      const rows = el.querySelectorAll("tr");
      rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll("th, td");
        const cellTexts = Array.from(cells).map((c) => c.textContent?.trim() ?? "");
        parts.push(`| ${cellTexts.join(" | ")} |
`);
        if (rowIndex === 0) {
          parts.push(`| ${cellTexts.map(() => "---").join(" | ")} |
`);
        }
      });
      parts.push("\n");
      return;
    }
    if (tag === "A") {
      const href = el.href;
      const text = el.textContent?.trim() ?? "";
      if (text) parts.push(`[${text}](${href})`);
      return;
    }
    if (tag === "IMG") {
      const alt = el.getAttribute("alt") ?? "";
      const src = el.src;
      parts.push(`![${alt}](${src})`);
      return;
    }
    if (tag === "STRONG" || tag === "B") {
      parts.push("**");
      Array.from(el.childNodes).forEach((child) => walkNode(child, parts, listDepth));
      parts.push("**");
      return;
    }
    if (tag === "EM" || tag === "I") {
      parts.push("*");
      Array.from(el.childNodes).forEach((child) => walkNode(child, parts, listDepth));
      parts.push("*");
      return;
    }
    if (tag === "CODE") {
      const parent = el.parentElement;
      if (parent?.tagName === "PRE") {
        parts.push(`

\`\`\`
${el.textContent ?? ""}
\`\`\`

`);
        return;
      }
      parts.push(`\`${el.textContent?.trim() ?? ""}\``);
      return;
    }
    if (tag === "PRE") {
      const codeChild = el.querySelector("code");
      if (codeChild) {
        walkNode(codeChild, parts, listDepth);
        return;
      }
      parts.push(`

\`\`\`
${el.textContent ?? ""}
\`\`\`

`);
      return;
    }
    if (tag === "INPUT") {
      const input = el;
      parts.push(`[input: ${input.value || input.placeholder || ""}]`);
      return;
    }
    if (tag === "SELECT") {
      const select = el;
      const selected = select.options[select.selectedIndex];
      parts.push(`[select: ${selected?.text ?? ""}]`);
      return;
    }
    if (tag === "TEXTAREA") {
      const textarea = el;
      parts.push(`[textarea: ${textarea.value || textarea.placeholder || ""}]`);
      return;
    }
    if (tag === "DIV" || tag === "SECTION" || tag === "ARTICLE" || tag === "MAIN" || tag === "HEADER" || tag === "FOOTER" || tag === "NAV" || tag === "ASIDE") {
      parts.push("\n");
      Array.from(el.childNodes).forEach((child) => walkNode(child, parts, listDepth));
      parts.push("\n");
      return;
    }
    if (tag === "BR") {
      parts.push("\n");
      return;
    }
    if (tag === "HR") {
      parts.push("\n\n---\n\n");
      return;
    }
    Array.from(el.childNodes).forEach((child) => walkNode(child, parts, listDepth));
  }
  function setElementValue(element, value) {
    element.focus();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      descriptor?.set?.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function detectMaskedInput(element) {
    if (!(element instanceof HTMLInputElement)) return false;
    const type = element.type;
    if (type === "tel") return true;
    const inputMode = element.getAttribute("inputmode");
    const pattern = element.getAttribute("pattern");
    if ((inputMode === "tel" || inputMode === "numeric") && pattern) return true;
    if (element.className && /\b(cleave|masked|imask)\b/i.test(element.className)) {
      return true;
    }
    return false;
  }
  async function withDescriptor(deps, commandId, targetId, expectedVersion, effect) {
    const currentSnapshot = deps.captureSnapshot();
    if (typeof expectedVersion === "number" && Number.isFinite(expectedVersion) && expectedVersion !== currentSnapshot.version) {
      return buildErrorResult(
        commandId,
        "STALE_SNAPSHOT",
        `snapshot version mismatch: expected ${expectedVersion}, received ${currentSnapshot.version}`,
        currentSnapshot,
        targetId
      );
    }
    const resolvedTarget = resolveRuntimeTarget(deps.getDescriptors(), targetId);
    if (!resolvedTarget) {
      const parsed = parseRuntimeTargetId(targetId);
      if (parsed.repeatId && parsed.repeatKey) {
        return buildErrorResult(
          commandId,
          "REPEAT_INDEX_OUT_OF_RANGE",
          `repeat "${parsed.repeatId}": key "${parsed.repeatKey}" not found in current snapshot.`,
          currentSnapshot,
          targetId
        );
      }
      return buildErrorResult(commandId, "TARGET_NOT_FOUND", `target not found: ${targetId}`, currentSnapshot, targetId);
    }
    return effect(resolvedTarget.descriptor, resolvedTarget.element, currentSnapshot);
  }
  async function handleWait(deps, input) {
    const timeoutMs = typeof input.timeoutMs === "number" && input.timeoutMs > 0 ? input.timeoutMs : 5e3;
    const startedAt = Date.now();
    const { baseTargetId } = parseRuntimeTargetId(input.targetId);
    const descriptor = deps.getDescriptors().find((entry) => entry.target.targetId === baseTargetId);
    if (!descriptor) {
      const snapshot = deps.captureSnapshot();
      return buildErrorResult(
        input.commandId ?? input.targetId,
        "TARGET_NOT_FOUND",
        `target not found: ${input.targetId}`,
        snapshot,
        input.targetId
      );
    }
    for (; ; ) {
      const snapshot = deps.captureSnapshot();
      const resolvedTarget = resolveRuntimeTarget(deps.getDescriptors(), input.targetId);
      if (!resolvedTarget) {
        return buildErrorResult(
          input.commandId ?? input.targetId,
          "TARGET_NOT_FOUND",
          `target not found: ${input.targetId}`,
          snapshot,
          input.targetId
        );
      }
      const target = captureTarget(descriptor, resolvedTarget.element, resolvedTarget.targetId);
      const matched = input.state === "visible" && target.visible || input.state === "hidden" && !target.visible || input.state === "enabled" && target.enabled || input.state === "disabled" && !target.enabled;
      if (matched) {
        return buildSuccessResult(input.commandId ?? input.targetId, snapshot, {
          state: input.state,
          targetId: input.targetId
        });
      }
      if (Date.now() - startedAt >= timeoutMs) {
        return buildErrorResult(
          input.commandId ?? input.targetId,
          "TIMEOUT",
          `wait timed out for ${input.targetId} (${input.state})`,
          snapshot,
          input.targetId
        );
      }
      await sleep(50);
    }
  }
  async function handleRead(deps, input) {
    const root = input.selector ? document.querySelector(input.selector) : document.body;
    if (!root) {
      const snapshot2 = deps.captureSnapshot();
      return buildErrorResult(
        input.commandId ?? "read",
        "TARGET_NOT_FOUND",
        `selector not found: ${input.selector}`,
        snapshot2
      );
    }
    await deps.captureSettledSnapshot(1);
    const fullMarkdown = domToMarkdown(root);
    const truncated = fullMarkdown.length > MAX_READ_CHARS;
    const markdown = truncated ? fullMarkdown.slice(0, MAX_READ_CHARS) + "\n\n[truncated \u2014 use selector to read specific sections]" : fullMarkdown;
    const snapshot = deps.captureSnapshot();
    return buildSuccessResult(input.commandId ?? "read", snapshot, {
      markdown,
      truncated,
      charCount: fullMarkdown.length
    });
  }
  async function handleFill(deps, input) {
    return withDescriptor(deps, input.commandId ?? input.targetId, input.targetId, input.expectedVersion, async (descriptor, element, snapshot) => {
      const snapshotTarget = findSnapshotTarget(snapshot, input.targetId);
      if (snapshotTarget && isOverlayFlowLocked(snapshot) && !snapshotTarget.overlay) {
        return buildFlowBlockedResult(input.commandId ?? input.targetId, snapshot, input.targetId);
      }
      if (!descriptor.actionKinds.includes("fill")) {
        return buildErrorResult(input.commandId ?? input.targetId, "INVALID_TARGET", `target does not support fill: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!canReceiveTextInput(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "INVALID_TARGET", `target is not fillable: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!isVisible(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "NOT_VISIBLE", `target is not visible: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      const config = deps.resolveExecutionConfig(input.config);
      await smoothScrollIntoView(element);
      if (!isElementInViewport(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "NOT_VISIBLE", `target is outside of viewport: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!isTopmostInteractable(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "NOT_VISIBLE", `target is covered by another element: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!isEnabled(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "DISABLED", `target is disabled: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (config.clickDelayMs > 0) {
        await sleep(config.clickDelayMs);
      }
      if (element instanceof HTMLSelectElement) {
        if (config.pointerAnimation) {
          await deps.queue.push({
            type: "animation",
            execute: () => flashPointerOverlay(element, config, () => setElementValue(element, input.value))
          });
        } else {
          setElementValue(element, input.value);
        }
        const nextSnapshot2 = await deps.captureSettledSnapshot(2);
        return buildSuccessResult(input.commandId ?? input.targetId, nextSnapshot2, {
          actionKind: "fill",
          targetId: input.targetId,
          value: input.value
        });
      }
      const clear = input.clear ?? true;
      const requestedStrategy = input.strategy ?? "auto";
      const isContentEditable = isContentEditableElement(element);
      const isMasked = element instanceof HTMLElement && detectMaskedInput(element);
      const strategy = requestedStrategy === "auto" ? isMasked ? "keystroke" : "insert" : requestedStrategy;
      const performFill = async () => {
        try {
          ;
          element.focus({ preventScroll: true });
        } catch {
          ;
          element.focus();
        }
        if (document.activeElement !== element && !isContentEditable) {
          ;
          element.focus();
        }
        if (isContentEditable) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          selection?.removeAllRanges();
          selection?.addRange(range);
          if (!clear) {
            selection?.collapseToEnd();
          }
        } else if (clear) {
          await deps.eventSequences.selectAllAndDelete();
        }
        if (strategy === "dom-setter") {
          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            setElementValue(element, input.value);
          }
          return;
        }
        if (strategy === "keystroke") {
          await deps.eventSequences.typeText(input.value);
          return;
        }
        await deps.eventSequences.insertText(input.value);
      };
      if (config.pointerAnimation) {
        await deps.queue.push({
          type: "animation",
          execute: () => flashPointerOverlay(element, config, performFill)
        });
      } else {
        await performFill();
      }
      const nextSnapshot = await deps.captureSettledSnapshot(2);
      return buildSuccessResult(input.commandId ?? input.targetId, nextSnapshot, {
        actionKind: "fill",
        targetId: input.targetId,
        value: input.value
      });
    });
  }
  async function animateCursorThenCdpAction(element, cursorName, durationMs, cdpAction) {
    const animationDurationMs = resolvePointerDurationMs(durationMs);
    const meta = getCursorMeta(cursorName);
    const state = getOrCreateCursorElement(cursorName);
    const el = state.element;
    const interactablePoint = getInteractablePoint(element);
    const { x: endX, y: endY } = getCursorTranslatePosition(interactablePoint, meta);
    const { x: startX, y: startY } = getCursorStartPosition(state);
    el.style.display = "block";
    setCursorTransform(el, startX, startY);
    await animateWithRAF(animationDurationMs, (raw) => {
      const t = easeOutCubic(raw);
      const cx = startX + (endX - startX) * t;
      const cy = startY + (endY - startY) * t;
      setCursorTransform(el, cx, cy);
    });
    el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`;
    setCursorTransform(el, endX, endY, 0.85);
    await waitForCursorTransition(el);
    triggerCursorClick(el);
    await cdpAction(toCoords(interactablePoint));
    setCursorTransform(el, endX, endY, 1);
    await waitForCursorTransition(el);
    el.style.transition = "";
    saveCursorPosition(state, endX, endY);
  }
  function interpolateDragSteps(src, dst, steps) {
    const result = [];
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      result.push({
        x: src.clientX + (dst.clientX - src.clientX) * progress,
        y: src.clientY + (dst.clientY - src.clientY) * progress
      });
    }
    return result;
  }
  async function animateCursorDragWithCdp(sourceElement, srcCoords, dstCoords, cursorName, durationMs, eventSeq) {
    const animationDurationMs = resolvePointerDurationMs(durationMs);
    const meta = getCursorMeta(cursorName);
    const state = getOrCreateCursorElement(cursorName);
    const el = state.element;
    const { x: srcX, y: srcY } = getCursorTranslatePosition(srcCoords, meta);
    const { x: dstX, y: dstY } = getCursorTranslatePosition(dstCoords, meta);
    const { x: startX, y: startY } = getCursorStartPosition(state);
    el.style.display = "block";
    setCursorTransform(el, startX, startY);
    await animateWithRAF(animationDurationMs, (raw) => {
      const t = easeOutCubic(raw);
      const cx = startX + (srcX - startX) * t;
      const cy = startY + (srcY - startY) * t;
      setCursorTransform(el, cx, cy);
    });
    applyCursorPressStyle(el);
    setCursorTransform(el, srcX, srcY, 0.85);
    await waitForCursorTransition(el);
    await eventSeq.mouseMoved(toCoords(srcCoords));
    await eventSeq.mousePressed(toCoords(srcCoords));
    await raf();
    el.style.transition = "";
    const steps = interpolateDragSteps(srcCoords, dstCoords, DRAG_MOVE_STEPS);
    for (const step of steps) {
      const { x: cx, y: cy } = getCursorTranslatePosition(
        { clientX: step.x, clientY: step.y },
        meta
      );
      setCursorTransform(el, cx, cy, 0.85);
      await eventSeq.mouseMoved(step, 1);
      await raf();
    }
    await eventSeq.mouseReleased(toCoords(dstCoords));
    el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-out`;
    setCursorTransform(el, dstX, dstY, 1);
    await waitForCursorTransition(el);
    removeCursorPressStyle(el);
    saveCursorPosition(state, dstX, dstY);
  }
  async function animateCursorHtmlDragWithCdp(srcCoords, dstCoords, cursorName, durationMs, eventSeq) {
    const animationDurationMs = resolvePointerDurationMs(durationMs);
    const meta = getCursorMeta(cursorName);
    const state = getOrCreateCursorElement(cursorName);
    const el = state.element;
    const { x: srcX, y: srcY } = getCursorTranslatePosition(srcCoords, meta);
    const { x: dstX, y: dstY } = getCursorTranslatePosition(dstCoords, meta);
    const { x: startX, y: startY } = getCursorStartPosition(state);
    el.style.display = "block";
    setCursorTransform(el, startX, startY);
    await animateWithRAF(animationDurationMs, (raw) => {
      const t = easeOutCubic(raw);
      const cx = startX + (srcX - startX) * t;
      const cy = startY + (srcY - startY) * t;
      setCursorTransform(el, cx, cy);
    });
    applyCursorPressStyle(el);
    setCursorTransform(el, srcX, srcY, 0.85);
    await waitForCursorTransition(el);
    await eventSeq.htmlDrag(toCoords(srcCoords), toCoords(dstCoords));
    el.style.transition = "";
    await animateWithRAF(animationDurationMs, (raw) => {
      const t = raw;
      const cx = srcX + (dstX - srcX) * t;
      const cy = srcY + (dstY - srcY) * t;
      setCursorTransform(el, cx, cy, 0.85);
    });
    el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-out`;
    setCursorTransform(el, dstX, dstY, 1);
    await waitForCursorTransition(el);
    removeCursorPressStyle(el);
    saveCursorPosition(state, dstX, dstY);
  }
  async function handleAct(deps, input) {
    return withDescriptor(deps, input.commandId ?? input.targetId, input.targetId, input.expectedVersion, async (descriptor, element, snapshot) => {
      const snapshotTarget = findSnapshotTarget(snapshot, input.targetId);
      if (snapshotTarget && isOverlayFlowLocked(snapshot) && !snapshotTarget.overlay) {
        return buildFlowBlockedResult(input.commandId ?? input.targetId, snapshot, input.targetId);
      }
      if (!descriptor.actionKinds.some((k) => ACT_COMPATIBLE_KINDS.has(k))) {
        return buildErrorResult(input.commandId ?? input.targetId, "INVALID_TARGET", `target does not support act: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      const action = input.action ?? "click";
      if (!descriptor.actionKinds.includes(action)) {
        return buildErrorResult(input.commandId ?? input.targetId, "INVALID_TARGET", `target does not support action "${action}": ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!isVisible(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "NOT_VISIBLE", `target is not visible: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      const config = deps.resolveExecutionConfig(input.config);
      await smoothScrollIntoView(element);
      if (!isElementInViewport(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "NOT_VISIBLE", `target is outside of viewport: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!isTopmostInteractable(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "NOT_VISIBLE", `target is covered by another element: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!isEnabled(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "DISABLED", `target is disabled: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (config.clickDelayMs > 0) {
        await sleep(config.clickDelayMs);
      }
      const coords = toCoords(getInteractablePoint(element));
      const cdpActionForType = (c) => {
        switch (action) {
          case "click":
            return deps.eventSequences.click(c);
          case "dblclick":
            return deps.eventSequences.dblclick(c);
          case "contextmenu":
            return deps.eventSequences.contextmenu(c);
          case "hover":
            return deps.eventSequences.hover(c);
          case "longpress":
            return deps.eventSequences.longpress(c);
        }
      };
      if (config.pointerAnimation) {
        await deps.queue.push({
          type: "animation",
          execute: () => animateCursorThenCdpAction(
            element,
            config.cursorName ?? DEFAULT_CURSOR_NAME,
            config.pointerDurationMs,
            cdpActionForType
          )
        });
      } else {
        await cdpActionForType(coords);
      }
      const nextSnapshot = await deps.captureSettledSnapshot(2);
      return buildSuccessResult(input.commandId ?? input.targetId, nextSnapshot, {
        actionKind: action,
        targetId: input.targetId
      });
    });
  }
  function buildMovedTarget(element, targetId) {
    const domRect = element.getBoundingClientRect();
    const cx = domRect.left + domRect.width / 2;
    const cy = domRect.top + domRect.height / 2;
    return {
      targetId,
      center: { x: Math.round(cx), y: Math.round(cy) },
      size: { w: Math.round(domRect.width), h: Math.round(domRect.height) },
      coordSpace: "viewport"
    };
  }
  async function handleDrag(deps, input) {
    return withDescriptor(
      deps,
      input.commandId ?? input.sourceTargetId,
      input.sourceTargetId,
      input.expectedVersion,
      async (sourceDescriptor, sourceElement, snapshot) => {
        const sourceSnapshotTarget = findSnapshotTarget(snapshot, input.sourceTargetId);
        const hasTargetId = input.destinationTargetId != null;
        const hasCoords = input.destinationCoords != null;
        if (hasTargetId === hasCoords) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "INVALID_COMMAND",
            hasTargetId ? "Cannot specify both destinationTargetId and destinationCoords" : "Must specify either destinationTargetId or destinationCoords",
            snapshot,
            input.sourceTargetId
          );
        }
        if (hasTargetId && input.sourceTargetId === input.destinationTargetId) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "INVALID_COMMAND",
            "sourceTargetId and destinationTargetId must be different",
            snapshot,
            input.sourceTargetId
          );
        }
        if (hasCoords && input.placement != null) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "INVALID_COMMAND",
            "placement cannot be used with destinationCoords",
            snapshot,
            input.sourceTargetId
          );
        }
        if (isOverlayFlowLocked(snapshot) && !sourceSnapshotTarget?.overlay) {
          return buildFlowBlockedResult(
            input.commandId ?? input.sourceTargetId,
            snapshot,
            input.sourceTargetId
          );
        }
        if (!isVisible(sourceElement)) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "NOT_VISIBLE",
            `target is not visible: ${sourceDescriptor.target.targetId}`,
            snapshot,
            sourceDescriptor.target.targetId
          );
        }
        const config = deps.resolveExecutionConfig(input.config);
        await smoothScrollIntoView(sourceElement);
        if (!isElementInViewport(sourceElement)) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "NOT_VISIBLE",
            `target is outside of viewport: ${sourceDescriptor.target.targetId}`,
            snapshot,
            sourceDescriptor.target.targetId
          );
        }
        if (!isTopmostInteractable(sourceElement)) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "NOT_VISIBLE",
            `target is covered by another element: ${sourceDescriptor.target.targetId}`,
            snapshot,
            sourceDescriptor.target.targetId
          );
        }
        if (!isEnabled(sourceElement)) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "DISABLED",
            `target is disabled: ${sourceDescriptor.target.targetId}`,
            snapshot,
            sourceDescriptor.target.targetId
          );
        }
        if (config.clickDelayMs > 0) {
          await sleep(config.clickDelayMs);
        }
        if (hasCoords) {
          if (input.destinationCoords && "relativeTo" in input.destinationCoords) {
            const relCoords = input.destinationCoords;
            const refDescriptor = resolveRuntimeTarget(deps.getDescriptors(), relCoords.relativeTo);
            if (!refDescriptor) {
              return buildErrorResult(
                input.commandId ?? input.sourceTargetId,
                "TARGET_NOT_FOUND",
                `relativeTo target not found: ${relCoords.relativeTo}`,
                snapshot,
                relCoords.relativeTo
              );
            }
            const refRect = refDescriptor.element.getBoundingClientRect();
            const refCx = refRect.left + refRect.width / 2;
            const refCy = refRect.top + refRect.height / 2;
            input.destinationCoords = {
              x: Math.round(refCx + relCoords.dx),
              y: Math.round(refCy + relCoords.dy)
            };
          }
          const srcCoords = getElementCenter(sourceElement);
          const destCoords = {
            clientX: input.destinationCoords.x,
            clientY: input.destinationCoords.y
          };
          const srcDomRect = sourceElement.getBoundingClientRect();
          const srcVpCenter = {
            x: Math.round(srcDomRect.left + srcDomRect.width / 2),
            y: Math.round(srcDomRect.top + srcDomRect.height / 2)
          };
          if (config.pointerAnimation) {
            await deps.queue.push({
              type: "animation",
              execute: () => animateCursorDragWithCdp(
                sourceElement,
                srcCoords,
                destCoords,
                config.cursorName ?? DEFAULT_CURSOR_NAME,
                config.pointerDurationMs,
                deps.eventSequences
              )
            });
          } else {
            const steps = interpolateDragSteps(srcCoords, destCoords, DRAG_MOVE_STEPS);
            await deps.eventSequences.pointerDrag(toCoords(srcCoords), toCoords(destCoords), steps);
          }
          const nextSnapshot2 = await deps.captureSettledSnapshot(2);
          const freshSource = resolveRuntimeTarget(deps.getDescriptors(), input.sourceTargetId);
          const movedElement = freshSource?.element ?? sourceElement;
          const movedTarget = buildMovedTarget(movedElement, input.sourceTargetId);
          const movedCenter = movedTarget.center;
          const destX = input.destinationCoords.x;
          const elementStale = !movedElement.isConnected;
          if (elementStale || movedCenter && Math.abs(movedCenter.x - destX) > 20 && Math.abs(movedCenter.x - srcVpCenter.x) < 5 && Math.abs(movedCenter.y - srcVpCenter.y) < 5) {
            return buildErrorResult(
              input.commandId ?? input.sourceTargetId,
              "NOT_VISIBLE",
              "Node did not move. It may be blocked by an overlapping element. Try moving nearby nodes at the same position first.",
              nextSnapshot2,
              input.sourceTargetId
            );
          }
          return buildSuccessResult(input.commandId ?? input.sourceTargetId, nextSnapshot2, {
            actionKind: "drag",
            sourceTargetId: input.sourceTargetId,
            destinationCoords: input.destinationCoords,
            movedTarget
          });
        }
        const destinationTarget = resolveRuntimeTarget(deps.getDescriptors(), input.destinationTargetId);
        if (!destinationTarget) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "TARGET_NOT_FOUND",
            `target not found: ${input.destinationTargetId}`,
            snapshot,
            input.destinationTargetId
          );
        }
        const destinationDescriptor = destinationTarget.descriptor;
        const destinationElement = destinationTarget.element;
        const destinationSnapshotTarget = findSnapshotTarget(snapshot, input.destinationTargetId);
        if (isOverlayFlowLocked(snapshot) && !destinationSnapshotTarget?.overlay) {
          return buildFlowBlockedResult(
            input.commandId ?? input.sourceTargetId,
            snapshot,
            input.destinationTargetId
          );
        }
        await smoothScrollIntoView(destinationElement);
        const placement = input.placement ?? "inside";
        if (!isVisible(destinationElement)) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "NOT_VISIBLE",
            `target is not visible: ${destinationDescriptor.target.targetId}`,
            snapshot,
            destinationDescriptor.target.targetId
          );
        }
        if (!isElementInViewport(destinationElement)) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "NOT_VISIBLE",
            `target is outside of viewport: ${destinationDescriptor.target.targetId}`,
            snapshot,
            destinationDescriptor.target.targetId
          );
        }
        if (!isTopmostInteractable(destinationElement)) {
          return buildErrorResult(
            input.commandId ?? input.sourceTargetId,
            "NOT_VISIBLE",
            `target is covered by another element: ${destinationDescriptor.target.targetId}`,
            snapshot,
            destinationDescriptor.target.targetId
          );
        }
        {
          const srcCoords = getElementCenter(sourceElement);
          const dstCoords = getDragPlacementCoords(destinationElement, placement);
          const isHtmlDrag = sourceElement.draggable;
          if (config.pointerAnimation) {
            await deps.queue.push({
              type: "animation",
              execute: () => isHtmlDrag ? animateCursorHtmlDragWithCdp(
                srcCoords,
                dstCoords,
                config.cursorName ?? DEFAULT_CURSOR_NAME,
                config.pointerDurationMs,
                deps.eventSequences
              ) : animateCursorDragWithCdp(
                sourceElement,
                srcCoords,
                dstCoords,
                config.cursorName ?? DEFAULT_CURSOR_NAME,
                config.pointerDurationMs,
                deps.eventSequences
              )
            });
          } else if (isHtmlDrag) {
            await deps.eventSequences.htmlDrag(toCoords(srcCoords), toCoords(dstCoords));
          } else {
            const steps = interpolateDragSteps(srcCoords, dstCoords, DRAG_MOVE_STEPS);
            await deps.eventSequences.pointerDrag(toCoords(srcCoords), toCoords(dstCoords), steps);
          }
        }
        const nextSnapshot = await deps.captureSettledSnapshot(2);
        return buildSuccessResult(input.commandId ?? input.sourceTargetId, nextSnapshot, {
          actionKind: "drag",
          destinationTargetId: input.destinationTargetId,
          placement,
          sourceTargetId: input.sourceTargetId
        });
      }
    );
  }
  function expandWheelSteps(action) {
    const steps = action.steps;
    if (steps == null || steps <= 1) {
      const { steps: _, durationMs: __, ...rest } = action;
      return [rest];
    }
    const perStep = action.deltaY / steps;
    const intervalMs = action.durationMs != null ? action.durationMs / steps : 0;
    const result = [];
    for (let i = 0; i < steps; i++) {
      const isLast = i === steps - 1;
      const entry = {
        type: "wheel",
        x: action.x,
        y: action.y,
        deltaY: perStep
      };
      if (action.ctrlKey) entry.ctrlKey = action.ctrlKey;
      if (!isLast && intervalMs > 0) {
        entry.delayMs = intervalMs;
      } else if (isLast && action.delayMs != null) {
        entry.delayMs = action.delayMs;
      }
      result.push(entry);
    }
    return result;
  }
  async function handlePointer(deps, input) {
    const commandId = input.commandId ?? "pointer";
    let element = null;
    if (input.targetId) {
      const target = resolveRuntimeTarget(deps.getDescriptors(), input.targetId);
      if (!target) {
        const snapshot = await deps.captureSettledSnapshot(0);
        return buildErrorResult(commandId, "TARGET_NOT_FOUND", `target not found: ${input.targetId}`, snapshot, input.targetId);
      }
      element = target.element;
    } else if (input.selector) {
      element = document.querySelector(input.selector);
      if (!element) {
        const snapshot = await deps.captureSettledSnapshot(0);
        return buildErrorResult(commandId, "TARGET_NOT_FOUND", `element not found for selector: ${input.selector}`, snapshot);
      }
    } else if (input.coords) {
      element = document.elementFromPoint(input.coords.x, input.coords.y);
      if (!element) {
        const snapshot = await deps.captureSettledSnapshot(0);
        return buildErrorResult(commandId, "TARGET_NOT_FOUND", `no element at coordinates (${input.coords.x}, ${input.coords.y})`, snapshot);
      }
    } else {
      const snapshot = await deps.captureSettledSnapshot(0);
      return buildErrorResult(commandId, "INVALID_COMMAND", "Must specify targetId, selector, or coords", snapshot);
    }
    if (!input.actions || input.actions.length === 0) {
      const snapshot = await deps.captureSettledSnapshot(0);
      return buildErrorResult(commandId, "INVALID_COMMAND", "actions array must not be empty", snapshot);
    }
    for (const action of input.actions) {
      if (action.type === "wheel" && action.steps != null) {
        const expanded = expandWheelSteps(action);
        for (const step of expanded) {
          await deps.eventSequences.wheel({ x: step.x, y: step.y }, step.deltaY, step.ctrlKey);
          if (step.delayMs != null && step.delayMs > 0) {
            await new Promise((r) => setTimeout(r, step.delayMs));
          }
        }
        continue;
      }
      switch (action.type) {
        case "pointerdown":
          await deps.eventSequences.mousePressed({ x: action.x, y: action.y });
          break;
        case "pointermove":
          await deps.eventSequences.mouseMoved({ x: action.x, y: action.y });
          break;
        case "pointerup":
          await deps.eventSequences.mouseReleased({ x: action.x, y: action.y });
          break;
        case "wheel":
          await deps.eventSequences.wheel({ x: action.x, y: action.y }, action.deltaY, action.ctrlKey);
          break;
      }
      if (action.delayMs != null && action.delayMs > 0) {
        await new Promise((r) => setTimeout(r, action.delayMs));
      }
    }
    const nextSnapshot = await deps.captureSettledSnapshot(2);
    return buildSuccessResult(commandId, nextSnapshot, {
      actionKind: "pointer",
      actionsCount: input.actions.length
    });
  }
  async function handleGuide(deps, input) {
    return withDescriptor(deps, input.commandId ?? input.targetId, input.targetId, input.expectedVersion, async (descriptor, element, snapshot) => {
      const snapshotTarget = findSnapshotTarget(snapshot, input.targetId);
      if (snapshotTarget && isOverlayFlowLocked(snapshot) && !snapshotTarget.overlay) {
        return buildFlowBlockedResult(input.commandId ?? input.targetId, snapshot, input.targetId);
      }
      if (!descriptor.actionKinds.some((k) => ACT_COMPATIBLE_KINDS.has(k))) {
        return buildErrorResult(input.commandId ?? input.targetId, "INVALID_TARGET", `target does not support guide: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!isVisible(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "NOT_VISIBLE", `target is not visible: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      await smoothScrollIntoView(element);
      if (!isElementInViewport(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "NOT_VISIBLE", `target is outside of viewport: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!isTopmostInteractable(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "NOT_VISIBLE", `target is covered by another element: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      if (!isEnabled(element)) {
        return buildErrorResult(input.commandId ?? input.targetId, "DISABLED", `target is disabled: ${descriptor.target.targetId}`, snapshot, descriptor.target.targetId);
      }
      const guideConfig = deps.resolveExecutionConfig(input.config);
      await deps.queue.push({
        type: "animation",
        execute: () => animateCursorThenCdpAction(
          element,
          guideConfig.cursorName ?? DEFAULT_CURSOR_NAME,
          guideConfig.pointerDurationMs,
          (coords) => deps.eventSequences.click(coords)
        )
      });
      const nextSnapshot = deps.captureSnapshot();
      return buildSuccessResult(input.commandId ?? input.targetId, nextSnapshot, {
        actionKind: "guide",
        targetId: input.targetId
      });
    });
  }

  // src/runtime/macro-runner.ts
  function interpolateParams(template, params) {
    return template.replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => params[key] == null ? "" : String(params[key])
    );
  }
  var MacroRunner = class {
    constructor(deps) {
      this.deps = deps;
    }
    consecutiveFailures = 0;
    resetTimer = null;
    disposed = false;
    /**
     * manifest.precondition → step loop → manifest.postcondition 을 단일 호출로 완결.
     * CDP round-trip 없음 — handleAct/handleFill 은 in-page DOM 조작만 수행.
     */
    async run(macro, params = {}) {
      if (this.disposed) {
        return { status: "step-error", stepIndex: -1, error: "runner disposed" };
      }
      const threshold = macro.circuitBreaker?.maxRetries ?? 2;
      const resetAfterMs = macro.circuitBreaker?.resetAfterMs;
      if (resetAfterMs != null && resetAfterMs > 0) {
        this.scheduleReset(resetAfterMs);
      }
      if (macro.precondition) {
        const evalResult = this.evalExpr(macro.precondition, params);
        if (evalResult.ok) {
          if (evalResult.value === true) {
            return { status: "already-satisfied" };
          }
        } else {
          return { status: "precondition-failed", reason: evalResult.error };
        }
      }
      const descriptors = this.deps.commandHandlerDeps.getDescriptors();
      for (let i = 0; i < macro.steps.length; i++) {
        const step = macro.steps[i];
        this.deps.onStepStart?.(i, step);
        const match = resolveRuntimeTarget(descriptors, step.targetId);
        if (!match) {
          this.consecutiveFailures++;
          this.deps.onStepEnd?.(i, step, false);
          if (this.consecutiveFailures >= threshold) {
            return { status: "circuit-open", failedStep: i };
          }
          if (i === macro.steps.length - 1) {
            return { status: "target-not-found", stepIndex: i, targetId: step.targetId };
          }
          continue;
        }
        if (isSensitive(match.element, step.sensitive)) {
          this.deps.onSensitiveStep?.(i, step);
        }
        let commandResult;
        try {
          if (step.action === "fill") {
            const value = step.value != null ? interpolateParams(step.value, params) : "";
            commandResult = await handleFill(this.deps.commandHandlerDeps, {
              targetId: step.targetId,
              value
            });
          } else {
            commandResult = await handleAct(this.deps.commandHandlerDeps, {
              targetId: step.targetId,
              action: step.action
            });
          }
        } catch (err) {
          this.consecutiveFailures++;
          this.deps.onStepEnd?.(i, step, false);
          if (this.consecutiveFailures >= threshold) {
            return { status: "circuit-open", failedStep: i };
          }
          if (i < macro.steps.length - 1) {
            continue;
          }
          return {
            status: "step-error",
            stepIndex: i,
            error: err instanceof Error ? err.message : String(err)
          };
        }
        if (commandResult.ok) {
          this.consecutiveFailures = 0;
        } else {
          this.consecutiveFailures++;
        }
        this.deps.onStepEnd?.(i, step, commandResult.ok);
        if (this.consecutiveFailures >= threshold) {
          return { status: "circuit-open", failedStep: i };
        }
        if (!commandResult.ok) {
          if (i < macro.steps.length - 1) {
            continue;
          }
          return {
            status: "step-error",
            stepIndex: i,
            error: commandResult.error?.message ?? "step failed"
          };
        }
      }
      if (macro.postcondition) {
        const evalResult = this.evalExpr(macro.postcondition, params);
        if (!evalResult.ok) {
          this.consecutiveFailures++;
          return { status: "postcondition-failed", reason: evalResult.error };
        }
        if (evalResult.value !== true) {
          this.consecutiveFailures++;
          return { status: "postcondition-failed", reason: "postcondition returned falsy" };
        }
      }
      return { status: "ok" };
    }
    /** 모든 타이머를 정리하고 runner를 사용 불가 상태로 표시. */
    dispose() {
      this.disposed = true;
      if (this.resetTimer !== null) {
        clearTimeout(this.resetTimer);
        this.resetTimer = null;
      }
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    scheduleReset(ms) {
      if (this.resetTimer !== null) {
        clearTimeout(this.resetTimer);
      }
      this.resetTimer = setTimeout(() => {
        this.consecutiveFailures = 0;
        this.resetTimer = null;
      }, ms);
    }
    /**
     * `new Function` 기반 sandboxed 식 평가 (T-14-07).
     * - `eval()` 직접 호출 금지 — caller scope 변수 접근 방지
     * - params 만 context 로 주입; 식 내 다른 identifier 는 ReferenceError
     * - 결과는 boolean 캐스팅만 사용 (side-effect 는 무시)
     */
    evalExpr(expr, params) {
      try {
        const fn = new Function("params", `return !!(${expr})`);
        return { ok: true, value: fn(params) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  };

  // src/runtime/cdp-client.ts
  var CDP_TIMEOUT_MS = 5e3;
  function createCdpClient(postMessage) {
    const pending = /* @__PURE__ */ new Map();
    let pendingDragData = null;
    function handleCdpMessage(e) {
      const detail = e.detail;
      if (!detail) return;
      if (detail.type === "cdp_response") {
        const entry = pending.get(detail.requestId);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(detail.requestId);
        if (detail.error) {
          entry.reject(new Error(detail.error));
        } else {
          entry.resolve(detail.result ?? {});
        }
      }
      if (detail.type === "cdp_event") {
        if (detail.method === "Input.dragIntercepted") {
          pendingDragData = detail.params?.data ?? null;
        }
      }
    }
    window.addEventListener("agrune:cdp", handleCdpMessage);
    function sendCdpEvent(method, params) {
      const requestId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`CDP request timed out: ${method}`));
        }, CDP_TIMEOUT_MS);
        pending.set(requestId, { resolve, reject, timer });
        postMessage("cdp_request", { requestId, method, params });
      });
    }
    function dispose() {
      window.removeEventListener("agrune:cdp", handleCdpMessage);
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error("CDP client disposed"));
      }
      pending.clear();
    }
    return {
      sendCdpEvent,
      getPendingDragData: () => pendingDragData,
      clearPendingDragData: () => {
        pendingDragData = null;
      },
      dispose
    };
  }

  // src/runtime/event-sequences.ts
  function sleep2(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function keyFromChar(ch) {
    if (ch.length === 1 && /[a-zA-Z]/.test(ch)) {
      return {
        key: ch,
        code: `Key${ch.toUpperCase()}`,
        windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0)
      };
    }
    if (ch.length === 1 && /[0-9]/.test(ch)) {
      return {
        key: ch,
        code: `Digit${ch}`,
        windowsVirtualKeyCode: ch.charCodeAt(0)
      };
    }
    if (ch === " ") return { key: " ", code: "Space", windowsVirtualKeyCode: 32 };
    return { key: ch, code: "" };
  }
  function createEventSequences(cdp) {
    const send = cdp.sendCdpEvent.bind(cdp);
    const mouse = (type, x, y, extra) => send("Input.dispatchMouseEvent", { type, x, y, ...extra });
    return {
      async click(coords) {
        await mouse("mouseMoved", coords.x, coords.y);
        await mouse("mousePressed", coords.x, coords.y, { button: "left", clickCount: 1 });
        await mouse("mouseReleased", coords.x, coords.y, { button: "left", clickCount: 1 });
      },
      async dblclick(coords) {
        await mouse("mousePressed", coords.x, coords.y, { button: "left", clickCount: 1 });
        await mouse("mouseReleased", coords.x, coords.y, { button: "left", clickCount: 1 });
        await mouse("mousePressed", coords.x, coords.y, { button: "left", clickCount: 2 });
        await mouse("mouseReleased", coords.x, coords.y, { button: "left", clickCount: 2 });
      },
      async contextmenu(coords) {
        await mouse("mousePressed", coords.x, coords.y, { button: "right", clickCount: 1 });
        await mouse("mouseReleased", coords.x, coords.y, { button: "right", clickCount: 1 });
      },
      async hover(coords) {
        await mouse("mouseMoved", coords.x, coords.y);
      },
      async longpress(coords) {
        await mouse("mousePressed", coords.x, coords.y, { button: "left", clickCount: 1 });
        await sleep2(500);
        await mouse("mouseReleased", coords.x, coords.y, { button: "left", clickCount: 1 });
      },
      async mousePressed(coords, button = "left") {
        await mouse("mousePressed", coords.x, coords.y, { button, clickCount: 1 });
      },
      async mouseMoved(coords, buttons) {
        await mouse("mouseMoved", coords.x, coords.y, buttons != null ? { buttons } : void 0);
      },
      async mouseReleased(coords, button = "left") {
        await mouse("mouseReleased", coords.x, coords.y, { button, clickCount: 1 });
      },
      async pointerDrag(src, dst, steps) {
        await mouse("mouseMoved", src.x, src.y);
        await mouse("mousePressed", src.x, src.y, { button: "left", clickCount: 1 });
        await sleep2(16);
        for (const step of steps) {
          await mouse("mouseMoved", step.x, step.y, { buttons: 1 });
        }
        await mouse("mouseReleased", dst.x, dst.y, { button: "left", clickCount: 1 });
      },
      async wheel(coords, deltaY, ctrlKey = false) {
        await mouse("mouseMoved", coords.x, coords.y);
        await mouse("mouseWheel", coords.x, coords.y, { deltaX: 0, deltaY, modifiers: ctrlKey ? 4 : 0 });
      },
      async htmlDrag(src, dst) {
        await send("Input.setInterceptDrags", { enabled: true });
        await mouse("mousePressed", src.x, src.y, { button: "left", clickCount: 1 });
        await mouse("mouseMoved", dst.x, dst.y);
        await sleep2(100);
        const dragData = cdp.getPendingDragData();
        if (dragData) {
          await send("Input.dispatchDragEvent", { type: "drop", x: dst.x, y: dst.y, data: dragData });
          cdp.clearPendingDragData();
        }
        await mouse("mouseReleased", dst.x, dst.y, { button: "left", clickCount: 1 });
        await send("Input.setInterceptDrags", { enabled: false });
      },
      async insertText(text) {
        await send("Input.insertText", { text });
      },
      async typeText(text, options) {
        const delay = options?.delayMs ?? 0;
        for (const ch of Array.from(text)) {
          const keyInfo = keyFromChar(ch);
          await send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: keyInfo.key,
            code: keyInfo.code,
            text: ch,
            unmodifiedText: ch,
            ...keyInfo.windowsVirtualKeyCode ? { windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode } : {}
          });
          await send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: keyInfo.key,
            code: keyInfo.code,
            ...keyInfo.windowsVirtualKeyCode ? { windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode } : {}
          });
          if (delay > 0) await sleep2(delay);
        }
      },
      async pressKey(key, options) {
        const modifiers = options?.modifiers ?? 0;
        const code = options?.code ?? key;
        const text = options?.text;
        await send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key,
          code,
          modifiers,
          ...text ? { text, unmodifiedText: text } : {}
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key,
          code,
          modifiers
        });
      },
      async selectAllAndDelete() {
        await send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: "a",
          code: "KeyA",
          modifiers: 4,
          // Meta
          commands: ["selectAll"]
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "a",
          code: "KeyA",
          modifiers: 4
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Delete",
          code: "Delete"
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Delete",
          code: "Delete"
        });
      }
    };
  }

  // src/runtime/page-agent-runtime.ts
  var runtimeDisposers = /* @__PURE__ */ new WeakMap();
  var GLOBAL_RUNTIME_KEY = "__agrune_page_agent_runtime__";
  function getGlobalRuntimeStore() {
    const root = globalThis;
    if (!root[GLOBAL_RUNTIME_KEY]) {
      root[GLOBAL_RUNTIME_KEY] = {};
    }
    return root[GLOBAL_RUNTIME_KEY];
  }
  function createPageAgentRuntime(manifest, options = {}) {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("Page agent runtime requires a browser environment.");
    }
    const runtimeOptions = { ...DEFAULT_OPTIONS, ...options };
    const manifestDescriptors = collectDescriptors(manifest);
    const snapshotStore = {
      latest: null,
      signature: null,
      version: 0
    };
    let lastRelevantDomMutationAt = performance.now();
    let currentConfig = normalizeExecutionConfig(runtimeOptions);
    let agentActivityActive = false;
    let activityIdleTimer = null;
    const queue = new ActionQueue({ idleTimeoutMs: IDLE_TIMEOUT_MS });
    const mutationObserverRoot = document.body ?? document.documentElement;
    const mutationObserver = mutationObserverRoot ? new MutationObserver((mutations) => {
      if (mutations.some(isRelevantSnapshotMutation)) {
        lastRelevantDomMutationAt = performance.now();
      }
    }) : null;
    mutationObserver?.observe(mutationObserverRoot, {
      attributes: true,
      attributeFilter: SNAPSHOT_RELEVANT_ATTRIBUTES,
      childList: true,
      subtree: true
    });
    const getDescriptors = () => manifestDescriptors;
    const captureSnapshot = () => makeSnapshot(getDescriptors(), snapshotStore);
    const captureSettledSnapshot = async (minimumFrames) => {
      const deadline = performance.now() + DOM_SETTLE_TIMEOUT_MS;
      let observedFrames = 0;
      let stableFrames = 0;
      while (performance.now() < deadline) {
        await waitForNextFrame();
        observedFrames += 1;
        if (performance.now() - lastRelevantDomMutationAt >= DOM_SETTLE_QUIET_WINDOW_MS) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
        }
        if (observedFrames >= minimumFrames && stableFrames >= DOM_SETTLE_STABLE_FRAMES) {
          break;
        }
      }
      return captureSnapshot();
    };
    const resolveExecutionConfig = (patch) => mergeRuntimeConfig(currentConfig, patch);
    const clearActivityIdleTimer = () => {
      if (activityIdleTimer !== null) {
        clearTimeout(activityIdleTimer);
        activityIdleTimer = null;
      }
    };
    const syncActiveVisualEffects = () => {
      if (currentConfig.auroraGlow) {
        showAuroraGlow(currentConfig.auroraTheme);
      } else {
        hideAuroraGlow();
      }
      if (currentConfig.pointerAnimation) {
        showIdlePointerOverlay(currentConfig.cursorName ?? DEFAULT_CURSOR_NAME);
      } else {
        hidePointerOverlay();
      }
    };
    const hideVisualEffects = () => {
      hideAuroraGlow();
      hidePointerOverlay();
    };
    queue.onActivate = () => {
      clearActivityIdleTimer();
      syncActiveVisualEffects();
    };
    queue.onDeactivate = () => {
      if (!agentActivityActive) {
        scheduleActivityHide();
      }
    };
    const scheduleActivityHide = () => {
      clearActivityIdleTimer();
      activityIdleTimer = setTimeout(() => {
        activityIdleTimer = null;
        if (!agentActivityActive && !queue.active) {
          hideVisualEffects();
        }
      }, IDLE_TIMEOUT_MS);
    };
    if (!runtimeOptions.cdpPostMessage) {
      throw new Error("Page agent runtime requires cdpPostMessage to be provided.");
    }
    const cdpClient = createCdpClient(runtimeOptions.cdpPostMessage);
    const eventSequences = createEventSequences(cdpClient);
    const deps = {
      captureSnapshot,
      captureSettledSnapshot,
      getDescriptors,
      resolveExecutionConfig,
      queue,
      eventSequences
    };
    const macroRunners = /* @__PURE__ */ new Map();
    const runMacro = async ({
      macroId,
      params = {},
      onStepProgress
    }) => {
      const macro = manifest.macros?.find((m) => m.macroId === macroId);
      if (!macro) {
        return {
          status: "step-error",
          stepIndex: -1,
          error: `macro not found: ${macroId}`,
          macroId,
          stepCount: 0
        };
      }
      let runner = macroRunners.get(macroId);
      if (!runner) {
        runner = new MacroRunner({
          commandHandlerDeps: deps,
          onStepStart: onStepProgress ? (i, step) => onStepProgress({ stepIndex: i, step, phase: "start" }) : void 0,
          onStepEnd: onStepProgress ? (i, step, ok) => onStepProgress({ stepIndex: i, step, phase: "end", ok }) : void 0,
          onSensitiveStep: onStepProgress ? (i, step) => onStepProgress({ stepIndex: i, step, phase: "sensitive" }) : void 0
        });
        macroRunners.set(macroId, runner);
      } else if (onStepProgress) {
      }
      const result = await runner.run(macro, params);
      return { ...result, macroId, stepCount: macro.steps.length };
    };
    const runtime = {
      getSnapshot: captureSnapshot,
      beginAgentActivity: () => {
        agentActivityActive = true;
        clearActivityIdleTimer();
        syncActiveVisualEffects();
      },
      endAgentActivity: () => {
        agentActivityActive = false;
        if (!queue.active) {
          scheduleActivityHide();
        }
      },
      act: async (input) => handleAct(deps, input),
      drag: async (input) => handleDrag(deps, input),
      fill: async (input) => handleFill(deps, input),
      wait: async (input) => handleWait(deps, input),
      guide: async (input) => handleGuide(deps, input),
      read: async (input) => handleRead(deps, input),
      pointer: async (input) => handlePointer(deps, input),
      applyConfig: (config) => {
        currentConfig = mergeRuntimeConfig(currentConfig, config);
        if (config.cursorName && cursorState && config.cursorName !== cursorState.cursorName) {
          getOrCreateCursorElement(config.cursorName);
        }
        if (queue.active || agentActivityActive) {
          syncActiveVisualEffects();
        }
      },
      isBusy: () => agentActivityActive || queue.active,
      isActive: () => agentActivityActive || queue.active || activityIdleTimer !== null,
      runMacro
    };
    runtimeDisposers.set(runtime, () => {
      clearActivityIdleTimer();
      mutationObserver?.disconnect();
      queue.dispose();
      cdpClient.dispose();
      macroRunners.forEach((r) => r.dispose());
      macroRunners.clear();
    });
    return runtime;
  }
  function getInstalledPageAgentRuntime() {
    return getGlobalRuntimeStore().active ?? null;
  }
  function installPageAgentRuntime(manifest, options = {}) {
    const runtime = createPageAgentRuntime(manifest, options);
    const globalStore = getGlobalRuntimeStore();
    globalStore.active?.dispose();
    const handle = {
      ...runtime,
      dispose() {
        runtimeDisposers.get(runtime)?.();
        runtimeDisposers.delete(runtime);
        hideAuroraGlow();
        hidePointerOverlay();
        const current = getGlobalRuntimeStore();
        if (current.active === handle) {
          current.active = void 0;
        }
        if (typeof window !== "undefined" && window.agruneDom === runtime) {
          delete window.agruneDom;
        }
      }
    };
    globalStore.active = handle;
    window.agruneDom = runtime;
    return handle;
  }

  // src/page-runtime.ts
  function buildEmptyManifest() {
    return { version: 3, groups: [] };
  }
  return __toCommonJS(page_runtime_exports);
})();
/*! Bundled license information:

ai-motion/build/Motion.js:
  (**
   * AI Motion - WebGL2 animated border with AI-style glow effects
   *
   * @author Simon<gaomeng1900@gmail.com>
   * @license MIT
   * @repository https://github.com/gaomeng1900/ai-motion
   *)
*/
//# sourceMappingURL=page-runtime.global.js.map