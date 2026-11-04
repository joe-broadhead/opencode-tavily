// Tavily's part of the tools RPC: the plugin-specific block of src/host/tools-rpc.ts. The shared part is tested in
// tools-rpc.test.ts.
import { describe, expect, test } from "bun:test"
import { KNOWN_READS, NEXT_STEPS, pluginError, shapeResult, TOOLS_RPC_ID } from "../../src/host/tools-rpc.js"
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

  test("returns Tavily's results unchanged: the same object", () => {
    for (const result of [{ output: { results: [] }, text: "text" }, { text: '{"query":"q"}' }, { text: "" }])
      expect(shapeResult("tavily_search", result)).toBe(result)
  })

  test("turns Tavily's error object, answered as a result, into UPSTREAM_ERROR with the first line redacted", () => {
    const error = {
      error: "Extract failed",
      status: 429,
      detail: { error: "Blocked for https://files.example.invalid/a.pdf?X-Amz-Signature=secret-123 key tvly-abcdefgh12345\nsecond line" },
    }
    let thrown: unknown
    try {
      shapeResult("tavily_extract", { text: JSON.stringify(error) })
    } catch (caught) {
      thrown = caught
    }
    expect(pluginError(thrown)).toEqual({
      code: "UPSTREAM_ERROR",
      what: "tavily_tavily_extract failed: Tavily answered with error 429: Extract failed: Blocked for https://files.example.invalid/a.pdf?[redacted] key [redacted]",
      next: "Wait a minute, then retry; if it keeps happening, check your Tavily plan and API key at https://app.tavily.com.",
    })
    expect(() => shapeResult("tavily_map", { output: { error: "Map failed", status: 500 }, text: "" })).toThrow("Map failed")
  })

  test("names no other error as its own", () => {
    expect(pluginError(new Error("Map failed"))).toBeUndefined()
  })

  test("the sign-in next step matches status: Tavily MCP first, then an API key", () => {
    expect(NEXT_STEPS.AUTH_REQUIRED).toBe("Run /connect and choose Tavily MCP to sign in, or choose Tavily to use an API key.")
  })

  test("has no per-account servers", () => {
    expect(NEXT_STEPS.ACCOUNT_UNKNOWN).toBeUndefined()
  })
})
