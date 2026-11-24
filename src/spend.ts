/**
 * Tavily's five tools all spend credits from the signed-in account or API key. This module is the plugin's one spend
 * classification: `permissions.ts` derives the known actions from it, the tools RPC derives its method table from it,
 * status reports it, and the README, the skills and the `jelly.cost` line quote it.
 *
 * The class is `spend`, not one of the method classes (`read`, `write`, `send`, `share`, `delete`, `export`, `admin`):
 * every tool only reads from the web, and the money is a property of the call. v0 of plugin-contract puts it on
 * `actions[].effect: "spend"` with `cost`, so 4b turns `SPEND_CLASS` and `SPEND_TOOLS` into that without re-deriving
 * them. The plugin sets no spending limit.
 */

/** The effect 4b gives each action: the five tools spend money rather than change or send anything. */
export const SPEND_CLASS = "spend"

/** Tavily bills in credits. */
export const SPEND_UNIT = "credit"

export interface SpendTool {
  /** The upstream tool name without the server's `tavily_` prefix. */
  readonly name: string
  /** What one call costs, in Tavily's own units, as its API reference documents them. */
  readonly cost: string
}

/** The five tools, in the order the skills and the docs list them. Each call spends credits. */
export const SPEND_TOOLS: readonly SpendTool[] = [
  { name: "search", cost: "1 credit (basic, fast, ultra-fast), 2 (advanced)" },
  { name: "extract", cost: "1 per 5 pages read (basic), 2 per 5 (advanced); failed pages are free" },
  { name: "map", cost: "1 per 10 pages found, 2 per 10 with instructions" },
  { name: "crawl", cost: "map's cost plus extract's for each page read" },
  { name: "research", cost: "4-110 credits (mini), 15-250 (pro) per task" },
]

/**
 * The one spend line for status, the README and the `jelly` cost. It says what every call costs, the two bounded
 * prices a person budgets for, and that the plugin itself sets no cap.
 */
export const SPEND_TEXT =
  "Every search, extract, map, crawl and research call spends Tavily credits from the signed-in account or key. A research task costs 4-110 credits with mini and 15-250 with pro, and a crawl reads up to 50 pages by default. The plugin sets no spending limit."

/** The spend entry for an upstream tool name, such as `search`; undefined for a tool Tavily adds later. */
export const spendOf = (name: string) => SPEND_TOOLS.find((tool) => tool.name === name)
