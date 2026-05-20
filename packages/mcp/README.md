# @agrune/mcp

Internal source package for the MCP server bundled into the public `agrune` npm package.

General users do not install `@agrune/mcp` directly. MCP hosts should run the public package:

```json
{
  "command": "npx",
  "args": ["-y", "agrune@latest"]
}
```

Local development can point at the workspace package:

```json
{
  "command": "npx",
  "args": ["-y", "/Users/chenjing/dev/agrune/agrune/packages/agrune"]
}
```

The `agrune` binary is the MCP server. There is no `agrune mcp` subcommand and no runtime skill/manifest installer in the current product path.

## Contents

- MCP stdio server implementation
- Public tool registration for browser control
- Chrome/CDP launcher integration through `@agrune/browser`
- Command broker and HITL controller internals

Manifest authoring, registry sync, DevTools, and Studio workflows are separate future/product surfaces and should not leak into the regular agent MCP tool list.
