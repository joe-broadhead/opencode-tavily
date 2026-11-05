import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { INTEGRATION_ID } from "../../src/credential.js"
import { SERVER_NAME } from "../../src/mcp.js"
import { DEFAULT_RULES, KNOWN_ACTIONS } from "../../src/permissions.js"

/**
 * The `jelly` section of package.json, which Jelly reads without loading the plugin. Jelly's agents have no base
 * "allow everything" rule, so this plugin's own default rules never reach them; Jelly writes each declared "ask" or
 * "deny" as that tool's default instead. So each declared effect must be the one these rules give the tool after a
 * base allow, the declared skills must be the ones the package ships, and the declared sign-ins must be the
 * integration and server the plugin signs in through.
 */

type Tool = { name: string; permission: string; effect: string; readOnly: boolean }
type SignIn = { id: string; label: string; group: string; integration?: string; server?: string }
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))
const jelly = pkg.jelly as { title: string; tools: Tool[]; skills: string[]; signIns: SignIn[] }
const doc = readFileSync(new URL("../../docs/jelly.md", import.meta.url), "utf8")
const rules: readonly { action: string; resource: string; effect: string }[] = [{ action: "*", resource: "*", effect: "allow" }, ...DEFAULT_RULES]
const wildcard = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`)
const effectOf = (action: string) => [...rules].reverse().find((rule) => wildcard(rule.action).test(action) && rule.resource === "*")?.effect

describe("the jelly declaration", () => {
  test("gives each tool the effect the plugin's own default rules give it", () => {
    expect(jelly.tools.length).toBeGreaterThan(0)
    for (const tool of jelly.tools) expect(effectOf(tool.permission), tool.permission).toBe(tool.effect)
  })

  test("declares exactly the known tools, each read-only", () => {
    expect(jelly.tools.map((tool) => tool.permission).sort()).toEqual([...KNOWN_ACTIONS].sort())
    for (const tool of jelly.tools) expect(tool.readOnly, tool.name).toBe(true)
  })

  test("names each tool once, as the engine names its permission (namespace.tool for namespace_tool)", () => {
    const names = jelly.tools.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    for (const tool of jelly.tools) expect(tool.name.replaceAll(".", "_"), tool.name).toBe(tool.permission)
  })

  test("names every skill the package ships", () => {
    expect([...jelly.skills].sort()).toEqual(readdirSync(new URL("../../skills", import.meta.url)).sort())
  })

  test("declares the two sign-ins: an API key through the built-in Tavily entry, or OAuth through Tavily MCP", () => {
    const key = jelly.signIns.find((signIn) => signIn.id === "key")
    const account = jelly.signIns.find((signIn) => signIn.id === "account")
    expect(jelly.signIns).toHaveLength(2)
    expect(key).toMatchObject({ integration: INTEGRATION_ID, label: "Tavily" })
    expect(key?.server).toBeUndefined()
    expect(account).toMatchObject({ server: SERVER_NAME, label: "Tavily MCP" })
    expect(account?.integration).toBeUndefined()
    expect(key?.group).toBe(account?.group)
  })
})

// The drawing elements Jelly's icon cleaner keeps (hey-jelly `plugin-icon.ts`). It drops a whole icon that has any
// other element, so a `<title>` is refused too.
const ICON_ELEMENTS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs"])
for (const name of ["linearGradient", "radialGradient", "stop", "clipPath", "mask"]) ICON_ELEMENTS.add(name)

describe("the jelly summary and icon", () => {
  test("the summary is one line of 1 to 120 characters", () => {
    const summary = (pkg.jelly as { summary: string }).summary
    expect(summary.trim().length).toBeGreaterThan(0)
    expect(summary.length).toBeLessThanOrEqual(120)
    expect(summary).not.toContain("\n")
  })

  test("the icon is assets/icon.svg, shipped, with one svg root, xmlns and viewBox, only drawing elements, under 16 KB", () => {
    const icon = (pkg.jelly as { icon: string }).icon
    expect(icon).toBe("assets/icon.svg")
    expect(pkg.files).toContain(icon)
    const svg = readFileSync(new URL(`../../${icon}`, import.meta.url), "utf8").trim()
    expect(svg.length).toBeLessThanOrEqual(16_384)
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]* viewBox="[^"]+"/)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).not.toMatch(/<title|<style|<script|&|<!/i)
    const elements = [...svg.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1])
    expect(elements.filter((name) => !ICON_ELEMENTS.has(name!))).toEqual([])
  })
})

describe("docs/jelly.md", () => {
  test("counts the declared tools and lists the declared skills", () => {
    const reads = jelly.tools.filter((tool) => tool.readOnly).length
    expect(doc).toContain(`${jelly.tools.length} tools are declared (${reads} read-only)`)
    for (const skill of jelly.skills) expect(doc).toContain(`\`${skill}\``)
  })

  test("quotes the message /connect shows for a rejected key", () => {
    expect(doc).toContain("> Tavily did not accept this API key. Replace it, or remove it to sign in with Tavily MCP.")
  })

  test("names no version, so that it stays true after a release", () => {
    expect(doc).not.toContain(pkg.version)
  })
})
