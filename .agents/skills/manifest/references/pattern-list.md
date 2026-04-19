# Pattern: Lists (`defineRepeat`)

동적 리스트 (todo 항목, 게시글 카드, 테이블 행 등)는 정적 `defineTarget`으로는 각 인스턴스를 구분할 수 없다. `defineRepeat`을 써서 **DOM enumerate** + **key 추출** + **per-instance target 확장**을 한 번에 선언한다.

## 표준 예시 (TodoMVC 리스트)

```typescript
import {
  defineManifest,
  defineGroup,
  defineTarget,
  defineRepeat,
} from '@agrune/manifest'

export default defineManifest({
  groups: [
    defineGroup({
      groupId: 'todos',
      targets: [
        defineTarget({
          targetId: 'new_todo_input',
          selector: { role: { name: 'textbox' }, css: '#new-todo' },
          actionKinds: ['fill'],
        }),
      ],
      repeats: [
        defineRepeat({
          repeatId: 'todo_items',
          template: 'todo_${key}',
          keyFrom: 'el.dataset.id',
          nameFrom: 'el.querySelector("label")?.textContent?.trim() ?? ""',
          strategy: 'dom',
          containerSelector: { css: '.todo-list' },
          targets: [
            defineTarget({
              targetId: 'todo_item_toggle',
              selector: { role: { name: 'checkbox' }, css: '.toggle' },
              actionKinds: ['click'],
            }),
            defineTarget({
              targetId: 'todo_item_label',
              selector: { css: 'label' },
              actionKinds: ['dblclick'],
            }),
            defineTarget({
              targetId: 'todo_item_destroy',
              selector: { role: { name: 'button' }, css: '.destroy' },
              actionKinds: ['click'],
            }),
          ],
        }),
      ],
    }),
  ],
})
```

## 필드 의미

| 필드 | 설명 |
|---|---|
| `repeatId` | 고유 ID (snake_case). snapshot의 `repeatInstance` 필드에 함께 등장 |
| `template` | 각 인스턴스에 붙일 target 이름 템플릿. `${key}`에 keyFrom 결과 치환 (예: `todo_abc123`) |
| `keyFrom` | JS 표현식 문자열. 각 row 요소를 `el`로 받아 unique key 반환 |
| `nameFrom` | 선택. UI에 노출할 display name (각 row 구분용) |
| `strategy` | `'dom'` (viewport 밖 포함 모든 row 열거) 또는 `'virtualized'` (viewport 내 + `aria-rowcount`/`aria-setsize` 힌트) |
| `containerSelector` | 선택. row 열거 범위를 좁히는 컨테이너 selector. 없으면 `document` 전체 스캔 |
| `targets` | 각 인스턴스 내부 인터랙티브 요소 정의. targetId는 per-repeat unique |

## strategy 선택

- **`'dom'`** — default. DOM에 실제 렌더된 모든 row를 열거. 짧은 리스트, 정적 페이지에 적합.
- **`'virtualized'`** — `react-window` / `tanstack-virtual` 등이 viewport만 렌더하는 경우. Runtime이 `aria-rowcount` / `aria-setsize` attr를 logical-size hint로 사용. **Phase 15-02에서 실제 virtualized library 내부 상태(fiber data-state)까지 파고드는 로직은 v0.6+로 연기** — 현재는 viewport 내 row + aria hint만.

## containerSelector를 언제 쓰나

- 같은 페이지에 `<ul>` 여러 개 있을 때 (`.todo-list` vs `.suggested-list`)
- virtualized list의 viewport root를 명시적으로 찍어야 row limit이 예측 가능할 때
- `document.querySelectorAll` 전역 탐색을 피하고 싶을 때 (성능)

생략하면 `document`가 scope → 같은 template selector가 여러 곳에서 잡힐 수 있으니 주의.

## keyFrom 표현식 주의

- `el.dataset.id` — `data-id` attr 읽기 (권장)
- `el.querySelector('a[href]')?.href` — 링크 URL을 key로 (unique 보장시에만)
- **`el.textContent`는 불안정** — 공백/개행으로 key가 꼬일 수 있음. `.trim()` 필수, 가능하면 피하기.
- Key 중복시 runtime이 `_dup_<n>` suffix 붙여 방어하지만, authoring 시 unique를 보장하는 것이 청결.

## 테이블 행

```typescript
defineRepeat({
  repeatId: 'member_rows',
  template: 'member_${key}',
  keyFrom: 'el.dataset.memberId',
  nameFrom: 'el.querySelector("td:first-child")?.textContent?.trim() ?? ""',
  strategy: 'dom',
  containerSelector: { css: 'table.members tbody' },
  targets: [
    defineTarget({
      targetId: 'member_row_edit',
      selector: { role: { name: 'button' }, text: 'Edit' },
      actionKinds: ['click'],
    }),
    defineTarget({
      targetId: 'member_row_delete',
      selector: { role: { name: 'button' }, text: 'Delete' },
      actionKinds: ['click'],
    }),
  ],
}),
```

## repeatInstance in snapshot

runtime이 확장한 target은 snapshot에서:
```json
{
  "targetId": "todo_item_toggle",
  "repeatInstance": { "repeatId": "todo_items", "key": "abc123", "name": "Buy milk" },
  "selector": { "css": ".todo-list li[data-id='abc123'] .toggle" }
}
```
AI agent가 `agrune_act({ targetId: "todo_item_toggle", repeatInstance: { key: "abc123" } })`로 특정 인스턴스 조작.
