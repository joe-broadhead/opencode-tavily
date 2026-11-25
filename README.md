# Tavily

Tavily's hosted MCP server gives OpenCode five web tools: search, page extraction, site maps, site crawls and cited
research. This plugin is the connector around it. It adds one named account per alias, the `status` and `probe` reads,
the permission rules and this documentation. Tavily's server owns the tools and the sign-in; the plugin adds no tools of
its own, reads no web content and stores no credential.

**Every tool call spends Tavily credits**, and the plugin sets no spending limit.

## Install

The plugin is prepared for `v0.0.0`. The maintainer cuts that tag after the pull request merges; this repository's older
tags belong to the previous package line and do not contain this build. Once `v0.0.0` exists:

```sh
opencode plugin add github:we-the-rebel-alliance/tavily-plugin#v0.0.0
```

## Sign in

The mechanism is `mcp`: OpenCode runs one Tavily MCP server per account alias, and keeps each server's OAuth
separately.

| Alias | MCP server |
|---|---|
| `default` | `tavily` |
| any other, such as `work` | `tavily-work` |

Sign in to each server once through OpenCode's MCP sign-in; `/connect` lists the server names. OpenCode obtains and
keeps Tavily's OAuth token. The plugin never sees it.

One account needs no options at all. Several are a map of alias to an empty profile:

```json
{
  "accounts": {
    "work": {},
    "personal": {}
  }
}
```

Methods that take an account accept `account: "work"` or `account: "personal"`. With two aliases and no account, a call
is refused with `ACCOUNT_REQUIRED`, whose next step lists the aliases.

## Access

`access` is `all` (the default), `ask-changes` or `read-only`.

| Level | `status` and `probe` | the five Tavily tools |
|---|---|---|
| `all` | run | run |
| `ask-changes` | run | ask first |
| `read-only` | run | off |

The five tools are classified `write` for access, not because they change anything at Tavily but because each call
spends credits: a free-looking read that bills the person is not a read. `read-only` therefore turns all five off, and
a Tavily tool added later is covered by the same `mcp:*` rule until a release reviews it.

## Cost

| Tool | Cost per call |
|---|---|
| Search | 1 credit (basic, fast, ultra-fast), 2 (advanced) |
| Extract | 1 per 5 pages read (basic), 2 per 5 (advanced); failed pages are free |
| Map | 1 per 10 pages found, 2 per 10 with instructions |
| Crawl | map's cost plus extract's for each page read |
| Research | 4-110 credits (mini), 15-250 (pro) per task |

`status` and `probe` cost nothing. The plugin sets no spending limit; Tavily's plan does. `executionTimeoutMs` bounds
how long one call may run (15 minutes by default), not what it costs.

## Tavily's server instructions

Tavily's hosted server may send its own instructions to the model, and this build does not record them: an
unauthenticated `initialize` answers `401 Unauthorized`, and no signed-in account was available when this plugin was
written. The plugin neither repeats nor counters text it has not read.

## Capabilities

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

## Errors

<!-- generated:errors -->
| Code | Meaning |
|---|---|
| `NEEDS_SIGN_IN` | the account is not signed in |
| `SCOPE_MISSING` | the call needs a scope the person has not confirmed |
| `ACCOUNT_REQUIRED` | the plugin serves several accounts and the call names none |
| `ACCOUNT_UNKNOWN` | the call names an alias the plugin does not serve |
| `ACCOUNT_MISMATCH` | the item belongs to another account |
| `CURSOR_INVALID` | the cursor is malformed, or belongs to another source, account or scope |
| `CURSOR_EXPIRED` | the provider no longer keeps the history the cursor names |
| `RATE_LIMITED` | the provider asked the plugin to slow down |
| `BUDGET_EXCEEDED` | the read would cost more than the person allows |
| `SOURCE_DISABLED` | the person turned this source or action off |
| `TOO_LARGE` | the answer is larger than the source's maxBytes |
| `INPUT_INVALID` | the input does not match the method's schema |
| `SOURCE_UNKNOWN` | the plugin declares no such source |
| `SCHEMA_VIOLATION` | an answer does not keep the contract's shape |
| `PERMISSION_DENIED` | the person's grant does not cover the call |
| `PLAN_INVALID` | the plan is missing, or belongs to another method |
| `PLAN_USED` | the plan was already used by an earlier commit |
| `GRANT_INVALID` | the action grant did not verify, or was already spent |
| `HOST_UNTESTED` | OpenCode is outside the plugin's tested range |
| `OPTIONS_INVALID` | the plugin's options do not match their schema |
| `UNAVAILABLE` | the provider could not be reached |
<!-- /generated:errors -->

## Docs

- [Capabilities](docs/capabilities.md)
- [Configuration](docs/configuration.md)
- [Accounts](docs/accounts.md)
- [Automations](docs/automations.md)
- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
