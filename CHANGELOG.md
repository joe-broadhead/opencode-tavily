# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2026-11-03

### Added

- The tools RPC, `tavily.web.tools`: a script can call `tavily_search`, `tavily_extract`, `tavily_map`, `tavily_crawl` and `tavily_research` with no model, through `opencode api`, as a session and its agent. It gets exactly the access that agent's model has: a tool its rules hide is refused, OpenCode checks each call against the agent's and the session's rules, and an ask is refused at once because no one is there to answer it. `describe` lists the methods with each tool's live input schema. A tool that Tavily adds later is never a method. `docs/scripting.md` explains it.

## [0.0.1] - 2026-11-03

### Added

- A `jelly` section in `package.json`: each tool with its permission, its default effect and whether it only reads, the skill ids. Jelly reads it without loading the plugin and applies the declared asks, because its agents have no base allow rule for this plugin's own default rules to follow. `docs/jelly.md` explains it.
- `title` and `signIns` in the `jelly` section: the name Jelly shows on the plugin's card, and what the plugin signs in to, so that one card can say whether each sign-in is connected and start, renew or end it. `docs/jelly.md` lists them.

### Fixed

- A wrong API key no longer looks ready. Tavily's MCP server connects with any key, so `/tavily-status` showed `connected` and `Nothing to do.` while every call failed with `Unauthorized: missing or invalid API key`. The plugin now checks the key once with Tavily's usage endpoint, which costs no credits. Status shows whether Tavily accepts the key, gives the replacement as the next step, and `/connect` marks a rejected connected key "Sign in required".
- `TAVILY_API_KEY` set only in a shell no longer fails silently. The plugin runs in OpenCode's background service, which never sees a variable exported in a terminal after it started, so it used OAuth. The **Tavily: Status** dialog now names this case, and the docs and next steps explain `/connect` → **Tavily** and `opencode service set env TAVILY_API_KEY` instead of "restart OpenCode".
- Status no longer mixes two keys when the key changes while status is read.

## [0.0.0] - 2026-11-01

### Added

- Tavily's hosted MCP server, `https://mcp.tavily.com/mcp/`, registered as `tavily`, with Tavily's own tools: `tavily_search`, `tavily_extract`, `tavily_map`, `tavily_crawl` and `tavily_research`.
- Sign-in with OAuth through `/connect` → **Tavily MCP** or `opencode mcp auth tavily`, or with an API key through OpenCode's built-in **Tavily** entry, `opencode auth login tavily` or `TAVILY_API_KEY`. The plugin switches between them without a restart.
- Default permission rules for every agent: the five Tavily tools run without a prompt, and any other tool on the `tavily` server asks.
- OpenCode's built-in Tavily provider as the default for the `websearch` tool, unless `opencode.json` chooses a provider. The `websearch` option turns this off.
- `/tavily-status`, and the **Tavily: Status** view in the terminal UI (`/tavily`): connection, sign-in, tools, agents without the default rules, web search default, OpenCode version and the next step.
- The `tavily.web` RPC with one read-only method, `status`.
- Two skills: `tavily` and `tavily-research`.
- The options `websearch`, `executionTimeoutMs` and `allowUntestedHost`, and a start-up check for OpenCode `>=2.2.3 <2.3.0`.
