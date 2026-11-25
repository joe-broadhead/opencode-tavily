# Capabilities

Every method, source, action and bus event the manifest declares.

<!-- generated:capabilities -->
### Methods

| Method | Class | Accounts | Operations |
|---|---|---|---|
| `status` | read | none | — |
| `probe` | read | optional | — |
| `mcp:tavily_search` | write | optional | `tavily_search` |
| `mcp:tavily_extract` | write | optional | `tavily_extract` |
| `mcp:tavily_map` | write | optional | `tavily_map` |
| `mcp:tavily_crawl` | write | optional | `tavily_crawl` |
| `mcp:tavily_research` | write | optional | `tavily_research` |
| `mcp:*` | write | optional | — |

### Sources

| Source | Kind | Reads or output | Method | Cost |
|---|---|---|---|---|

### Actions

None.

### Bus events

None.
<!-- /generated:capabilities -->

## Notes

- **`status`** reads no account and costs nothing. It reports the plugin's version, the OpenCode host, one entry per
  alias from OpenCode's own MCP server state, the agents whose rules no longer match the generated access rules, and
  one next step.
- **`probe`** reads one account and costs nothing. Its owner is OpenCode's connection identity, the MCP server it runs
  for the alias (`mcp:tavily-work`), not a Tavily account: `verified: false` says so. It reads no web content and proves
  no Tavily sign-in; `status` reports that.
- **The five `mcp:` methods are Tavily's own tools.** The plugin does not register, wrap or proxy them: the hosted
  server owns their schemas and runs them. Each is declared so a consumer knows its access class before it calls one.
  `mcp:tavily_search` has the operation `tavily_search`, which is the server's own tool name.
- **`mcp:*`** is the same class, `write`: a Tavily tool added later is a change until a release reviews it. The
  explicit rows give each known tool its true class, and the access rules put the wildcard before the specific rules so
  a known tool keeps its own.
- **Per-alias names.** The alias is the MCP server, and the tool name carries it. OpenCode names a native tool
  `<server>_<tool>`: `tavily_tavily_search` for `default`, `tavily-work_tavily_search` for `work`. In Code Mode the alias
  is the namespace: `tools.tavily.tavily_search` for `default`, `tools["tavily-work"].tavily_search` for `work`. A Tavily
  tool takes no `account` field; only `probe` takes one. A permission rule for one alias never matches another alias's
  tool.
- **No sources, actions or bus events.** There is no feed to poll (the vendor's MCP server owns its answers and the
  plugin cannot read it) and no write for the plugin to make, so it has no cursor, no preview and no `changed` nudge.
  `probe` and `status` are its only methods of its own.
- **Tavily's hosted-server instructions are not recorded.** An unauthenticated `initialize` answers `401
  Unauthorized`, and no signed-in account was available when this plugin was written. The plugin neither repeats nor
  counters text it has not read.
- **Every tool call spends Tavily credits.** The per-tool prices are in the [README](../README.md#cost) and in the
  `tavily` skill; the plugin sets no spending limit.
