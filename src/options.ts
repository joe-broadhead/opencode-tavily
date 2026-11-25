/**
 * The plugin's own options: the two settings the contract does not know.
 *
 * `access`, `accounts` and `allowUntestedHost` are the contract's options and are read by its modules; this file reads
 * `websearch` and `executionTimeoutMs`, checks them, and answers the defaults the manifest declares. A bad value is
 * `OPTIONS_INVALID`, in the contract's one form, and setup stops before anything is registered.
 */

/** The shortest call the manifest allows, in milliseconds: one minute. */
export const MIN_EXECUTION_TIMEOUT_MS = 60_000

/** The longest call the manifest allows, in milliseconds: one hour. */
export const MAX_EXECUTION_TIMEOUT_MS = 3_600_000

/** The manifest's default call time: fifteen minutes. */
export const DEFAULT_EXECUTION_TIMEOUT_MS = 900_000

/** The options the plugin's own code reads. The contract's options are read by the contract. */
export interface PluginOptions {
  /** Select OpenCode's built-in Tavily provider when nothing earlier chose one. */
  readonly websearch: boolean
  /** How long one Tavily tool call may run, in milliseconds. */
  readonly executionTimeoutMs: number
}

/** Every option the manifest declares, including the contract's. */
const KNOWN = new Set(["access", "accounts", "allowUntestedHost", "websearch", "executionTimeoutMs"])

const invalid = (what: string): Error => new Error(`OPTIONS_INVALID: ${what}. Next step: fix the plugin's options in opencode.json.`)

/** Read and check the plugin's options, or refuse with `OPTIONS_INVALID`. */
export function pluginOptions(options: Readonly<Record<string, unknown>>): PluginOptions {
  for (const key of Object.keys(options)) if (!KNOWN.has(key)) throw invalid(`"${key}" is not an option; the options are ${[...KNOWN].join(", ")}`)

  const websearch = options["websearch"] === undefined ? true : options["websearch"]
  if (typeof websearch !== "boolean") throw invalid(`"websearch" must be true or false`)

  const executionTimeoutMs = options["executionTimeoutMs"] === undefined ? DEFAULT_EXECUTION_TIMEOUT_MS : options["executionTimeoutMs"]
  if (typeof executionTimeoutMs !== "number" || !Number.isInteger(executionTimeoutMs) || executionTimeoutMs < MIN_EXECUTION_TIMEOUT_MS || executionTimeoutMs > MAX_EXECUTION_TIMEOUT_MS) {
    throw invalid(`"executionTimeoutMs" must be an integer from ${MIN_EXECUTION_TIMEOUT_MS} to ${MAX_EXECUTION_TIMEOUT_MS}`)
  }

  return { websearch, executionTimeoutMs }
}
