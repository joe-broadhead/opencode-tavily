# Changelog

## 0.0.0 (unreleased)

- Rebuilt on plugin-contract v0: the `capabilities` manifest, one `register` call, `status` and `probe`, and the
  contract's access rules.
- Accounts are held by the `mcp` mechanism: one Tavily MCP server per alias, named `tavily` or `tavily-<alias>`, each
  with its own OAuth. The plugin stores no credential.
- The five Tavily tools are declared as pass-through `mcp:` methods and classified `write`, because each call spends
  credits. `mcp:*` covers a tool Tavily adds later.
- `websearch` selects OpenCode's built-in Tavily web search provider when nothing earlier chose one;
  `executionTimeoutMs` sets the MCP server's `timeout.execution`.
- Fresh docs, two skills, generated doc sections, a synthetic two-alias conformance fixture, unit tests and a pack
  test. The copied release kit and the TUI are gone; `plugin-kit` owns the gates.
