# In Jelly

[Jelly](https://heyjelly.ai) runs OpenCode agents. It reads the `jelly` section of this
package's `package.json` as JSON, without loading the plugin, when a person reviews the exact
version, and uses it as follows.

Jelly names the plugin **Tavily** (`jelly.title`), with the package name and version beneath. Under
that name it shows the one line in `jelly.summary`, and beside it the mark in `jelly.icon`
(`assets/icon.svg`, shipped in the package): Jelly reads that file once, when it records the
plugin, and keeps it only if it is a clean SVG of drawing elements, with no script, style, link
or outside reference. A Jelly whose declaration schema lacks `summary` or `icon` refuses this
declaration, because that schema accepts no unknown keys.

`jelly.cost` is the line Jelly shows on the plugin's review before it installs, in the plugin's own words, saying what
it costs with Tavily: "Every search, extract, map, crawl and research call spends Tavily credits from the signed-in
account or key. A research task costs 4-110 credits with mini and 15-250 with pro, and a crawl reads up to 50 pages by
default. The plugin sets no spending limit." It changes nothing Jelly allows.

## Tools and permissions

5 tools are declared (5 read-only). Jelly's agents have no base "allow everything"
rule, so this plugin's own default rules, which it puts after that rule, never reach them. Jelly
writes each declared `ask` or `deny` as that tool's default instead (the person's own choice
replaces it), and denies a read-only helper every tool not marked `readOnly`. A declared `allow`
changes nothing in Jelly.

- Ask: none.
- Off: none.
- Everything else runs, as the plugin's own rules let it.

A tool the upstream server adds later is not declared, so in Jelly it is not asked about by
default. Keep `jelly.tools` in step with the known-tool list; `test/**/jelly.test.ts` checks
each declared effect against the plugin's own default rules.

Jelly's shared rules for every plugin of the family, word for word:

<!-- family-block:start -->
- At Allowed (`all`), the default, every tool runs without asking, declared or not, whatever its `effect`.
- At Ask before changes (`ask-changes`), a `readOnly` tool runs, and every other tool asks first, including a tool this plugin does not declare.
- At Read only (`read-only`), a `readOnly` tool runs, and every other tool is off, including a tool this plugin does not declare.
- A declared `effect` of `allow` changes nothing: the tool follows the access choice and its `readOnly`.
- A declared `effect` of `ask` makes the tool ask at Ask before changes, even when it is `readOnly`, and changes nothing at Allowed or Read only.
- A declared `effect` of `deny` turns the tool off at Ask before changes and at Read only, and changes nothing at Allowed.
- An action listed in `asks` asks first at Ask before changes and at Read only, and never at Allowed.
- A tool named with one `*`, such as another account's `plaud-*.get_file`, follows the same rules as a tool named in full.
- A choice the person makes for one tool wins over the access choice and the declared `effect`.
- jelly leaves out a key it does not know at the top level of the `jelly` block, and reads the rest.
- jelly refuses the plugin for a key it does not know inside anything it reads, such as a tool, a sign-in or a setting.
- jelly refuses the plugin, with one plain line, when `requires` names a field or a feature it does not read.
<!-- family-block:end -->

## Skills

Declared: `tavily`, `tavily-research`. Jelly refuses an install whose
skill ids collide with another plugin's or the agent's own.

## Views

None yet.

## Signing in

`jelly.signIns` declares two alternatives in one group, `tavily`: `key`, OpenCode's key integration `tavily` ("Tavily API key"; OpenCode's `/connect` calls the same entry "Tavily", and the row links to Tavily's key page), or `account`, the `tavily` MCP server's own OAuth ("Tavily account"). Either one connects the card and serves the five Tavily tools, and once one is connected the card shows only that one. They differ in one thing: only the key serves OpenCode's built-in `websearch` tool, which the `websearch` setting (on by default) makes Tavily's. With the account alone the card reads Connected, but `websearch` has no key and uses Tavily's keyless access, not the person's account; connect the key for web search on the person's own key, or turn the `websearch` setting off, which only stops the plugin choosing Tavily as OpenCode's web search provider (OpenCode then uses the provider chosen otherwise). When both are connected, the key wins. The plugin checks each key once with Tavily's usage endpoint, which costs no credits. A key saved through `/connect` or `opencode auth login tavily` that Tavily turns down shows this plugin's `needs_auth` message on the key row, with Replace the key:

> Tavily did not accept this API key. Replace it, or remove it to sign in with your Tavily account.

A rejected `TAVILY_API_KEY` has no saved connection to mark, so the key row does not show it; the plugin's status names the rejection and the next step.

Jelly folds the declared sign-ins into this plugin's one card, which shows each as Connected, Not signed in or Sign in again (expired or revoked), and starts, renews and signs out of each. An agent's `jelly_connection_request`, or a tool result that names this plugin's "Run /connect and choose …" next step, opens the same card. The plugin still signs in through OpenCode, as it does without Jelly; the declaration only tells Jelly which of the engine's integrations and servers are this plugin's.

## Settings

Jelly draws a form from `jelly.contributes.settings` and writes each value into the plugin's options:

- `access` declares its three values as `choices`, with Jelly's own labels: **Allowed** (`all`, the default), **Ask
  before changes** (`ask-changes`) and **Read only** (`read-only`).
- `websearch` is a switch, on by default.
- `executionTimeoutMs` (Call time limit) is a whole number from 60000 to 3600000 (1 minute to 1 hour), 15 minutes by
  default.

These sets and bounds are the options parser's own, so Jelly never saves a value the plugin refuses. Choices and bounds
need a Jelly that includes app#1301: an older Jelly refuses a setting that declares them. `test/unit/jelly.test.ts`
checks the settings against Jelly's setting contract, restated in `test/support/jelly-settings.ts`, and checks each
declared value and bound against the options parser.

## Versions

Jelly's curated catalogue pins an exact version. Publish each release under a new version, so
that a review in Jelly can tell two releases apart.

The declaration test runs the shared kit, `test/support/jelly-kit.ts`, which checks the declaration and this page against Jelly's plugin authors' standard. `scripts/check-copies.mjs` holds the kit, and the shared part of the tools RPC (`src/host/tools-rpc.ts`), equal to the copy every plugin carries.
