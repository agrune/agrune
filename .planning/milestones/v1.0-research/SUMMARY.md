# Project Research Summary

**Project:** agrune
**Domain:** browser-first automation product expanding into macOS local control research
**Researched:** 2026-04-07
**Confidence:** MEDIUM

## Executive Summary

Research so far supports a qualified “yes”: agrune can plausibly expand from annotated browser automation into a browser + macOS local-control product, but only with a hybrid architecture. The important distinction is that macOS will not universally replace app-authored annotations. Instead, the product would combine deterministic browser semantics, macOS accessibility semantics, app-specific scripting where available, and on-device visual fallback where semantics are absent.

The strongest recommendation is to preserve current browser precision while treating desktop automation as a new capability layer. In practice that means `DOM/CDP` stays the browser gold path, `AX` becomes the desktop gold path when exposed, and `Vision` exists to fill gaps rather than define the whole product. The biggest risks are permission onboarding, inconsistent accessibility quality across third-party apps, and the temptation to over-trust screenshot-based inference.

## Key Findings

### Recommended Stack

The architecture should remain TypeScript-led at the MCP/product layer and add a small native macOS bridge for framework access. The native bridge exists because ScreenCaptureKit, Accessibility APIs, Apple events, and low-level input are all much more natural and reliable from Apple-native frameworks than from a pure Node stack.

**Core technologies:**
- TypeScript agrune monorepo: preserve MCP surface and current browser contracts
- Swift macOS helper: bridge Accessibility, capture, Apple events, and input
- ScreenCaptureKit + Vision: verification and fallback perception
- CDP + current DOM runtime: preserve deterministic browser behavior

### Expected Features

**Must have (table stakes):**
- Unified snapshot of browser and local targets with provenance
- Permission onboarding for Accessibility / Screen Recording
- Safe action loop with visible highlight/pointer and post-action verification
- Honest unsupported / low-confidence reporting

**Should have (differentiators):**
- Channel fusion policy (`DOM/CDP > AX > Vision`)
- External manual annotation profiles for unsupported apps
- App-specific adapters for scriptable apps

**Defer (v2+):**
- Heavy custom local ML stacks beyond OCR / light reranking
- Cross-platform Windows/Linux parity
- Fully polished consumer zero-setup onboarding

### Architecture Approach

The recommended architecture is a surface-oriented control system: surface registry, perception adapters, normalization layer, action layer, overlay/pointer renderer, and verification loop. The product should generalize current browser assumptions without flattening away provenance. The action layer must always know whether a target came from DOM, accessibility, scripting, or visual inference.

**Major components:**
1. Surface registry — browser tabs, native windows, and adapters
2. Perception adapters — DOM/CDP, AX, scriptable-app, and visual fallback
3. Action + verification loop — semantic action first, coordinate fallback last

### Critical Pitfalls

1. **Permissions are core UX, not setup trivia** — if onboarding is clumsy, the product fails before automation begins.
2. **Accessibility quality is uneven** — some apps will be excellent, some unusable, and the roadmap must acknowledge that.
3. **Vision is probabilistic** — it should rescue unsupported cases, not silently replace deterministic channels.
4. **Browser precision must not regress** — current agrune value comes from strong semantics today.

## Implications for Roadmap

### Phase 1: Channel Inventory and Constraints
**Rationale:** Everything downstream depends on knowing which channels are deterministic, permission-gated, or probabilistic.
**Delivers:** Capability matrix for DOM/CDP, AX, Apple events, capture, and visual fallback.
**Addresses:** research baseline and security constraints.
**Avoids:** false universality claims.

### Phase 2: Annotation Methods Report
**Rationale:** Direct semantic annotation options should be explored before fallback-heavy alternatives.
**Delivers:** Three materially different direct annotation methods with evaluation.
**Uses:** AX, app-controlled semantics, and app-specific adapters.

### Phase 3: Annotation Alternatives Report
**Rationale:** Only after direct methods are mapped should gap-filling alternatives be compared.
**Delivers:** Three materially different non-annotation methods with local-ML and recovery analysis.
**Uses:** capture, Vision, external locator systems, and verification.

### Phase 4: Product Synthesis and Go/No-Go
**Rationale:** The project is research-first; it needs a decision package, not just scattered notes.
**Delivers:** comparison matrix, recommended hybrid architecture, and prototype order.

### Phase Ordering Rationale

- Channel and permission constraints must come first because they shape every later case.
- Direct methods precede alternatives because they define the highest-confidence product path.
- Synthesis comes last because the recommendation depends on both reports using the same evaluation frame.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** App-internal annotation possibilities vary by app technology and ownership model.
- **Phase 3:** Vision/local-ML fallback needs careful boundary setting to avoid overclaiming reliability.

Phases with standard patterns:
- **Phase 1:** macOS capability inventory and current agrune seam mapping are relatively straightforward.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core capability channels are backed by official Apple and CDP docs |
| Features | MEDIUM | Product expectations are partly inference from domain constraints |
| Architecture | MEDIUM | Strong direction, but exact package boundaries still need design work |
| Pitfalls | MEDIUM-HIGH | Risks are visible from platform docs and current product shape |

**Overall confidence:** MEDIUM

### Gaps to Address

- Which macOS app classes are high-value and high-quality enough for AX-first support in a first prototype
- Whether app-specific scripting adapters are worth supporting early or should remain opportunistic
- How much visible pointer/overlay behavior is necessary for user trust versus visual noise

## Sources

### Primary (HIGH confidence)

- [AXUIElement documentation](https://developer.apple.com/documentation/applicationservices/axuielement_h)
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [Allow apps to use screen and audio recording](https://support.apple.com/en-afri/guide/mac-help/mchl592e5686/mac)
- [Introduction to Apple Events](https://developer.apple.com/library/archive/documentation/mac/pdf/Interapplication_Communication/Intro_to_IAC.pdf)
- [Chrome DevTools Protocol: Accessibility](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/)
- [Chrome DevTools Protocol: DOMSnapshot](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/)
- [Chrome DevTools Protocol: Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/)

### Secondary (MEDIUM confidence)

- [Screen Recognition: Creating Accessibility Metadata for Mobile Applications from Pixels](https://docs-assets.developer.apple.com/ml-research/papers/screen-recognition-chi-2021.pdf)
- [agrune README](/Users/chenjing/dev/agrune/agrune/README.md)
- [Codebase architecture notes](/Users/chenjing/dev/agrune/.planning/codebase/ARCHITECTURE.md)

---
*Research completed: 2026-04-07*
*Ready for roadmap: yes*
