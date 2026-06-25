# agrune ↔ @playwright/cli parity coverage

The north star (SPEC §1): implement **every** `@playwright/cli` command; the only intended
divergence is the perception layer (manifest vs a11y). This table tracks coverage per SPEC §6.5
and Appendix A.6 (incl. the A.0.3 corrections: `generate-locator`, `highlight`, `detach`,
`--raw`, `video-chapter`, `[button]` on mousedown/mouseup, `-s=`/`--session` are real parity
targets). **Status: every command has an agrune equivalent.**

## Lifecycle / context
| playwright-cli | agrune | Playwright public API |
|---|---|---|
| `open <url>` | `open` | `context.newPage()` + `page.goto` |
| `attach <endpoint>` | `attach <cdp>` (off-default, DECISIONS #26) | `chromium.connectOverCDP` |
| `close` | `close` / `tabs close` | `page.close()` |
| `detach` | `detach` | disconnect CDP without killing Chrome |
| `delete-data` | `delete-data` (per-tab scoping #20) | `context.clearCookies()` + storage clear |

## Navigation
| `goto <url>` | `navigate` / `goto` | `page.goto` |
| `go-back` | `back` / **`go-back`** alias | `page.goBack()` |
| `go-forward` | `forward` / **`go-forward`** alias | `page.goForward()` |
| `reload` | `reload` | `page.reload()` |
| `resize <w> <h>` | `resize` | `page.setViewportSize()` |

## Element actions
| `click`/`dblclick` | `click` / `dblclick` | `locator.click()/dblclick()` |
| `fill` | `fill` | `locator.fill()` (+ keystroke strategy) |
| `type` | `type` | `locator.pressSequentially()` |
| `hover` | `hover` | `locator.hover()` |
| `select` | `select` | `locator.selectOption()` |
| `check` | `check` | `locator.check()` |
| `uncheck` | `uncheck` | `locator.uncheck()` |
| `upload` | `upload` | `locator.setInputFiles()` / fileChooser |
| `drag`/`drop` | `drag --to` / `drop` | `locator.dragTo()` / synthetic DnD |

## Keyboard / mouse primitives
| `press <key>` | `press` | `locator.press()`/`keyboard.press()` |
| `keydown <key>` | `keydown` | `keyboard.down()` |
| `keyup <key>` | `keyup` | `keyboard.up()` |
| `mousemove x y` | `mousemove` | `mouse.move()` |
| `mousedown [button]` | `mousedown [button]` | `mouse.down()` |
| `mouseup [button]` | `mouseup [button]` | `mouse.up()` |
| `mousewheel dx dy` | `mousewheel` | `mouse.wheel()` |

## Perception / output
| `snapshot` | `snapshot` / `aria-snapshot` (+ manifest `targets`) | `locator.ariaSnapshot()` + manifest outline |
| `screenshot` | `screenshot` | `page/locator.screenshot()` |
| `pdf` | `pdf` | `page.pdf()` |
| `eval` | `evaluate` / `eval` | `page/locator.evaluate()` |
| `run-code` | `run-code-unsafe` / `run-code` (gated off-default) | `page.evaluate` of arbitrary fn |
| `generate-locator` | `generate-locator` | resolved-element → Playwright locator + manifest ref |
| `highlight` | `highlight` | `locator.highlight()` |

## Dialogs
| `dialog-accept` | `dialog accept` / `--accept` / **`dialog-accept`** alias | `dialog.accept()` |
| `dialog-dismiss` | `dialog dismiss` / `--dismiss` / **`dialog-dismiss`** alias | `dialog.dismiss()` |

## Tabs
| `tab-list` | `tabs list` / `tab list` | `context.pages()` |
| `tab-new` | `tabs new` / `tab new` | `context.newPage()` |
| `tab-close` | `tabs close` / `tab close` | `page.close()` |
| `tab-select` | `tabs select` / `tabs focus` | `page.bringToFront()` |

## Storage / state
| `state-save [file]` | `state-save` | `context.storageState({path})` |
| `state-load <file>` | `state-load` (per-tab apply #20) | `addCookies` + per-origin localStorage |
| `cookie-list` | `cookie-list` | `context.cookies()` |
| `cookie-get <name>` | `cookie-get` | `context.cookies()` filtered |
| `cookie-set …` | `cookie-set --cookie json` | `context.addCookies()` |
| `cookie-delete <name>` | `cookie-delete` | clear-all + re-add survivors |
| `cookie-clear` | `cookie-clear` | `context.clearCookies()` |
| `localstorage-*` | `localstorage-{get,set,remove,list,clear}` | `page.evaluate(localStorage…)` |
| `sessionstorage-*` | `sessionstorage-{get,set,remove,list,clear}` | `page.evaluate(sessionStorage…)` |

## Network
| `network requests` | `network` | `page.on('request'/'response')` |
| `network request [parts]` | `network request --part` | `request.headers()/postData()`, `response.body()` |
| `route <glob>` | `route` (block/allow) | `page.route()` + registry |
| `route-list` | `route-list` | registry |
| `unroute <glob>` | `unroute` | `page.unroute()` |
| `network-state-set` | `network-state-set --offline` | `context.setOffline()` |

## Console / diagnostics / runtime
| `console` | `console` | `page.on('console')` |
| `tracing-start`/`tracing-stop` | `tracing-start` / `tracing-stop` | `context.tracing.start/stop({path})` |
| `video-*` (incl. `video-chapter`) | `video` / `video-chapter` | `page.video()` (recording enabled at context create) |
| `show` | `show` (no-op in headless; points to `playwright show-trace`) | trace viewer |
| `pause-at`/`resume`/`step-over` | `pause-at` / `resume` / `step-over` | `page.pause()` (best-effort headless) |

## Install / global
| `install` | `install` | `npx playwright install chromium` |
| `install-browser <name>` | `install-browser` | `npx playwright install <name>` |
| `list` | `list` | enumerate tabs |
| `close-all` | `close-all` | close all pages |
| `kill-all` | `kill-all` / `daemon stop` | terminate daemon + browser |
| global `--json` | `--json` (per-command) | — |
| global `--raw` | `--raw` | bare-value output |
| global `--version` | `--version` | print version |
| global `--help` | `--help` | help text |
| `-s=<id>` / `--session <id>` | both accepted (A.0.2) | session selector |

## Reduced-fidelity notes (documented)
- **video-***: Playwright records video only when the context is created with `recordVideo`. The
  commands surface `page.video()?.path()`; enabling recording is a daemon-start concern.
- **pause-at/resume/step-over**: `page.pause()` opens the inspector only when headed; in the
  default headless daemon these are best-effort.
- **show**: no interactive UI in a headless daemon; prints the `npx playwright show-trace` hint.
- **attach/detach**: off the default path; drives the user's real Chrome over CDP — the manifest
  security posture does NOT apply to an attached browser (documented trust caveat).
