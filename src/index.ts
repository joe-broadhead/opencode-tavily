import { Plugin } from "@opencode/plugin"
import { watchConnect } from "./connect.js"
import { checkHost } from "./host-version.js"
import { keyChecker } from "./key-check.js"
import { registerToolsRpc } from "./host/tools-rpc.js"
import { readKey, registerServer, SERVER_NAME, watchKey, type ServerState } from "./mcp.js"
import { parseOptions } from "./options.js"
import { registerDefaultRules } from "./permissions.js"
import { Tavily } from "./rpc/index.js"
import { loadSkills, registerSkills } from "./skills.js"
import { readStatus, registerStatusCommand, unavailable } from "./status.js"
import { selectWebsearchDefault, type WebsearchState } from "./websearch.js"

const warn = (message: string) => console.warn(message)

export default Plugin.define({
  id: "tavily.web",
  async setup(ctx) {
    // Options first: they hold the host check's override. Validation has no side effects.
    const options = parseOptions(ctx.options)
    const host = checkHost(ctx.app.version, options.allowUntestedHost, warn)
    const skills = await loadSkills()
    const server: ServerState = { key: await readKey(ctx.integration, undefined, warn), userServer: false }
    const websearch: WebsearchState = { tavilyDefault: false }
    const checkKey = keyChecker()
    // Ask Tavily about the key now, so status has the answer; the check never throws.
    if (server.key) void checkKey(server.key.key)

    await registerServer(ctx.mcp, server, options.executionTimeoutMs)
    await registerDefaultRules(ctx.agent)
    if (options.websearch) await selectWebsearchDefault(ctx.websearch, websearch)
    await registerSkills(ctx.skill, skills)
    const read = () => readStatus(ctx, { server, websearch, host, checkKey })
    await registerStatusCommand(ctx, read)
    await ctx.rpc.register(Tavily, {
      status: (_input, { error }) =>
        read().catch((cause: unknown) => {
          const { message, nextStep } = unavailable(cause)
          return error("unavailable", message, { nextStep })
        }),
    })

    // Scripts call the five tools with no model, as a session and its agent; a user's own server is not the plugin's.
    const stopTools = await registerToolsRpc(ctx, { mcp: { server: SERVER_NAME, managed: () => !server.userServer } })

    const controller = new AbortController()
    void watchKey(ctx, server, controller.signal, warn)
    void watchConnect(ctx, server, checkKey, controller.signal)
    return async () => {
      controller.abort()
      await stopTools()
    }
  },
})
