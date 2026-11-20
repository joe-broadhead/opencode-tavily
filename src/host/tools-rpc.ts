/**
 * Tavily's part of the tools RPC (`tavily.web.tools`): the plugin value and the method table that the source contract's
 * `tools-rpc` module takes. The module (`@we-the-rebel-alliance/source-contract/tools-rpc`, bundled into
 * `dist/index.js`) is the transport the plugin family shares:
 *
 *   POST /api/rpc/tavily.web.tools/<method>
 *   { "input": { "sessionID": "<session>", "input": <the tool's input> } }
 *
 * A script runs as a session and the agent it names; the rule for the method's permission action is resolved before
 * dispatch, and only `allow` runs. An MCP method then runs through OpenCode's own executor. The five tools only read
 * from the web, and each one spends credits. The class `describe` reports is `read`; whether a call runs is the
 * session's rules, not the class.
 */
import { toolsRpcId, upstreamText, type Failure, type McpResult, type MethodSpec, type NextSteps, type ShapeCall, type ToolsRpcPlugin } from "@we-the-rebel-alliance/source-contract/tools-rpc"
import { SERVER_NAME } from "../mcp.js"
import { KNOWN_ACTIONS } from "../permissions.js"
import { tavilyErrorIn, tavilyErrorLine, type TavilyError } from "../tavily-error.js"

/** The plugin's id. The RPC id is `<PLUGIN_ID>.tools`. */
export const PLUGIN_ID = "tavily.web"

/** `tavily.web.tools`. Scripts call it by name, so it never changes. */
export const TOOLS_RPC_ID = toolsRpcId(PLUGIN_ID)

/**
 * Every tool this plugin knows, by exact upstream name (the tool id without the `<server>_` prefix), with its class.
 * Tavily's five tools all only read, so all are `read`. An allowlist: a tool the server adds later is not a method
 * until it is classified here, and `describe` lists it as unclassified.
 */
export const METHODS: readonly MethodSpec[] = KNOWN_ACTIONS.map((action): MethodSpec => ({
  kind: "mcp",
  name: action.slice(`${SERVER_NAME}_`.length),
  class: "read",
}))

/** Tavily's error object in a result, which `shapeResult` throws so that `pluginError` names it. */
class TavilyResultError extends Error {
  readonly failure: Failure
  constructor(method: string, error: TavilyError) {
    super(error.message)
    this.failure = { code: "UPSTREAM_ERROR", what: `${SERVER_NAME}_${method} failed: ${upstreamText(tavilyErrorLine(error))}`, next: error.next }
  }
}

/** What the model path's `execute.before` hooks do to an MCP call's arguments, which the executor skips. Tavily has none. */
export function shapeInput(_method: string, input: unknown, _call: ShapeCall): unknown {
  return input
}

/**
 * What the model path's `execute.after` hook does (src/tavily-error.ts), which the executor skips: Tavily's error
 * object, which its server answers as a result, becomes UPSTREAM_ERROR. Every other result is returned as it is.
 */
export function shapeResult(method: string, result: McpResult, _call: ShapeCall): McpResult {
  const error = tavilyErrorIn(result.output, result.text)
  if (error) throw new TavilyResultError(method, error)
  return result
}

/** The next step for each code. Each is one sentence that ends with a full stop. */
export const NEXT_STEPS: NextSteps = {
  SESSION_UNKNOWN: `Create a session in the location you mean, such as POST /api/session with {"agent":"build"} sent with the header "x-opencode-directory: <dir>" or the location[directory] query, and pass its id.`,
  SESSION_AGENT_REQUIRED: `Create a session that names an agent this project has, with its project as the location, such as POST /api/session with {"agent":"build","location":{"directory":"/path/to/project"}}, and pass its id.`,
  PERMISSION_DENIED: "Add an allow rule for the tool to the session's agent or to the session, or use a session whose agent allows it.",
  AUTH_REQUIRED: "Run /connect and choose Tavily account to sign in, or choose Tavily to use an API key.",
  CONNECTING: "Wait a few seconds, then call the method again.",
  CONNECTION_FAILED: "Run /tavily-status and follow its next step.",
  DISABLED: `Enable the tavily server in /mcps, or remove "disabled": true from mcp.servers.tavily in opencode.json.`,
  NOT_REGISTERED: "Run /tavily-status and follow its next step.",
  TOOL_UNAVAILABLE: "Call describe to see which methods OpenCode lists now, and run /tavily-status.",
  UPSTREAM_ERROR: "Check the input against the method's schema from describe, and run /tavily-status if it keeps failing.",
  CANCELLED: "Call the method again if you still need the result.",
}

/** The plugin's own errors as a code, what happened and the next step: only Tavily's error object, from `shapeResult`. */
export function pluginError(error: unknown): Failure | undefined {
  return error instanceof TavilyResultError ? error.failure : undefined
}

/** Tavily's plugin value for the tools RPC. No method has a resource resolver. */
export const PLUGIN: ToolsRpcPlugin = { id: PLUGIN_ID, nextSteps: NEXT_STEPS, shapeInput, shapeResult, pluginError }
