# Privacy Policy — agrune

**Last updated:** April 19, 2026 (rephrased post-2026-04-15 CDP-only pivot; post-2026-04-19 v0.5 manifest pivot)

## Overview

agrune is an MCP (Model Context Protocol) server that enables AI agents to interact with web pages through a locally-installed Chrome instance, controlled via the Chrome DevTools Protocol (CDP). The target surface for each interaction is defined by an externally authored manifest (`@agrune/manifest` SDK), not by modifying the target page's source. This policy explains what data agrune accesses and how it is handled.

## Data Collection

agrune collects the following data **only when an AI agent actively requests it** through an MCP tool call (`agrune_snapshot`, `agrune_act`, `agrune_fill`, etc.):

- **Website content**: DOM structure and text content of the current page, converted to structured snapshots constrained to the manifest's declared targets
- **User activity**: Browser actions (clicks, scrolls, text input) are performed on behalf of the AI agent, not recorded or stored

Fields marked `sensitive: true` in the manifest (e.g. passwords, CVV, OTP) are automatically masked in snapshots and command logs. agrune additionally applies a heuristic (OR-combined with manifest flag) to auto-mask common sensitive inputs such as `type="password"` and credit card `autocomplete=cc-*` fields.

## Data Usage

All data is:
- Processed **locally** on your device
- Transmitted **only** between the CDP session (user-launched Chrome) and the local MCP server process running on your machine, and from the MCP server to the MCP harness (Claude Code / Codex / etc.) over stdio
- **Never** sent to external servers, third parties, or cloud services by agrune itself

Note: the downstream MCP harness (the AI agent product) may transmit snapshot excerpts to its own model provider per that product's own privacy policy. agrune does not control that hop.

## Data Storage

- agrune's CDP session is scoped to the Chrome instance that the user (or the `agrune` CLI) launched. There is no system-wide install and no persistent background service.
- When recorder captures are used, pending captures are stored locally under `$HOME/.agrune/authoring/pending/<session>/` and are not transmitted anywhere; the user commits them into `manifest.ts` via the local `agrune manifest dev` watcher.
- No website content or user activity data is persisted by the MCP server beyond the in-memory session lifetime.

## Data Sharing

agrune does **not**:
- Sell or transfer user data to third parties
- Use data for advertising, analytics, or credit assessment
- Collect personally identifiable information

## Permission model

agrune runs as a local stdio process and does **not** install any browser add-on, nor request system-wide Chrome permissions. Instead:

- A CDP session is bound to a Chrome instance that the user explicitly launches (either via `agrune` CLI or by attaching to an existing `--remote-debugging-port`).
- The session terminates when the Chrome process or the MCP server stops; no permissions persist after termination.
- The set of interactable targets is restricted to those declared in the manifest that the AI agent has loaded; targets not declared in the manifest are not exposed to the agent as actionable.

## Contact

For questions about this privacy policy, please open an issue at: https://github.com/agrune/agrune/issues
