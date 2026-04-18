# Phase 4 Report: Product Synthesis and Recommendation

**Phase:** 4 — Product Synthesis and Recommendation  
**Date:** 2026-04-07  
**Decision Scope:** agrune 가 browser-only 에서 browser + macOS local control product 로 확장 가능한가?

## Executive Verdict

**Qualified GO.**

단, 전제는 명확하다.

- `DOM/CDP` 기반 browser path 는 그대로 유지한다
- macOS local control 은 `AX-first hybrid expansion` 으로 간다
- direct methods 는 premium semantic tier 로 취급한다
- alternatives 는 coverage tier 로 취급한다
- `Vision-first universal automation` 을 제품 약속으로 내세우지 않는다

즉, **“모든 앱에 direct annotation”은 No-Go**, **“browser precision 을 유지한 hybrid local-control platform”은 Go** 다.

## Six-Case Comparison Matrix

| Case | Tier | Ownership Need | Coverage | Determinism | User Setup Burden | Product Leverage | Recommendation |
|------|------|----------------|----------|-------------|-------------------|------------------|----------------|
| A. First-Party Native SDK | Direct | Very high | Narrow | Very high | Medium | High for owned apps | Strategic for first-party apps only |
| B. Accessibility-Carrier | Direct | High | Narrow to medium | High | Medium | High on macOS | Best native direct method |
| C. Embedded Web / Electron Bridge | Direct | High | Medium in hybrid apps | Very high | Medium | Very high where applicable | Best direct method for DOM-capable desktops |
| D. External AX Harvesting | Alternative | Low | Medium to broad | Medium to high | High (Accessibility permission) | Very high | Best default desktop entry path |
| E. Manual External Profile | Alternative | Low | Targeted but flexible | Medium | High initial setup | Medium | Best unsupported-app rescue path |
| F. Screen + Local Vision / ML | Alternative | Low | Broadest | Low to medium | High (Screen Recording + confidence management) | Medium | Necessary last resort, not default |

## What Product Should Promise

### Safe promise

“agrune 는 브라우저와 일부 macOS 앱을 semantic-first 로 제어하고, unsupported surfaces 에 대해서는 guided fallback 을 제공한다.”

### Unsafe promise

“agrune 는 모든 앱에 direct annotation 처럼 정확하게 동작한다.”

이 unsafe promise 는 현재 연구 결과로는 방어할 수 없다.

## Recommended Hybrid Architecture

### Layer 1: Browser Semantic Tier

- existing `DOM annotation`
- existing `CDP`
- browser accessibility only as secondary input

### Layer 2: Desktop Semantic Tier

- macOS `AX`
- app-specific scripting adapters where available
- owned app direct methods (SDK / accessibility-carrier / embedded bridge)

### Layer 3: Coverage Tier

- manual external profiles
- screen capture + local vision/ML
- visible pointer / overlay guidance

### Layer 4: Verification Tier

- DOM/AX/state re-observation
- screenshot diff and expected state checks
- failure / retry / downgrade logic

## Prototype Order

### Prototype 1: Surface Abstraction Without Regressing Browser

- Generalize current browser-centric assumptions toward `surfaceId`
- Preserve existing MCP verbs
- Add provenance fields like `source` and `confidence`

### Prototype 2: macOS AX Snapshot + Action + Overlay

- native helper for Accessibility
- desktop target normalization
- visible guide / pointer
- post-action verification

### Prototype 3: Manual External Profiles

- profile format
- structural locators
- import/export and editing flow

### Prototype 4: Vision / ML Fallback

- capture pipeline
- candidate generation
- reranking
- guarded action loop

### Optional Prototype 5: App-Specific Adapters

- Apple events for scriptable apps
- first-party SDK for owned native surfaces
- embedded bridge for Electron/WebView partners

## General-User Viability

### Verdict

**Conditionally viable.**

아래가 성립하면 일반 사용자도 사용할 수 있다.

- 설치 시 permission/dev-mode onboarding 이 guided 된다
- supported apps 에서는 사용 단계가 단순하다
- unsupported apps 는 “지원 안 됨” 또는 “power-user setup 필요”가 명확하다

### Not viable if

- vision fallback 을 silent default 로 둔다
- support coverage 를 과장한다
- 권한/보안 안내 없이 screen reading/control 이 먼저 보인다

## Go / No-Go Decisions

| Decision | Verdict | Why |
|----------|---------|-----|
| browser + macOS hybrid expansion | GO | current agrune structure 와 잘 맞고, value expansion 이 명확하다 |
| universal app-direct annotation as the main strategy | NO-GO | ownership requirement 때문에 coverage 가 너무 좁다 |
| AX-first desktop entry | GO | macOS 에서 가장 semantic 한 external channel 이다 |
| manual profile system | GO-LATER | unsupported apps coverage 를 크게 넓힌다 |
| vision-first product positioning | NO-GO | 확률적이고 신뢰 비용이 크다 |

## Final Recommendation

agrune 는 **browser-first + macOS semantic expansion** 으로 가는 것이 맞다.

정리하면:

- 브라우저는 지금처럼 strong semantic path 유지
- macOS 는 `AX-first`
- unsupported apps 는 `manual profile`
- truly hard cases 만 `Vision fallback`
- product messaging 은 “semantic-first, verified fallback” 으로 유지

이렇게 가면 네가 원한 “브라우저와 로컬 제어 모두 가능한 그림”은 성립한다.  
하지만 그 그림은 **하나의 universal direct annotation engine** 이 아니라 **quality tiers 가 분리된 hybrid control system** 으로 이해해야 한다.

## Inputs

- [Phase 1 report](/Users/chenjing/dev/agrune/.planning/phases/01-channel-inventory-and-constraints/01-CHANNEL-INVENTORY.md)
- [Phase 2 report](/Users/chenjing/dev/agrune/.planning/phases/02-annotation-methods-report/02-ANNOTATION-METHODS-REPORT.md)
- [Phase 3 report](/Users/chenjing/dev/agrune/.planning/phases/03-annotation-alternatives-report/03-ANNOTATION-ALTERNATIVES-REPORT.md)
- [agrune README](/Users/chenjing/dev/agrune/agrune/README.md)
- [Architecture notes](/Users/chenjing/dev/agrune/.planning/codebase/ARCHITECTURE.md)
