# Changelog

## 0.0.0 (2026-11-25)

- A tools-only connector on plugin-contract v0.0.0: Tavily's hosted MCP server owns the five tools and the OAuth
  sign-in, and the plugin adds one MCP server per account alias, `status` through `statusAnswer`, `probe`, and the
  contract's access rules.
- `capabilities`: `tavily`, the Tavily vendor and icons, host `>=2.4.1 <2.5.0` tested on 2.4.1, `accounts.via: "mcp"`
  with an empty profile per alias, and the methods table with the five `mcp:` tools classified `write` beside `mcp:*`.
- Options: `access`, `accounts`, `allowUntestedHost`, `websearch` (selects OpenCode's built-in Tavily provider when
  nothing earlier chose one) and `executionTimeoutMs` (the MCP server's `timeout.execution`).
- Docs, two skills, generated doc sections, a synthetic two-alias conformance fixture, 58 unit tests and a pack test.
  Built with `plugin-kit`; no compatibility paths, no dead code.
