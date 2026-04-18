# Features Research

**Domain:** macOS-first semantic desktop automation layered onto agrune
**Researched:** 2026-04-07
**Confidence:** MEDIUM

## Table Stakes

### Surface Discovery

| Feature | Why It Matters | Complexity |
|---------|----------------|------------|
| Enumerate running apps, windows, and active surface | Users need a stable starting point before any action | Medium |
| Show source of truth per target (`dom`, `cdp`, `ax`, `vision`, `script`) | Users need to know what is deterministic vs inferred | Medium |
| Generate a unified snapshot of interactive targets | Core product promise is a common control surface across browser and local apps | High |

### Action Safety

| Feature | Why It Matters | Complexity |
|---------|----------------|------------|
| Highlight target before/while acting | Desktop automation without preview feels unsafe | Low |
| Verify post-action state after every non-trivial action | Coordinate and vision fallback require guardrails | High |
| Permission onboarding for Accessibility and Screen Recording | macOS capability is blocked until permissions are granted | Medium |

### Interaction Primitives

| Feature | Why It Matters | Complexity |
|---------|----------------|------------|
| Click / press / activate semantic target | Minimum viable control surface | Medium |
| Fill text fields and confirm value | Core workflow for productivity apps | Medium |
| Scroll, select, and focus windows | Required for navigating large interfaces | Medium |
| Optional visible pointer / overlay cursor | Increases trust and debuggability for desktop actions | Low |

### Hybrid Product Consistency

| Feature | Why It Matters | Complexity |
|---------|----------------|------------|
| Reuse existing agrune verbs where possible | Prevents product split between browser and local control | High |
| Preserve browser-first deterministic path | Chrome should not regress just because local automation exists | Medium |
| Report unsupported / low-confidence targets explicitly | Honest failure modes matter more than fake universality | Medium |

## Differentiators

| Feature | Why It Helps | Dependencies |
|---------|--------------|--------------|
| Channel fusion policy (`DOM/CDP > AX > Vision`) | Lets agrune stay precise where possible and broad where needed | Unified snapshot model |
| External manual annotation profiles for unsupported apps | Gives users a way to rescue low-AX apps without app source access | Overlay + locator persistence |
| App-specific adapters (Apple events / script dictionaries / browser adapters) | High leverage on scriptable apps like productivity tools | App capability inventory |
| On-device visual reranking and confidence scoring | Makes fallback feel intentional instead of random | Screen capture + vision worker |
| Session replay with verification checkpoints | Can turn successful exploratory flows into reusable commands | Snapshot diff + action logs |

## Anti-Features

| Avoid | Why |
|-------|-----|
| Silent blind clicking without visible confirmation | Breaks trust immediately on desktop |
| Claiming all apps are equally automatable | Accessibility and scriptability coverage varies widely |
| Storing only absolute coordinates as reusable locators | Fragile under normal user behavior |
| Defaulting to off-device screenshot analysis | Conflicts with privacy and latency expectations |

## Dependencies Between Features

- Unified snapshot depends on channel inventory and a normalized target model.
- Safe actions depend on both semantic action selection and post-action verification.
- Manual external annotations depend on overlay tooling plus a durable locator format.
- On-device ML only pays off after the capture pipeline and verification loop already exist.

## Research Implications

- A viable v1 research result must separate deterministic features from probabilistic ones.
- Browser and desktop should share verbs, but not necessarily the same locator implementation.
- Permission UX is not a support detail; it is part of the core product viability decision.

## Sources

### Primary

- [AXUIElement documentation](https://developer.apple.com/documentation/applicationservices/axuielement_h)
- [Allow apps to use screen and audio recording](https://support.apple.com/en-afri/guide/mac-help/mchl592e5686/mac)
- [Chrome DevTools Protocol: DOMSnapshot](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/)
- [Chrome DevTools Protocol: Accessibility](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/)

### Secondary / Inference

- [agrune README](/Users/chenjing/dev/agrune/agrune/README.md)
- [Project context](/Users/chenjing/dev/agrune/.planning/PROJECT.md)

---
*Feature research for agrune desktop-expansion feasibility*
