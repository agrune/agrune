# Privacy Policy — agrune

**Last updated:** June 14, 2026

## Overview

agrune is an MCP (Model Context Protocol) server that enables AI agents to interact with web pages through a local Chromium instance, driven via Playwright (the legacy Chrome DevTools Protocol stack has been removed). The target surface for each interaction is supplied by the page through `window.__agrune_manifest__`. This policy explains what data agrune accesses and how it is handled.

## Data Collection

agrune collects the following data **only when an AI agent actively requests it** through an MCP tool call such as `browser_get_targets`, `browser_click`, `browser_fill`, or `browser_read`:

- **Website content**: DOM structure and text content of the current page, converted to compact target snapshots constrained to the page-owned manifest's declared targets
- **User activity**: Browser actions (clicks, scrolls, text input) are performed on behalf of the AI agent, not recorded or stored

Fields marked `sensitive: true` in the manifest (e.g. passwords, CVV, OTP) are automatically masked in snapshots and command logs. agrune additionally applies a heuristic (OR-combined with manifest flag) to auto-mask common sensitive inputs such as `type="password"` and credit card `autocomplete=cc-*` fields.

## Data Usage

All data is:
- Processed **locally** on your device
- Transmitted **only** between the Playwright-managed browser session and the local MCP server process running on your machine, and from the MCP server to the MCP harness (Claude Code / Codex / etc.) over stdio
- **Never** sent to external servers, third parties, or cloud services by agrune itself

Note: the downstream MCP harness (the AI agent product) may transmit snapshot excerpts to its own model provider per that product's own privacy policy. agrune does not control that hop.

## Data Storage

- agrune's browser session is scoped to the Chromium instance that the user or the `agrune` MCP server launched. There is no system-wide install and no persistent background service.
- No website content or user activity data is persisted by the MCP server beyond the in-memory session lifetime.

## Data Sharing

agrune does **not**:
- Sell or transfer user data to third parties
- Use data for advertising, analytics, or credit assessment
- Collect personally identifiable information

## Permission model

agrune runs as a local stdio process and does **not** install any browser add-on, nor request system-wide Chrome permissions. Instead:

- Playwright launches a Chromium instance, or attaches to an existing Chrome instance exposed through `--remote-debugging-port` (via Playwright's `connectOverCDP`).
- The session terminates when the browser process or the MCP server stops; no permissions persist after termination.
- The set of interactable targets is restricted to those declared in the page-owned manifest; targets not declared in that manifest are not exposed to the agent as actionable.

## Contact

For questions about this privacy policy, please open an issue at: https://github.com/agrune/agrune/issues
