#!/usr/bin/env node
// The workflows are parsed as workflows, not as YAML: `actionlint` catches a `${{ }}` that only exists in one context,
// which makes GitHub reject the whole file and run nothing. CI installs actionlint 1.7.12 in the one `ci` job before
// `npm run check`; here it runs when the tool is on PATH and prints a visible notice when it is not, so a local check
// without it still passes.
import { spawnSync } from "node:child_process"

const probe = spawnSync("actionlint", ["-version"], { encoding: "utf8" })
if (probe.error?.code === "ENOENT") {
  console.log("actionlint is not on PATH, so the workflow check is skipped here; CI installs it in the ci job before npm run check.")
  process.exit(0)
}
const run = spawnSync("actionlint", ["-color"], { stdio: "inherit" })
process.exit(run.status ?? 1)
