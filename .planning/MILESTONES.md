# Milestones

## v1.0 Research (Shipped: 2026-04-18)

**Phases completed:** 4 phases, 9 plans, 9 tasks

**Key accomplishments:**

- Current agrune의 브라우저 gold path 를 기준점으로 고정해 desktop research 가 regression 을 일으키지 않도록 정리했다.
- DOM/CDP, AX, Apple events, ScreenCapture, Vision, manual profiles를 하나의 capability matrix 로 정리했다.
- 이후 연구 phase 전체에 공통 적용할 perception/action 정책과 product truths 를 고정했다.
- “앱에 직접 annotation”을 세 가지 다른 integration model 로 분해해 direct methods taxonomy 를 만들었다.
- 직접 어노테이션 전략만으로는 universal desktop coverage 가 안 되며, 현실적 조합은 accessibility-carrier + embedded web bridge 라고 결론냈다.
- 직접 어노테이션이 없을 때의 대체 전략을 AX harvesting, manual profiles, vision fallback 으로 분리했다.
- 대체 전략의 핵심은 후보 생성보다 verification loop 라는 점을 정리하고, AX default / manual profile rescue / vision last resort 구도를 제안했다.
- 여섯 케이스를 한 비교판에 올리고, 제품이 안전하게 약속할 수 있는 범위를 분리했다.
- 최종 결론은 ‘browser precision 유지 + AX-first hybrid expansion 은 GO, universal direct annotation 과 vision-first positioning 은 NO-GO’다.

---
