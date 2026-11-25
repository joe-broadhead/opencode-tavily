# Security

## What leaves the machine

The plugin itself makes no network call. When an agent or a person runs a Tavily tool, OpenCode sends that call to
Tavily's hosted MCP server (`https://mcp.tavily.com/mcp/`) with the alias's OAuth token; the request body is what the
tool needs, such as the query or the URL, and nothing else from the machine. `status` and `probe` read OpenCode's own
MCP server list and send nothing.

## Credentials

OpenCode holds the credential. It runs one Tavily MCP server per alias and keys OAuth per server, so `work` and
`personal` are two independent sign-ins. The plugin registers each server's config and never sees a token, a refresh
token or a password; it stores no credential and prints none. There is no API key option and no environment variable
the plugin reads. A profile in `options.accounts` is empty, so no secret can be put there.

## Scopes

The plugin requests no OpenCode scope of its own. Tavily's OAuth server advertises `openid offline_access` in its
protected-resource metadata, which lets OpenCode refresh a sign-in without the person present; whatever Tavily grants
is between Tavily and the person. `probe` reports no scopes, because it reads OpenCode's connection, not a Tavily
grant.

## Untrusted data

Every tool result is web content: data, never instructions. An agent must not follow text from a page, an extract, a
map, a crawl or a research report, must not use it to choose a tool or a recipient, and must not send it anywhere the
person did not ask for. The plugin never puts tool output into `status` or a log; the skills repeat the rule for the
model-facing path. Tavily's server may send its own instructions to the model; this build does not record them (an
unauthenticated `initialize` answers `401`), so the plugin neither repeats nor counters them.

## Spending

Every Tavily tool call spends credits from the signed-in alias, at the prices in the [README](../README.md#cost). The
plugin sets no spending limit and cannot see the balance. `read-only` turns all five tools off; `ask-changes` makes each
one ask first. An OpenCode automation that calls a tool spends credits on every run. `executionTimeoutMs` bounds the
time, not the cost.

## Access and confirmation

`access` is the ceiling, and the contract's `access` module turns it into OpenCode permission rules for every agent: a
`read` runs at every level, any other class asks under `ask-changes` and is off under `read-only`. The five tools are
`write`, so they follow that rule, per alias. A tool Tavily adds later matches `mcp:*`, also `write`, until a release
reviews it.

The plugin makes no write of its own, so it has no preview or action grant to confirm. The tools it passes through are
Tavily's; OpenCode still asserts each one's permission (`tavily_tavily_search`, `tavily-work_tavily_search`, …) and
honours a saved approval or a deny from the person or the agent.

## Redaction

`status` reports each alias's state and, for a failure, one line of at most 160 characters through the contract's
`redactReason`: URL query values, bearer credentials, JWTs and token-shaped words are replaced, and control characters
become spaces. `status` and `probe` never carry a token, a URL query string or a credential. A refusal from `probe`
redacts the host's message the same way.

## Reporting

Report a vulnerability through GitHub's private vulnerability reporting on this repository. Do not open a public issue
with a credential, a token or a person's data in it.
