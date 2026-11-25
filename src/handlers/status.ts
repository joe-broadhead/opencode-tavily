/**
 * `status`: what a person and an app read before anything else. It carries no web content and no credential, and it
 * costs no Tavily credits: it reads the manifest, OpenCode's MCP server list and the agents' rules.
 *
 * The answer is the contract's `statusAnswer` over `STATUS_SCHEMA`: the plugin and host identity, one entry per alias
 * from OpenCode's own server state, the agents that no longer hold the generated rules, and one next step.
 */
import { accountStatuses, accountsOf, redactReason, statusAnswer, STATUS_SCHEMA, type AccountSignal } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { signals } from "../provider/client.ts"
import { EMPTY } from "./shared.ts"
import type { HandlerRuntime } from "./index.ts"

/** `status`: every alias's sign-in state, the host range, the unguarded agents and one next step. */
export function statusHandler(runtime: HandlerRuntime): MethodHandler {
  return {
    description:
      "Read Tavily's version, OpenCode host, every account alias's sign-in state and any next step. It costs no Tavily credits and reads no web content.",
    input: EMPTY,
    output: STATUS_SCHEMA,
    async run(_input, call) {
      const plan = accountsOf(runtime.manifest, runtime.options)
      const problems: string[] = [...runtime.accountProblems]
      if (!plan.ok) problems.unshift(...plan.problems)
      const profiles = plan.ok ? plan.value.accounts : []
      let accountSignals: Record<string, AccountSignal>
      try {
        accountSignals = await signals(runtime.mcp, runtime.manifest.plugin.name, profiles.map((profile) => profile.alias))
      } catch (error) {
        // An unreadable server list is unknown, never zero: every alias is an error, and the plugin says so once.
        const reason = redactReason(error instanceof Error ? error.message : String(error))
        accountSignals = Object.fromEntries(profiles.map((profile) => [profile.alias, { state: "error", reason } satisfies AccountSignal]))
        problems.push(`OpenCode's MCP server list could not be read: ${reason}`)
      }
      const accounts = accountStatuses(profiles, accountSignals)

      let unguardedAgents: readonly string[] = []
      try {
        unguardedAgents = [...(await call.unguardedAgents())]
      } catch (error) {
        // An unreadable agent list is unknown, never zero: status says error, with a redacted next step.
        problems.unshift(redactReason(error instanceof Error ? error.message : String(error)))
      }

      return statusAnswer({
        manifest: runtime.manifest,
        version: runtime.version,
        hostVersion: runtime.hostVersion,
        accounts,
        problems,
        unguardedAgents,
      })
    },
  }
}
