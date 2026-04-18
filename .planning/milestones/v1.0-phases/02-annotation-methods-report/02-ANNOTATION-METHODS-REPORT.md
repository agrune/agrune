# Phase 2 Report: Annotation Methods

**Phase:** 2 — Annotation Methods Report  
**Date:** 2026-04-07  
**Question:** macOS-first agrune 에서 “직접 어노테이션”은 어떤 형태로 성립할 수 있는가?

## Evaluation Frame

이 보고서의 direct method 는 다음 조건을 만족해야 한다.

- semantic target 정보가 의도적으로 노출된다
- agrune 가 stable locator 또는 action contract 로 변환할 수 있다
- 단순 화면 인식이 아니라, 앱 또는 플랫폼이 의미를 제공한다

## Case A: First-Party Native agrune SDK

### Concept

앱 소유자가 agrune SDK 또는 agrune-compatible metadata layer 를 앱 내부에 직접 넣는다. 웹의 `data-agrune-*`에 가장 가까운 네이티브 대응이다.

### How It Works

- native view/widget 에 agrune target metadata 를 명시한다
- runtime bridge 가 이를 외부 snapshot contract 로 노출한다
- 가능하면 accessibility 정보도 함께 강화해 외부 tooling 친화성을 높인다

### Good Fit

- 우리가 소유한 macOS app
- 협업 가능한 파트너 앱
- 내부 업무용 툴

### Limits

- 제3자 폐쇄형 앱에는 적용 불가
- SDK 를 넣을 수 없는 레거시 네이티브 앱에는 무력

## Case B: Accessibility-Carrier Annotation

### Concept

앱은 별도 agrune SDK 대신, `NSAccessibility` / `UIAccessibility` 같은 표준 접근성 surface 를 아주 풍부하게 구현해 agrune 가 읽을 semantic carrier 로 쓴다. 즉, “agrune 전용 DOM”이 아니라 “풍부한 accessibility semantics”를 annotation 대용으로 활용한다.

### How It Works

- 표준 control 은 built-in accessibility exposure 를 최대한 활용한다
- custom control 은 `NSAccessibilityElement` 또는 role-specific protocol 로 외부에 드러낸다
- role, label, value, frame, actions, notifications 를 정교하게 제공한다

### Good Fit

- 소스를 수정할 수 있는 native app
- OS-level automation 과 screen reader support 를 동시에 챙기고 싶은 앱

### Limits

- agrune 전용 metadata channel 로는 표현력이 제한될 수 있다
- accessibility naming 은 사용자 경험도 고려해야 해서 internal-only metadata packing 에 제약이 있다
- third-party app 에는 적용 불가

## Case C: Embedded Web / Electron Annotation Bridge

### Concept

Electron, WebView, 또는 browser-hosted app 처럼 내부에 DOM-like surface 가 있는 앱은 preload, bridge, devtools/debug port 등을 통해 agrune semantic layer 를 renderer 쪽에 직접 노출한다.

### How It Works

- renderer / preload 에서 safe bridge 를 노출한다
- DOM 또는 internal widget model 을 agrune snapshot contract 로 변환한다
- 필요 시 `contextBridge` 같은 공식 메커니즘으로 isolated world 와 main world 사이를 연결한다

### Good Fit

- Electron desktop apps
- embedded web surfaces
- browser extension / CDP 를 사용할 수 있는 hosted apps

### Limits

- pure native app 에는 범용 적용 불가
- security model 에 맞게 narrow bridge 설계가 필요하다
- third-party Electron app 이라 해도 preload/control 권한이 없으면 적용 불가

## Comparative Evaluation

| Case | Technical Feasibility | Product Structure | Risk | Permission / Security | Performance | UX | Verdict |
|------|-----------------------|-------------------|------|-----------------------|-------------|----|---------|
| A. First-Party Native SDK | High for owned apps | Separate SDK / adapter tier 필요 | Medium | Low OS permission burden, high app integration effort | High | High | Best direct method if you own the app |
| B. Accessibility-Carrier | Medium to high | Uses OS-native semantics, low extra runtime | Medium | Depends on macOS Accessibility permission for external automation | High | High for accessible apps | Best externalizable direct method on macOS |
| C. Embedded Web / Electron Bridge | High for compatible apps | Browser-like adapter tier 재사용 가능 | Medium | Bridge surface must be tightly scoped | High | High | Best hybrid direct method for DOM-capable desktops |

## Why These Three Are Materially Different

- **Case A** 는 agrune-specific contract 를 앱 내부에 직접 넣는 방식이다.
- **Case B** 는 OS 표준 semantic carrier 인 accessibility 를 agrune translation source 로 쓰는 방식이다.
- **Case C** 는 native 가 아니라 embedded web/runtime bridge 를 direct surface 로 이용하는 방식이다.

즉 차이는 “어디에 semantics 를 박느냐”다.

- app-owned custom contract
- OS-standard semantic layer
- embedded web/runtime bridge

## Recommendation

### Best direct method overall

**Case B + Case C 조합**이 현실적이다.

- macOS native app 에서는 `Accessibility-Carrier`
- Electron / browser-like app 에서는 `Embedded Web / Electron Bridge`

### Best direct method if you own the app

**Case A** 가 가장 정확하다.  
다만 일반 사용자 대상 제품 확장이라는 관점에서는 coverage 가 너무 좁아서 universal strategy 가 되긴 어렵다.

## Implications For agrune

- “앱에 직접 annotation”은 존재하지만, 범용적이지 않다.
- direct methods 만으로 일반 사용자용 universal local control product 를 만들 수는 없다.
- 따라서 later synthesis 에서는 direct methods 를 semantic premium tier 로 배치하고, alternatives 를 coverage tier 로 더해야 한다.

## Sources

- [Accessibility for custom AppKit controls](https://developer.apple.com/library/archive/documentation/Accessibility/Conceptual/AccessibilityMacOSX/ImplementingAccessibilityforCustomControls.html)
- [NSAccessibility](https://developer.apple.com/documentation/appkit/nsaccessibility-swift.struct)
- [UIAccessibility protocol](https://developer.apple.com/documentation/UIKit/uiaccessibility-protocol)
- [Scripting Bridge](https://developer.apple.com/documentation/scriptingbridge)
- [NSScriptSuiteRegistry](https://developer.apple.com/documentation/foundation/nsscriptsuiteregistry)
- [Mac Automation Scripting Guide: How Mac Scripting Works](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/HowMacScriptingWorks.html)
- [Electron Accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility)
- [Electron contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
