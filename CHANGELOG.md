# Changelog

## 0.0.0 (2026-11-25)

- A tools-only connector on plugin-contract v0.0.0: Tavily's hosted MCP server owns the five tools and the OAuth
  sign-in, and the plugin adds one MCP server per account alias, `status` through `statusAnswer`, `probe`, and the
  contract's access rules.
- `capabilities`: `tavily`, the Tavily vendor and icons, host `>=2.4.1 <2.5.0` tested on 2.4.1, `accounts.via: "mcp"`
  with an empty profile per alias, and the methods table with the five `mcp:` tools classified `write` beside `mcp:*`.
- Options: `access`, `accounts`, `allowUntestedHost`, `websearch` (selects OpenCode's built-in Tavily provider when
  nothing earlier chose one) and `executionTimeoutMs` (the MCP server's `timeout.execution`).
- Docs, two skills, generated doc sections, a synthetic two-alias conformance fixture, 61 unit and host tests and a pack test.
  Built with `plugin-kit`; no compatibility paths, no dead code.
- `NOTICE` lists every package inlined into the bundle (the contract, yaml, zod) with its verbatim license, and a test
  checks it against an esbuild metafile.

### Removed since v0.0.7

- `tavily.web.tools` and its `describe` method: the tools RPC is superseded by doors 1–3 and the vendor's pass-through
  MCP tools, and `register` deliberately refuses a handler for an MCP method.
- The `execute.after` hook that rewrote Tavily error objects: per-request hooks are forbidden by the plugin standard;
  Tavily's error objects pass through as data and both skills say how to read a `status` in one.
- API-key sign-in (the `tavily` integration key, `TAVILY_API_KEY`, the `/usage` key check): accounts use the `mcp`
  mechanism; OpenCode holds the OAuth and the plugin holds no key.
- The `/tavily-status` command and the TUI status page (`./tui`, `src/tui/index.tsx`): the contract `status` is the one
  read, as a tool, in Code Mode and over RPC.
- The old `status.access` field: the contract's `status` shape is closed, so the access level is the `access` plugin
  option and the generated permission rules (`opencode.json`); `status.nextStep` and `unguardedAgents` report a rule
  that is missing.
- The rich `tavily.web/status` fields (`account`, `auth`, `keyCheck`, `tools`, `websearchDefault`, `shadowedSkills`,
  `permissionsBlock`): the contract's status shape is closed; every alias's sign-in state is in `status.accounts`, and
  costs are in the README and the skills.
- The old manifest's app metadata block (title, summary, tools, skills, sign-ins, settings): replaced by the
  `capabilities` manifest.
- The `/connect` rename to “Tavily account”: each alias is now an MCP server named `tavily` or `tavily-<alias>`.

