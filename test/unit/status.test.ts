import { describe, expect, test } from "bun:test"
import { DEFAULT_RULES, type Rule } from "../../src/permissions.js"
import type { Status } from "../../src/rpc/index.js"
import {
  buildStatus,
  formatStatus,
  readStatus,
  registerStatusCommand,
  unavailable,
  type StatusFacts,
} from "../../src/status.js"
import {
  agent,
  integration,
  keyConnection,
  LOCATION,
  transforms,
  type AgentInfo,
  type EditorOf,
  type McpServer,
} from "./fake.js"
import type { Plugin } from "@opencode/plugin"

const BASE: Rule = { action: "*", resource: "*", effect: "allow" }
const guarded = { id: "build", permissions: [BASE, ...DEFAULT_RULES] }
const HOST = { version: "2.2.3", tested: true }
const KNOWN = ["search", "extract", "map", "crawl", "research"].map((name) => ({ id: `tavily_tavily_${name}` }))
const FIVE = { visible: 5, unknown: 0, unknownNames: [] }
const NONE = { visible: 0, unknown: 0, unknownNames: [] }

const facts = (overrides: Partial<StatusFacts> = {}): StatusFacts => ({
  server: { status: "connected" },
  userServer: false,
  tools: KNOWN,
  websearchDefault: true,
  host: HOST,
  agents: [guarded],
  ...overrides,
})

describe("buildStatus", () => {
  test("connected through OAuth is ready, with the account label", () => {
    expect(buildStatus(facts({ oauthAccount: "jo@example.com" }))).toEqual({
      connection: "connected",
      auth: "oauth",
      account: "jo@example.com",
      tools: FIVE,
      websearchDefault: true,
      host: HOST,
      nextStep: "Nothing to do.",
    })
  })

  test("counts the tavily server's tools and names the unknown ones", () => {
    const tools = [...KNOWN, { id: "tavily_tavily_feedback" }, { id: "tavily_Bad Name" }, { id: "read" }, { id: "other_tavily_search" }]
    expect(buildStatus(facts({ tools })).tools).toEqual({ visible: 7, unknown: 2, unknownNames: ["tavily_feedback"] })
    expect(buildStatus(facts({ tools: [] })).tools).toEqual(NONE)
  })

  test("a connected key reports its credential label", () => {
    const status = buildStatus(facts({ key: { key: "tvly-secret", source: "connected", label: "Tavily" } }))
    expect(status).toMatchObject({ auth: "key_connected", account: "Tavily" })
    expect(status.nextStep).toBe("Nothing to do.")
  })

  test("an environment key has no account", () => {
    const status = buildStatus(facts({ key: { key: "tvly-secret", source: "env" }, oauthAccount: "ignored" }))
    expect(status.auth).toBe("key_env")
    expect(status).not.toHaveProperty("account")
  })

  test("a user's own server is reported, whatever key exists", () => {
    const status = buildStatus(facts({ userServer: true, key: { key: "tvly-secret", source: "env" }, oauthAccount: "me" }))
    expect(status).toMatchObject({ auth: "user_server", account: "me" })
  })

  test("needs sign-in, for each auth source", () => {
    const needsAuth = { server: { status: "needs_auth" } } as const
    expect(buildStatus(facts(needsAuth)).nextStep).toBe(
      "Run /connect and choose Tavily MCP to sign in, or choose Tavily to use an API key.",
    )
    expect(buildStatus(facts({ ...needsAuth, userServer: true })).nextStep).toBe(
      "Run /connect and choose tavily to sign in to your own server.",
    )
    expect(buildStatus(facts({ ...needsAuth, key: { key: "k", source: "env" } })).nextStep).toBe(
      "Tavily did not accept the API key: replace TAVILY_API_KEY and restart OpenCode.",
    )
    expect(buildStatus(facts({ ...needsAuth, key: { key: "k", source: "connected" } })).nextStep).toBe(
      "Tavily did not accept the API key: run /connect, choose Tavily and replace the key.",
    )
  })

  test("failed, with and without a key", () => {
    expect(buildStatus(facts({ server: { status: "failed" } })).nextStep).toBe(
      `Run "opencode mcp list" to see the error, and check your network.`,
    )
    expect(buildStatus(facts({ server: { status: "failed" }, key: { key: "k", source: "env" } })).nextStep).toBe(
      "Check your network. If it works, replace TAVILY_API_KEY and restart OpenCode.",
    )
  })

  test("pending, disabled and not registered", () => {
    expect(buildStatus(facts({ server: { status: "pending" } })).nextStep).toBe("Wait a few seconds, then run /tavily-status again.")
    expect(buildStatus(facts({ server: { status: "disabled" } })).nextStep).toBe(
      `Enable the tavily server in /mcps, or remove "disabled": true from mcp.servers.tavily in opencode.json.`,
    )
    const missing = buildStatus(facts({ server: undefined }))
    expect(missing).toMatchObject({ connection: "not_registered", auth: "none" })
    expect(missing.nextStep).toBe(
      `Check that no other plugin or policy removes the "tavily" MCP server, then run "opencode reload".`,
    )
  })

  test("names agents that miss the default rules, with the block to paste and the per-agent fix", () => {
    const configOnly = { id: "reviewer", permissions: [BASE] }
    const other = { id: "docs/writer", permissions: [BASE] }
    const strict = { id: "readonly", permissions: [BASE, { action: "*", resource: "*", effect: "deny" } as const] }
    const status = buildStatus(facts({ agents: [guarded, configOnly, other, strict] }))
    expect(status.unguardedAgents).toEqual(["reviewer", "docs/writer"])
    expect(status.permissionsBlock).toEqual(DEFAULT_RULES)
    expect(status.nextStep).toBe(
      "Put the block first in each listed agent's own permissions, in opencode.json or the agent's Markdown file, followed by your top-level permissions rules for tavily_* actions.",
    )
    // Sign-in comes first; the agents and the block stay listed.
    const signIn = buildStatus(facts({ server: { status: "needs_auth" }, agents: [configOnly] }))
    expect(signIn).toMatchObject({ unguardedAgents: ["reviewer"], permissionsBlock: DEFAULT_RULES })
    expect(signIn.nextStep).toStartWith("Run /connect and choose Tavily MCP")
  })

  test("the block counts anywhere after the base allow, even after another plugin's block, but not before it", () => {
    const other = { action: "linear_*", resource: "*", effect: "ask" } as const
    const behind = { id: "build", permissions: [BASE, other, ...DEFAULT_RULES] }
    const before = { id: "custom", permissions: [...DEFAULT_RULES, BASE] }
    expect(buildStatus(facts({ agents: [behind, before] })).unguardedAgents).toEqual(["custom"])
  })

  test("an agent fixed through its own permissions is no longer named", () => {
    // The host's order for a config-only agent: the base rules, the top-level rules, then the agent's own rules.
    const topLevel = { action: "tavily_tavily_research", resource: "*", effect: "ask" } as const
    const fixed = { id: "reviewer", permissions: [BASE, { action: "read", resource: "*.env", effect: "ask" } as const, topLevel, ...DEFAULT_RULES, topLevel] }
    expect(buildStatus(facts({ agents: [fixed] }))).not.toHaveProperty("unguardedAgents")
  })

  test("an untested host is reported once everything else is ready", () => {
    const status = buildStatus(facts({ host: { version: "3.0.0", tested: false } }))
    expect(status.host).toEqual({ version: "3.0.0", tested: false })
    expect(status.nextStep).toBe("If Tavily misbehaves, use OpenCode 2.2.3 or a later 2.2 release.")
  })

  test("never carries the key", () => {
    for (const source of ["connected", "env"] as const)
      for (const status of ["connected", "needs_auth", "failed"] as const)
        expect(JSON.stringify(buildStatus(facts({ server: { status }, key: { key: "tvly-secret", source, label: "Tavily" } })))).not.toContain(
          "tvly-secret",
        )
  })
})

describe("readStatus", () => {
  const server = (entry: McpServer) => ({ list: async () => ({ location: LOCATION, data: [entry] }) })
  const agents = (data: AgentInfo[]) => ({ list: async () => ({ location: LOCATION, data }) })
  const tool = { list: async () => [...KNOWN, { id: "tavily_tavily_feedback" }] as never }
  const state = {
    server: { key: undefined, userServer: false },
    websearch: { tavilyDefault: true },
    host: HOST,
  }

  test("reads the server, the OAuth account and the agents through public APIs", async () => {
    const credentials = integration({ connection: keyConnection("jo@example.com") })
    const status = await readStatus(
      {
        mcp: server({ name: "tavily", status: { status: "connected" }, integrationID: "mcp_abc" }),
        integration: credentials.domain,
        agent: agents([agent("reviewer")]),
        tool,
      },
      state,
    )
    expect(status).toMatchObject({
      connection: "connected",
      auth: "oauth",
      account: "jo@example.com",
      tools: { visible: 6, unknown: 1, unknownNames: ["tavily_feedback"] },
      unguardedAgents: ["reviewer"],
    })
  })

  test("a failed account lookup leaves the rest of the status intact", async () => {
    const credentials = integration({})
    credentials.state.failActive = new Error("store locked")
    const status = await readStatus(
      {
        mcp: server({ name: "tavily", status: { status: "needs_auth", error: "401" }, integrationID: "mcp_abc" }),
        integration: credentials.domain,
        agent: agents([]),
        tool,
      },
      state,
    )
    expect(status).toMatchObject({ connection: "needs_auth", auth: "oauth" })
    expect(status).not.toHaveProperty("account")
  })

  test("another server name is not Tavily", async () => {
    const status = await readStatus(
      { mcp: server({ name: "other", status: { status: "connected" } }), integration: integration({}).domain, agent: agents([]), tool },
      state,
    )
    expect(status.connection).toBe("not_registered")
  })
})

describe("formatStatus", () => {
  test("renders every field in the view's order, with the block to paste", () => {
    const status: Status = {
      connection: "needs_auth",
      auth: "oauth",
      tools: { visible: 6, unknown: 1, unknownNames: ["tavily_feedback"] },
      websearchDefault: true,
      host: HOST,
      unguardedAgents: ["reviewer"],
      permissionsBlock: DEFAULT_RULES.slice(0, 2),
      nextStep: "Sign in.",
    }
    expect(formatStatus(status)).toBe(
      [
        "Tavily status",
        "- Connection: sign-in required",
        "- Account: none",
        "- Access: read only: search, extract, map, crawl and research",
        "- Sign-in: OAuth (/connect → Tavily MCP)",
        `- Web search: Tavily, unless opencode.json sets "websearch"`,
        "- Tools: 6 available, 1 unknown (they ask first): tavily_feedback",
        "- Agents without default rules: reviewer. New Tavily tools run there without asking. The block:",
        `  {"action":"tavily_*","resource":"*","effect":"ask"},`,
        `  {"action":"tavily_tavily_search","resource":"*","effect":"allow"}`,
        "- OpenCode: 2.2.3 (tested)",
        "- Next step: Sign in.",
      ].join("\n"),
    )
  })

  test("a ready status ends with one next step: Nothing to do.", () => {
    const text = formatStatus({
      connection: "connected",
      auth: "key_connected",
      account: "Tavily",
      tools: NONE,
      websearchDefault: false,
      host: HOST,
      nextStep: "Nothing to do.",
    })
    expect(text).toContain("- Account: Tavily")
    expect(text).toContain("- Sign-in: API key (/connect → Tavily)")
    expect(text).toContain("- Tools: none listed yet")
    expect(text).toContain("- Web search: not set by this plugin")
    expect(text).toContain("- Agents without default rules: none")
    expect(text.split("\n").filter((line) => line.startsWith("- Next step:"))).toEqual(["- Next step: Nothing to do."])
  })
})

describe("/tavily-status", () => {
  async function command(read: () => Promise<Status>) {
    const commands = transforms<EditorOf<Plugin.Context["command"]>>()
    const posted: Parameters<Plugin.Context["session"]["synthetic"]>[0][] = []
    await registerStatusCommand(
      {
        command: commands,
        session: {
          synthetic: async (input) => {
            posted.push(input)
            return {} as never
          },
        },
      },
      read,
    )
    const added: Parameters<EditorOf<Plugin.Context["command"]>["add"]>[0][] = []
    commands.run({ add: (definition) => void added.push(definition) })
    return { added, posted }
  }

  test("posts the status as a synthetic message without starting a model turn", async () => {
    const ready: Status = { connection: "connected", auth: "oauth", tools: FIVE, websearchDefault: true, host: HOST, nextStep: "Nothing to do." }
    const { added, posted } = await command(async () => ready)
    expect(added.map((definition) => definition.name)).toEqual(["tavily-status"])
    await added[0]?.execute({ sessionID: "ses_1" as never, prompt: { text: "" }, delivery: "steer" })
    expect(posted).toEqual([{ sessionID: "ses_1", text: formatStatus(ready), description: "Tavily status", resume: false }])
  })

  test("reports an unreadable status with a code and a next step", async () => {
    const { added, posted } = await command(async () => {
      throw new Error("mcp list failed")
    })
    await added[0]?.execute({ sessionID: "ses_1" as never, prompt: { text: "" }, delivery: "steer" })
    expect(posted[0]?.text).toBe(
      "STATUS_UNAVAILABLE: Could not read Tavily's status (mcp list failed). Next step: Run /tavily-status again, and restart OpenCode if it keeps failing.",
    )
    expect(unavailable("x").nextStep).toBe("Run /tavily-status again, and restart OpenCode if it keeps failing.")
  })
})
