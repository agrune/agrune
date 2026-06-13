// Parse a Playwright `ariaSnapshot` dump (.md / YAML-ish) into the set of
// actionable nodes, preserving the nearest enclosing landmark so we can group
// them realistically. This is the same source-of-truth the raw snapshot is
// measured from, which keeps the manifest-vs-raw comparison apples-to-apples.

const ACTIONABLE_ROLES = new Set([
  'link', 'button', 'searchbox', 'textbox', 'checkbox', 'radio',
  'combobox', 'listbox', 'switch', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'tab', 'slider', 'spinbutton', 'option',
])

const LANDMARK_ROLES = new Set([
  'banner', 'navigation', 'main', 'contentinfo', 'complementary',
  'search', 'region', 'dialog', 'form',
])

// `  - role "name" [ref=e12] [cursor=pointer]:`  /  `- button [ref=e3]`
const NODE_RE = /^(\s*)-\s+([a-z][a-z]*)\b(?:\s+"((?:[^"\\]|\\.)*)")?/

export function parseAriaDump(text) {
  const lines = text.split('\n')
  const targets = []
  let currentLandmark = 'page'

  for (const line of lines) {
    const m = NODE_RE.exec(line)
    if (!m) continue
    const role = m[2]
    const name = (m[3] ?? '').replace(/\\"/g, '"').trim()

    if (LANDMARK_ROLES.has(role)) {
      currentLandmark = name && name.length > 0 ? `${role}: ${name}` : role
      continue
    }

    if (ACTIONABLE_ROLES.has(role)) {
      targets.push({
        role,
        name: name.length > 0 ? name : role,
        landmark: currentLandmark,
      })
    }
  }

  return targets
}
