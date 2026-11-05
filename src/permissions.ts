import type { Plugin } from "@opencode/plugin"
import type { PermissionRule as Rule } from "./rpc/index.js"

export type { Rule }

/** The permission actions of Tavily's documented tools. Hosted discovery marks all five read-only. */
export const KNOWN_ACTIONS = ["search", "extract", "map", "crawl", "research"].map((tool) => `tavily_tavily_${tool}`)

/** Unknown or new `tavily` tools ask; the known reads run without a prompt. */
export const DEFAULT_RULES: readonly Rule[] = [
  { action: "tavily_*", resource: "*", effect: "ask" },
  ...KNOWN_ACTIONS.map((action): Rule => ({ action, resource: "*", effect: "allow" })),
]

const BASE_ALLOW: Rule = { action: "*", resource: "*", effect: "allow" }

const same = (a: Rule, b: Rule) => a.action === b.action && a.resource === b.resource && a.effect === b.effect

/**
 * True when the default rules appear as one contiguous block anywhere after the agent's first base allow. Other
 * plugins insert their blocks at the same place, so the block need not come first.
 */
export function hasDefaultRules(rules: readonly Rule[]) {
  const base = rules.findIndex((rule) => same(rule, BASE_ALLOW))
  if (base === -1) return false
  return rules.some(
    (_, start) =>
      start > base &&
      DEFAULT_RULES.every((rule, offset) => {
        const candidate = rules[start + offset]
        return candidate !== undefined && same(candidate, rule)
      }),
  )
}

/**
 * Inserts the default rules right after the agent's first base allow. Every later rule (agent-specific denies, the
 * user's `permissions`, saved approvals) still wins, because the last match wins. An agent without a base allow gets
 * nothing: there, unlisted tools are not allowed anyway, and the block's `ask` would loosen a default deny.
 */
export function insertDefaultRules(rules: Rule[]) {
  const base = rules.findIndex((rule) => same(rule, BASE_ALLOW))
  if (base === -1 || hasDefaultRules(rules)) return
  rules.splice(base + 1, 0, ...DEFAULT_RULES.map((rule) => ({ ...rule })))
}

/** A tool Tavily might add later: no rule names it, so the block's `tavily_*` ask decides it. */
const UNKNOWN_TOOL = `tavily_unknown`

/**
 * An agent is unguarded when it has a base allow, lacks the block, and its own rules would let a new Tavily tool
 * run without asking. An agent whose rules already ask or deny for every Tavily tool needs no fix.
 */
export function isUnguarded(rules: readonly Rule[]) {
  return rules.some((rule) => same(rule, BASE_ALLOW)) && !hasDefaultRules(rules) && evaluate(rules, UNKNOWN_TOOL) === "allow"
}

/** Host wildcards: `*` matches any run of characters and `?` one character, over the whole string. */
const matches = (pattern: string, value: string) =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`).test(value)

/** The effect of `rules` for an MCP-style call (resource `*`): the last matching rule wins, and no match asks. */
export function evaluate(rules: readonly Rule[], action: string): Rule["effect"] {
  return rules.findLast((rule) => matches(rule.action, action) && matches(rule.resource, "*"))?.effect ?? "ask"
}

export function registerDefaultRules(agent: Pick<Plugin.Context["agent"], "transform">) {
  return agent.transform((editor) => {
    for (const { id } of editor.list()) editor.update(id, (info) => insertDefaultRules(info.permissions))
  })
}
