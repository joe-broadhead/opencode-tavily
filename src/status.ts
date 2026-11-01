import type { Plugin } from "@opencode/plugin"
import type { TavilyKey } from "./credential.js"
import type { HostCheck } from "./host-version.js"
import { SERVER_NAME, type ServerState } from "./mcp.js"
import { DEFAULT_RULES, evaluate, hasDefaultRules, KNOWN_READS, type Rule } from "./permissions.js"
import {
  ACCESS_TEXT,
  accountText,
  agentsText,
  AUTH_LABELS,
  blockLines,
  CONNECTION_LABELS,
  hostText,
  toolsText,
  websearchText,
  type Status,
} from "./rpc/index.js"
import type { WebsearchState } from "./websearch.js"

/**
 * The fix for agents that miss the inserted rules: the block first in each agent's own `permissions`, then the
 * user's top-level Tavily rules again, because an agent's own rules come after the top-level ones. The top-level
 * `permissions` are no fix: they come after Explore's `* * deny` too, so they would loosen Explore.
 */
const AGENT_FIX =
  "Put the block first in each listed agent's own permissions, in opencode.json or the agent's Markdown file, followed by your top-level permissions rules for tavily_* actions."

/** Everything status depends on, gathered from public host APIs and the plugin's own state. */
export interface StatusFacts {
  readonly server?: { readonly status: Exclude<Status["connection"], "not_registered"> }
  readonly userServer: boolean
  readonly key?: TavilyKey
  /** The OAuth credential label of the server's integration. */
  readonly oauthAccount?: string
  /** Every tool OpenCode lists; status counts the `tavily` server's. */
  readonly tools: readonly { readonly id: string }[]
  readonly websearchDefault: boolean
  readonly host: HostCheck
  readonly agents: readonly { readonly id: string; readonly permissions: readonly Rule[] }[]
}

const TOOL_PREFIX = `${SERVER_NAME}_`
const LISTED_UNKNOWN = 20
// A tool name comes from the server; list only plain names.
const SAFE_NAME = /^[a-z][a-z0-9_]{0,63}$/

function toolsOf(facts: StatusFacts): Status["tools"] {
  const ids = facts.tools.map((tool) => tool.id).filter((id) => id.startsWith(TOOL_PREFIX))
  const unknown = ids.filter((id) => !KNOWN_READS.includes(id)).map((id) => id.slice(TOOL_PREFIX.length))
  const unknownNames = unknown.filter((name) => SAFE_NAME.test(name)).slice(0, LISTED_UNKNOWN)
  return { visible: ids.length, unknown: unknown.length, unknownNames }
}

function authOf(facts: StatusFacts): Status["auth"] {
  if (!facts.server) return "none"
  if (facts.userServer) return "user_server"
  if (!facts.key) return "oauth"
  return facts.key.source === "env" ? "key_env" : "key_connected"
}

function nextStepOf(connection: Status["connection"], auth: Status["auth"], facts: StatusFacts, unguarded: string[]) {
  const replaceKey =
    auth === "key_env" ? "replace TAVILY_API_KEY and restart OpenCode" : "run /connect, choose Tavily and replace the key"
  switch (connection) {
    case "not_registered":
      return `Check that no other plugin or policy removes the "tavily" MCP server, then run "opencode reload".`
    case "disabled":
      return `Enable the tavily server in /mcps, or remove "disabled": true from mcp.servers.tavily in opencode.json.`
    case "pending":
      return `Wait a few seconds, then run /tavily-status again.`
    case "needs_auth":
      if (auth === "oauth") return `Run /connect and choose Tavily MCP to sign in, or choose Tavily to use an API key.`
      if (auth === "user_server") return `Run /connect and choose tavily to sign in to your own server.`
      return `Tavily did not accept the API key: ${replaceKey}.`
    case "failed":
      if (auth === "key_env" || auth === "key_connected") return `Check your network. If it works, ${replaceKey}.`
      return `Run "opencode mcp list" to see the error, and check your network.`
  }
  if (unguarded.length > 0) return AGENT_FIX
  if (!facts.host.tested) return `If Tavily misbehaves, use OpenCode 2.2.3 or a later 2.2 release.`
  return "Nothing to do."
}

export function buildStatus(facts: StatusFacts): Status {
  const connection = facts.server?.status ?? "not_registered"
  const auth = authOf(facts)
  const account = auth === "key_connected" ? facts.key?.label : auth === "key_env" ? undefined : facts.oauthAccount
  const unguarded = facts.agents
    .filter((agent) => !hasDefaultRules(agent.permissions) && evaluate(agent.permissions, "tavily_unknown") === "allow")
    .map((agent) => agent.id)
  const nextStep = nextStepOf(connection, auth, facts, unguarded)
  return {
    connection,
    auth,
    ...(account === undefined ? {} : { account }),
    tools: toolsOf(facts),
    websearchDefault: facts.websearchDefault,
    host: { version: facts.host.version, tested: facts.host.tested },
    ...(unguarded.length === 0
      ? {}
      : { unguardedAgents: unguarded, permissionsBlock: DEFAULT_RULES.map((rule) => ({ ...rule })) }),
    nextStep,
  }
}

interface StatusState {
  readonly server: ServerState
  readonly websearch: WebsearchState
  readonly host: HostCheck
}

export async function readStatus(
  ctx: {
    readonly mcp: Pick<Plugin.Context["mcp"], "list">
    readonly integration: Pick<Plugin.Context["integration"], "connection">
    readonly agent: Pick<Plugin.Context["agent"], "list">
    readonly tool: Pick<Plugin.Context["tool"], "list">
  },
  state: StatusState,
) {
  const [servers, agents, tools] = await Promise.all([ctx.mcp.list(), ctx.agent.list(), ctx.tool.list()])
  const server = servers.data.find((entry) => entry.name === SERVER_NAME)
  // The account label is optional; a failed lookup must not hide the rest of the status.
  const connection = server?.integrationID
    ? await ctx.integration.connection.active(server.integrationID).catch(() => undefined)
    : undefined
  return buildStatus({
    server: server && { status: server.status.status },
    userServer: state.server.userServer,
    key: state.server.key,
    oauthAccount: connection?.type === "credential" ? connection.label : undefined,
    tools,
    websearchDefault: state.websearch.tavilyDefault,
    host: state.host,
    agents: agents.data,
  })
}

/** The status as text, in the dialog's order; Sign-in and Web search are Tavily's own rows. */
export function formatStatus(status: Status) {
  return [
    "Tavily status",
    `- Connection: ${CONNECTION_LABELS[status.connection]}`,
    `- Account: ${accountText(status)}`,
    `- Access: ${ACCESS_TEXT}`,
    `- Sign-in: ${AUTH_LABELS[status.auth]}`,
    `- Web search: ${websearchText(status)}`,
    `- Tools: ${toolsText(status)}`,
    `- Agents without default rules: ${agentsText(status)}`,
    ...blockLines(status.permissionsBlock ?? []).map((line) => `  ${line}`),
    `- OpenCode: ${hostText(status)}`,
    `- Next step: ${status.nextStep}`,
  ].join("\n")
}

export function unavailable(error: unknown) {
  const reason = error instanceof Error ? error.message : String(error)
  return {
    message: `STATUS_UNAVAILABLE: Could not read Tavily's status (${reason}).`,
    nextStep: "Run /tavily-status again, and restart OpenCode if it keeps failing.",
  }
}

export function registerStatusCommand(
  ctx: { readonly command: Pick<Plugin.Context["command"], "transform">; readonly session: Pick<Plugin.Context["session"], "synthetic"> },
  read: () => Promise<Status>,
) {
  return ctx.command.transform((editor) =>
    editor.add({
      name: "tavily-status",
      description: "Show Tavily's connection, sign-in, tools, web search default and next step",
      execute: async ({ sessionID }) => {
        const text = await read().then(formatStatus, (error: unknown) => {
          const { message, nextStep } = unavailable(error)
          return `${message} Next step: ${nextStep}`
        })
        await ctx.session.synthetic({ sessionID, text, description: "Tavily status", resume: false })
      },
    }),
  )
}
