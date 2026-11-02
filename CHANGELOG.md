# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A `jelly` section in `package.json`: each tool with its permission, its default effect and whether it only reads, the skill ids. Jelly reads it without loading the plugin and applies the declared asks, because its agents have no base allow rule for this plugin's own default rules to follow. `docs/jelly.md` explains it.

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
