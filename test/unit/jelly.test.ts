import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { KEY_REJECTED, OAUTH_NAME } from "../../src/connect.js"
import { INTEGRATION_ID } from "../../src/credential.js"
import { SERVER_NAME } from "../../src/mcp.js"
import { DEFAULT_RULES, KNOWN_READS } from "../../src/permissions.js"

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
    expect(jelly.tools.map((tool) => tool.permission).sort()).toEqual([...KNOWN_READS].sort())
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
    expect(account).toMatchObject({ server: SERVER_NAME, label: OAUTH_NAME })
    expect(account?.integration).toBeUndefined()
    expect(key?.group).toBe(account?.group)
  })
})

describe("docs/jelly.md", () => {
  test("counts the declared tools and lists the declared skills", () => {
    const reads = jelly.tools.filter((tool) => tool.readOnly).length
    expect(doc).toContain(`${jelly.tools.length} tools are declared (${reads} read-only)`)
    for (const skill of jelly.skills) expect(doc).toContain(`\`${skill}\``)
  })

  test("quotes the message /connect shows for a rejected key", () => {
    expect(doc).toContain(`> ${KEY_REJECTED}`)
  })

  test("names no version, so that it stays true after a release", () => {
    expect(doc).not.toContain(pkg.version)
  })
})
