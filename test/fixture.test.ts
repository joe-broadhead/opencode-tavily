import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { accountsOf, resolveAccount } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { manifest, packageName } from "../src/manifest.ts"
import { OPTIONS, run, runtimeFor } from "./support/runtime.ts"

interface Fixture {
  readonly $comment: string
  readonly plugin: string
  readonly namespace: string
  readonly accounts: {
    readonly real: boolean
    readonly aliases: readonly string[]
    readonly required: { readonly method: string; readonly code: string }
    readonly unknown: { readonly method: string; readonly account: string; readonly code: string }
    readonly cursors: readonly unknown[]
  }
  readonly events: { readonly emitted: readonly string[]; readonly status: unknown }
}

const fixture = JSON.parse(readFileSync(new URL("../fixtures/conformance.json", import.meta.url), "utf8")) as Fixture

test("the fixture was recorded for this package from the synthetic two-alias runtime", () => {
  assert.equal(fixture.plugin, packageName)
  assert.equal(fixture.namespace, manifest.plugin.summary)
  assert.equal(fixture.accounts.real, true)
  assert.deepEqual(fixture.accounts.aliases, ["work", "personal"])
  assert.match(fixture.$comment, /not a live Tavily recording/)
  assert.match(fixture.$comment, /invented/)
})

test("the recorded account cases are what the contract's resolver answers", () => {
  const plan = accountsOf(manifest, OPTIONS)
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  const required = resolveAccount(plan.value.accounts, {})
  assert.equal(required.ok, false)
  if (required.ok) return
  assert.equal(required.code, fixture.accounts.required.code)
  assert.equal(fixture.accounts.required.method, "probe")
  const unknown = resolveAccount(plan.value.accounts, { account: fixture.accounts.unknown.account })
  assert.equal(unknown.ok, false)
  if (unknown.ok) return
  assert.equal(unknown.code, fixture.accounts.unknown.code)
  assert.equal(fixture.accounts.unknown.method, "probe")
})

test("the recorded status is what the status handler answers today", async () => {
  assert.deepEqual(await run(runtimeFor(), "status", {}), fixture.events.status)
})

test("probe answers for every recorded alias from the server the runtime lists", async () => {
  for (const [index, alias] of fixture.accounts.aliases.entries()) {
    const answer = (await run(runtimeFor(), "probe", {}, alias)) as Record<string, unknown>
    assert.equal(answer.account, alias)
    assert.equal(answer.trust, "untrusted")
    assert.deepEqual(answer.owner, {
      id: `mcp:tavily-${alias}`,
      label: `Tavily (${alias})`,
      verified: false,
    })
    const recorded = (fixture.events.status as { accounts: { alias: string }[] }).accounts[index]
    assert.equal(recorded?.alias, alias)
  }
})

test("the fixture records no bus event and no cursor case", () => {
  assert.deepEqual(fixture.events.emitted, [])
  // No cursor-bearing read exists, so an honest fixture cannot record one; the kit's accounts.cursors finding is
  // reported as a contract issue rather than hidden with an invented case.
  assert.deepEqual(fixture.accounts.cursors, [])
})
