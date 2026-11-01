// The plugin on the embedded OpenCode host (see harness.ts): registration, status and RPC, the default permission rules
// through the host's own evaluation, the web search default, the user's own server and the key sign-in signal.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Tavily, type Status } from "../../src/rpc/index.js"
import { OAUTH_INTEGRATION_ID } from "../../src/connect.js"
import { formatStatus } from "../../src/status.js"
import { NEW_TOOL as FAKE_NEW_TOOL, RECORDED_TOOLS } from "./catalog.js"
import { startFakeTavily, type FakeTavily } from "./fake-tavily.js"
import { cleanup, HOST_VERSION, startHost, until, type Host } from "./harness.js"
import { schemaErrors } from "../schema.js"

// Starting a host takes seconds on a laptop and minutes in a slow container (see READY_MS in harness.ts).
setDefaultTimeout(300_000)
afterAll(cleanup)

type Rule = { action: string; resource: string; effect: "allow" | "ask" | "deny" }
const rule = (action: string, effect: Rule["effect"]): Rule => ({ action, resource: "*", effect })

const KNOWN_READS = ["search", "extract", "map", "crawl", "research"].map((tool) => `tavily_tavily_${tool}`)
/** The plugin's block: unknown Tavily tools ask, the five documented reads run. */
const BLOCK = [rule("tavily_*", "ask"), ...KNOWN_READS.map((action) => rule(action, "allow"))]
const BUILT_IN_AGENTS = ["build", "general", "explore", "compaction", "title", "summary", "plan"]
const NEW_TOOL = "tavily_tavily_feedback"
const OAUTH_INTEGRATION = /^mcp_[0-9a-f]{16}$/
const HOST = `OpenCode ${HOST_VERSION} (embedded SDK)`

/** The RPC's JSON Schema output is untyped on the client; the tests check it against the schema. */
const status = async (host: Host) => (await host.client.rpc(Tavily).status({}, { location: host.location })) as Status

async function tavilyServer(host: Host) {
  const { data } = await host.client.mcp.list({ location: host.location })
  return data.find((server) => server.name === "tavily")
}

/** The Tavily entries in /connect: the built-in key integration and, for OAuth, the server's own. */
async function tavilyIntegrations(host: Host) {
  const { data } = await host.client.integration.list({ location: host.location })
  return data.filter((integration) => integration.id === "tavily" || OAUTH_INTEGRATION.test(integration.id))
}

/** Waits until /connect lists the server's OAuth integration as "Tavily MCP", beside the built-in "Tavily". */
async function namedEntries(host: Host) {
  return until("/connect lists Tavily and Tavily MCP", async () => {
    const names = (await tavilyIntegrations(host)).map((integration) => integration.name).sort()
    return names.join() === "Tavily,Tavily MCP" ? names : undefined
  })
}

const sessions = new WeakMap<Host, Map<string, string>>()

async function session(host: Host, agent: string) {
  const known = sessions.get(host) ?? new Map<string, string>()
  sessions.set(host, known)
  const existing = known.get(agent)
  if (existing) return existing
  const { id } = await host.client.session.create({ agent, location: host.location })
  known.set(agent, id)
  return id
}

/** The host's own last-match evaluation for an MCP tool call, which asserts `<server>_<tool>` on resource `*`. */
async function effect(host: Host, agent: string, action: string) {
  const sessionID = await session(host, agent)
  return (await host.client.permission.create({ sessionID, agent, action, resources: ["*"], save: ["*"] })).effect
}

async function statusText(host: Host) {
  const sessionID = await session(host, "build")
  const before = (await host.client.session.inbox.list({ sessionID })).length
  await host.client.session.command({ sessionID, name: "tavily-status", text: "" })
  return until("/tavily-status posts its text", async () => {
    const inbox = await host.client.session.inbox.list({ sessionID })
    const posted = inbox.slice(before).findLast((item) => item.type === "synthetic")
    return posted?.type === "synthetic" ? posted.payload.text : undefined
  })
}

describe(`defaults on ${HOST}`, () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ config: { agents: { reviewer: { description: "Reviews changes", mode: "subagent" } } } })
  })
  afterAll(() => host?.close())

  test("the plugin is active and registers the tavily server, /tavily-status and both skills", async () => {
    const { data: plugins } = await host.client.plugin.list({ location: host.location })
    expect(plugins.find((entry) => entry.id === "tavily.web")?.state).toEqual({ status: "active" })
    const server = await tavilyServer(host)
    expect(server?.status.status).toBe("needs_auth")
    expect(server?.integrationID).toBe(OAUTH_INTEGRATION_ID)
    const { data: commands } = await host.client.command.list({ location: host.location })
    expect(commands.map((command) => command.name)).toContain("tavily-status")
    const { data: skills } = await host.client.skill.list({ location: host.location })
    expect(skills.map((skill) => skill.id).filter((id) => id.startsWith("tavily")).sort()).toEqual(["tavily", "tavily-research"])
  })

  test("OAuth is the sign-in: the server has its own OAuth integration, named Tavily MCP in /connect", async () => {
    const server = await tavilyServer(host)
    await namedEntries(host)
    const integrations = await tavilyIntegrations(host)
    const integrationID = server?.integrationID ?? "none"
    const oauth = integrations.find((integration) => integration.id === integrationID)
    expect(oauth?.methods.map((method) => method.type)).toEqual(["oauth"])
    expect(integrations.map((integration) => integration.id).sort()).toEqual([integrationID, "tavily"].sort())
  })

  test("the RPC status matches its schema, and /tavily-status shows the same status with the sign-in step", async () => {
    const current = await status(host)
    expect(schemaErrors(Tavily.methods.status.output, current)).toEqual([])
    expect(current).toMatchObject({
      connection: "needs_auth",
      auth: "oauth",
      websearchDefault: true,
      host: { version: HOST_VERSION, tested: true },
      unguardedAgents: ["reviewer"],
    })
    expect(current.tools).toEqual({ visible: 0, unknown: 0, unknownNames: [] })
    expect(current.permissionsBlock).toEqual(BLOCK)
    expect(current.nextStep).toBe("Run /connect and choose Tavily MCP to sign in, or choose Tavily to use an API key.")
    expect(await statusText(host)).toBe(formatStatus(current))
  })

  test("every built-in agent has the block right after its base allow, once; the config-only agent has none", async () => {
    const { data: agents } = await host.client.agent.list({ location: host.location })
    const rules = new Map(agents.map((agent) => [agent.id as string, agent.permissions as Rule[]]))
    for (const id of BUILT_IN_AGENTS) {
      const permissions = rules.get(id)
      expect(permissions?.[0]).toEqual(rule("*", "allow"))
      expect(permissions?.slice(1, 1 + BLOCK.length)).toEqual(BLOCK)
      expect(permissions?.filter((entry) => entry.action === "tavily_*")).toHaveLength(1)
    }
    expect(rules.get("reviewer")?.some((entry) => entry.action.startsWith("tavily_"))).toBe(false)
  })

  test("the host asks for a new Tavily tool, allows the known reads, and keeps Plan and Explore strict", async () => {
    expect(await effect(host, "build", NEW_TOOL)).toBe("ask")
    for (const action of KNOWN_READS) expect(await effect(host, "build", action)).toBe("allow")
    expect(await effect(host, "plan", NEW_TOOL)).toBe("ask")
    expect(await effect(host, "plan", "tavily_tavily_search")).toBe("allow")
    expect(await effect(host, "plan", "edit")).toBe("deny")
    expect(await effect(host, "explore", "tavily_tavily_search")).toBe("deny")
    expect(await effect(host, "explore", NEW_TOOL)).toBe("deny")
  })

  test("a saved 'Always allow' for the new tool wins over the block, and Explore stays denied", async () => {
    const sessionID = await session(host, "build")
    const asked = await host.client.permission.create({ sessionID, agent: "build", action: NEW_TOOL, resources: ["*"], save: ["*"] })
    expect(asked.effect).toBe("ask")
    await host.client.permission.reply({ sessionID, requestID: asked.id, decision: "always" })
    expect(await effect(host, "build", NEW_TOOL)).toBe("allow")
    expect(await effect(host, "build", "tavily_tavily_other")).toBe("ask")
    expect(await effect(host, "explore", NEW_TOOL)).toBe("deny")
  })

  test("with no websearch choice in config, Tavily serves web search", async () => {
    const { data } = await host.client.websearch.query({ location: host.location, query: "host test" })
    expect(data.providerID).toBe("tavily")
  })

  test("a key connected with /connect switches the server to the key, and removing it switches back to OAuth", async () => {
    const key = "tvly-host-test-connected-key"
    await host.client.integration.connect.key({ integrationID: "tavily", key, label: "Host test key", location: host.location })
    await until("the server drops OAuth", async () => (await tavilyServer(host))?.integrationID === undefined)
    expect(await status(host)).toMatchObject({ auth: "key_connected", account: "Host test key" })
    expect((await tavilyIntegrations(host)).map((integration) => integration.id)).toEqual(["tavily"])
    await expectKeyHidden(host, key)

    const credential = (await host.client.credential.list()).find((entry) => entry.integrationID === "tavily")
    await host.client.credential.remove({ credentialID: credential!.id })
    await until("the server returns to OAuth", async () => OAUTH_INTEGRATION.test((await tavilyServer(host))?.integrationID ?? ""))
    expect(await status(host)).toMatchObject({ auth: "oauth" })
    // OpenCode registers the OAuth integration again on the reload; the plugin names it again.
    await namedEntries(host)
  })
})

describe(`user config on ${HOST}`, () => {
  const userRules = [rule(NEW_TOOL, "allow")]
  let fake: FakeTavily
  let host: Host
  beforeAll(async () => {
    fake = await startFakeTavily([...RECORDED_TOOLS, FAKE_NEW_TOOL])
    host = await startHost({
      config: {
        mcp: { servers: { tavily: { type: "remote", url: fake.url, oauth: false, headers: { "x-tavily-host-test": "user" } } } },
        permissions: userRules,
        websearch: { provider: "fakeprobe" },
        // The fix status gives for a config-only agent: the block first in its own rules, then the user's rules again.
        agents: { reviewer: { description: "Reviews changes", mode: "subagent", permissions: [...BLOCK, ...userRules] } },
      },
    })
  })
  afterAll(async () => {
    await host?.close()
    await fake?.close()
  })

  test("the user's own tavily server is kept unchanged", async () => {
    expect((await tavilyServer(host))?.status).toEqual({ status: "connected" })
    expect(fake.requests.map((request) => request.method)).toContain("tools/list")
    expect(new Set(fake.requests.map((request) => request.marker))).toEqual(new Set(["user"]))
    expect(await status(host)).toMatchObject({ connection: "connected", auth: "user_server" })
  })

  test("status counts the server's tools that OpenCode lists and names the unknown one", async () => {
    // OpenCode adds a server's tools to its registry after the server connects.
    await until("OpenCode lists the server's tools", async () => ((await status(host)).tools.visible > 0 ? true : undefined))
    expect((await status(host)).tools).toEqual({ visible: 6, unknown: 1, unknownNames: ["tavily_feedback"] })
  })

  test("a user permissions allow for a new tool wins; other new tools still ask", async () => {
    expect(await effect(host, "build", NEW_TOOL)).toBe("allow")
    expect(await effect(host, "build", "tavily_tavily_other")).toBe("ask")
    expect(await effect(host, "plan", "edit")).toBe("deny")
  })

  test("the per-agent fix guards a config-only agent and keeps the user's rule winning", async () => {
    expect(await effect(host, "reviewer", "tavily_tavily_other")).toBe("ask")
    expect(await effect(host, "reviewer", NEW_TOOL)).toBe("allow")
    expect(await effect(host, "reviewer", "tavily_tavily_search")).toBe("allow")
    expect((await status(host)).unguardedAgents).toBeUndefined()
  })

  test("a websearch choice in config still serves web search", async () => {
    const { data } = await host.client.websearch.query({ location: host.location, query: "host test" })
    expect(data.providerID).toBe("fakeprobe")
  })
})

describe(`TAVILY_API_KEY on ${HOST}`, () => {
  const key = "tvly-host-test-env-key"
  let host: Host
  beforeAll(async () => {
    host = await startHost({ env: { TAVILY_API_KEY: key } })
  })
  afterAll(() => host?.close())

  test("turns OAuth off: the server has no OAuth integration, and status reports the key", async () => {
    const server = await tavilyServer(host)
    expect(server).toBeDefined()
    expect(server?.integrationID).toBeUndefined()
    const integrations = await tavilyIntegrations(host)
    expect(integrations.map((integration) => integration.id)).toEqual(["tavily"])
    expect(integrations[0]?.connections).toEqual([expect.objectContaining({ type: "env", name: "TAVILY_API_KEY" })])
    const current = await status(host)
    expect(current).toMatchObject({ auth: "key_env", websearchDefault: true })
    expect(current.account).toBeUndefined()
  })

  test("the key appears in no client API, status or command output", async () => {
    await expectKeyHidden(host, key)
  })
})

async function expectKeyHidden(host: Host, key: string) {
  const location = { location: host.location }
  const outputs = await Promise.all([
    host.client.mcp.list(location),
    host.client.integration.list(location),
    host.client.config.get(location),
    host.client.agent.list(location),
    host.client.plugin.list(location),
    status(host),
    statusText(host),
  ])
  for (const output of outputs) expect(JSON.stringify(output)).not.toContain(key)
}
