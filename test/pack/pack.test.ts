// The built package as users get it: `npm pack`, then `npm install --ignore-scripts` of the tarball into an empty
// project, offline, with the npm on PATH. Run it after `npm run build` (check does). PACK_TARBALL tests a tarball that
// is already packed instead, such as the one the release workflow publishes. The tarball holds only
// JavaScript, skills and docs; the install adds nothing else; and the installed package imports, and loads in each
// stock OpenCode release it is tested on (startStock in ../host/harness.ts).
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { Tavily } from "../../src/rpc/index.js"
import { DEFAULT_RULES } from "../../src/permissions.js"
import { cleanup, npm, REPO, root, startStock, STOCK_VERSIONS, until, type Host } from "../host/harness.js"
import { schemaErrors } from "../schema.js"

// Packing, installing, and downloading and starting a stock host take minutes in a slow container (see READY_MS in
// harness.ts).
setDefaultTimeout(300_000)

const NAME = "@joe-broadhead/opencode-tavily"
const ALLOWED = /^(package\.json|README\.md|LICENSE|CHANGELOG\.md|dist\/.+|skills\/.+)$/
const REQUIRED = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "dist/index.js",
  "dist/tui.js",
  "skills/tavily/SKILL.md",
  "skills/tavily-research/SKILL.md",
]
const LIFECYCLE = ["preinstall", "install", "postinstall", "preprepare", "prepare", "postprepare", "prepack", "postpack"]
  .concat(["prepublish", "prepublishOnly", "publish", "postpublish", "preuninstall", "uninstall", "postuninstall", "dependencies"])
/** What OpenCode supplies to plugins at runtime. Nothing else may be imported. */
const HOST_MODULES = /^(@opencode\/plugin(\/.+)?|@opentui\/(core|solid)(\/.+)?|solid-js(\/.+)?)$/
const UI_MODULES = /^(@opentui\/|solid-js)/

const work = join(root, "pack")
const project = join(work, "project")
const installed = join(project, "node_modules", NAME)

type Packed = { filename: string; size: number; unpackedSize: number; entryCount: number; files: { path: string }[] }
let packed: Packed
let manifest: Record<string, any>

beforeAll(async () => {
  mkdirSync(project, { recursive: true })
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "tavily-pack-test", version: "0.0.0", private: true }))
  let tarball: string
  if (process.env.PACK_TARBALL) {
    tarball = resolve(process.env.PACK_TARBALL)
    ;[packed] = JSON.parse(await npm(["pack", "--dry-run", "--ignore-scripts", "--json", tarball], project)) as Packed[]
  } else {
    if (!existsSync(join(REPO, "dist/index.js"))) throw new Error("dist/ is missing. Run npm run build first.")
    ;[packed] = JSON.parse(await npm(["pack", "--ignore-scripts", "--json", "--pack-destination", work], REPO)) as Packed[]
    tarball = join(work, packed.filename)
  }
  // Offline: the tarball must need nothing from the registry.
  await npm(["install", "--ignore-scripts", "--offline", tarball], project)
  manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"))
})
afterAll(cleanup)

const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  )

describe("the tarball", () => {
  test("holds only dist, skills, README.md, LICENSE, CHANGELOG.md and package.json, under 300 KB and 80 files", () => {
    const paths = packed.files.map((file) => file.path)
    expect(paths.filter((path) => !ALLOWED.test(path))).toEqual([])
    expect(REQUIRED.filter((path) => !paths.includes(path))).toEqual([])
    expect(packed.entryCount).toBeLessThan(80)
    expect(packed.unpackedSize).toBeLessThan(300 * 1024)
  })

  test("ships no TypeScript, TSX or declaration files, only JavaScript", () => {
    expect(packed.files.map((file) => file.path).filter((path) => /\.[cm]?tsx?$/.test(path))).toEqual([])
  })

  test("declares no dependencies, peers or lifecycle scripts, and states the tested host range", () => {
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta", "bundleDependencies", "bundledDependencies", "overrides"])
      expect(manifest[field]).toBeUndefined()
    expect(Object.keys(manifest.scripts ?? {}).filter((script) => LIFECYCLE.includes(script))).toEqual([])
    expect(manifest.opencode).toEqual({ host: ">=2.2.3 <2.3.0" })
    expect(manifest.exports).toEqual({ ".": "./dist/index.js", "./tui": "./dist/tui.js" })
    for (const target of Object.values(manifest.exports as Record<string, string>)) expect(existsSync(join(installed, target))).toBe(true)
  })
})

describe("the install", () => {
  test("adds only this package: no peers, no dependencies, no bundled modules", () => {
    const visible = (directory: string) => readdirSync(directory).filter((entry) => !entry.startsWith("."))
    expect(visible(join(project, "node_modules"))).toEqual(["@joe-broadhead"])
    expect(visible(join(project, "node_modules", "@joe-broadhead"))).toEqual(["opencode-tavily"])
    expect(existsSync(join(installed, "node_modules"))).toBe(false)
  })

  // OpenCode reloads a plugin in place but keeps the module records of unchanged paths, so a new entry that imports a
  // sibling module can get a stale copy of it. With exactly two self-contained entries there is no sibling to go stale.
  test("dist holds exactly index.js and tui.js, and neither imports, import()s or requires a relative path", () => {
    expect(files(join(installed, "dist")).map((file) => relative(installed, file)).sort()).toEqual(["dist/index.js", "dist/tui.js"])
    const scanner = new Bun.Transpiler({ loader: "js" })
    for (const where of ["dist/index.js", "dist/tui.js"]) {
      const text = readFileSync(join(installed, where), "utf8")
      const relativeImports = scanner.scan(text).imports.filter(({ path }) => !/^(node:|@|[a-z])/.test(path))
      expect({ where, relativeImports }).toEqual({ where, relativeImports: [] })
      expect({ where, require: /\brequire\s*\(/.test(text) }).toEqual({ where, require: false })
    }
  })

  test("its JavaScript imports only Node built-ins and host modules; only dist/tui.js imports the UI", () => {
    const scanner = new Bun.Transpiler({ loader: "js" })
    for (const where of ["dist/index.js", "dist/tui.js"]) {
      for (const { path } of scanner.scan(readFileSync(join(installed, where), "utf8")).imports) {
        expect({ where, path, allowed: path.startsWith("node:") || HOST_MODULES.test(path) }).toEqual({ where, path, allowed: true })
        if (where !== "dist/tui.js") expect({ where, ui: UI_MODULES.test(path) }).toEqual({ where, ui: false })
      }
    }
  })

  test("imports dist/index.js and dist/tui.js when the host modules are supplied", async () => {
    // OpenCode supplies these to plugins. Linking them beside the project, not inside it, keeps the install as it is.
    for (const name of ["@opencode/plugin", "@opentui/core", "@opentui/solid", "solid-js"]) {
      mkdirSync(join(work, "node_modules", dirname(name)), { recursive: true })
      symlinkSync(join(REPO, "node_modules", name), join(work, "node_modules", name), "dir")
    }
    const server = await import(join(installed, "dist/index.js"))
    const tui = await import(join(installed, "dist/tui.js"))
    expect(server.default.id).toBe("tavily.web")
    expect(tui.default.id).toBe("tavily.web.tui")
  })
})

/** The host's last-match evaluation of an MCP tool call, which asserts `<server>_<tool>` on resource `*`. */
async function effect(host: Host, agent: string, action: string) {
  const { id: sessionID } = await host.client.session.create({ agent, location: host.location })
  return (await host.client.permission.create({ sessionID, agent, action, resources: ["*"], save: ["*"] })).effect
}

for (const version of STOCK_VERSIONS)
  describe(`the installed package on stock OpenCode ${version}`, () => {
    let host: Host
    beforeAll(async () => {
      host = await startStock(version, installed)
    })
    afterAll(() => host?.close())

    test("loads from its directory with its server and TUI parts", async () => {
      const { data: plugins } = await host.client.plugin.list({ location: host.location })
      const entry = plugins.find((plugin) => plugin.id === "tavily.web")
      expect(entry?.state).toEqual({ status: "active" })
      expect(entry?.source).toEqual({ type: "local", path: expect.stringContaining(join("node_modules", NAME)) })
      // The host reports `rpc` only for a `./rpc` export, which it never loads; the server part registers the RPC.
      expect(entry?.features).toEqual({ server: true, tui: true })
    })

    test("registers the tavily server, /tavily-status and the packaged skills, and answers status", async () => {
      const { data: servers } = await host.client.mcp.list({ location: host.location })
      expect(servers.map((server) => server.name)).toContain("tavily")
      const { data: commands } = await host.client.command.list({ location: host.location })
      expect(commands.map((command) => command.name)).toContain("tavily-status")
      const { data: skills } = await host.client.skill.list({ location: host.location })
      const packaged = skills.filter((skill) => skill.id.startsWith("tavily"))
      expect(packaged.map((skill) => skill.id).sort()).toEqual(["tavily", "tavily-research"])
      for (const skill of packaged) expect(skill.path).toContain(join("node_modules", NAME, "skills"))
      const { output } = await host.client.rpc.call({ rpcID: "tavily.web", method: "status", input: {}, location: host.location })
      expect(schemaErrors(Tavily.methods.status.output, output)).toEqual([])
      expect(output).toMatchObject({ auth: "oauth", host: { version, tested: true } })
    })

    test("/connect lists the built-in key entry as Tavily and the server's OAuth entry as Tavily MCP", async () => {
      const { data: servers } = await host.client.mcp.list({ location: host.location })
      const oauth = servers.find((server) => server.name === "tavily")?.integrationID
      const names = await until("the OAuth entry is named Tavily MCP", async () => {
        const { data } = await host.client.integration.list({ location: host.location })
        const found = Object.fromEntries(data.filter((entry) => entry.id === "tavily" || entry.id === oauth).map((entry) => [entry.id, entry.name]))
        return oauth && found[oauth] === "Tavily MCP" ? found : undefined
      })
      expect(names).toEqual({ tavily: "Tavily", [oauth!]: "Tavily MCP" })
    })

    test("puts the default rules right after each built-in agent's base allow, and the host enforces them", async () => {
      const { data: agents } = await host.client.agent.list({ location: host.location })
      for (const id of ["build", "plan", "explore"]) {
        const permissions = agents.find((agent) => agent.id === id)?.permissions
        expect(permissions?.slice(0, 1 + DEFAULT_RULES.length)).toEqual([{ action: "*", resource: "*", effect: "allow" }, ...DEFAULT_RULES])
      }
      expect(await effect(host, "build", "tavily_tavily_feedback")).toBe("ask")
      expect(await effect(host, "build", "tavily_tavily_search")).toBe("allow")
      expect(await effect(host, "explore", "tavily_tavily_search")).toBe("deny")
    })
  })
