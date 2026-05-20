# agrune

Agrune MCP server package.

```bash
npx agrune@latest
```

Use this package as an MCP server command:

```json
{
  "command": "npx",
  "args": ["-y", "agrune@latest"]
}
```

The package starts the Agrune MCP server directly. It does not install skills, edit AI runtime config, or provide a separate user CLI.

Useful server options:

- `--attach http://127.0.0.1:9222` attaches to an existing automation Chrome.
- `--user-data-dir <path>` overrides the persistent Chrome profile.
- `--isolated` uses a temporary Chrome profile for a fresh session.
