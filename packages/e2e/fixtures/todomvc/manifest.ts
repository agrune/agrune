/**
 * TodoMVC agrune demo manifest — reference implementation for RECORD-05.
 *
 * This file is what the `manifest` authoring skill should produce when run
 * against the `App.tsx` in this directory. 8 static targets + 1 `defineRepeat`
 * cover the interactive surface of the canonical TodoMVC UI:
 *
 *   - new_todo_input              — fill new todo
 *   - toggle_all                  — mark every todo complete / incomplete
 *   - todo_items (repeat)         — per-row toggle / label (dbl-click to edit) / destroy
 *   - filter_all / filter_active / filter_completed  — URL-hash route buttons
 *   - clear_completed_button      — remove all completed rows
 *
 * README.md describes the manual verification checklist the user runs after
 * invoking the skill — skill output is acceptable if ≥ 6 / 8 static targets
 * and the `todo_items` repeat are generated automatically.
 */
import {
  defineManifest,
  defineGroup,
  defineTarget,
  defineRepeat,
} from '@agrune/manifest'

const newTodoInput = defineTarget({
  targetId: 'new_todo_input',
  selector: { role: { name: 'textbox' }, css: '#new-todo' },
  actionKinds: ['fill'],
})

const toggleAll = defineTarget({
  targetId: 'toggle_all',
  selector: { role: { name: 'checkbox' }, css: '#toggle-all' },
  actionKinds: ['click'],
})

const filterAll = defineTarget({
  targetId: 'filter_all',
  selector: { role: { name: 'link' }, css: 'a[href="#/all"]' },
  actionKinds: ['click'],
})

const filterActive = defineTarget({
  targetId: 'filter_active',
  selector: { role: { name: 'link' }, css: 'a[href="#/active"]' },
  actionKinds: ['click'],
})

const filterCompleted = defineTarget({
  targetId: 'filter_completed',
  selector: { role: { name: 'link' }, css: 'a[href="#/completed"]' },
  actionKinds: ['click'],
})

const clearCompletedButton = defineTarget({
  targetId: 'clear_completed_button',
  selector: { role: { name: 'button' }, css: '.clear-completed' },
  actionKinds: ['click'],
})

const todoItemToggle = defineTarget({
  targetId: 'todo_item_toggle',
  selector: { role: { name: 'checkbox' }, css: '.toggle' },
  actionKinds: ['click'],
})

const todoItemLabel = defineTarget({
  targetId: 'todo_item_label',
  selector: { css: 'label' },
  actionKinds: ['dblclick'],
})

const todoItemDestroy = defineTarget({
  targetId: 'todo_item_destroy',
  selector: { role: { name: 'button' }, css: '.destroy' },
  actionKinds: ['click'],
})

const todoItemsRepeat = defineRepeat({
  repeatId: 'todo_items',
  template: 'todo_${key}',
  keyFrom: 'el.dataset.id ?? ""',
  nameFrom: 'el.querySelector("label")?.textContent?.trim() ?? ""',
  strategy: 'dom',
  containerSelector: { css: '.todo-list' },
  targets: [todoItemToggle, todoItemLabel, todoItemDestroy],
})

const todosGroup = defineGroup({
  groupId: 'todos',
  targets: [
    newTodoInput,
    toggleAll,
    filterAll,
    filterActive,
    filterCompleted,
    clearCompletedButton,
  ],
  repeats: [todoItemsRepeat],
})

export default defineManifest({
  groups: [todosGroup],
})
