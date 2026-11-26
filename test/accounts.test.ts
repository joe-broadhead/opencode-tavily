import assert from "node:assert/strict"
import { test } from "node:test"
import { manifest } from "../src/manifest.ts"
import { registerMcpAccounts, type AccountsContext } from "../src/accounts.ts"
import { pluginOptions } from "../src/options.ts"

/** A context with the two transforms, capturing the MCP servers a plugin registers. */
function context(existing: Readonly<Record<string, Record<string, unknown>>> = {}) {
  const servers = new Map<string, Record<string, unknown>>(Object.entries(existing))
  const writes: string[] = []
  const fake = {
    integration: {
      transform: async () => {
        throw new Error("the mcp mechanism must not touch the integration transform")
      },
    },
    mcp: {
      transform: async (callback: (editor: { set(name: string, config: Record<string, unknown>): void }) => void) => {
        callback({
          set: (name, config) => {
            writes.push(name)
            servers.set(name, config)
          },
        })
        return { dispose: async () => undefined }
      },
    },
  } as unknown as AccountsContext
  return { fake, servers, writes }
}

test("the mcp mechanism registers one server per alias, named for the account", async () => {
  const { fake, servers } = context()
  const registration = await registerMcpAccounts(fake, manifest, { accounts: { work: {}, personal: {} } }, pluginOptions({}))
  assert.equal(registration.mechanism, "mcp")
  assert.deepEqual(registration.accounts.map((account) => account.name), ["tavily-work", "tavily-personal"])
  assert.deepEqual(registration.problems, [])
  assert.deepEqual(servers.get("tavily-work"), {
    type: "remote",
    url: "https://mcp.tavily.com/mcp/",
    oauth: {},
    timeout: { execution: 900_000 },
  })
  assert.deepEqual(servers.get("tavily-personal"), {
    type: "remote",
    url: "https://mcp.tavily.com/mcp/",
    oauth: {},
    timeout: { execution: 900_000 },
  })
})

test("with no accounts option the plugin has one default server", async () => {
  const { fake, servers } = context()
  const registration = await registerMcpAccounts(fake, manifest, {}, pluginOptions({}))
  assert.deepEqual(registration.accounts.map((account) => account.name), ["tavily"])
  assert.deepEqual(servers.get("tavily"), {
    type: "remote",
    url: "https://mcp.tavily.com/mcp/",
    oauth: {},
    timeout: { execution: 900_000 },
  })
})

test("the call time limit reaches every server's timeout.execution", async () => {
  const { fake, servers } = context()
  await registerMcpAccounts(fake, manifest, { accounts: { work: {}, personal: {} } }, pluginOptions({ executionTimeoutMs: 600_000 }))
  for (const name of ["tavily-work", "tavily-personal"]) {
    assert.deepEqual(servers.get(name)?.timeout, { execution: 600_000 })
  }
})

test("a bad alias is reported and registers no server", async () => {
  const { fake, servers, writes } = context()
  const registration = await registerMcpAccounts(fake, manifest, { accounts: { Work: {} } }, pluginOptions({}))
  assert.ok(registration.problems.length > 0)
  assert.equal(servers.size, 0)
  assert.deepEqual(writes, [])
})

test("a server already named for an alias is set to the plugin's config", async () => {
  // The contract's accounts module sets each alias's config; it does not read the entry first. Documented in
  // docs/accounts.md: the plugin owns the servers it names, so a user entry under one of those names is replaced.
  const { fake, servers } = context({ "tavily-work": { type: "remote", url: "https://example.test/mcp" } })
  await registerMcpAccounts(fake, manifest, { accounts: { work: {} } }, pluginOptions({}))
  assert.deepEqual(servers.get("tavily-work"), {
    type: "remote",
    url: "https://mcp.tavily.com/mcp/",
    oauth: {},
    timeout: { execution: 900_000 },
  })
})
