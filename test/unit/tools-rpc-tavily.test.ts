// Tavily's part of the tools RPC: the plugin-specific block of src/host/tools-rpc.ts. The shared part is tested in
// tools-rpc.test.ts.
import { describe, expect, test } from "bun:test"
import { KNOWN_READS, NEXT_STEPS, shapeResult, TOOLS_RPC_ID } from "../../src/host/tools-rpc.js"
import { SERVER_NAME } from "../../src/mcp.js"
import { KNOWN_READS as READ_ACTIONS } from "../../src/permissions.js"

describe("Tavily's tools RPC", () => {
  test("is tavily.web.tools, with exactly Tavily's five tools as methods", () => {
    expect(TOOLS_RPC_ID).toBe("tavily.web.tools")
    expect([...KNOWN_READS]).toEqual(["tavily_search", "tavily_extract", "tavily_map", "tavily_crawl", "tavily_research"])
  })

  test("its methods are the tools the default rules allow, so a new Tavily tool never becomes one", () => {
    expect(KNOWN_READS.map((name) => `${SERVER_NAME}_${name}`)).toEqual([...READ_ACTIONS])
  })

  test("returns Tavily's results unchanged: the model path has no hook that changes them", () => {
    const result = { output: { results: [] }, text: "text" }
    expect(shapeResult("tavily_search", result)).toBe(result)
  })

  test("has no per-account servers", () => {
    expect(NEXT_STEPS.ACCOUNT_UNKNOWN).toBeUndefined()
  })
})
