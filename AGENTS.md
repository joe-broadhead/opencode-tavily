# Repository rules

This repository builds `@joe-broadhead/opencode-tavily`, an OpenCode plugin that registers Tavily's official remote MCP server (`https://mcp.tavily.com/mcp/`) and uses Tavily's own tools. Setup, checks and releases are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Platform

- Use only public `@opencode/plugin` APIs that exist in OpenCode 2.2.3. The host range is exactly `>=2.2.3 <2.3.0`, never `^2.2.3`.
- Test against stock OpenCode 2.2.3 and 2.2.4 only.
- `npm run lint` (`test/forbidden`) scans `src/` and `dist/` and fails on any of these:
  - `ctx.generate.text` or `experimental.generate.text`;
  - `ctx.experimental.artifact`;
  - a `permission.hook("evaluate")`, except the one in `src/host/tools-rpc.ts`: it turns an `ask` on one of the tools RPC's own script calls in flight into a deny, because no one can answer it, and touches nothing else;
  - an import of `@opencode/ai`, `effect` or the V1 `@opencode-ai/` packages;
  - an import of `@opentui/*` or `solid-js` outside `src/tui`.
- Code outside `src/tui` imports only `@opencode/plugin`, `@opencode/plugin/*`, `node:*` and other files in `src/`. `src/tui` may also import `../rpc/index.js`, which the build inlines.
- `src/host/tools-rpc.ts` is a copy of a module shared by several plugins. Change only its block between the `PLUGIN-SPECIFIC` markers here; change the rest in the shared copy first.
- Tests import no host source: only `@opencode/plugin`, `@opencode/sdk` and `@opencode/client` at 2.2.3. Write test doubles as narrow `Pick<Plugin.Context, ...>` fakes.

## Greenfield

- No legacy or dead code, exports, dependencies, docs, tests or fixtures. Delete rather than deprecate.
- No plugin-owned Tavily tools, no plugin web search provider and no keyless MCP mode.
- No runtime manifests, schema pinning or attestation. `npm run check:upstream` warns about upstream drift and never fails.
- Never write keys, tokens, personal data or machine-local absolute paths into the repository. Never log or store the Tavily key.

## Package

- Releases follow CONTRIBUTING. `release.yml` refuses a private package or a tag that differs from the version.
- The version appears only in `package.json` and `CHANGELOG.md`.
- No `dependencies`, peer dependencies, lifecycle scripts or declaration files. `exports` lists only `.` → `./dist/index.js` and `./tui` → `./dist/tui.js`.
- `dist/` holds exactly `index.js` and `tui.js`, each a self-contained esbuild bundle with no relative imports (`tools/build.mjs`). Only `@opencode/plugin*`, `@opentui/*`, `solid-js` and `node:*` stay external. `tsc` only typechecks.
- `@opencode/plugin`, `@opencode/sdk`, `@opencode/client` and `@opencode/theme` are exact dev dependencies at 2.2.3. Do not add 2.2.4 to `package-lock.json`.
- npm installs and runs the scripts (`npm ci`, `npm run check`); Bun 1.4.4 runs the tests.

## Contracts

Keep these stable: plugin id `tavily.web`, TUI id `tavily.web.tui`, MCP server name `tavily`, RPC id `tavily.web` with the method `status`, the tools RPC `tavily.web.tools` with `describe` and one method per known read, and skill ids `tavily` and `tavily-research`. Users' permission rules and saved approvals name the server's tools, and clients call the RPC by its id.

## Commits

`npm run check` passes before every commit. Use `type(scope): summary`, with a body line such as `Refs #10`.
