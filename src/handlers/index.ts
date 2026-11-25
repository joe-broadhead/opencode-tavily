/**
 * The handler table: one entry per method the manifest declares, by the method's name.
 *
 * A handler says what one method looks like and does the work; `register` adds the account selector, the doors, the
 * permission assertions and the answer checks. The provider is the only layer that reads OpenCode's MCP servers.
 */
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import type { HandlerTable } from "@we-the-rebel-alliance/plugin-contract/register"
import type { ServerList } from "../provider/client.ts"
import { probeHandler } from "./probe.ts"
import { statusHandler } from "./status.ts"

/** The plugin state the handlers may read, built once in `setup`. Nothing is written after `register` returns. */
export interface HandlerRuntime {
  /** The validated manifest: the name, the title, the host range and the tested releases. */
  readonly manifest: Manifest
  /** The installed package's version, as `status` reports it. */
  readonly version: string
  /** The OpenCode release the plugin runs on: `ctx.app.version`. */
  readonly hostVersion: string
  /** The plugin's options, from which `status` reads the account profiles. */
  readonly options: Readonly<Record<string, unknown>>
  /** OpenCode's live MCP server list, which `status` and `probe` read. */
  readonly mcp: ServerList
  /** What account registration could not do; `status` reports the first one. */
  readonly accountProblems: readonly string[]
}

/** Every method's handler. */
export function handlersFor(runtime: HandlerRuntime): HandlerTable {
  return {
    status: statusHandler(runtime),
    probe: probeHandler(runtime),
  }
}
