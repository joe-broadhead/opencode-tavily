import assert from "node:assert/strict"
import { test } from "node:test"
import { accountStatus, redactReason } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { connectionOwner, findServer, MCP_URL, serverConfig, serverName, signalFor, signals, type ServerEntry } from "../src/provider/client.ts"

const CONFIG = { title: "Tavily", alias: "work", executionTimeoutMs: 900_000 } as const

test("the per-alias server is Tavily's one MCP URL with its own OAuth", () => {
  assert.equal(MCP_URL, "https://mcp.tavily.com/mcp/")
  assert.deepEqual(serverConfig(CONFIG), {
    type: "remote",
    url: "https://mcp.tavily.com/mcp/",
    oauth: {},
    timeout: { execution: 900_000 },
    title: "Tavily (work)",
  })
  assert.deepEqual(serverConfig({ ...CONFIG, alias: "default" })["title"], "Tavily")
})

test("the account name is the one OpenCode signs in to", () => {
  assert.equal(serverName("tavily", "default"), "tavily")
  assert.equal(serverName("tavily", "work"), "tavily-work")
  assert.equal(serverName("tavily", "personal"), "tavily-personal")
})

test("probe's owner is OpenCode's connection identity, never a Tavily identity", () => {
  assert.deepEqual(connectionOwner("tavily", "Tavily", "work"), {
    id: "mcp:tavily-work",
    label: "Tavily (work)",
    verified: false,
  })
  assert.deepEqual(connectionOwner("tavily", "Tavily", "default"), { id: "mcp:tavily", label: "Tavily", verified: false })
})

test("every OpenCode MCP state maps to the contract's signal", () => {
  assert.deepEqual(signalFor(undefined), { state: "error", reason: "OpenCode lists no such server" })
  assert.deepEqual(signalFor({ name: "tavily-work", status: { status: "connected" } }), { state: "ready" })
  assert.deepEqual(signalFor({ name: "tavily-work", status: { status: "needs_auth", error: "OAuth token expired" } }), { state: "needs_sign_in" })
  assert.deepEqual(signalFor({ name: "tavily-work", status: { status: "disabled" } }), { state: "error", reason: "the server is disabled" })
  assert.deepEqual(signalFor({ name: "tavily-work", status: { status: "pending" } }), { state: "error", reason: "the server is still connecting" })
  assert.deepEqual(signalFor({ name: "tavily-work", status: { status: "failed", error: "connection refused" } }), { state: "error", reason: "connection refused" })
  assert.deepEqual(signalFor({ name: "tavily-work", status: { status: "some_future_state" } }), {
    state: "error",
    reason: "the server reports some_future_state",
  })
})

test("a failure's reason is redacted and cut before it reaches status", () => {
  // A fabricated token in a real JWT's shape, assembled here so the repository carries no token-shaped literal.
  const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "abcdefghijklmnop"].join(".")
  const error = `the host said Bearer ${jwt} and failed at https://mcp.tavily.com/cb?access_token=supersecret-value`
  const signal = signalFor({ name: "tavily-work", status: { status: "failed", error } })
  const reason = signal.reason ?? ""
  assert.ok(reason.length <= 160, `reason is ${reason.length} characters`)
  assert.doesNotMatch(reason, /supersecret-value/)
  assert.doesNotMatch(reason, /eyJhbGci/)
  assert.doesNotMatch(reason, /Bearer\s+[A-Za-z0-9]/)
  assert.equal(reason, redactReason(error))
})

test("every alias's state comes from one live read of OpenCode's list", async () => {
  let reads = 0
  const entries: readonly ServerEntry[] = [
    { name: "tavily-personal", status: { status: "needs_auth" } },
    { name: "tavily-work", status: { status: "connected" } },
  ]
  const states = await signals(
    {
      list: async () => {
        reads += 1
        return { data: entries }
      },
    },
    "tavily",
    ["work", "personal"],
  )
  assert.equal(reads, 1)
  assert.deepEqual(states, { work: { state: "ready" }, personal: { state: "needs_sign_in" } })
})

test("a missing server is that alias's error, and the other alias still answers", async () => {
  const states = await signals({ list: async () => ({ data: [{ name: "tavily-work", status: { status: "connected" } }] }) }, "tavily", ["work", "personal"])
  const personal = accountStatus("personal", states["personal"])
  assert.deepEqual(states, { work: { state: "ready" }, personal: { state: "error", reason: "OpenCode lists no such server" } })
  assert.deepEqual(personal, { alias: "personal", state: "error", reason: "OpenCode lists no such server" })
})

test("an unreadable server list is unknown for every alias, never ready", async () => {
  const states = await signals(
    {
      list: async () => {
        throw new Error("permission denied at https://mcp.tavily.com/cb?token=hidden-value")
      },
    },
    "tavily",
    ["work", "personal"],
  )
  for (const alias of ["work", "personal"]) {
    const signal = states[alias]
    assert.equal(signal?.state, "error")
    assert.doesNotMatch(signal?.reason ?? "", /hidden-value/)
    assert.doesNotMatch(signal?.reason ?? "", /token=[^…]/)
  }
})

test("findServer names the entry OpenCode lists", () => {
  const entries: readonly ServerEntry[] = [{ name: "tavily-work", status: { status: "connected" } }]
  assert.equal(findServer(entries, "tavily-work")?.name, "tavily-work")
  assert.equal(findServer(entries, "tavily-personal"), undefined)
})
