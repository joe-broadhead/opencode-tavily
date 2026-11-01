import { describe, expect, test } from "bun:test"
import type { Plugin } from "@opencode/plugin"
import { OAUTH_INTEGRATION_ID, OAUTH_NAME, watchConnect } from "../../src/connect.js"
import type { ServerState } from "../../src/mcp.js"
import { envConnection, events, keyConnection, LOCATION, settle, type Connection, type EditorOf, type McpServer } from "./fake.js"

type Editor = EditorOf<Plugin.Context["integration"]>
type Status = Parameters<Plugin.Context["integration"]["connection"]["status"]>[0]

/** The host's integration registry: it replays transforms in registration order over a fresh `tavily` name. */
function host(input: { oauth?: boolean; connection?: Connection; server?: McpServer["status"]["status"] } = {}) {
  const transforms: { callback: (editor: Editor) => void; disposed: boolean }[] = []
  const statuses: Status[] = []
  const state = { server: input.server ?? "connected", oauth: input.oauth ?? true }
  const name = () => {
    let current = "tavily"
    const editor = {
      get: (id: string) => (id === OAUTH_INTEGRATION_ID ? { id, name: current } : undefined),
      update: (_id: string, update: (ref: { id: string; name: string }) => void) => {
        const ref = { id: OAUTH_INTEGRATION_ID, name: current }
        update(ref)
        current = ref.name
      },
    } as unknown as Editor
    for (const entry of transforms) if (!entry.disposed) entry.callback(editor)
    return current
  }
  const integration: Pick<Plugin.Context["integration"], "get" | "transform" | "connection"> = {
    get: async ({ integrationID }) => {
      if (!state.oauth || integrationID !== OAUTH_INTEGRATION_ID) throw new Error("integration not found")
      return { location: LOCATION, data: { id: integrationID, name: name() } } as never
    },
    transform: async (callback) => {
      const entry = { callback, disposed: false }
      transforms.push(entry)
      return { dispose: async () => void (entry.disposed = true) }
    },
    connection: {
      active: async () => input.connection,
      resolve: async () => undefined,
      status: async (status) => void statuses.push(status),
    },
  }
  const mcp = { list: async () => ({ location: LOCATION, data: [{ name: "tavily", status: { status: state.server } } as McpServer] }) }
  /** OpenCode registering the server's integration again, as it does on every MCP reload. */
  const reregister = () =>
    transforms.push({ callback: (editor) => editor.update(OAUTH_INTEGRATION_ID, (ref) => void (ref.name = "tavily")), disposed: false })
  return { integration, mcp, state, statuses, name, reregister, live: () => transforms.filter((entry) => !entry.disposed).length }
}

function start(fake: ReturnType<typeof host>, server: ServerState) {
  const stream = events()
  const controller = new AbortController()
  const done = watchConnect({ event: stream.domain, integration: fake.integration, mcp: fake.mcp }, server, controller.signal)
  return { stream, stop: () => (controller.abort(), done) }
}

const oauth: ServerState = { key: undefined, userServer: false }

describe("the Tavily MCP name in /connect", () => {
  test("names the server's OAuth integration, and names it again after OpenCode re-registers it", async () => {
    const fake = host()
    fake.reregister()
    const watch = start(fake, oauth)
    await settle()
    expect(fake.name()).toBe(OAUTH_NAME)
    fake.reregister()
    expect(fake.name()).toBe("tavily")
    watch.stream.push("integration.updated")
    await settle()
    expect(fake.name()).toBe(OAUTH_NAME)
    // The host's two registrations and one rename: the earlier rename is disposed.
    expect(fake.live()).toBe(3)
    await watch.stop()
    expect(fake.live()).toBe(2)
  })

  test("leaves a user's own server and a key-only setup alone", async () => {
    for (const [fake, server] of [
      [host(), { key: undefined, userServer: true }],
      [host({ oauth: false }), oauth],
    ] as const) {
      const watch = start(fake, server)
      watch.stream.push("integration.updated")
      await settle()
      expect(fake.live()).toBe(0)
      await watch.stop()
    }
  })
})

describe("a rejected key in /connect", () => {
  const connected: ServerState = { key: { key: "tvly-bad", source: "connected", label: "Tavily" }, userServer: false }

  test("marks the Tavily entry sign-in required, and clears it once the server connects", async () => {
    const fake = host({ oauth: false, connection: keyConnection(), server: "needs_auth" })
    const watch = start(fake, connected)
    watch.stream.push("mcp.status.changed", { server: "other" })
    watch.stream.push("mcp.status.changed", { server: "tavily" })
    watch.stream.push("mcp.status.changed", { server: "tavily" })
    await settle()
    expect(fake.statuses).toEqual([
      {
        integrationID: "tavily",
        connection: keyConnection(),
        status: { status: "needs_auth", message: "Tavily did not accept this API key. Replace it, or remove it to sign in with Tavily MCP." },
      },
    ])
    fake.state.server = "connected"
    watch.stream.push("mcp.status.changed", { server: "tavily" })
    await settle()
    expect(fake.statuses.at(-1)).toEqual({ integrationID: "tavily", connection: keyConnection(), status: undefined })
    expect(JSON.stringify(fake.statuses)).not.toContain("tvly-bad")
    await watch.stop()
  })

  test("never marks an environment key or OAuth", async () => {
    for (const [connection, server] of [
      [envConnection(), { key: { key: "tvly-env", source: "env" }, userServer: false }],
      [undefined, oauth],
    ] as const) {
      const fake = host({ oauth: false, connection, server: "needs_auth" })
      const watch = start(fake, server)
      watch.stream.push("mcp.status.changed", { server: "tavily" })
      await settle()
      expect(fake.statuses).toEqual([])
      await watch.stop()
    }
  })
})
