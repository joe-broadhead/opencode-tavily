/**
 * The provider: Tavily's hosted MCP server, as OpenCode runs it.
 *
 * The vendor's server owns the tools and the account. This module is the one place the plugin names Tavily's endpoint,
 * and the one place it reads OpenCode's MCP server list, so `status` and `probe` answer from the host's own view
 * rather than a copy. The plugin makes no network call itself.
 */
import type { AccountSignal, MCPServerConfig } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { accountLabel, accountName, redactReason } from "@we-the-rebel-alliance/plugin-contract/accounts"

/** Tavily's hosted MCP server. One server per alias uses it; the plugin adds no path and no query. */
export const MCP_URL = "https://mcp.tavily.com/mcp/"

/** One MCP server's state, as OpenCode reports it. The strings are the host's; an unknown one is an error for status. */
export interface ServerStatus {
  readonly status: string
  readonly error?: string | undefined
}

/** One MCP server entry from `ctx.mcp.list()`. */
export interface ServerEntry {
  readonly name: string
  readonly status: ServerStatus
}

/** The live read of OpenCode's MCP servers: one `list()` call, never a cached copy. */
export interface ServerList {
  list(): Promise<{ readonly data: readonly ServerEntry[] }>
}

/** What the per-alias server config sets: how long one call may run. */
export interface ServerConfigInput {
  /** The MCP server's `timeout.execution`, from the plugin's `executionTimeoutMs`. */
  readonly executionTimeoutMs: number
}

/**
 * The MCP server config for one alias. OpenCode keys OAuth per server, so two aliases are two independent sign-ins.
 *
 * Only the fields 2.4.1's remote config defines: the server name (`tavily`, `tavily-work`) is what tells aliases
 * apart, because that config has no display-title field.
 */
export function serverConfig(input: ServerConfigInput): MCPServerConfig {
  return {
    type: "remote",
    url: MCP_URL,
    oauth: {},
    timeout: { execution: input.executionTimeoutMs },
  }
}

/** The MCP server name for one alias: `tavily` for `default`, `tavily-<alias>` otherwise. */
export function serverName(plugin: string, alias: string): string {
  return accountName(plugin, alias)
}

/** OpenCode's own connection identity for an alias: the MCP server it runs, not a Tavily account. */
export interface ConnectionOwner {
  readonly id: string
  readonly label: string
  readonly verified: false
}

/** The owner `probe` reports: `mcp:<server name>`, labelled by the vendor's title and the alias. */
export function connectionOwner(plugin: string, title: string, alias: string): ConnectionOwner {
  return { id: `mcp:${serverName(plugin, alias)}`, label: accountLabel(title, alias), verified: false }
}

/** OpenCode's MCP servers, or a refusal when the host cannot list them. */
export async function serverEntries(mcp: ServerList): Promise<readonly ServerEntry[]> {
  return (await mcp.list()).data
}

/** The entry with this name, or undefined when OpenCode lists no such server. */
export function findServer(entries: readonly ServerEntry[], name: string): ServerEntry | undefined {
  return entries.find((entry) => entry.name === name)
}

/**
 * One MCP server state as the contract's account signal.
 *
 * A failure's reason is redacted and cut to 160 characters here, so nothing the host printed can carry a credential
 * into status. A state the host adds later is an error, never `ready`.
 */
export function signalFor(entry: ServerEntry | undefined): AccountSignal {
  if (entry === undefined) return { state: "error", reason: "OpenCode lists no such server" }
  const status = entry.status
  switch (status.status) {
    case "connected":
      return { state: "ready" }
    case "needs_auth":
      return { state: "needs_sign_in" }
    case "failed":
      return { state: "error", reason: redactReason(status.error ?? "the server failed") }
    case "disabled":
      return { state: "error", reason: "the server is disabled" }
    case "pending":
      return { state: "error", reason: "the server is still connecting" }
    default:
      return { state: "error", reason: redactReason(`the server reports ${status.status}`) }
  }
}

/**
 * Every alias's signal, from one live read of OpenCode's server list.
 *
 * A host that cannot list its MCP servers throws, and the caller owns the answer: `status` turns a failed read into an
 * error for every declared alias and one problem, because an answer it does not have is unknown, never `ready`.
 */
export async function signals(mcp: ServerList, plugin: string, aliases: readonly string[]): Promise<Record<string, AccountSignal>> {
  const entries = await serverEntries(mcp)
  return Object.fromEntries(aliases.map((alias) => [alias, signalFor(findServer(entries, serverName(plugin, alias)))]))
}
