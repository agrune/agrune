<div align="center">

<img src="https://github.com/agrune/agrune/raw/main/packages/devtools/icon-128.png" width="80" height="80" alt="agrune logo" />

# agrune

**Browser automation for AI agents — CDP-native, 100% local, works with any MCP harness**

<!-- TODO 2026-04-18: Chrome Web Store 배지는 v1.1 CDP-only 피봇 이후 더 이상 canonical 배포 채널이 아닙니다. 재설치/링크 삭제 판단은 org maintainer 수동 결정. -->
[![Version](https://img.shields.io/npm/v/@agrune/mcp?style=flat-square&label=version&color=cb3837)](https://www.npmjs.com/package/@agrune/mcp)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/gchelkphnedibjihiomlbpjhjlajplke?style=flat-square&label=chrome%20web%20store&color=4285F4)](https://chromewebstore.google.com/detail/agrune/gchelkphnedibjihiomlbpjhjlajplke) <!-- deprecated -->
[![Downloads](https://img.shields.io/npm/dm/@agrune/mcp?style=flat-square&label=downloads&color=cb3837)](https://www.npmjs.com/package/@agrune/mcp)
[![License](https://img.shields.io/github/license/agrune/agrune?style=flat-square&color=yellow)](https://github.com/agrune/agrune/blob/main/LICENSE)

</div>

<!-- ============================================================
     HERO DEMO GIF
     Shooting guide: Record an AI agent interacting with a web app
     using the Aurora pointer — clicking buttons, filling forms,
     dragging elements. ~800px wide, 10-15 second loop, GIF or
     WebM. Replace the placeholder below once recorded.
     ============================================================ -->

<div align="center">
<img src="https://placehold.co/800x400/1a1a2e/8b949e?text=Demo+GIF+%E2%80%94+Coming+Soon" alt="agrune demo — AI agent automating a web page" width="800" />
</div>

## What is agrune?

**agrune** lets AI agents see and control web pages — directly in a real Chrome browser, over CDP. Add simple `data-agrune-*` annotations to your UI, run `@agrune/mcp`, and watch your MCP-compatible agent (Claude, GPT, Gemini, …) interact with the page with live command logs and a smooth Aurora pointer.

Everything runs **100% locally**. No cloud. No data leaves your machine.

## Use Cases

| | Use Case | Status | Description |
|---|---|---|---|
| :test_tube: | **Dev QA** | `Coming Soon` | AI agents run E2E tests. No brittle selectors — AI understands what it's testing. |
| :world_map: | **Platform Guide** | `Coming Soon` | Pre-mapped annotations for popular platforms. No code changes needed. |
| :zap: | **Platform Automation** | `Coming Soon` | AI autonomously performs tasks on supported platforms. |

> All use cases are under active development.

<!-- ============================================================
     ANNOTATION GIF
     Shooting guide: Split-view recording — left side shows HTML
     with data-agrune-* attributes being added, right side shows
     the AI agent controlling the annotated elements. ~800px wide,
     10-15 second loop. Replace the placeholder below once recorded.
     ============================================================ -->

<div align="center">
<img src="https://placehold.co/800x400/1a1a2e/8b949e?text=Annotation+%E2%86%92+Control+Split+View+%E2%80%94+Coming+Soon" alt="Annotation to control split view" width="800" />
</div>

## Key Features

| | | |
|:---:|:---:|:---:|
| :dart: **10 MCP Tools** | :lock: **100% Local** | :sparkles: **Live DevTools Webapp** |
| Click, fill, drag, wait, read, focus — full browser control via MCP | Zero cloud. CDP straight to your own Chrome | Command log, HITL toolbar, session routing, failure diagnostics at http://localhost:47654/devtools |
| :label: **Simple Annotations** | :robot: **Agent Agnostic** | :zap: **Self-Healing Sessions** |
| Just add `data-agrune-*` attributes to your HTML. No SDK | Works with Claude, GPT, Gemini — any MCP-speaking agent | Auto-reattach on tab crashes, supervisor-driven recovery, `recovered` flag on tool responses |

## Why agrune?

| | agrune | Playwright | BrowserUse | Chrome DevTools |
|---|:---:|:---:|:---:|:---:|
| **AI-native (MCP)** | :white_check_mark: | :x: | :white_check_mark: | :x: |
| **Visual feedback** | :white_check_mark: Aurora cursor | :x: | :warning: Highlight only | :x: |
| **Semantic targeting** | :white_check_mark: Named annotations | CSS / XPath | Vision-based | CSS / XPath |
| **Real browser** | :white_check_mark: | Headless default | :white_check_mark: | :white_check_mark: |
| **Zero cloud** | :white_check_mark: 100% local | :white_check_mark: | :x: Cloud API | :white_check_mark: |
| **Setup** | 1 command | Config + scripts | API key + config | Manual protocol |

> **The key difference:** Other tools target elements by CSS selectors or screenshots. agrune uses **semantic annotations** — the AI knows *what* a button does, not just where it is. No brittle selectors, no vision model costs, and interactions that survive UI redesigns.

## Architecture

```
┌──────────┐     ┌──────────────────────┐     ┌────────┐     ┌──────────┐
│ AI Agent │◄───►│ @agrune/mcp (stdio)  │◄───►│ Chrome │◄───►│ Web Page │
└──────────┘     └──────────────────────┘     └────────┘     └──────────┘
                  + DevTools webapp :47654     CDP            data-agrune-*
```

## Quick Start

**1. Install the MCP server**

```sh
npm install -g @agrune/mcp
```

**2. Launch agrune**

```sh
agrune                     # Chrome launch + DevTools webapp on :47654
agrune --attach ws://...   # attach to an existing Chrome (--remote-debugging-port)
agrune --help              # full flag reference
```

**3. Connect your MCP-compatible agent** to the stdio server and start interacting.

See the monorepo [README](https://github.com/agrune/agrune#readme) for annotation examples, DevTools webapp features, and automation profile setup.

---

<div align="center">

[Documentation](https://github.com/agrune/agrune) · [Chrome Web Store](https://chromewebstore.google.com/detail/agrune/gchelkphnedibjihiomlbpjhjlajplke) <!-- deprecated --> · [npm](https://www.npmjs.com/org/agrune) · [Contributing](https://github.com/agrune/agrune/blob/main/CONTRIBUTING.md)

</div>
