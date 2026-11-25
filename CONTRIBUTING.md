# Contributing

This repository is an OpenCode plugin on [plugin-contract](https://github.com/we-the-rebel-alliance/plugin-contract) v0.
The contract is [docs/contract.md](https://github.com/we-the-rebel-alliance/plugin-contract/blob/master/docs/contract.md),
the bar for every plugin repository is
[docs/plugin-standard.md](https://github.com/we-the-rebel-alliance/plugin-contract/blob/master/docs/plugin-standard.md),
and [AGENTS.md](AGENTS.md) is the working guide.

## Set up and check

You need Node 24.

```sh
npm ci --ignore-scripts
npm run check
```

`npm run check` runs the whole gate:

| Step | What it proves |
|---|---|
| `npm run typecheck` | the sources and tests typecheck under strict settings |
| `npm run bundle` | `dist/index.js` is built from `src/index.ts` with esbuild and committed |
| `npm test` | the manifest, accounts, provider, options, handlers, web search, skills and fixture tests pass |
| `npm run test:pack` | the packed tarball carries the right files and its `./server` entry loads as a plugin |
| `plugin-kit check` | conformance T0 and T1 on 2.4.1, the doc file set, the forbidden patterns and no bundled kit |
| `plugin-kit docs --check` | every generated doc section matches the manifest |

CI runs the same steps in one job named `ci`, after a freshness gate: it rebuilds `dist/` and fails when
`git diff --exit-code dist/` finds the committed bundle stale. One full check at a time on a shared machine:
`flock /tmp/opencode/p4b-check.lock -c 'npm run check'`.

## The contract pin

`package.json` pins the contract to its release tag, `github:we-the-rebel-alliance/plugin-contract#v0.0.0`, and moves
the pin with the contract's release. Never copy a contract module into this repository.

The committed `package-lock.json` may record the contract's repository over `git+ssh`; CI rewrites that URL to HTTPS
before `npm ci`, so a runner needs no SSH key. Keep the GitHub dependency form the contract documents.

## Pull requests

One change per pull request, based on `master`, with a conventional commit (`feat:`, `fix:`, `docs:`, `chore:`). The
pull request says what changed, why, the contract section it implements, and the exact `npm run check` result.

A new method starts in `package.json` `capabilities`, then its handler in `src/handlers/`, then its tests, then
`npx plugin-kit docs`, then `npx plugin-kit check`. Every capability has tests, including its negative cases. A new
Tavily tool is covered by `mcp:*` until its own row is added.

## Fixtures

`fixtures/conformance.json` is the plugin's evidence to the conformance kit, and `test/fixture.test.ts` replays it
through the handlers so it cannot drift. It is recorded from the plugin's synthetic two-alias runtime: there is no live
Tavily account in this repository's history, so nothing in it is a live capture, and its `$comment` says so. Rebuild it
with `npm run fixtures`. A real capture needs a signed-in Tavily account and `npx plugin-kit record`; nobody has
recorded one.

## Releases

Releases are tags, not npm packages. A release is prepared in one pull request,
`chore(release): prepare vX.Y.Z`: the version in `package.json` and `package-lock.json`, the `CHANGELOG.md` section, and
`npx plugin-kit docs` if the manifest changed. The maintainer pushes the tag; the release workflow checks the tag,
builds, and creates the GitHub release with the packed tarball, the conformance report and `SHA256SUMS`.

The repository still carries `v0.0.0`–`v0.0.7`, tags from the package's life before the transfer. They are the previous
package and do not contain this build; the maintainer deletes the old `v0.0.0` and cuts this line's `v0.0.0` after the
merge.
