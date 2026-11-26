/** The real OpenCode 2.4.1 host for the plugin's host tests: load `dist/`, activate it, and read what it registered. */
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { Plugin } from "@opencode/plugin"

const REPOSITORY = fileURLToPath(new URL("../..", import.meta.url))
const ENTRY = join(REPOSITORY, "dist", "index.js")
const ACTIVATION_TIMEOUT_MS = 20_000

/** The plugin definition `dist/index.js` exports. */
export type PluginDefinition = Plugin.Plugin

/** One MCP server the plugin set through `ctx.mcp.transform`, with the config it set. */
export interface RecordedServer {
  readonly name: string
  readonly config: Readonly<Record<string, unknown>>
}

/** One listed plugin, as much as activation needs. */
interface ListedPlugin {
  readonly id?: string
  readonly state?: { readonly status?: string; readonly error?: string }
}

/** The part of the SDK host these tests read: its sessions, servers, skills, RPC and close. */
export interface EmbeddedHost {
  readonly sessions: {
    create(input: Record<string, unknown>): Promise<{ readonly id: string }>
    prompt(input: Record<string, unknown>): Promise<unknown>
  }
  readonly plugin: { list(input: Record<string, unknown>): Promise<{ readonly data: readonly ListedPlugin[] }> }
  readonly mcp: { list(input: Record<string, unknown>): Promise<{ readonly data: readonly { readonly name: string }[] }> }
  readonly skill: { list(input: Record<string, unknown>): Promise<{ readonly data: readonly unknown[] }> }
  readonly rpc: { call(input: Record<string, unknown>): Promise<{ readonly output?: unknown }> }
  close(): Promise<void>
}

/** One activated host, with what the plugin registered. */
export interface HostRun {
  readonly host: EmbeddedHost
  /** The repository, where `package.json` and `skills/` live. */
  readonly repository: string
  /** An empty temporary project directory; OpenCode discovers `<directory>/skills` itself, so this is never the repo. */
  readonly directory: string
  readonly sessionID: string
  readonly pluginID: string
  readonly servers: readonly RecordedServer[]
  close(): Promise<void>
}

/** The plugin options a person's `opencode.json` gives; the embedded host reads no config file, so the test injects them. */
const OPTIONS = { accounts: { work: {}, personal: {} } } as const

/** The environment variables an ambient OpenCode config hides behind; the test points them at the temp project. */
const ISOLATED = ["HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"] as const

/** Point every config root at `root`, skip the free-model call, and answer the values to restore. */
function isolateEnvironment(root: string): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {}
  for (const key of ISOLATED) {
    saved[key] = process.env[key]
    process.env[key] = key === "HOME" ? join(root, "home") : join(root, key.toLowerCase())
  }
  saved.OPENCODE_DISABLE_FREE_MODELS = process.env.OPENCODE_DISABLE_FREE_MODELS
  process.env.OPENCODE_DISABLE_FREE_MODELS = "1"
  return saved
}

function restoreEnvironment(saved: Record<string, string | undefined>): void {
  for (const key of Object.keys(saved)) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
}

/** Wrap the plugin so the test sees the MCP configs and the options a real install would give it. */
function withTestContext(plugin: PluginDefinition, servers: RecordedServer[], options: Readonly<Record<string, unknown>>): PluginDefinition {
  return {
    id: plugin.id,
    setup(context) {
      const target = context as unknown as Record<string, unknown>
      const mcp = target.mcp as { transform(callback: (editor: unknown) => void): Promise<unknown> }
      const proxy = new Proxy(target, {
        get(from, key) {
          if (key === "options") return { ...(from.options as Record<string, unknown> | undefined), ...options }
          if (key === "mcp") {
            return new Proxy(mcp, {
              get(mcpTarget, field) {
                if (field !== "transform") {
                  const value = Reflect.get(mcpTarget, field)
                  return typeof value === "function" ? value.bind(mcpTarget) : value
                }
                return (callback: (editor: unknown) => void) =>
                  mcpTarget.transform((editor) => {
                    const recorded = new Proxy(editor as Record<string, unknown>, {
                      get(editorTarget, editorField) {
                        if (editorField === "set") {
                          return (name: string, config: Record<string, unknown>) => {
                            servers.push({ name, config })
                            const set = editorTarget.set as (name: string, config: unknown) => void
                            set(name, config)
                          }
                        }
                        const value = Reflect.get(editorTarget, editorField)
                        return typeof value === "function" ? value.bind(editorTarget) : value
                      },
                    })
                    callback(recorded)
                  })
              },
            })
          }
          return Reflect.get(from, key, from)
        },
      })
      return plugin.setup(proxy as unknown as Plugin.Context)
    },
  }
}

/** Wait, with a bound, until OpenCode lists the plugin as active; a failed setup is the test's error. */
async function waitForActive(host: EmbeddedHost, directory: string, pluginID: string): Promise<void> {
  const deadline = Date.now() + ACTIVATION_TIMEOUT_MS
  for (;;) {
    const list = await host.plugin.list({ location: { directory } }).catch(() => undefined)
    const found = list?.data.find((entry: { id?: string; state?: { status?: string; error?: string } }) => String(entry.id) === pluginID)
    if (found?.state?.status === "failed") throw new Error(`the plugin failed to set up: ${String(found.state.error)}`)
    if (found?.state?.status === "active") return
    if (Date.now() >= deadline) throw new Error(`the plugin did not become active within ${ACTIVATION_TIMEOUT_MS} ms`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * Load the built entry into the embedded `@opencode/sdk` 2.4.1 host, in an empty temporary project, and activate it.
 *
 * OpenCode discovers `<project>/skills` itself, so the project is never the repository: a listed skill can only have
 * come from the plugin's own `ctx.skill` registration. `HOME` and the XDG roots are isolated too, before the SDK is
 * loaded, so no ambient skill or plugin config leaks in. A missing `dist/index.js` throws: the host tests run after
 * `npm run bundle` and must fail, never skip, without it.
 */
export async function activate(options: Readonly<Record<string, unknown>> = OPTIONS): Promise<HostRun> {
  if (!existsSync(ENTRY)) throw new Error("dist/index.js is missing: run `npm run bundle` before the host test")
  const module = (await import(pathToFileURL(ENTRY).href)) as { default?: PluginDefinition }
  const plugin = module.default
  if (plugin === undefined || typeof plugin.id !== "string" || typeof plugin.setup !== "function") {
    throw new Error("dist/index.js does not export a Plugin.define({ id, setup }) value")
  }

  const project = mkdtempSync(join(tmpdir(), "tavily-host-"))
  const saved = isolateEnvironment(project)
  let host: EmbeddedHost | undefined
  try {
    const { OpenCode } = await import("@opencode/sdk")
    const servers: RecordedServer[] = []
    const created = await OpenCode.create({
      plugins: [withTestContext(plugin, servers, options)],
      config: { directory: project },
      app: { name: "opencode", version: "2.4.1" },
      log: { level: "error", emit: () => undefined },
    })
    host = created
    const session = await created.sessions.create({ location: { directory: project }, agent: "build", permissions: [] })
    // A prompt is what makes the SDK acquire the location's plugin instance. The turn needs no model, but its failure
    // can take tens of seconds, so it is bounded before the activation poll.
    await Promise.race([
      created.sessions.prompt({ sessionID: session.id, text: "activate the tavily plugin", delivery: "queue" }).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 90_000)),
    ])
    await waitForActive(created, project, plugin.id)

    let closed = false
    return {
      host: created,
      repository: REPOSITORY,
      directory: project,
      sessionID: session.id,
      pluginID: plugin.id,
      servers,
      async close() {
        if (closed) return
        closed = true
        await Promise.race([host?.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 10_000))])
        restoreEnvironment(saved)
        rmSync(project, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await Promise.race([host?.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 10_000))])
    restoreEnvironment(saved)
    rmSync(project, { recursive: true, force: true })
    throw error
  }
}

/** Call one of the plugin's RPC methods as the activation session. */
export async function call(run: HostRun, method: string, input: unknown): Promise<unknown> {
  const answer = await run.host.rpc.call({
    rpcID: run.pluginID,
    method,
    input: { sessionID: run.sessionID, input },
    location: { directory: run.directory },
  })
  return answer.output
}
