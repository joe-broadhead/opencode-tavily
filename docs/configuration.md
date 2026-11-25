# Configuration

The options and their defaults, generated from `capabilities.options`.

<!-- generated:configuration -->
| Option | Type | Default | Description |
|---|---|---|---|
| `access` | `all` \| `ask-changes` \| `read-only` | `"all"` | How much the plugin's methods may do: all runs every method, ask-changes asks before a non-read, read-only turns every non-read off. |
| `accounts` | object | — | One empty profile per account alias. The alias is the whole setting; no secret goes in a profile. |
| `allowUntestedHost` | boolean | `false` | Start outside the tested OpenCode range. |
| `websearch` | boolean | `true` | Select OpenCode's built-in Tavily provider for the websearch tool when nothing earlier chose one. |
| `executionTimeoutMs` | integer | `900000` | How long one Tavily tool call may run, in milliseconds: 1 minute to 1 hour. Research needs the most time. |
<!-- /generated:configuration -->

## One account

No options are needed: the plugin serves one `default` account, whose MCP server is `tavily`. Sign in to it through
OpenCode's MCP sign-in.

## Several accounts

```json
{
  "access": "ask-changes",
  "accounts": {
    "work": {},
    "personal": {}
  },
  "websearch": true,
  "executionTimeoutMs": 900000,
  "allowUntestedHost": false
}
```

- **`access`** is the ceiling: `all` runs every method, `ask-changes` asks before a non-read, `read-only` turns every
  non-read off. The five Tavily tools are non-reads, because each call spends credits. A rule the person or an app adds
  later still wins for one tool.
- **`accounts`** is one profile per alias. The profile is empty: the alias is the whole setting, and no secret goes in
  a profile. Each alias gets its own MCP server (`tavily-work`, `tavily-personal`) and its own OAuth sign-in.
- **`websearch`** (default `true`) selects OpenCode's built-in Tavily web search provider when nothing earlier chose
  one. The plugin adds no provider of its own. A `websearch` choice in `opencode.json` is applied by OpenCode after
  package plugins, so that choice wins; the plugin cannot see it. `false` leaves OpenCode's web search completely alone.
- **`executionTimeoutMs`** (default `900000`, 1 minute to 1 hour) is the MCP server's `timeout.execution`: how long one
  Tavily tool call may run. Research needs the most time; OpenCode's own default is 12 hours, which does not stop a call
  that hangs.
- **`allowUntestedHost`** (default `false`) starts the plugin outside `>=2.4.1 <2.5.0`. Leave it off: an untested host
  is refused with `HOST_UNTESTED` and a next step.

A value outside the schema is `OPTIONS_INVALID` and setup stops before anything is registered.
