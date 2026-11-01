import { Rpc } from "@opencode/plugin/rpc"

const CONNECTIONS = ["connected", "pending", "needs_auth", "failed", "disabled", "not_registered"] as const
const AUTH_SOURCES = ["oauth", "key_connected", "key_env", "user_server", "none"] as const

export interface PermissionRule {
  readonly action: string
  readonly resource: string
  readonly effect: "allow" | "deny" | "ask"
}

/** The plugin's read-only status. It never carries a key or token. */
export interface Status {
  readonly connection: (typeof CONNECTIONS)[number]
  readonly auth: (typeof AUTH_SOURCES)[number]
  /** The credential's label, never a secret. */
  readonly account?: string
  /** The `tavily` server's tools that OpenCode lists; unknown ones are not among the five known reads and ask. */
  readonly tools: { readonly visible: number; readonly unknown: number; readonly unknownNames: readonly string[] }
  /** This plugin selected Tavily as the web search default. A `websearch` choice in opencode.json still wins. */
  readonly websearchDefault: boolean
  readonly host: { readonly version: string; readonly tested: boolean }
  /**
   * Agents that miss the plugin's default rules and would run new Tavily tools without asking. OpenCode creates
   * agents defined only in user config after plugins run, so those agents never receive the rules.
   */
  readonly unguardedAgents?: readonly string[]
  /** The default rules to paste into each unguarded agent's own permissions; present with `unguardedAgents`. */
  readonly permissionsBlock?: readonly PermissionRule[]
  /** The one next step; `Nothing to do.` when everything is ready. */
  readonly nextStep: string
}

export const CONNECTION_LABELS: Record<Status["connection"], string> = {
  connected: "connected",
  pending: "connecting",
  needs_auth: "sign-in required",
  failed: "failed",
  disabled: "disabled",
  not_registered: "not configured",
}

/** Every Tavily tool only reads from the web. */
export const ACCESS_TEXT = "read only: search, extract, map, crawl and research"

export const AUTH_LABELS: Record<Status["auth"], string> = {
  oauth: "OAuth (/connect → Tavily MCP)",
  key_connected: "API key (/connect → Tavily)",
  key_env: "API key from TAVILY_API_KEY",
  user_server: "your own tavily server in opencode.json",
  none: "none",
}

export function toolsText({ tools }: Status) {
  if (tools.visible === 0) return "none listed yet"
  const unknown = tools.unknown === 0 ? "" : `, ${tools.unknown} unknown (they ask first): ${tools.unknownNames.join(", ")}`
  return `${tools.visible} available${unknown}`
}

export const websearchText = (status: Status) =>
  status.websearchDefault ? `Tavily, unless opencode.json sets "websearch"` : "not set by this plugin"

export const accountText = (status: Status) => status.account ?? "none"

export const agentsText = (status: Status) =>
  status.unguardedAgents === undefined
    ? "none"
    : `${status.unguardedAgents.join(", ")}. New Tavily tools run there without asking. The block:`

export const hostText = (status: Status) => `${status.host.version} (${status.host.tested ? "tested" : "untested"})`

/** The permission block as lines to paste: one rule per line, comma-separated. */
export const blockLines = (block: readonly PermissionRule[]) =>
  block.map((rule, index) => `${JSON.stringify(rule)}${index < block.length - 1 ? "," : ""}`)

const strings = { type: "array", items: { type: "string" } } as const

const rule = {
  type: "object",
  properties: {
    action: { type: "string" },
    resource: { type: "string" },
    effect: { type: "string", enum: ["allow", "deny", "ask"] },
  },
  required: ["action", "resource", "effect"],
  additionalProperties: false,
} as const

const status = {
  type: "object",
  properties: {
    connection: { type: "string", enum: [...CONNECTIONS] },
    auth: { type: "string", enum: [...AUTH_SOURCES] },
    account: { type: "string" },
    tools: {
      type: "object",
      properties: { visible: { type: "integer" }, unknown: { type: "integer" }, unknownNames: strings },
      required: ["visible", "unknown", "unknownNames"],
      additionalProperties: false,
    },
    websearchDefault: { type: "boolean" },
    host: {
      type: "object",
      properties: { version: { type: "string" }, tested: { type: "boolean" } },
      required: ["version", "tested"],
      additionalProperties: false,
    },
    unguardedAgents: strings,
    permissionsBlock: { type: "array", items: rule },
    nextStep: { type: "string" },
  },
  required: ["connection", "auth", "tools", "websearchDefault", "host", "nextStep"],
  additionalProperties: false,
} as const

/** Call `status` with `{}` as the input. */
export const Tavily = Rpc.define({
  id: "tavily.web",
  methods: {
    status: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: status,
      errors: {
        unavailable: {
          type: "object",
          properties: { nextStep: { type: "string" } },
          required: ["nextStep"],
          additionalProperties: false,
        },
      },
    },
  },
  events: {},
})
