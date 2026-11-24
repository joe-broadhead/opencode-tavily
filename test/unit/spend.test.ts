// The spend classification, checked once for every place it appears: the five tools are the plugin's known actions and
// tools-RPC methods, status carries the class and the spend line, the jelly cost (kept for 4b) is the same line, and
// the README and the skill print Tavily's own unit prices. 4b turns this table into `actions[].effect: "spend"` and
// `cost`; until then this test is what keeps the places from drifting apart.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { METHODS } from "../../src/host/tools-rpc.js"
import { KNOWN_ACTIONS } from "../../src/permissions.js"
import { buildStatus } from "../../src/status.js"
import { SPEND_CLASS, SPEND_TEXT, SPEND_TOOLS, SPEND_UNIT, spendOf } from "../../src/spend.js"
import pkg from "../../package.json" with { type: "json" }

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const read = (file: string) => readFileSync(join(ROOT, file), "utf8")

describe("the spend classification", () => {
  test("is the contract's spend effect, in Tavily's unit, over exactly the five known tools", () => {
    expect(SPEND_CLASS).toBe("spend")
    expect(SPEND_UNIT).toBe("credit")
    expect(SPEND_TOOLS.map((tool) => tool.name)).toEqual(["search", "extract", "map", "crawl", "research"])
    expect(SPEND_TOOLS.map((tool) => `tavily_tavily_${tool.name}`)).toEqual([...KNOWN_ACTIONS])
    expect(METHODS.map((method) => `tavily_${method.name}`)).toEqual([...KNOWN_ACTIONS])
    for (const tool of SPEND_TOOLS) expect(spendOf(tool.name)).toBe(tool)
    expect(spendOf("feedback")).toBeUndefined()
  })

  test("every status carries the class, the unit and the one spend line", () => {
    const status = buildStatus({
      access: "all",
      server: { status: "connected" },
      userServer: false,
      userServerAtTavily: false,
      tools: [],
      websearchDefault: true,
      host: { version: "2.4.1", tested: true, inRange: true },
      agents: [],
    })
    expect(status.cost).toEqual({ class: "spend", unit: "credit", text: SPEND_TEXT })
  })

  test("the jelly cost, kept until 4b removes the key, is the same line", () => {
    const jelly = pkg.jelly as { cost?: string; tools?: { name: string; readOnly: boolean }[] }
    expect(jelly.cost).toBe(SPEND_TEXT)
    expect(jelly.tools?.map((tool) => tool.name)).toEqual(SPEND_TOOLS.map((tool) => `tavily.tavily_${tool.name}`))
    for (const tool of jelly.tools ?? []) expect(tool.readOnly, tool.name).toBe(false)
  })

  test("the README and the tavily skill print every tool's price as the classification states it", () => {
    const flat = (text: string) => text.replace(/\s+/g, " ")
    for (const file of ["README.md", "docs/configuration.md"])
      expect({ file, text: flat(read(file)).includes(flat(SPEND_TEXT)) }).toEqual({ file, text: true })
    const skill = read("skills/tavily/SKILL.md")
    for (const tool of SPEND_TOOLS) expect({ tool: tool.name, priced: skill.includes(tool.cost) }).toEqual({ tool: tool.name, priced: true })
  })
})
