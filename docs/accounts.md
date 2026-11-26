# Accounts

Several aliases at once, each signed in separately.

<!-- generated:accounts -->
Accounts are held by the **mcp** mechanism: the vendor's MCP server holds them.

The profile has no fields.
<!-- /generated:accounts -->

## Sign in per alias

The mechanism is `mcp`: Tavily's hosted MCP server holds the credential, and OpenCode keys OAuth per server.

| Alias | MCP server |
|---|---|
| `default` | `tavily` |
| `work` | `tavily-work` |
| `personal` | `tavily-personal` |

Sign in to each server once through OpenCode's MCP sign-in; `/connect` lists the server names. Each server has its own
OAuth session, so two aliases are two independent sign-ins. OpenCode asks Tavily's OAuth server, whose metadata
advertises `openid offline_access`, so a sign-in can be refreshed. The plugin never sees the token, stores none, and
offers no API key option.

The plugin owns the servers it names. The contract's accounts module sets each alias's config under its name, so a
server you already configured as `tavily` or `tavily-<alias>` is replaced by the plugin's config. Use another name for
a server of your own.

## Picking an account

Only `probe` takes an account: pass `account: "<alias>"` to read that alias's OpenCode connection. With two aliases and
none, `probe` is refused with `ACCOUNT_REQUIRED`, whose next step lists the aliases; an alias the plugin does not serve
is `ACCOUNT_UNKNOWN`. `status` takes no account, and neither do Tavily's tools: their alias is the MCP server
(`tavily-work_tavily_search`, or `tools["tavily-work"].tavily_search` in Code Mode).

## Status

`status` lists every alias in the order the options name them, with `ready`, `needs_sign_in` or `error`, from
OpenCode's own MCP server state:

| OpenCode reports | `status` says |
|---|---|
| `connected` | `ready` |
| `needs_auth` | `needs_sign_in` |
| `failed` | `error`, with the host's reason redacted and cut to 160 characters |
| `disabled` | `error`, "the server is disabled" |
| `pending` | `error`, "the server is still connecting" |
| no entry under the server's name | `error`, "OpenCode lists no such server" |

The plugin's own state is `error` when the plugin has a problem of its own, such as a server it could not register or an
agent list it could not read; else `needs_sign_in` when an alias does; else `ready`. An alias's own `error` stays on
that alias in `accounts[]`, and `nextStep` is the first plugin problem, the sign-in sentence, or null.

## Probe

`probe` answers the account and its owner:

```json
{
  "account": "work",
  "owner": { "id": "mcp:tavily-work", "label": "Tavily (work)", "verified": false },
  "trust": "untrusted"
}
```

That owner is **OpenCode's own connection identity**, the MCP server OpenCode runs for the alias, not a Tavily account
or organization. `verified: false` says the plugin cannot vouch for it. `probe` reads no web content and does not prove
that the OAuth token is valid; `status` and a tool call do.

## Per-alias tools

Tavily's pass-through tools are permitted per alias: `tavily-work_*` for `work` and `tavily-personal_*` for `personal`,
and `tavily_*` for `default`. The derivation is the contract's `serverOf` and `toolAction`, and the access rules emit
one rule per alias. A rule, grant or saved approval for one alias never reaches another alias's tool.

There is no per-alias setting beyond the alias itself. A profile is an empty object, and a secret never goes in one.
