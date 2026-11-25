// Rewrites fixtures/conformance.json from the plugin's synthetic two-alias runtime.
//
//   npm run fixtures
//
// There is no live Tavily account on this machine, so nothing here is a live capture: the aliases `work` and
// `personal` are invented, and both MCP servers answer `connected` from an in-memory list. The fixture says so in its
// `$comment`. `plugin-kit record --check` redacts and checks it like any recording.
//
// accounts.cursors is empty because the plugin has no cursor-bearing read: it declares no source. That is an honest
// gap against the kit's accounts checks, not a missing recording, and it is reported as a contract issue.
import { mkdirSync, writeFileSync } from "node:fs"
import { accountsOf, resolveAccount } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { manifest, packageName } from "../src/manifest.ts"
import { OPTIONS, run, runtimeFor } from "../test/support/runtime.ts"

const plan = accountsOf(manifest, OPTIONS)
if (!plan.ok) throw new Error(`the fixture's options do not validate: ${plan.problems.join("; ")}`)
const aliases = plan.value.accounts.map((account) => account.alias)

function codeOf(resolved) {
  if (resolved.ok) throw new Error("the account resolved, and this case needs a refusal")
  return resolved.code
}

const required = codeOf(resolveAccount(plan.value.accounts, {}))
const unknown = codeOf(resolveAccount(plan.value.accounts, { account: "nobodyhere" }))
if (required !== "ACCOUNT_REQUIRED" || unknown !== "ACCOUNT_UNKNOWN") {
  throw new Error(`the account cases answer ${required} and ${unknown}, not ACCOUNT_REQUIRED and ACCOUNT_UNKNOWN`)
}

// Drive probe and status through the real handler table, so the recording is what the plugin answers.
for (const alias of aliases) {
  const answer = await run(runtimeFor(), "probe", {}, alias)
  if (answer?.trust !== "untrusted" || answer?.owner?.verified !== false) throw new Error(`probe for ${alias} is not an untrusted, unverified connection identity`)
}
const status = await run(runtimeFor(), "status", {})

const fixture = {
  $comment:
    "Recorded from the plugin's synthetic two-alias runtime through its own handlers; the provider answers are synthetic, not a live Tavily recording. The aliases work and personal are invented, and both MCP servers answer connected from an in-memory list. accounts.real: true means the conformance kit runs the two-account cases against the real 2.4.1 host (docs/conformance.md), not that a provider was read. accounts.cursors is empty because the plugin has no cursor-bearing read (it declares no source), which is a known gap the kit reports rather than something a fixture can invent.",
  plugin: packageName,
  namespace: manifest.plugin.summary,
  accounts: {
    real: true,
    aliases,
    required: { method: "probe", code: required },
    unknown: { method: "probe", account: "nobodyhere", code: unknown },
    cursors: [],
  },
  events: { emitted: [], status },
}

mkdirSync("fixtures", { recursive: true })
writeFileSync("fixtures/conformance.json", `${JSON.stringify(fixture, null, 2)}\n`)
console.log(`recorded fixtures/conformance.json for ${packageName}: ${aliases.join(", ")}, status ${status.state}`)
