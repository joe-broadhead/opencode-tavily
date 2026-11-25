/**
 * The account wiring for the `mcp` mechanism: one vendor MCP server per alias, through the contract's `accounts`
 * module.
 *
 * OpenCode holds the credentials and keys OAuth per MCP server. This module only supplies the server config Tavily's
 * server needs, named `<plugin>` for `default` and `<plugin>-<alias>` for every other alias. The plugin stores no
 * credential and reads none.
 */
import type { Plugin } from "@opencode/plugin"
import { registerAccounts, type AccountsRegistration } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { serverConfig } from "./provider/client.ts"
import type { PluginOptions } from "./options.ts"

/** The context part registration needs: the two transforms a plugin's setup context has. */
export type AccountsContext = Pick<Plugin.Context, "integration" | "mcp">

/**
 * Register one MCP server per alias and return what was registered, with any problem for `status`.
 *
 * The contract's module sets each alias's server config over an entry already named `<plugin>` or `<plugin>-<alias>`,
 * so the plugin owns the servers it names. A user entry under one of those names is replaced; use another name for a
 * server of your own.
 */
export function registerMcpAccounts(
  context: AccountsContext,
  manifest: Manifest,
  options: Readonly<Record<string, unknown>>,
  settings: PluginOptions,
): Promise<AccountsRegistration> {
  return registerAccounts(context, {
    manifest,
    options,
    server: (_account, _name) => serverConfig({ executionTimeoutMs: settings.executionTimeoutMs }),
  })
}
