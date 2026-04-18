# Phase 3 Report: Annotation Alternatives

**Phase:** 3 — Annotation Alternatives Report  
**Date:** 2026-04-07  
**Question:** direct annotation 이 없을 때 agrune 는 어떤 대체 전략으로 범용성을 확보할 수 있는가?

## Evaluation Frame

이 보고서의 alternative 는 다음 성질을 가져야 한다.

- 앱 소유자가 agrune semantics 를 직접 제공하지 않아도 사용 가능하다
- target acquisition 과 action verification 방식이 정의되어 있다
- deterministic 한 부분과 probabilistic 한 부분이 분리되어 설명된다

## Case A: External AX Harvesting + Synthetic Annotation

### Concept

앱이 agrune 를 위해 annotation 하지는 않았더라도, OS accessibility tree 가 충분하면 agrune 가 이를 읽어 synthetic target list 와 overlay annotation 을 만든다.

### How It Works

- `AXUIElement` 로 role, name, bounds, enabled, actions 를 읽는다
- clickable / fillable / selectable nodes 를 추린다
- external overlay 로 번호와 이름을 붙인다
- 실행은 `AX` action 우선, 안 되면 coordinate fallback

### Deterministic Parts

- AX tree 읽기
- AX action 수행 가능 여부
- window / element bounds

### Probabilistic Parts

- 어떤 node 가 사용자에게 가장 의미 있는 target 인지의 ranking
- poor AX apps 에서 generic container 해석

### Best Fit

- 접근성 품질이 좋은 third-party macOS apps
- 일반 UI control 이 많은 productivity apps

## Case B: Manual External Profile + Structural Locators

### Concept

유저나 운영자가 앱 외부에서 reusable profile 을 만든다. 이는 앱에 annotation 을 넣는 것이 아니라, window matcher / region matcher / anchor / relative geometry / visual template / post-check 를 묶은 external locator graph 를 저장하는 방식이다.

### How It Works

- 대상 window 와 region 을 정의한다
- anchor element 또는 recognizable visual feature 를 지정한다
- target 을 absolute coordinates 가 아니라 relative geometry 로 표현한다
- action 후 expected state change 를 검증한다

### Deterministic Parts

- window matching
- saved structural relationships
- explicit post-action expectation

### Probabilistic Parts

- visual anchor 재탐색
- UI 업데이트 후 locator drift 보정

### Best Fit

- 접근성 없는 레거시 업무 앱
- 사내 도구처럼 사용자가 setup cost 를 감수할 수 있는 환경

## Case C: Screen Capture + Local Vision / ML + Verified Action Loop

### Concept

화면 이미지를 on-device perception pipeline 에 넣어 클릭 가능 후보를 추론하고, action 후 다시 화면을 보며 성공 여부를 확인하는 strategy 다.

### How It Works

- ScreenCaptureKit 으로 window/screen pixels 를 얻는다
- Vision OCR, icon/template matching, detector/reranker 를 조합한다
- candidate target 을 confidence 와 함께 생성한다
- click 후 screenshot / text / focus / state change 로 결과를 검증한다

### Deterministic Parts

- capture itself
- action dispatch
- post-action diff or expected state check

### Probabilistic Parts

- candidate generation
- icon semantics 해석
- ambiguous UI ranking

### Best Fit

- canvas-heavy UI
- poor accessibility apps
- remote/streamed/legacy surfaces

## Comparative Evaluation

| Case | Technical Feasibility | Product Structure | Risk | Permission / Security | Performance | UX | Verdict |
|------|-----------------------|-------------------|------|-----------------------|-------------|----|---------|
| A. External AX Harvesting | High where AX quality is good | Natural desktop adapter tier | Medium | Accessibility permission required | High | High | Best non-direct default on macOS |
| B. Manual External Profile | Medium | Profile storage + overlay + verification system 필요 | Medium to high | Capture or AX may still be needed for robust matching | Medium | Medium | Strong rescue path for unsupported apps |
| C. Screen + Local Vision / ML | Medium | Perception worker + verification loop 필요 | High | Screen Recording permission required | Medium to low | Medium when transparent, poor if hidden | Essential fallback, dangerous as default |

## Why These Three Are Materially Different

- **Case A** 는 OS가 이미 가진 semantics 를 harvesting 하는 전략이다.
- **Case B** 는 사람이 외부 구조를 명시해 reusable locator graph 를 만드는 전략이다.
- **Case C** 는 pixels 로부터 후보를 추론하는 perception-first 전략이다.

즉 차이는 “무엇을 source of structure 로 삼느냐”다.

- OS semantic exposure
- user-authored external structure
- on-device visual inference

## Key Findings

### OCR-only is not enough

OCR 은 단독 locator 로는 약하다.

- 창 위치 변경
- 크기 변경
- 반복 텍스트
- scroll state
- multi-monitor scaling

때문에 Case B 와 Case C 모두 OCR 을 보조 신호로만 써야 한다.

### Verification is the real product feature

alternative strategies 에서 중요한 건 “어떻게 찾느냐”만이 아니다.
진짜 차별점은:

- action 전 guidance
- action 후 re-observe
- expected state change 확인
- 실패 시 recovery path 제공

이 verification loop 가 있어야 probabilistic strategy 를 product 로 만들 수 있다.

## Recommendation

### Best alternative default

**Case A: External AX Harvesting**

이유:
- macOS 에서 가장 semantic 한 external channel 이다
- third-party apps coverage 가 direct method 보다 넓다
- action model 이 pure vision 보다 안정적이다

### Best unsupported-app escape hatch

**Case B: Manual External Profile**

이유:
- 접근성 없는 앱도 user effort 로 구조화할 수 있다
- OCR-only 가 아니라 structural locator 와 verification 으로 안정성을 높일 수 있다

### Necessary but dangerous fallback

**Case C: Screen + Local Vision / ML**

이유:
- coverage 는 넓지만 가장 확률적이다
- default strategy 가 아니라 last resort 가 되어야 한다

## Implications For agrune

- alternative layer 가 있어야 일반 사용자 대상 제품 확장이 가능하다
- 하지만 이 layer 는 direct methods 를 대체하는 main tier 가 되면 안 된다
- final recommendation 은 `semantic tier + coverage tier + verification loop` 구조가 되어야 한다

## Sources

- [AXUIElement documentation](https://developer.apple.com/documentation/applicationservices/axuielement_h)
- [AXObserver](https://developer.apple.com/documentation/applicationservices/1459139-axobservercreate)
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [VNRecognizeTextRequest](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)
- [Allow apps to use screen and audio recording](https://support.apple.com/en-afri/guide/mac-help/mchl592e5686/mac)
- [Screen Recognition: Creating Accessibility Metadata for Mobile Applications from Pixels](https://docs-assets.developer.apple.com/ml-research/papers/screen-recognition-chi-2021.pdf)
