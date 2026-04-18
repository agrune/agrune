# Stack Research

**Domain:** macOS-first browser + local desktop semantic automation research for agrune
**Researched:** 2026-04-07
**Confidence:** MEDIUM-HIGH

## Recommended Stack

### Core Technologies

| Technology | Version / Baseline | Purpose | Why Recommended |
|------------|--------------------|---------|-----------------|
| TypeScript + `pnpm` workspace | Existing agrune baseline | Keep MCP surface, contracts, runtime orchestration in the current monorepo | Current agrune already ships a browser-first MCP/runtime stack here, so research should extend rather than fork it |
| Swift macOS helper | Modern Swift on supported target macOS | Bridge to native macOS frameworks that Node does not expose cleanly | Accessibility, ScreenCaptureKit, Apple events, and low-level input are first-class in Apple frameworks |
| ApplicationServices Accessibility API (`AXUIElement`) | System framework | Read accessibility tree, roles, names, bounds, and invoke semantic actions | This is the highest-confidence external semantic channel for third-party macOS apps when exposed |
| ScreenCaptureKit | System framework | Capture windows/screens for verification and vision fallback | Apple positions it as the modern capture path for screen/window content and audio |
| Vision framework | System framework | On-device OCR and visual feature extraction | Best default local perception path before introducing external ML runtimes |
| Chrome DevTools Protocol | Current Chrome family browser protocol | Preserve deterministic browser control for Chrome/Chromium targets | For Chrome, DOM/CDP remains more precise and cheaper than OS-level capture or inference |
| Apple events / scriptable app bridge | System framework / app-specific | App-specific semantic shortcut for apps that expose script dictionaries | Useful for apps like productivity tools where scripting is richer than raw UI clicking |

### Supporting Libraries / Frameworks

| Library / API | Purpose | When to Use |
|---------------|---------|-------------|
| `CGEvent` (CoreGraphics) | Coordinate-based mouse/keyboard fallback | Only after DOM/CDP, AX, or app scripting cannot execute the action semantically |
| `AXObserver` | Observe accessibility tree changes | Needed for stable post-action verification and dynamic overlays |
| Accessibility Inspector + VoiceOver | Inspect accessibility exposure and quality | Mandatory during research and QA of desktop targets |
| Optional local model runtime (`Core ML` or `ONNX Runtime`) | Run custom GUI detectors beyond OCR | Introduce only if Vision OCR + heuristics cannot cover critical fallback cases |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Xcode + macOS SDK | Build native helper / permission flows | Needed for Accessibility, ScreenCaptureKit, and Apple events integration |
| Accessibility Inspector | Inspect live AX tree and attributes | Fastest way to tell whether a target app is a semantic candidate or a vision-only case |
| Existing agrune MCP test loop | Reuse current MCP verbs and runtime assumptions | Keeps research grounded in the real product surface rather than a throwaway prototype |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Swift native helper | Pure Node native addon | Only if minimizing process count matters more than API clarity and permission UX |
| ScreenCaptureKit | Older Quartz window capture paths | Only for legacy compatibility experiments; not the preferred long-term path |
| DOM/CDP for Chrome | OS capture + vision for Chrome | Only when Chrome surface is image/canvas-heavy and DOM/CDP cannot express the target |
| Vision on-device | Cloud OCR / hosted multimodal API | Only for off-device experiments; not aligned with agrune's local-first privacy position |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Absolute-coordinate-only automation as primary design | Breaks on window movement, scaling, layout changes, and multi-monitor setups | Semantic action first, then relative/verified fallback |
| Vision-first browser control | Throws away deterministic DOM/CDP data that agrune already has | Keep browser path `DOM/CDP > AX > Vision` |
| Cloud-first screenshot analysis by default | Conflicts with privacy posture and adds latency | On-device perception first |

## Stack Patterns by Variant

**If the target is Chrome or a Chromium browser:**
- Use existing agrune DOM/runtime and CDP as the primary control path.
- Add browser accessibility or screenshot analysis only as a gap-filling layer.

**If the target is a native macOS app with good accessibility exposure:**
- Use `AXUIElement` for snapshot, overlay placement, and actions.
- Use screen capture only for verification, highlighting, and visual fallback.

**If the target app is scriptable:**
- Prefer an app-specific Apple events adapter for high-value flows.
- Treat it as a privileged semantic adapter, not as the universal default.

**If the target app exposes poor accessibility and no scriptability:**
- Fall back to screen capture + Vision + external locator logic.
- Mark this path as probabilistic and require explicit verification after every action.

## Version Compatibility / Boundary Notes

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| Existing agrune TypeScript packages | Browser-first MCP/runtime stack | Research should preserve current browser contract shape where possible |
| Swift native helper | macOS accessibility / capture frameworks | Practical baseline should follow whichever macOS releases support the chosen capture APIs in product scope |
| Vision fallback | Captured window/screen images | OCR alone is insufficient; useful as one signal in a larger fallback pipeline |

## Sources

### Primary

- [AXUIElement documentation](https://developer.apple.com/documentation/applicationservices/axuielement_h) — macOS accessibility element API surface
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit) — Apple screen/window capture framework
- [WWDC22: Take ScreenCaptureKit to the next level](https://developer.apple.com/videos/play/wwdc2022/10155/) — window capture workflow and shareable content model
- [VNRecognizeTextRequest](https://developer.apple.com/documentation/vision/vnrecognizetextrequest) — on-device OCR entry point
- [Chrome DevTools Protocol: Accessibility](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/) — browser accessibility tree access
- [Chrome DevTools Protocol: DOMSnapshot](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/) — layout/bounds-aware DOM snapshots
- [Chrome DevTools Protocol: Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/) — deterministic browser input dispatch
- [Introduction to Apple Events](https://developer.apple.com/library/archive/documentation/mac/pdf/Interapplication_Communication/Intro_to_IAC.pdf) — scriptable app communication model

### Secondary / Inference

- [agrune README](/Users/chenjing/dev/agrune/agrune/README.md) — current product packaging and MCP surface
- [Codebase architecture notes](/Users/chenjing/dev/agrune/.planning/codebase/ARCHITECTURE.md) — current package boundaries and driver shape

---
*Stack research for agrune desktop-expansion feasibility*
