/**
 * OpenCode's built-in Tavily web search provider.
 *
 * The plugin adds no provider of its own: it selects the one OpenCode ships when nothing earlier chose one. A
 * `websearch` choice in `opencode.json` is applied by OpenCode's own plugin, which runs after package plugins, so that
 * choice still wins; the plugin cannot see it. Off means the plugin leaves the choice entirely alone.
 */
import type { Plugin } from "@opencode/plugin"

/** OpenCode's built-in Tavily web search provider. */
export const WEBSEARCH_PROVIDER = "tavily"

/**
 * Select the built-in provider when no earlier transform chose one, and only then.
 *
 * `false` is a choice: OpenCode stores it when a person turned web search off, and the plugin leaves it. Returns the
 * transform's registration for cleanup, or undefined when the option is off.
 */
export function applyWebsearchDefault(websearch: Pick<Plugin.Context["websearch"], "transform">, enabled: boolean) {
  if (!enabled) return undefined
  return websearch.transform((editor) => {
    if (editor.default.get() === undefined) editor.default.set(WEBSEARCH_PROVIDER)
  })
}
