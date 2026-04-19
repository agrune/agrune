# Pattern: Navigation / Buttons / Links

탐색 UI (헤더 네비, 메뉴, 링크, 일반 버튼)는 대부분 **non-sensitive** 이고, `actionKinds: ['click']` 만으로 충분하다. 가장 많은 volume을 차지하므로 skill이 자동 생성할 때 가장 기계적으로 다룰 수 있는 부분이다.

## 기본 규칙

- `role`을 1순위 selector — `button`, `link`, `menuitem`, `tab`, `checkbox`, `radio`, `switch`, `option`
- `text`를 2순위 — 버튼/링크의 visible label. UI 카피가 바뀔 수 있으니 짧고 특징적인 부분 위주.
- `css`는 fallback. role/text로 unique가 안 될 때만.
- `sensitive` 필드 **생략**. 로그아웃 버튼조차 `sensitive`가 아니다 (정보 누출 경로 아님).

## Header navigation

```typescript
import { defineManifest, defineGroup, defineTarget } from '@agrune/manifest'

export default defineManifest({
  groups: [
    defineGroup({
      groupId: 'header_nav',
      targets: [
        defineTarget({
          targetId: 'home_link',
          selector: { role: { name: 'link' }, text: 'Home' },
          actionKinds: ['click'],
        }),
        defineTarget({
          targetId: 'products_link',
          selector: { role: { name: 'link' }, text: 'Products' },
          actionKinds: ['click'],
        }),
        defineTarget({
          targetId: 'profile_menu_button',
          selector: { role: { name: 'button' }, css: '[aria-haspopup=menu]' },
          actionKinds: ['click'],
        }),
        defineTarget({
          targetId: 'logout_menuitem',
          selector: { role: { name: 'menuitem' }, text: 'Log out' },
          actionKinds: ['click'],
        }),
      ],
    }),
  ],
})
```

## Tabs / Segmented control

```typescript
defineTarget({
  targetId: 'tab_overview',
  selector: { role: { name: 'tab' }, text: 'Overview' },
  actionKinds: ['click'],
}),
defineTarget({
  targetId: 'tab_activity',
  selector: { role: { name: 'tab' }, text: 'Activity' },
  actionKinds: ['click'],
}),
```

Tabs가 `aria-selected` 속성으로 active 상태를 표현하면 snapshot에 반영되지만, manifest selector에는 포함하지 말 것 — inactive tab을 클릭할 수 없게 된다.

## 일반 action buttons

```typescript
defineTarget({
  targetId: 'save_button',
  selector: { role: { name: 'button' }, text: 'Save' },
  actionKinds: ['click'],
}),
defineTarget({
  targetId: 'cancel_button',
  selector: { role: { name: 'button' }, text: 'Cancel' },
  actionKinds: ['click'],
}),
defineTarget({
  targetId: 'delete_button',
  selector: { role: { name: 'button' }, text: 'Delete', css: 'button.danger' },
  actionKinds: ['click'],
}),
```

**여러 'Save' 버튼**이 한 페이지에 있으면 role + text 만으로 중복 — `css`에 추가 discriminator (`form#profile button[type=submit]`) 또는 container-scoped `defineRepeat` 사용.

## Checkbox / Radio / Switch

```typescript
defineTarget({
  targetId: 'accept_terms_checkbox',
  selector: { role: { name: 'checkbox' }, text: 'I agree to the Terms' },
  actionKinds: ['click'],
}),
defineTarget({
  targetId: 'notifications_switch',
  selector: { role: { name: 'switch' }, css: '[aria-label="Enable notifications"]' },
  actionKinds: ['click'],
}),
```

`click` 이 토글한다. runtime 이 checked/unchecked 상태를 snapshot에 넣는다.

## Links to external URL

```typescript
defineTarget({
  targetId: 'docs_external_link',
  selector: { role: { name: 'link' }, text: 'Documentation' },
  actionKinds: ['click'],
}),
```

외부 URL로 이동하는 링크는 새 탭을 열 수도 있다 — `agrune_act` 가 다중 세션을 감지하고 active session 으로 자동 전환 (Phase 7 SESS-01).

## Keyboard-only targets

일부 UI는 focus + Enter 로만 작동 (dropdown menu item 등). 그래도 `actionKinds: ['click']` 를 써라 — agrune `click` 은 CDP Input 도메인으로 pointer + keyboard path 를 혼합해 submit 한다.

## Icon-only 버튼

텍스트 없는 아이콘 버튼 (X, ⋮, ☰)은 `aria-label` 을 읽어 selector 에 반영:

```typescript
defineTarget({
  targetId: 'close_dialog_button',
  selector: { role: { name: 'button' }, css: '[aria-label=Close]' },
  actionKinds: ['click'],
}),
```

`aria-label` 이 없으면 제품 팀에 추가 요청. 없으면 `css` fallback 으로 class/data-attr 사용하되 hash class 는 금지.

## targetId naming

- 페이지/섹션 접두어 + 역할 + 명사: `header_logo_link`, `product_card_add_to_cart_button`, `settings_sidebar_logout_link`
- 짧게: 20자 이하 권장. 너무 길면 AI agent prompt 가 커져 비용 증가.
- 중복 금지: 같은 manifest 안에서 unique.
