/**
 * TodoMVC demo App.tsx — RECORD-05 reference fixture.
 *
 * NOT a runnable app in this workspace — `@agrune/e2e` does not depend on
 * `react`. This file is a **structural reference** for the adjacent
 * `manifest.ts`. To actually run the demo, drop this directory into a Vite +
 * React project with `react` and `react-dom` installed.
 *
 * `tsconfig.json` in `packages/e2e/` excludes `fixtures/**`, so TypeScript
 * does NOT check this file during `pnpm --filter @agrune/e2e run typecheck`.
 * Keeping it uncompiled is deliberate — the fixture's job is to show the
 * interactive element layout that maps 1:1 with `manifest.ts`.
 */
// @ts-nocheck — fixture is intentionally not typechecked in this workspace.
import { useMemo, useState } from 'react'

type Todo = { id: string; title: string; completed: boolean }
type Filter = 'all' | 'active' | 'completed'

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const visible = useMemo(() => {
    if (filter === 'active') return todos.filter(t => !t.completed)
    if (filter === 'completed') return todos.filter(t => t.completed)
    return todos
  }, [todos, filter])

  const remaining = todos.filter(t => !t.completed).length
  const hasCompleted = todos.some(t => t.completed)
  const allComplete = todos.length > 0 && remaining === 0

  function addTodo(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const title = draft.trim()
    if (!title) return
    setTodos(prev => [...prev, { id: uid(), title, completed: false }])
    setDraft('')
  }

  function toggleTodo(id: string) {
    setTodos(prev =>
      prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t)),
    )
  }

  function destroyTodo(id: string) {
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  function toggleAll() {
    const next = !allComplete
    setTodos(prev => prev.map(t => ({ ...t, completed: next })))
  }

  function clearCompleted() {
    setTodos(prev => prev.filter(t => !t.completed))
  }

  return (
    <>
      <input
        id="new-todo"
        placeholder="What needs to be done?"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={addTodo}
      />

      {todos.length > 0 && (
        <section className="main">
          <input
            id="toggle-all"
            type="checkbox"
            checked={allComplete}
            onChange={toggleAll}
          />
          <label htmlFor="toggle-all">Mark all as complete</label>

          <ul className="todo-list">
            {visible.map(todo => (
              <li
                key={todo.id}
                data-id={todo.id}
                className={todo.completed ? 'completed' : ''}
              >
                <input
                  type="checkbox"
                  className="toggle"
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo.id)}
                />
                <label>{todo.title}</label>
                <button
                  className="destroy"
                  onClick={() => destroyTodo(todo.id)}
                  aria-label={`Delete ${todo.title}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <footer className="footer">
            <span>{remaining} item{remaining === 1 ? '' : 's'} left</span>
            <ul className="filters">
              <li>
                <a
                  href="#/all"
                  className={filter === 'all' ? 'selected' : ''}
                  onClick={() => setFilter('all')}
                >
                  All
                </a>
              </li>
              <li>
                <a
                  href="#/active"
                  className={filter === 'active' ? 'selected' : ''}
                  onClick={() => setFilter('active')}
                >
                  Active
                </a>
              </li>
              <li>
                <a
                  href="#/completed"
                  className={filter === 'completed' ? 'selected' : ''}
                  onClick={() => setFilter('completed')}
                >
                  Completed
                </a>
              </li>
            </ul>
            {hasCompleted && (
              <button className="clear-completed" onClick={clearCompleted}>
                Clear completed
              </button>
            )}
          </footer>
        </section>
      )}
    </>
  )
}
