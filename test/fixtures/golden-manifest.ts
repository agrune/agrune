// The A.7.1 golden manifest (4 groups; one sensitive target; one repeat with 2 rows).
// Reproduced verbatim from SPEC A.7.1 — note it omits top-level `version` and the repeat's
// `template` (both lenient in the lean schema so this validates; see manifest.ts).

export const goldenManifest = {
  groups: [
    {
      groupId: 'login',
      name: 'Login Form',
      desc: 'Authenticate to the app',
      targets: [
        {
          targetId: 'username_input',
          name: 'Username',
          desc: 'Your account name',
          selector: { css: '#user' },
          actionKinds: ['fill'],
        },
        {
          targetId: 'password_input',
          name: 'Password',
          selector: { css: '#pass' },
          actionKinds: ['fill'],
          sensitive: true,
        },
      ],
    },
    {
      groupId: 'todos',
      targets: [
        {
          targetId: 'new_todo_input',
          name: 'New todo',
          selector: { css: '#new-todo' },
          actionKinds: ['fill'],
        },
      ],
      repeats: [
        {
          repeatId: 'todo_items',
          keyFrom: 'el.dataset.id ?? ""',
          nameFrom: 'el.querySelector("label")?.textContent?.trim() ?? ""',
          strategy: 'dom',
          containerSelector: { css: '.todo-list' },
          targets: [
            { targetId: 'todo_item_toggle', name: 'Toggle', selector: { css: '.toggle' }, actionKinds: ['click'] },
            { targetId: 'todo_item_destroy', name: 'Destroy', selector: { css: '.destroy' }, actionKinds: ['click'] },
          ],
        },
      ],
    },
    {
      groupId: 'filters',
      name: 'Filters',
      desc: 'Route buttons',
      targets: [
        { targetId: 'filter_all', name: 'All', selector: { css: 'a[href="#/all"]' }, actionKinds: ['click'] },
      ],
    },
    { groupId: 'empty_group', name: 'Empty', targets: [] },
  ],
}

/**
 * A TodoMVC-like DOM consistent with the golden manifest AND with the spec's repeat-key
 * binding (`el` in keyFrom = the matched target element, e.g. `.toggle`). So the row's
 * interactive elements carry `data-id` for `el.dataset.id` to read. Two rows: a1 / b2.
 */
export const goldenHtml = `<!doctype html><html><head><title>Demo "App"</title></head><body>
  <form>
    <input id="user" name="username" />
    <input id="pass" type="password" name="password" />
  </form>
  <input id="new-todo" placeholder="What needs doing?" />
  <ul class="todo-list">
    <li data-id="a1">
      <input class="toggle" type="checkbox" data-id="a1" />
      <label>Buy milk</label>
      <button class="destroy" data-id="a1">x</button>
    </li>
    <li data-id="b2">
      <input class="toggle" type="checkbox" data-id="b2" />
      <label>Walk dog</label>
      <button class="destroy" data-id="b2">x</button>
    </li>
  </ul>
  <nav>
    <a href="#/all">All</a>
    <a href="#/active">Active</a>
  </nav>
</body></html>`
