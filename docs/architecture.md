# Architecture

The plugin is a thin layer over OpenCode's public plugin API. Tavily's hosted MCP server provides the tools, and OpenCode runs them: OAuth, the MCP connection, permission prompts and tool results. The plugin chooses the server's settings, adds default permission rules, chooses the web search default and reports status. It adds no tools of its own and does not change results.

It uses only APIs that are public in OpenCode 2.2.3. It is tested on stock OpenCode 2.2.3 and 2.2.4, and refuses to start outside `>=2.2.3 <2.3.0` unless `allowUntestedHost` is set.

## Parts

| File | What it does |
| --- | --- |
| `src/index.ts` | `Plugin.define({ id: "tavily.web", setup })`: runs the steps below in order and returns a cleanup that stops the key watcher |
| `src/options.ts` | Checks the options and applies the defaults (`OPTIONS_INVALID`) |
| `src/host-version.ts` | Checks `ctx.app.version` against `>=2.2.3 <2.3.0` (`HOST_UNTESTED`) |
| `src/skills.ts` | Loads `skills/*/SKILL.md` from the package and registers them (`SKILLS_INVALID`) |
| `src/credential.ts` | Reads the key of OpenCode's built-in `tavily` integration |
| `src/mcp.ts` | Registers the `tavily` server, and reconnects it when the key changes |
| `src/connect.ts` | Names the server's OAuth entry **Tavily MCP** in `/connect`, and flags a rejected key there |
| `src/permissions.ts` | Adds the default rules to every agent |
| `src/websearch.ts` | Makes the built-in `tavily` provider the web search default |
| `src/status.ts` | Builds the status and the `/tavily-status` command |
| `src/rpc/index.ts` | The status RPC contract and the labels that `/tavily-status` and the dialog share |
| `src/tui/index.tsx` | The **Tavily: Status** dialog (`tavily.web.tui`), built to `dist/tui.js` |
| `skills/tavily`, `skills/tavily-research` | The two skills |

`setup` runs in this order: options, host check, skills, key, then the MCP, agent, web search, skill and command transforms, the RPC, and last the key and `/connect` watchers. A failed check stops `setup` before the plugin registers anything.

## The MCP server

The plugin registers this server as `tavily`, through `ctx.mcp.transform`:

```js
{ type: "remote", url: "https://mcp.tavily.com/mcp/", timeout: { execution: executionTimeoutMs } }
```

With an API key, it adds `oauth: false` and `headers: { Authorization: "Bearer <key>" }`. It leaves `protocol` and `codemode` at OpenCode's defaults.

- **The key.** The plugin reads the active connection of OpenCode's built-in `tavily` integration with `ctx.integration.connection.active("tavily")` and `.resolve()`. It uses the result only when its type is `key`. The source is a key connected with `/connect` → Tavily or `opencode auth login tavily`, or `TAVILY_API_KEY`. The key stays in memory and is never logged or written.
- **Key changes.** Transforms must be synchronous, so the plugin reads the key in `setup`. It then listens for `credential.updated`, `credential.switched` and `integration.updated`. When the key itself changes, it calls `ctx.mcp.reload()`. OpenCode then reconnects the server with the key, or with OAuth.
- **Your own server.** If your config already defines a server named `tavily`, the transform leaves it unchanged. Status then reports `user_server`.
- **The `/connect` entries.** OpenCode's built-in key integration is named "Tavily". Without a key, OpenCode gives the server an OAuth integration, `mcp_` and 16 hex digits of the SHA-1 of `tavily`, NUL and the URL, and names it after the server. The plugin renames it **Tavily MCP**. OpenCode registers that integration, with its name, after plugin setup and again on every MCP reload, and transforms replay in registration order. So the plugin checks the name on `integration.updated`, and polls for the first 10 seconds because a subscription has no start acknowledgement; when the name was reset, it registers its rename again, after OpenCode's, and disposes the old one.
- **A rejected key.** On `mcp.status.changed`, when a connected key is in use and the server needs sign-in, the plugin reports `needs_auth` on the key's connection with `ctx.integration.connection.status`, so `/connect` shows "Sign in required" on **Tavily**. It clears the report when the server connects.
- **Code Mode.** OpenCode's default applies: MCP tools are in Code Mode, as `tools.tavily.tavily_search` and so on. With Code Mode off, they are direct tools named `tavily_tavily_search` and so on. OpenCode's own `websearch` tool covers simple searches outside Code Mode.

## Permissions: default ask rules

The permission mechanism that shipped is **default `ask` rules added through `ctx.agent.transform`**. There is no `allowTools` option and no permission hook.

In every agent, right after the first `{ action: "*", resource: "*", effect: "allow" }`, the plugin adds the block below. An agent without that rule gets nothing, because the block's `ask` would loosen its default deny.

- `{ action: "tavily_*", resource: "*", effect: "ask" }`, so unknown and new tools ask;
- one `allow` for each of Tavily's five read-only tools: `tavily_tavily_search`, `_extract`, `_map`, `_crawl` and `_research`.

The plugin adds the block only when the agent does not already have it, so rebuilds add nothing. OpenCode asserts `<server>_<tool>` on resource `*` for each MCP call, and the last matching rule wins. So every later rule wins over the block: the agent's own denies (Explore's `* * deny`, Plan's limits), your `permissions` and your saved "Always allow" answers. The host tests check each case on OpenCode 2.2.3: the known reads are allowed and a new tool asks, a user `allow` and a saved "Always allow" each win, and Plan and Explore stay strict. The package test checks that the installed plugin's rules are in place on stock 2.2.3 and 2.2.4, that a known read is allowed and a new tool asks, and that Explore stays strict.

An escalating permission hook was rejected. It would run after the rules and saved approvals, so it would override a user's explicit allow.

**Limit.** OpenCode creates agents that are defined only in user config after plugins run, so those agents never get the block. Status finds every agent that does not have the block and would allow an unknown Tavily tool. It lists the agent in `unguardedAgents` and gives the fix: put the block first in that agent's own `permissions`, then the user's top-level `tavily_*` rules. Putting the block in the top-level `permissions` is no fix: top-level rules come after Explore's `* * deny`, so they would let Explore use Tavily tools.

## Web search

When the `websearch` option is `true`, the plugin calls `e.default.set("tavily")` in `ctx.websearch.transform`, but only if no earlier transform chose a provider. It adds no provider of its own: OpenCode 2.2.3 ships one for Tavily, with the `tavily` integration.

OpenCode applies `websearch` from `opencode.json` in its own plugin, which runs after package plugins, so that choice wins and the plugin cannot see it. OpenCode uses the provider that the user chose when it first asked only when no transform set a provider.

## Status and RPC

One status object feeds `/tavily-status`, the RPC and the dialog:

```ts
{
  connection: "connected" | "pending" | "needs_auth" | "failed" | "disabled" | "not_registered"
  auth: "oauth" | "key_connected" | "key_env" | "user_server" | "none"
  account?: string            // a credential label, never a secret
  tools: { visible: number; unknown: number; unknownNames: string[] } // the tavily server's tools OpenCode lists
  websearchDefault: boolean   // the plugin chose Tavily; opencode.json can still override it
  host: { version: string; tested: boolean }
  unguardedAgents?: string[]  // agents without the default rules
  permissionsBlock?: Rule[]   // the block to paste, with unguardedAgents
  nextStep: string            // one next step; "Nothing to do." when ready
}
```

The plugin reads it from `ctx.mcp.list()`, `ctx.tool.list()`, `ctx.agent.list()`, `ctx.integration.connection.active()` and its own state. It holds no key or token. An agent counts as guarded when the block appears anywhere after its first base allow: other plugins insert their blocks at the same place. `unknownNames` lists at most 20 plain names.

`/tavily-status` posts the text as a synthetic message with `resume: false`, so no model turn starts.

The RPC is `tavily.web`, with one read-only method, `status`. Its contract is `Tavily` in `src/rpc/index.ts`.

- **Input:** `{}`. The input schema is an object with no properties and `additionalProperties: false`. A call with no input, or with any key, fails with OpenCode's `rpc.invalid_input` error (HTTP 400). From a client, call `client.rpc(Tavily).status({}, { location })`. Over HTTP, `POST /api/rpc/tavily.web/status` with the body `{"input":{}}`.
- **Output:** the status object, checked against its JSON Schema.
- **Error:** `unavailable`, when the status cannot be read. Its message starts with `STATUS_UNAVAILABLE`, and its `data.nextStep` says what to do.

## Terminal UI

`dist/tui.js` is prebuilt JavaScript from `src/tui/index.tsx`. OpenCode does not compile `.tsx` files from `node_modules`, so the package ships no TSX. The RPC contract is inlined into it, so it imports only `@opencode/plugin/rpc`, `@opentui/core`, `@opentui/solid` and `solid-js`, which OpenCode supplies.

The TUI part registers one global command from setup: the palette entry **Tavily: Status**, with the slash alias `/tavily`. It opens one dialog that calls the RPC and shows the rows Connection, Account, Access, Sign-in, Web search, Tools, Agents without default rules (with the block), OpenCode and Next step, in that order; `/tavily-status` prints the same rows. `r` refreshes it and `Esc` closes it; the hint reads `r refresh · esc close`. It subscribes to events only while the dialog is open, and refreshes on `server.connected`, `mcp.status.changed`, `agent.updated`, `integration.updated`, `credential.updated` and `credential.switched`. OpenCode 2.2.3's client has no `mcp.tools.changed` event, and OpenCode lists a server's tools shortly after the server connects, so the tool count can lag until the next refresh or `r`. The part stops every listener, aborts open requests and closes the dialog when it is disposed.

## Package

- JavaScript only: `dist`, `skills`, `README.md`, `LICENSE`, `CHANGELOG.md` and `package.json`.
- `dist/` holds exactly two self-contained files, built by `tools/build.mjs` with esbuild: `index.js` (the server part) and `tui.js` (the TUI part, after Babel compiles its JSX). Each inlines every module it uses, the RPC contract included, so neither has a relative import. OpenCode reloads a plugin in place but keeps the module records of unchanged paths, so a sibling module could otherwise be a stale copy. Only `@opencode/plugin`, OpenTUI, Solid and `node:*` stay imports; the build fails on anything else. `tsc` only typechecks.
- The server part finds `skills/` at `../skills/` from `dist/index.js`, the package root.
- No `dependencies` and no peer dependencies. OpenCode supplies `@opencode/plugin`, OpenTUI and Solid to plugins at runtime. They are dev dependencies here, for types, the build and the tests, with `@opencode/plugin` pinned at 2.2.3.
- `"opencode": { "host": ">=2.2.3 <2.3.0" }` states the tested range. The start-up check uses the same range.
- No lifecycle scripts. OpenCode installs plugins with scripts turned off, so `dist/` is built before packing.
- Exports: `.` → `./dist/index.js` and `./tui` → `./dist/tui.js`. The package ships no declaration files.

## Why the plugin has no tools of its own

| Candidate | Decision |
| --- | --- |
| Wrappers for search, extract, map and crawl | No. They copied Tavily's schemas, broke when Tavily changed its wording, and needed a short deadline and a lossy normalizer. Tavily's own tools are typed, marked read-only and maintained by Tavily. |
| A Research wrapper with progress | No. It would need a second, key-only REST path beside `tavily_research`. |
| `status` or `catalog` tools for the model | No. The model sees OpenCode's errors and the sign-in state. People use `/tavily-status` or the **Tavily: Status** dialog. |
| A plugin web search provider | No. OpenCode ships one for Tavily, and the plugin selects it. |

## Research

- Tavily's Research result reaches the model unchanged, including the report's `sources`.
- `executionTimeoutMs` (15 minutes by default) bounds each call. OpenCode's own default is 12 hours, which does not stop a call that hangs.
- There is no progress. OpenCode asks the MCP server for progress only to keep the call alive and does not show it. A plugin cannot add progress to a tool that it does not own, so the `tavily-research` skill tells the model what to expect.

## Code Mode and declined calls

On OpenCode 2.2.3, when the user declines a tool call inside a Code Mode program, the program gets an error that it can catch, and the program continues. A program could therefore try a different route after a decline. The `tavily` skill tells the model to accept a decline and not to try another route. The upstream pull request [anomalyco/opencode#60112](https://github.com/anomalyco/opencode/pull/60112) proposes to end the run on a decline instead. This plugin does not work around it.

## Upstream drift

`npm run check:upstream` (`tools/check-upstream.mjs`) is a check for maintainers. It lists the tools of Tavily's hosted server without a key and compares them with the five known reads. It prints added and removed tools, and always exits with 0. Nothing at runtime depends on it: a new tool asks before it runs, and a removed tool leaves an unused allow rule.

## OpenCode facts the design relies on

The links point to the OpenCode source at tag `v2.2.3`.

| Fact | Source |
| --- | --- |
| `ctx.mcp.transform` registers a remote server with `type`, `url`, `headers`, `oauth`, `timeout`, `codemode` and `protocol`. | [`packages/schema/src/mcp.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/schema/src/mcp.ts) |
| A remote server without `oauth: false` gets an OAuth integration named after the server, with the id `mcp_` and the first 16 hex digits of the SHA-1 of its name and URL. So it cannot collide with the built-in `tavily` integration. | [`packages/core/src/mcp/index.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/mcp/index.ts) |
| Each MCP tool call asserts the permission `<server>_<tool>` on resource `*`. | [`packages/core/src/tool/mcp.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/tool/mcp.ts) |
| The last matching rule wins. Denies are checked first. Saved approvals come after agent and session rules, and are saved for the project. | [`packages/core/src/permission.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/permission.ts) |
| Config `permissions` are appended to every agent after its built-in rules. Agents defined only in config are created after package plugins run: from the default agent, then the top-level rules, then their own. | [`packages/core/src/config/plugin/agent.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/config/plugin/agent.ts) |
| `DEFAULT_EXECUTION_TIMEOUT` is 12 hours. Tool calls pass `onprogress: () => {}`, so progress is never shown. | [`packages/core/src/mcp/client.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/mcp/client.ts) |
| OpenCode ships the `tavily` web search provider and the `tavily` integration (named "Tavily", with `key` and `TAVILY_API_KEY` methods). The provider sends the key, or uses Tavily's keyless mode when there is none. | [`packages/core/src/plugin/websearch/tavily.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/plugin/websearch/tavily.ts) |
| The web search provider is the one chosen by the transforms. The user's stored first-use choice is used only when no transform chose one. | [`packages/core/src/websearch.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/websearch.ts) |
| The `websearch` setting in `opencode.json` is applied by OpenCode's own `opencode.config.websearch` plugin, which runs after package plugins. | [`packages/core/src/config/plugin/websearch.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/config/plugin/websearch.ts) |
| `ctx.integration.connection.active(id)` and `.resolve()` are public. A saved account wins over an environment connection. | [`packages/core/src/integration.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/integration.ts) |
| A permission decline inside a Code Mode program becomes an error that the program can catch. | [`packages/core/src/codemode/tool.ts`](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/codemode/tool.ts) |
