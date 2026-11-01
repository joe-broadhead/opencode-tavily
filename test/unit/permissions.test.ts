import { describe, expect, test } from "bun:test"
import {
  DEFAULT_RULES,
  evaluate,
  hasDefaultRules,
  insertDefaultRules,
  KNOWN_READS,
  registerDefaultRules,
  type Rule,
} from "../../src/permissions.js"
import { agent, agentEditor, transforms, type EditorOf } from "./fake.js"
import type { Plugin } from "@opencode/plugin"

const allow = (action: string): Rule => ({ action, resource: "*", effect: "allow" })
const deny = (action: string): Rule => ({ action, resource: "*", effect: "deny" })
const ask = (action: string): Rule => ({ action, resource: "*", effect: "ask" })
const BASE = allow("*")

describe("default rules", () => {
  test("unknown tavily tools ask and the five documented tools are allowed", () => {
    expect(DEFAULT_RULES[0]).toEqual(ask("tavily_*"))
    expect(KNOWN_READS).toEqual([
      "tavily_tavily_search",
      "tavily_tavily_extract",
      "tavily_tavily_map",
      "tavily_tavily_crawl",
      "tavily_tavily_research",
    ])
    expect(DEFAULT_RULES.slice(1)).toEqual(KNOWN_READS.map(allow))
  })
})

describe("insertDefaultRules", () => {
  test("inserts right after the first base allow", () => {
    const rules = [BASE, ask("read"), BASE, deny("edit")]
    insertDefaultRules(rules)
    expect(rules).toEqual([BASE, ...DEFAULT_RULES, ask("read"), BASE, deny("edit")])
  })

  test("leaves an agent without a base allow unchanged, so its default deny stays a deny", () => {
    const rules = [deny("*"), ask("read")]
    insertDefaultRules(rules)
    expect(rules).toEqual([deny("*"), ask("read")])
    expect(evaluate(rules, "tavily_tavily_search")).toBe("deny")
    expect(rules.length).toBe(2)
  })

  test("is idempotent", () => {
    const rules = [BASE, ask("read")]
    insertDefaultRules(rules)
    insertDefaultRules(rules)
    expect(rules.filter((rule) => rule.action === "tavily_*")).toHaveLength(1)
    expect(hasDefaultRules(rules)).toBe(true)
  })

  test("known reads are allowed, unknown tools ask", () => {
    const rules = [BASE]
    insertDefaultRules(rules)
    for (const action of KNOWN_READS) expect(evaluate(rules, action)).toBe("allow")
    expect(evaluate(rules, "tavily_feedback")).toBe("ask")
    expect(evaluate(rules, "tavily_unknown")).toBe("ask")
    expect(evaluate(rules, "read")).toBe("allow")
  })

  test("an agent with a later `* * deny` still denies every tavily tool", () => {
    const rules = [BASE, ask("read"), deny("*"), allow("grep")]
    insertDefaultRules(rules)
    expect(evaluate(rules, "tavily_tavily_search")).toBe("deny")
    expect(evaluate(rules, "tavily_unknown")).toBe("deny")
  })

  test("a user rule appended later wins", () => {
    const rules = [BASE]
    insertDefaultRules(rules)
    rules.push(allow("tavily_unknown"), ask("tavily_tavily_research"), deny("tavily_tavily_crawl"))
    expect(evaluate(rules, "tavily_unknown")).toBe("allow")
    expect(evaluate(rules, "tavily_tavily_research")).toBe("ask")
    expect(evaluate(rules, "tavily_tavily_crawl")).toBe("deny")
    expect(evaluate(rules, "tavily_tavily_search")).toBe("allow")
  })
})

describe("evaluate", () => {
  test("follows the host's wildcards and treats no match as ask", () => {
    expect(evaluate([allow("tavily_?avily_map")], "tavily_tavily_map")).toBe("allow")
    expect(evaluate([allow("tavily.*")], "tavily_x")).toBe("ask")
    expect(evaluate([], "tavily_x")).toBe("ask")
    expect(evaluate([{ action: "*", resource: "secret", effect: "deny" }], "tavily_x")).toBe("ask")
  })
})

describe("registerDefaultRules", () => {
  test("adds the rules to every agent, once per rebuild", async () => {
    const agentDomain = transforms<EditorOf<Plugin.Context["agent"]>>()
    await registerDefaultRules(agentDomain)
    const agents = [agent("build"), agent("explore", [BASE, deny("*"), allow("read")]), agent("plan")]
    agentDomain.run(agentEditor(agents))
    agentDomain.run(agentEditor(agents))
    for (const entry of agents) {
      expect(entry.permissions[0]).toEqual(BASE)
      expect(entry.permissions.slice(1, 1 + DEFAULT_RULES.length)).toEqual([...DEFAULT_RULES])
      expect(entry.permissions.filter((rule) => rule.action === "tavily_*")).toHaveLength(1)
    }
    expect(evaluate(agents[1].permissions, "tavily_tavily_search")).toBe("deny")
  })
})
