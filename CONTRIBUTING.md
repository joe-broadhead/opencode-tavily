# Contributing

Repository rules for contributors and agents are in [AGENTS.md](AGENTS.md).

## Setup

You need Node.js 24 or later, whose `npm` installs and runs the scripts, and [Bun](https://bun.sh) 1.4.4, which runs the tests.

```sh
git clone https://github.com/joe-broadhead/opencode-tavily.git
cd opencode-tavily
npm ci --ignore-scripts
npm run build
```

To try a local build, add the checkout's directory to `plugins` in your OpenCode config, then run `opencode reload`:

```jsonc
{ "plugins": ["/path/to/opencode-tavily"] }
```

## Checks

```sh
npm run check
```

`npm run build` runs `tools/build.mjs`: esbuild bundles `src/index.ts` into `dist/index.js` and `src/tui/index.tsx`, after Babel compiles its JSX, into `dist/tui.js`. Each file is self-contained, with no relative imports, so an in-place plugin reload never mixes it with a stale sibling module. `tsc` only typechecks.

`check` runs, in order: `typecheck` (the source and the whole test tree), `build`, the unit tests (`test`), the TUI tests (`test:tui`), the host tests (`test:host`), the package test (`test:pack`) and the forbidden-API scan (`lint`). Nothing calls Tavily.

- The host tests start OpenCode from `@opencode/sdk` inside the test process, in a temporary home with a proxy that refuses every request. A scripted loopback model runs real session turns, so the tests see what a model receives from a Tavily tool. `tools/host-tests.mjs` runs the suite on every tested release: the locked 2.2.3, then 2.2.4, 2.2.5 and 2.2.6 each installed from npm into a temp folder, and the stage fails when a release did not run. `HOST_SDK_DIR=<dir>` runs only the SDK in that folder.
- **Isolation.** Every test host lives in one temp root under `/tmp` (`/private/tmp` on macOS), whatever `TMPDIR` says. OpenCode reads `.opencode/` folders above a project, so a root inside your home would pick up your own agents and skills. Each project is its own git worktree, and the harness fails if a folder above the root holds `.opencode/`. Each stock host serves on its own free port and pins its managed-service port, so no CLI call reaches a running OpenCode.
- The package test checks that `dist/` holds exactly `index.js` and `tui.js` with no relative `import`, `import()` or `require`. It packs the plugin with `npm`, installs the tarball offline into an empty project, and loads it in each tested stock OpenCode release, 2.2.3, 2.2.4, 2.2.5 and 2.2.6 (`TESTED_HOSTS` in `src/host-version.ts`). Set `OPENCODE_BIN_2_2_3`, `OPENCODE_BIN_2_2_4`, `OPENCODE_BIN_2_2_5` and `OPENCODE_BIN_2_2_6` to those `opencode` binaries; otherwise it downloads each release from npm on every run, as CI does. `PACK_TARBALL` tests an existing tarball instead of packing one.
- `npm run check:upstream` is for maintainers. It lists the tools of Tavily's hosted server without a key and prints tools that were added or removed. It needs the network, only warns, and is not part of `check`.

## Releasing

1. Update `CHANGELOG.md` and the `version` in `package.json` on `master`.
2. Push a `vX.Y.Z` tag for that commit.
3. A reviewer approves the job in the `release` environment.

`.github/workflows/release.yml` then refuses a private package or a tag that differs from the version. It runs `npm ci` and `npm run check`, packs the tree once, runs the package test on that exact tarball, and publishes it to npm with trusted publishing and provenance. If the version is already on npm, it publishes nothing and says so, so a re-run is safe.
