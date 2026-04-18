# Phase 1 Report: Channel Inventory and Constraints

**Phase:** 1 — Channel Inventory and Constraints  
**Date:** 2026-04-07  
**Scope:** browser-first agrune 를 macOS local-control research 로 확장하기 위한 baseline 정리

## Goal

Phase 2와 Phase 3에서 서로 다른 연구 케이스를 비교하려면, 먼저 어떤 채널이 semantic 하고 어떤 채널이 probabilistic 한지 공통 언어로 정리되어 있어야 한다. 이 문서는 그 baseline 을 만든다.

## Current agrune Baseline

현재 agrune의 strongest path 는 브라우저 안에 있다.

- `DOM annotation`: 앱이 `data-agrune-*`를 선언할 수 있을 때 가장 높은 정밀도
- `CDP`: Chrome/Chromium 에서 deterministic input, DOM snapshot, accessibility tree, screenshot 획득 가능
- `MCP surface`: 이미 `snapshot`, `act`, `fill`, `pointer`, `guide`, `read` 같은 공통 verb 가 있음

이 baseline 때문에 로컬 제어 연구의 목표는 “브라우저를 OS 방식으로 대체”가 아니라, “브라우저 정밀도를 유지하면서 local surfaces 를 추가”하는 쪽이어야 한다.

## Channel Matrix

| Channel | Primary Surface | Ownership Needed | Determinism | Required Permission / Gate | Strength | Main Failure Mode | Product Role |
|---------|-----------------|------------------|-------------|----------------------------|----------|-------------------|--------------|
| DOM annotation | Web / Electron / WebView internals | 높음 | Very high | 브라우저/앱 내부 접근 필요 | 개발자 의도를 가장 정확히 표현 | 제3자 앱에는 적용 불가 | Browser gold path |
| CDP | Chrome / Chromium | 중간 | Very high | 디버깅 포트/attach 권한 | DOM, AX, screenshot, input 을 한 채널에서 처리 | 비-Chromium 앱에 무력 | Browser semantic transport |
| macOS Accessibility (`AX`) | Native macOS UI | 낮음~중간 | Medium to high | Accessibility permission | 외부에서 semantic role/name/bounds/action 획득 | 앱이 AX 를 빈약하게 노출할 수 있음 | Desktop gold path when exposed |
| Apple events / app scripting | Scriptable macOS apps | 낮음 | High in supported apps | Automation / app scripting consent | UI 클릭 없이 intent-level control 가능 | 지원 앱이 제한적 | High-leverage adapter |
| ScreenCaptureKit | Any visible app/window | 낮음 | Low by itself | Screen Recording permission | pixels 확보, verification 및 vision input 제공 | semantics 없음 | Capture substrate |
| Vision / local ML | Any visible app/window | 낮음 | Low to medium | capture path 필요 | unsupported UI 를 후보 수준으로 복구 | 오탐, 좌표 drift, 반복성 부족 | Last-resort perception |
| External manual profile | Any app | 낮음 | Medium | overlay/capture plus user setup | 접근성 없는 앱도 user-authored 구조로 보완 가능 | UI 변경에 취약 | Unsupported-app escape hatch |

## Constraint Analysis

### 1. Permission Gates Are First-Class

- `Accessibility` permission 없이는 semantic desktop action 이 거의 시작되지 않는다.
- `Screen Recording` permission 없이는 verification 과 vision fallback 이 성립하지 않는다.
- `Automation` / Apple events consent 는 scriptable apps 에서 별도 gate 가 된다.

즉, macOS local control 은 “기술이 되느냐”보다 “사용자가 이 permission stack 을 받아들이느냐”가 같은 비중의 문제다.

### 2. Third-Party Native Apps Do Not Have a Public DOM

- 외부에서 공통적으로 읽는 DOM 같은 구조는 없다.
- 있는 것은 대개 `AX tree` 아니면 pixels 뿐이다.
- 따라서 “앱에 직접 annotation”을 범용적으로 밀어 넣는 전략은 소스/플랫폼 제어권이 있는 경우에만 성립한다.

### 3. Browser and Desktop Must Not Be Flattened Too Early

브라우저는 이미 `DOM/CDP` 라는 deterministic semantic channel 을 갖고 있다. 이를 desktop 과 같은 수준의 “screen automation”으로 낮추면 agrune의 가장 큰 장점을 잃는다. 제품 구조는 채널을 통합해야 하지만, 채널의 품질 차이를 숨기면 안 된다.

## Recommended Policy

### Perception Order

1. `DOM / CDP`
2. `Apple events / script adapter`
3. `AX`
4. `Screen capture + Vision / local ML`

### Action Order

1. semantic browser action
2. app-script action
3. AX action
4. coordinate action with visible pointer and post-check

### Product Truths

- local control 은 가능하지만 universal direct annotation 은 아니다
- `AX`는 desktop 의 best external semantic channel 이지만 coverage 는 app-dependent 다
- vision 은 주 채널이 아니라 gap-filler 여야 한다
- 사용자 신뢰를 위해 source/confidence 표시가 필요하다

## What This Enables for Later Phases

- Phase 2는 “직접 어노테이션/직접 semantic exposure” 케이스만 다루고,
- Phase 3는 “어노테이션이 없는 상태에서 성립하는 우회/대체” 케이스를 다루며,
- Phase 4는 두 묶음을 한 표준 비교 프레임으로 합칠 수 있다.

## Sources

- [AXUIElement documentation](https://developer.apple.com/documentation/applicationservices/axuielement_h)
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [Allow apps to use screen and audio recording](https://support.apple.com/en-afri/guide/mac-help/mchl592e5686/mac)
- [Introduction to Apple Events](https://developer.apple.com/library/archive/documentation/mac/pdf/Interapplication_Communication/Intro_to_IAC.pdf)
- [Chrome DevTools Protocol: Accessibility](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/)
- [Chrome DevTools Protocol: DOMSnapshot](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/)
- [Chrome DevTools Protocol: Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/)
- [agrune README](/Users/chenjing/dev/agrune/agrune/README.md)
- [Architecture notes](/Users/chenjing/dev/agrune/.planning/codebase/ARCHITECTURE.md)
