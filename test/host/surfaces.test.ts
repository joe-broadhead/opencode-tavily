import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { activate, call } from "../support/host.ts"

const EXPECTED_CONFIG = {
  type: "remote",
  url: "https://mcp.tavily.com/mcp/",
  oauth: {},
  timeout: { execution: 900_000 },
} as const

test("the real host registers both alias servers at Tavily's URL and answers status and probe", async () => {
  const run = await activate()
  try {
    const set = new Map(run.servers.map((server) => [server.name, server.config]))
    assert.deepEqual([...set.keys()].sort(), ["tavily-personal", "tavily-work"])
    for (const name of ["tavily-work", "tavily-personal"]) {
      assert.deepEqual(set.get(name), EXPECTED_CONFIG, `${name} is registered at Tavily's one URL`)
    }

    const listed = await run.host.mcp.list({ location: { directory: run.directory } })
    const names = (listed.data as { name: string }[]).map((server) => server.name)
    for (const name of ["tavily-work", "tavily-personal"]) assert.ok(names.includes(name), `${name} is listed by the host`)

    const status = (await call(run, "status", {})) as Record<string, unknown>
    assert.equal(status.name, "tavily")
    assert.equal(status.version, "0.0.0")
    assert.deepEqual((status.accounts as { alias: string }[]).map((account) => account.alias), ["work", "personal"])
    assert.ok(["ready", "needs_sign_in", "error"].includes(String(status.state)))
    assert.ok(Array.isArray(status.unguardedAgents))

    const probe = (await call(run, "probe", { account: "work" })) as Record<string, unknown>
    assert.equal(probe.account, "work")
    assert.deepEqual(probe.owner, { id: "mcp:tavily-work", label: "Tavily (work)", verified: false })
    assert.equal(probe.trust, "untrusted")
  } finally {
    await run.host.close()
  }
})

test("with no accounts option the host lists the default server named exactly tavily", async () => {
  const run = await activate({})
  try {
    const set = new Map(run.servers.map((server) => [server.name, server.config]))
    assert.deepEqual([...set.keys()], ["tavily"], "the default alias registers one server, named <name>")
    assert.deepEqual(set.get("tavily"), EXPECTED_CONFIG)

    const listed = await run.host.mcp.list({ location: { directory: run.directory } })
    const names = (listed.data as { name: string }[]).map((server) => server.name)
    assert.ok(names.includes("tavily"), "the host lists the default server as tavily")
    assert.ok(!names.some((name) => name.startsWith("tavily-")), "no alias server exists without an accounts option")
  } finally {
    await run.host.close()
  }
})

test("the manifest declares the five tools and the wildcard", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { capabilities: { methods: Record<string, unknown> } }
  const methods = Object.keys(pkg.capabilities.methods)
  for (const tool of ["tavily_search", "tavily_extract", "tavily_map", "tavily_crawl", "tavily_research"]) {
    assert.ok(methods.includes(`mcp:${tool}`), `mcp:${tool} is declared`)
  }
  assert.ok(methods.includes("mcp:*"))
})
