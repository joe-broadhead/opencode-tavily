/**
 * The plugin's one entry: `Plugin.define({ id, setup })`, the host gate, the accounts, the skills, the web search
 * default, and one `register` call.
 *
 * `register` wires doors 1–3 from `handlers`, resolves accounts, generates the access rules and builds the bus writer.
 * This file never calls `ctx.tool`, `ctx.rpc` or `ctx.permission` itself.
 */
import { Plugin } from "@opencode/plugin"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { registerMcpAccounts } from "./accounts.ts"
import { handlersFor } from "./handlers/index.ts"
import { manifest, version } from "./manifest.ts"
import { pluginOptions } from "./options.ts"
import { readSkills, registerSkills } from "./skills.ts"
import { applyWebsearchDefault } from "./websearch.ts"

/** Dispose every registration in the order it was added; a failed dispose never hides the others. */
async function disposeAll(stops: readonly (() => Promise<void>)[]): Promise<void> {
  for (const stop of stops) await stop().catch(() => undefined)
}

export default Plugin.define({
  id: manifest.plugin.name,
  async setup(context) {
    assertHost(context, manifest)
    const options = context.options ?? {}
    const settings = pluginOptions(options)
    // Check every skill before anything registers, so a malformed file fails setup with one clear error.
    const skills = readSkills()

    // The vendor's MCP server holds the credentials: one server per alias, named tavily or tavily-<alias>.
    const accounts = await registerMcpAccounts(context, manifest, options, settings)

    const handlers = handlersFor({
      manifest,
      version,
      hostVersion: context.app.version,
      options,
      mcp: context.mcp,
      accountProblems: accounts.problems,
    })
    const registration = await register(context, manifest, handlers)

    const stops: (() => Promise<void>)[] = []
    try {
      const skillsRegistration = await registerSkills(context, skills)
      stops.push(() => skillsRegistration.dispose())
      const websearch = applyWebsearchDefault(context.websearch, settings.websearch)
      if (websearch !== undefined) {
        const websearchRegistration = await websearch
        stops.push(() => websearchRegistration.dispose())
      }
    } catch (error) {
      await disposeAll(stops)
      await registration.dispose().catch(() => undefined)
      throw error
    }
    stops.push(() => registration.dispose())
    return () => disposeAll(stops)
  },
})
