# Repository rules

This repository builds `@we-the-rebel-alliance/tavily-plugin`, an OpenCode plugin that registers Tavily's official
remote MCP server (`https://mcp.tavily.com/mcp/`) and uses Tavily's own tools. Setup, checks and releases are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Platform

- Use only public `@opencode/plugin` APIs that exist in OpenCode 2.4.1. The host range is exactly `>=2.4.1 <2.5.0`,
  never `^2.4.1`, and `TESTED_HOSTS` in `src/host-version.ts` is `["2.4.1"]`. A later 2.4 release runs and is reported
  as untested; an unsupported release is refused with `HOST_UNTESTED` before anything is registered.
- `npm run lint` (`test/forbidden`) scans `src/` and `dist/` and fails on an import of `@opencode/ai`, `effect` or the
  V1 `@opencode-ai/` packages, on `@opentui/*` or `solid-js` outside `src/tui`, and on internal hook APIs.
- Code outside `src/tui` imports only `@opencode/plugin`, `@opencode/plugin/*`, `node:*`,
  `@we-the-rebel-alliance/source-contract/tools-rpc` and other files in `src/`. The tools RPC is the transport 4b
  replaces; change it in source-contract, never here.
- Tests import no host source: only `@opencode/plugin`, `@opencode/sdk` and `@opencode/client` at 2.4.1, and
  `@we-the-rebel-alliance/source-contract` (a devDependency the build bundles). The host harness is the embedded 2.4.1
  SDK with its Automation service running the scheduler, so Code Mode with nobody present runs as an automation's code
  action (`unattended` in `test/host/harness.ts`). Write test doubles as narrow `Pick<Plugin.Context, ...>` fakes.

## Spend

- All five Tavily tools spend credits. `src/spend.ts` is the one classification: the five tools, Tavily's unit prices
  and the one spend line. `src/permissions.ts` derives the known actions from it, the tools RPC derives `METHODS`, and
  status carries `cost: { class: "spend", unit: "credit", text }`. 4b turns the same table into each action's
  `effect: "spend"` and `cost`; do not restate the prices elsewhere.
- Every tool is allowed by default. The `access` option generates the block (`all`; `ask-changes`; `read-only`) after
  each agent's first base allow; a user's rules always win. The plugin sets no spending limit.
- `defaultRules(access)` is printed in full in the README and in `docs/configuration.md` for each value;
  `test/unit/docs.test.ts` asserts the docs equal it.

## Greenfield

- No legacy or dead code, exports, dependencies, docs, tests or fixtures. Delete rather than deprecate.
- No plugin-owned Tavily tools, no plugin web search provider and no keyless MCP mode.
- Never write keys, tokens, personal data or machine-local absolute paths into the repository. Never log or store the
  Tavily key.

## Package

- Releases come only from `.github/workflows/release.yml` ("Releasing" in [CONTRIBUTING.md](CONTRIBUTING.md)). Never
  push a tag or a `release/*` branch, and never commit, tag or publish a release by hand. Agents never approve a
  release, never call the deployment-approval API, and never bypass a ruleset or the environment.
- No personal email in anything we publish. Check `git config user.email` before committing: a fresh clone inherits
  the machine's global identity. The release commit and tag are made by the release workflow as `github-actions[bot]`;
  never bypass that with a hand-made tag or release.
- The version appears only in `package.json` and `CHANGELOG.md`. `scripts/build.mjs` defines `__PLUGIN_VERSION__` from
  `package.json` for `src/version.ts`, and `bunfig.toml` preloads `test/version.ts`, which does the same for the tests.
- No `dependencies`, peer dependencies, lifecycle scripts or declaration files. `exports` lists `.` → `./dist/index.js`
  and `./tui` → `./dist/tui.js`. `dist/` holds exactly `index.js` and `tui.js`, each a self-contained esbuild bundle
  with no relative imports.
- `@opencode/plugin`, `@opencode/sdk`, `@opencode/client`, `@opencode/theme` and `effect` are exact dev dependencies at
  2.4.1 (effect 4.1.0, the plugin peer's version). Keep `package-lock.json` in step with `npm install`.
- npm installs and runs the scripts (`npm ci`, `npm run check`); Bun 1.4.5 runs the tests.

## Contracts

Keep these stable in 4a: plugin id `tavily.web`, TUI id `tavily.web.tui`, MCP server name `tavily`, RPC id
`tavily.web` with the method `status`, the tools RPC `tavily.web.tools` with `describe` and one method per known tool,
and skill ids `tavily` and `tavily-research`. The namespace line and both skill descriptions are fixed context: at most
400 and 300 characters, and pinned by `test/unit/skill-text.test.ts`.

## Commits

`npm run check` passes before every commit. Use `type(scope): summary`, with a body line such as `Refs #30`.
