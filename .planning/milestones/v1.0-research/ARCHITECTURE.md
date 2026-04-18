# Architecture Research

**Domain:** unified browser + local desktop control surface for agrune
**Researched:** 2026-04-07
**Confidence:** MEDIUM

## Recommended Architecture Shape

The research points to a hybrid architecture, not a universal OS-only one. For browser surfaces, agrune should keep deterministic DOM/CDP control as the primary path. For local apps, it should add a macOS bridge that can read accessibility semantics, capture pixels, and dispatch verified actions. Vision belongs behind those deterministic channels, not in front of them.

## Major Components

### 1. Surface Registry

- Tracks active browser tabs, native app windows, and any scriptable-app adapters.
- Assigns a unified `surfaceId` abstraction so the product no longer assumes only `tabId`.

### 2. Perception Adapters

- **Browser semantic adapter:** existing DOM runtime, manifest scanner, and CDP-backed browser metadata.
- **macOS accessibility adapter:** reads roles, names, bounds, enabled state, and available actions from the AX tree.
- **Screen perception adapter:** captures target windows/screens and extracts text or visual candidates for fallback.
- **Scriptable-app adapter:** optional app-specific semantic shortcut via Apple events.

### 3. Normalization Layer

- Converts every target into one shared snapshot schema with fields like `source`, `confidence`, `role`, `name`, `bounds`, `actionKinds`, and `locator`.
- Preserves provenance so the action layer knows whether a target is deterministic or inferred.

### 4. Action Layer

- Chooses the highest-confidence action path in order: semantic browser action, script/app adapter, AX action, then coordinate fallback.
- Requires post-action verification before marking an action successful.

### 5. Overlay / Guide Layer

- Renders highlight boxes, visible pointer motion, confidence badges, and target numbering over the live desktop.
- Should be shared by browser and local surfaces where possible so trust cues feel consistent.

### 6. Verification Layer

- Re-observes the target surface after each action.
- Confirms expected state changes via DOM, AX deltas, screenshot diffs, text changes, or window focus changes.

## Suggested Data Flow

1. MCP request arrives at agrune with a browser or desktop intent.
2. Surface registry resolves the active surface and available perception channels.
3. Highest-confidence adapter generates a normalized snapshot.
4. If semantic coverage is incomplete, lower-confidence channels add candidates but do not overwrite provenance.
5. The action layer selects the cheapest deterministic execution path available.
6. Overlay/pointer renders user-visible guidance.
7. Verification layer confirms the intended state change; otherwise the action is retried, downgraded, or rejected.

## Build Order Implications

1. Preserve current browser driver/runtime contract as the anchor.
2. Generalize `BrowserDriver` thinking toward a surface-oriented abstraction.
3. Add macOS capability inventory and target normalization before any ambitious pointer automation.
4. Add vision fallback only after semantic channels and verification exist.

## Architecture Decisions Suggested by Research

- `DOM/CDP` should remain the browser gold path.
- `AX` should become the desktop gold path when available.
- `Vision` should be a fallback perception tool, not the universal control model.
- App-specific scripting should be treated as a privileged adapter for high-value apps, not a universal dependency.

## What This Means for agrune

- The current package split already helps: `core` can absorb target/surface type generalization, `runtime` can stay browser-specific, and a future desktop bridge can live beside `browser` rather than inside it.
- The hardest architectural change is not clicking windows; it is defining a unified snapshot/action contract that preserves provenance and confidence without breaking current MCP ergonomics.

## Sources

### Primary

- [AXUIElement documentation](https://developer.apple.com/documentation/applicationservices/axuielement_h)
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [Introduction to Apple Events](https://developer.apple.com/library/archive/documentation/mac/pdf/Interapplication_Communication/Intro_to_IAC.pdf)
- [Chrome DevTools Protocol: Accessibility](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/)
- [Chrome DevTools Protocol: DOMSnapshot](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/)
- [Chrome DevTools Protocol: Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/)

### Secondary / Inference

- [agrune architecture notes](/Users/chenjing/dev/agrune/.planning/codebase/ARCHITECTURE.md)
- [agrune README](/Users/chenjing/dev/agrune/agrune/README.md)

---
*Architecture research for agrune desktop-expansion feasibility*
