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

test("an alias in error stays on that alias; the plugin is only error for its own problems", async () => {
  const disabled = (await run(
    runtimeWith([
      { name: "tavily-work", status: { status: "disabled" } },
      { name: "tavily-personal", status: { status: "connected" } },
    ]),
    "status",
    {},
  )) as Record<string, unknown>
  assert.equal(disabled["state"], "ready")
  assert.equal(disabled["nextStep"], null)
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
  assert.equal(failed["state"], "ready")
  assert.equal(failed["nextStep"], null)
  const accounts = failed["accounts"] as Record<string, unknown>[]
  assert.match(String(accounts[1]?.["reason"]), /^the host failed at https:\/\/mcp\.tavily\.com\/cb\?access_token=…/)
})

test("an alias in error and one that needs sign-in makes the plugin needs_sign_in", async () => {
  const answer = (await run(
    runtimeWith([
      { name: "tavily-work", status: { status: "disabled" } },
      { name: "tavily-personal", status: { status: "needs_auth" } },
    ]),
    "status",
    {},
  )) as Record<string, unknown>
  assert.equal(answer["state"], "needs_sign_in")
  assert.equal(answer["nextStep"], "Sign in to the account that needs it, then read status again.")
})

test("a server OpenCode does not list is that alias's error, and the plugin stays ready", async () => {
  const answer = (await run(runtimeWith([{ name: "tavily-work", status: { status: "connected" } }]), "status", {})) as Record<string, unknown>
  assert.equal(answer["state"], "ready")
  assert.equal(answer["nextStep"], null)
  assert.deepEqual(answer["accounts"], [
    { alias: "work", state: "ready" },
    { alias: "personal", state: "error", reason: "OpenCode lists no such server" },
  ])
})

test("an unreadable MCP server list is an error for every alias and for the plugin", async () => {
  const reason = "the host failed at https://mcp.tavily.com/cb?access_token=…"
  const answer = (await run(
    runtimeFor({
      mcp: {
        list: async () => {
          throw new Error("the host failed at https://mcp.tavily.com/cb?access_token=hidden-secret")
        },
      },
    }),
    "status",
    {},
  )) as Record<string, unknown>
  assert.equal(answer["state"], "error")
  assert.equal(answer["nextStep"], `OpenCode's MCP server list could not be read: ${reason}`)
  assert.deepEqual(answer["accounts"], [
    { alias: "work", state: "error", reason },
    { alias: "personal", state: "error", reason },
  ])
  assert.doesNotMatch(JSON.stringify(answer), /hidden-secret/)
})

test("status reports an agent that no longer holds the generated rules", async () => {
  const answer = (await run(runtimeFor(), "status", {}, "work", { unguardedAgents: async () => ({ ok: true, agents: ["build"] }) })) as Record<string, unknown>
  assert.deepEqual(answer["unguardedAgents"], ["build"])
})

test("an unreadable agent list is an error, never zero", async () => {
  const answer = (await run(runtimeFor(), "status", {}, "work", {
    unguardedAgents: async () => ({ ok: false, error: "the agent list failed at https://mcp.tavily.com/cb?token=hidden-value" }),
  })) as Record<string, unknown>
  assert.equal(answer["state"], "error")
  assert.deepEqual(answer["unguardedAgents"], [])
  assert.equal(answer["nextStep"], "the agent list failed at https://mcp.tavily.com/cb?token=…")
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
