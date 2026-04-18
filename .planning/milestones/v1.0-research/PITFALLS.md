# Pitfalls Research

**Domain:** macOS-first desktop automation feasibility for agrune
**Researched:** 2026-04-07
**Confidence:** MEDIUM

## Critical Pitfalls

| Pitfall | Why It Hurts | Early Warning Signal | Prevention Strategy | Phase |
|---------|--------------|----------------------|---------------------|-------|
| Permission gates are product gates | Accessibility and screen recording are blocked until the user explicitly grants access | Flows only work on the developer machine, or fail silently for testers | Treat permission onboarding as a first-class user flow in the research and recommendation | Phase 1 |
| Accessibility coverage varies wildly by app | Some apps expose rich roles/actions; others expose almost nothing useful | Target app shows generic containers or missing bounds in Accessibility Inspector | Grade target apps by AX quality and never assume “big app = good accessibility” | Phase 1 |
| Coordinate fallback drifts under real user behavior | Window movement, scaling, split view, and multiple displays quickly invalidate raw points | Actions work once, then miss after resize or display changes | Require relative locators and post-action verification before calling a fallback reusable | Phase 2 / 3 |
| Vision can become an attractive trap | OCR or detector demos look impressive before they prove stable in production | Team starts routing all hard cases through screenshots by default | Keep a strict policy: deterministic channels first, vision only for gaps | Phase 3 |
| Scriptable app support is selective | Apple events can be amazing for some apps and useless for others | One flagship demo works well but does not generalize | Document app-specific adapters as bonuses, not as the general desktop strategy | Phase 2 |
| Privacy/trust concerns are stronger on desktop | Users are more sensitive to apps reading screens and controlling other apps | Early feedback questions safety before capability | Make overlays, source labels, and local-only processing part of the product story | Phase 1 / 4 |
| Existing browser ergonomics can regress | A universal abstraction may accidentally weaken today’s precise browser path | New types or fallbacks start complicating simple browser actions | Anchor the design on preserving current DOM/CDP quality and MCP verbs | Phase 4 |

## Additional Notes

- The research should measure not only “can it click” but also “can a general user understand why it clicked that.”
- Unsupported states must be explicit; a clean refusal is better than a probabilistic click sold as deterministic.
- The `sub_repos` auto-sync behavior in current GSD tooling is a workspace-management concern, not a product concern, but it should be documented during planning to avoid workflow confusion.

## Sources

### Primary

- [Allow apps to use screen and audio recording](https://support.apple.com/en-afri/guide/mac-help/mchl592e5686/mac)
- [AXUIElement documentation](https://developer.apple.com/documentation/applicationservices/axuielement_h)
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [Introduction to Apple Events](https://developer.apple.com/library/archive/documentation/mac/pdf/Interapplication_Communication/Intro_to_IAC.pdf)

### Secondary / Inference

- [Screen Recognition: Creating Accessibility Metadata for Mobile Applications from Pixels](https://docs-assets.developer.apple.com/ml-research/papers/screen-recognition-chi-2021.pdf) — strong signal that pixel-only metadata generation is possible, but also a reminder that it fills gaps rather than making native semantics magically appear everywhere
- [agrune codebase concerns](/Users/chenjing/dev/agrune/.planning/codebase/CONCERNS.md)

---
*Pitfall research for agrune desktop-expansion feasibility*
