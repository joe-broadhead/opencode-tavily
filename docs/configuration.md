# Configuration

You configure the plugin in your OpenCode config: `~/.config/opencode/opencode.json` for every project, or `opencode.json` in one project.

## Options

Write the plugin as its package name, or as an object with `package` and `options`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "@joe-broadhead/opencode-tavily",
      "options": { "websearch": true, "executionTimeoutMs": 900000 }
    }
  ]
}
```

All options are optional.

| Option | Default | Meaning |
| --- | --- | --- |
| `websearch` | `true` | Make OpenCode's built-in Tavily provider the default for the `websearch` tool. A `websearch` setting in `opencode.json` still wins. See [Web search](#web-search). |
| `executionTimeoutMs` | `900000` (15 minutes) | How long one call to a Tavily tool can run, in milliseconds. An integer from `60000` (1 minute) to `3600000` (1 hour). Research needs the most time. |
| `allowUntestedHost` | `false` | Start on an OpenCode version outside `>=2.2.3 <2.3.0`. The plugin then logs a `HOST_UNTESTED` warning and runs. |

An unknown option, or a value of the wrong type, stops the plugin at start-up with a [`OPTIONS_INVALID`](#errors) error.

## Permissions

### The default rules

When OpenCode builds its agents, the plugin adds these rules to each one, right after the agent's first `{ "action": "*", "resource": "*", "effect": "allow" }` rule. An agent with no such rule gets none: the block's `ask` would loosen its default deny.

```json
[
  { "action": "tavily_*", "resource": "*", "effect": "ask" },
  { "action": "tavily_tavily_search", "resource": "*", "effect": "allow" },
  { "action": "tavily_tavily_extract", "resource": "*", "effect": "allow" },
  { "action": "tavily_tavily_map", "resource": "*", "effect": "allow" },
  { "action": "tavily_tavily_crawl", "resource": "*", "effect": "allow" },
  { "action": "tavily_tavily_research", "resource": "*", "effect": "allow" }
]
```

- Tavily's five tools only read from the web, so they run without a prompt.
- Any other tool on the `tavily` server asks first. That includes a tool that Tavily adds later.
- The plugin adds each rule only once, however often OpenCode rebuilds its agents.

OpenCode checks a Tavily call against the agent's rules, and **the last matching rule wins**. Rules are checked in this order:

1. the agent's built-in rules, with the plugin's rules after its first allow rule;
2. your top-level `permissions` in `opencode.json`;
3. the agent's own `permissions`;
4. your saved "Always allow" answers.

A `deny` from rules 1 to 3 wins over a saved "Always allow". If no rule matches, OpenCode asks. In `opencode run`, nobody can answer a prompt, so a call that would ask is refused.

So your own rules always win over the plugin's, and a stricter agent stays strict:

- **Plan** can use the five Tavily tools, other Tavily tools ask, and Plan's own limits, such as no file edits, stay.
- **Explore** denies every tool that is not on its own list, so it cannot use Tavily tools.

### Change the defaults

Add rules to `permissions` in `opencode.json`. They apply to every agent.

Research and Crawl use the most credits. To make them ask first:

```jsonc
{
  "permissions": [
    { "action": "tavily_tavily_research", "resource": "*", "effect": "ask" },
    { "action": "tavily_tavily_crawl", "resource": "*", "effect": "ask" }
  ]
}
```

To allow a new Tavily tool without a prompt, add an `allow` rule for its name. Or answer **Always allow** when OpenCode asks. That saves an approval for the whole project; see [SECURITY.md](../SECURITY.md#permissions).

```jsonc
{ "permissions": [{ "action": "tavily_tavily_feedback", "resource": "*", "effect": "allow" }] }
```

To turn off every Tavily tool:

```jsonc
{ "permissions": [{ "action": "tavily_*", "resource": "*", "effect": "deny" }] }
```

`tavily_*` also matches tools of any other MCP server whose name starts with `tavily_`.

### Agents defined only in your config

OpenCode creates the agents that you define only in your config after plugins run, so these agents do not get the plugin's rules. Without the rules, a new Tavily tool runs there without a prompt. `/tavily-status` and the **Tavily: Status** dialog name these agents and show the block to paste. An agent counts as covered when the block appears anywhere after its first `* * allow` rule.

Put the block first in that agent's own `permissions`, followed by your top-level `permissions` rules for `tavily_*` actions, because the agent's own rules come after the top-level ones and would otherwise win. For example, for an agent named `reviewer`, when your top-level `permissions` allow `tavily_tavily_feedback`:

```jsonc
{
  "permissions": [{ "action": "tavily_tavily_feedback", "resource": "*", "effect": "allow" }],
  "agents": {
    "reviewer": {
      "description": "Reviews changes",
      "mode": "subagent",
      "permissions": [
        { "action": "tavily_*", "resource": "*", "effect": "ask" },
        { "action": "tavily_tavily_search", "resource": "*", "effect": "allow" },
        { "action": "tavily_tavily_extract", "resource": "*", "effect": "allow" },
        { "action": "tavily_tavily_map", "resource": "*", "effect": "allow" },
        { "action": "tavily_tavily_crawl", "resource": "*", "effect": "allow" },
        { "action": "tavily_tavily_research", "resource": "*", "effect": "allow" },
        { "action": "tavily_tavily_feedback", "resource": "*", "effect": "allow" }
      ]
    }
  }
}
```

For an agent in a Markdown file, put the same rules under `permissions` in the file. Do not put the plugin's rules in the top-level `permissions`: they would come after Explore's own rules and let Explore use Tavily tools.

## Web search

OpenCode's `websearch` tool uses one provider. OpenCode chooses it in this order:

1. the `websearch` setting in `opencode.json`. `"websearch": { "provider": "<id>" }` chooses a provider, and `"websearch": false` turns web search off;
2. the plugin's choice, OpenCode's built-in `tavily` provider, when the `websearch` option is `true`;
3. the provider that you chose when OpenCode first asked you, which OpenCode stores.

While the plugin's `websearch` option is `true`, OpenCode does not use your stored choice. To use it again, set the option to `false`:

```jsonc
{ "plugins": [{ "package": "@joe-broadhead/opencode-tavily", "options": { "websearch": false } }] }
```

OpenCode applies the `opencode.json` setting after plugins run, so the plugin cannot see it. When you set it, `/tavily-status` still shows "Web search: Tavily, unless opencode.json sets "websearch"", but your setting is used.

The built-in provider uses the same Tavily API key as the plugin. With no key, it searches with Tavily's keyless access.

## API key or OAuth

| Your setup | What the plugin does | Sign-in in `/tavily-status` |
| --- | --- | --- |
| A key connected with `/connect` → **Tavily** or `opencode auth login tavily` | Sends the key to the server and turns OAuth off, so **Tavily MCP** leaves `/connect` | `API key (/connect → Tavily)`, with the key's label as the account |
| `TAVILY_API_KEY` in OpenCode's environment, and no connected key | The same | `API key from TAVILY_API_KEY` |
| No key | OAuth: `/connect` → **Tavily MCP**, `/mcps`, or `opencode mcp auth tavily` | `OAuth (/connect → Tavily MCP)`, with the sign-in's label as the account |
| An MCP server named `tavily` in your `mcp.servers` | Leaves your server unchanged | `your own tavily server in opencode.json` |

- To sign in with OAuth in the TUI, choose **Tavily MCP** in `/connect`, then press `o` or Enter to open the sign-in link in your browser. On the command line, `opencode mcp auth tavily` opens the browser automatically.
- OpenCode names the server's OAuth entry after the server, `tavily`. The plugin renames it **Tavily MCP**, so it is not confused with OpenCode's own **Tavily** key entry.
- A connected key wins over `TAVILY_API_KEY`.
- When you connect, replace or remove a key, the plugin reconnects the server. You do not need to restart OpenCode. After you change `TAVILY_API_KEY`, restart OpenCode.
- When Tavily rejects a connected key, `/connect` shows "Sign in required" on **Tavily** until the server connects again.
- With OAuth, Tavily chooses which of your Tavily API keys pays for the calls: a key named `mcp_auth_default`, or else your `default` key. See [Tavily's MCP documentation](https://docs.tavily.com/documentation/mcp).
- The plugin never writes the key to config or logs. See [SECURITY.md](../SECURITY.md) for where OpenCode keeps it.

Your own `tavily` server gets none of the plugin's key handling and no `executionTimeoutMs`. The default permission rules still apply to it, because they match the tool names.

## Errors

The plugin's own errors and warnings have one shape: `CODE: what happened. Next step: what to do.` Errors from OpenCode and from Tavily pass through unchanged. No error contains a key or a token.

| Code | When | Example |
| --- | --- | --- |
| `OPTIONS_INVALID` | Start-up; the plugin does not start | `OPTIONS_INVALID: Unknown option "foo"; the options are websearch, executionTimeoutMs, allowUntestedHost. Next step: Fix the plugin's options in opencode.json.` |
| `HOST_UNTESTED` | Start-up, outside `>=2.2.3 <2.3.0`; a warning with `allowUntestedHost` | `HOST_UNTESTED: This plugin supports OpenCode >=2.2.3 <2.3.0, and this is 2.3.0. Next step: Use OpenCode 2.2.3 or a later 2.2 release, or set "allowUntestedHost": true to run anyway.` |
| `SKILLS_INVALID` | Start-up; a packaged skill is missing or damaged | `SKILLS_INVALID: skills/tavily has no SKILL.md. Next step: Reinstall the plugin.` |
| `KEY_UNAVAILABLE` | Log warning; OpenCode could not read the key | `KEY_UNAVAILABLE: OpenCode could not read the Tavily API key (<reason>). Next step: Run /connect, choose Tavily and connect the key again.` |
| `KEY_WATCH_STOPPED` | Log warning; key changes are no longer picked up | `KEY_WATCH_STOPPED: The plugin stopped watching for Tavily key changes (<reason>). Next step: Restart OpenCode after you change the key.` |
| `STATUS_UNAVAILABLE` | `/tavily-status`, the dialog and the RPC | `STATUS_UNAVAILABLE: Could not read Tavily's status (<reason>). Next step: Run /tavily-status again, and restart OpenCode if it keeps failing.` |

A start-up error is in OpenCode's log, `~/.local/share/opencode/log/opencode.log`, on a "failed to load plugin" line, and `/tavily-status` is missing.
