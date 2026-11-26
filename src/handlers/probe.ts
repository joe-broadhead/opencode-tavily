/** `probe`: which OpenCode connection serves an account. It reads the server entry, never any web content. */
import { redactReason } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { refusal, RegisterError, type MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { connectionOwner, findServer, serverEntries, serverName, type ServerEntry } from "../provider/client.ts"
import { EMPTY, PROBE_OUTPUT } from "./shared.ts"
import type { HandlerRuntime } from "./index.ts"

/** The one-line reason of a host failure, redacted, for a refusal that may reach a person. */
function reasonOf(error: unknown): string {
  return redactReason(error instanceof Error ? error.message : String(error))
}

/**
 * `probe`: the account and OpenCode's connection identity for it.
 *
 * The owner is the MCP server OpenCode runs for the alias (`mcp:tavily-work`), not a Tavily account: the vendor's
 * server holds the sign-in and the plugin never sees it. `verified: false` says exactly that. `status` reports whether
 * the sign-in needs attention.
 */
export function probeHandler(runtime: HandlerRuntime): MethodHandler {
  return {
    description:
      "Read which OpenCode MCP connection serves a Tavily account: the account and its owner id. It reads no web content and proves no Tavily sign-in; read status for that.",
    input: EMPTY,
    output: PROBE_OUTPUT,
    async run(_input, call) {
      let entries: readonly ServerEntry[]
      try {
        entries = await serverEntries(runtime.mcp)
      } catch (error) {
        throw new RegisterError(refusal("UNAVAILABLE", `probe could not read OpenCode's MCP servers (${reasonOf(error)})`, "Read status, then try again; restart OpenCode if it keeps failing."))
      }
      const name = serverName(runtime.manifest.plugin.name, call.account)
      if (findServer(entries, name) === undefined) {
        throw new RegisterError(refusal("UNAVAILABLE", `OpenCode lists no ${name} server for ${call.account}`, "Read status; restart OpenCode if the server is still missing."))
      }
      return { account: call.account, owner: connectionOwner(runtime.manifest.plugin.name, runtime.manifest.plugin.title, call.account), trust: "untrusted" }
    },
  }
}
