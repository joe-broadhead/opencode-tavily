import assert from "node:assert/strict"
import { test } from "node:test"
import type { ServerEntry } from "../src/provider/client.ts"
import { handlersFor } from "../src/handlers/index.ts"
import { run, runtimeFor } from "./support/runtime.ts"

const STATUS_KEYS = ["name", "version", "host", "state", "accounts", "unguardedAgents", "nextStep"]

function runtimeWith(entries: readonly ServerEntry[], overrides: Parameters<typeof runtimeFor>[0] = {}) {
  return runtimeFor({ mcp: { list: async () => ({ data: entries }) }, ...overrides })
}

test("status names the plugin, the host and both accounts, and costs nothing", async () => {
  const answer = (await run(runtimeFor(), "status", {})) as Record<string, unknown>
  assert.deepEqual(Object.keys(answer).sort(), [...STATUS_KEYS].sort())
  assert.equal(answer["cost"], undefined)
  assert.equal(answer["name"], "tavily")
  assert.equal(answer["version"], "0.0.0")
  assert.deepEqual(answer["host"], { version: "2.4.1", range: ">=2.4.1 <2.5.0", tested: ["2.4.1"] })
  assert.equal(answer["state"], "ready")
  assert.equal(answer["nextStep"], null)
  assert.deepEqual(answer["unguardedAgents"], [])
  assert.deepEqual(answer["accounts"], [
    { alias: "work", state: "ready" },
    { alias: "personal", state: "ready" },
  ])
})

test("an alias that needs sign-in is the plugin's next step", async () => {
  const answer = (await run(
    runtimeWith([
      { name: "tavily-work", status: { status: "connected" } },
      { name: "tavily-personal", status: { status: "needs_auth", error: "no token" } },
    ]),
    "status",
    {},
  )) as Record<string, unknown>
  assert.equal(answer["state"], "needs_sign_in")
  assert.equal(answer["nextStep"], "Sign in to the account that needs it, then read status again.")
  assert.deepEqual(answer["accounts"], [
    { alias: "work", state: "ready" },
    { alias: "personal", state: "needs_sign_in" },
  ])
})

test("a failed or disabled server makes the plugin's state error, with its reason", async () => {
  const disabled = (await run(
    runtimeWith([
      { name: "tavily-work", status: { status: "disabled" } },
      { name: "tavily-personal", status: { status: "connected" } },
    ]),
    "status",
    {},
  )) as Record<string, unknown>
  assert.equal(disabled["state"], "error")
  assert.equal(disabled["nextStep"], "work: the server is disabled")
  assert.deepEqual(disabled["accounts"], [
    { alias: "work", state: "error", reason: "the server is disabled" },
    { alias: "personal", state: "ready" },
  ])

  const failed = (await run(
    runtimeWith([
      { name: "tavily-work", status: { status: "connected" } },
      { name: "tavily-personal", status: { status: "failed", error: "the host failed at https://mcp.tavily.com/cb?access_token=hidden-secret" } },
    ]),
    "status",
    {},
  )) as Record<string, unknown>
  assert.equal(failed["state"], "error")
  assert.doesNotMatch(String(failed["nextStep"]), /hidden-secret/)
  assert.match(String(failed["nextStep"]), /^personal: /)
  const accounts = failed["accounts"] as Record<string, unknown>[]
  assert.match(String(accounts[1]?.["reason"]), /^the host failed at https:\/\/mcp\.tavily\.com\/cb\?access_token=…/)
})

test("a server OpenCode does not list makes the plugin's state error", async () => {
  const answer = (await run(runtimeWith([{ name: "tavily-work", status: { status: "connected" } }]), "status", {})) as Record<string, unknown>
  assert.equal(answer["state"], "error")
  assert.equal(answer["nextStep"], "personal: OpenCode lists no such server")
})

test("status reports an agent that no longer holds the generated rules", async () => {
  const answer = (await run(runtimeFor(), "status", {}, "work", { unguardedAgents: async () => ["build"] })) as Record<string, unknown>
  assert.deepEqual(answer["unguardedAgents"], ["build"])
})

test("an unreadable agent list is an error, never zero", async () => {
  const answer = (await run(runtimeFor(), "status", {}, "work", {
    unguardedAgents: async () => {
      throw new Error("the agent list failed at https://mcp.tavily.com/cb?token=hidden-value")
    },
  })) as Record<string, unknown>
  assert.equal(answer["state"], "error")
  assert.doesNotMatch(String(answer["nextStep"]), /hidden-value/)
  assert.match(String(answer["nextStep"]), /Next step|the agent list failed/)
})

test("what account registration could not do is the first next step", async () => {
  const answer = (await run(runtimeFor({ accountProblems: ["accounts.work: the MCP server tavily-work could not be registered: boom"] }), "status", {})) as Record<string, unknown>
  assert.equal(answer["state"], "error")
  assert.equal(answer["nextStep"], "accounts.work: the MCP server tavily-work could not be registered: boom")
})

test("with no accounts option status lists the one default account", async () => {
  const answer = (await run(
    runtimeWith([{ name: "tavily", status: { status: "connected" } }], { options: {} }),
    "status",
    {},
    "default",
  )) as Record<string, unknown>
  assert.deepEqual(answer["accounts"], [{ alias: "default", state: "ready" }])
})

test("the status handler reuses the contract's status schema", () => {
  const handler = handlersFor(runtimeFor())["status"]
  assert.ok(handler !== undefined)
  assert.equal(handler.output["additionalProperties"], false)
  assert.deepEqual(handler.output["required"], STATUS_KEYS)
})
