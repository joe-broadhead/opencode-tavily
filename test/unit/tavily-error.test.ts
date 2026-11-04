import { describe, expect, test } from "bun:test"
import { modelText, tavilyErrorIn, tavilyErrorOf } from "../../src/tavily-error.js"

/** Tavily's answer to a rate-limited `tavily_map`, as it arrived live on 2026-11-04. */
const RATE_LIMITED = {
  error: "Map failed",
  status: 429,
  detail: { error: "Your request has been blocked due to excessive requests. Verify you are using production API keys." },
  documentation: "https://docs.tavily.com/documentation/rate-limits",
}

describe("Tavily's error object", () => {
  test("is a numeric status of 400 or more together with an error, with Tavily's words and a next step", () => {
    expect(tavilyErrorOf(RATE_LIMITED)).toEqual({
      status: 429,
      message: "Map failed: Your request has been blocked due to excessive requests. Verify you are using production API keys.",
      next: "Wait a minute, then retry; if it keeps happening, check your Tavily plan and API key at https://app.tavily.com.",
    })
    expect(tavilyErrorOf({ error: "Bad", status: 400 })).toMatchObject({ status: 400, message: "Bad" })
    expect(tavilyErrorOf({ error: { message: "Nested" }, status: 500, detail: "Nested" })).toMatchObject({ message: "Nested" })
  })

  test.each([
    [401, "Run /tavily-status and follow its next step to sign in again or replace the key."],
    [403, "Check the input against the tool's schema, then retry with a corrected input."],
    [432, "Check your Tavily plan's usage and limits at https://app.tavily.com, then retry."],
    [433, "Check your Tavily plan's usage and limits at https://app.tavily.com, then retry."],
    [500, "Wait a minute, then retry; Tavily had a problem on its side."],
  ])("status %d gets its own next step", (status, next) => {
    expect(tavilyErrorOf({ error: "x", status })?.next).toBe(next)
  })

  test.each([
    ["no error", { status: 429 }],
    ["an empty error", { error: " ", status: 429 }],
    ["a status below 400", { error: "x", status: 200 }],
    ["a string status", { error: "x", status: "429" }],
    ["a fractional status", { error: "x", status: 429.5 }],
    ["an array", [{ error: "x", status: 429 }]],
    ["a search result", { query: "q", results: [{ url: "https://example.invalid", content: "error 429" }], response_time: 1 }],
    ["null", null],
  ])("%s is not one", (_name, value) => {
    expect(tavilyErrorOf(value)).toBeUndefined()
  })

  test("is found in structured content, or in text that is exactly one JSON object", () => {
    expect(tavilyErrorIn(RATE_LIMITED, "")).toMatchObject({ status: 429 })
    expect(tavilyErrorIn(undefined, ` ${JSON.stringify(RATE_LIMITED, null, 2)}\n`)).toMatchObject({ status: 429 })
    expect(tavilyErrorIn(undefined, `Results: ${JSON.stringify(RATE_LIMITED)}`)).toBeUndefined()
    expect(tavilyErrorIn(undefined, "{not json")).toBeUndefined()
    expect(tavilyErrorIn(undefined, JSON.stringify({ ...RATE_LIMITED, padding: "x".repeat(20_000) }))).toBeUndefined()
  })

  test("the model's text says it is an error, not data, in the error format with the next step", () => {
    expect(modelText("tavily_tavily_map", tavilyErrorOf(RATE_LIMITED)!)).toBe(
      "UPSTREAM_ERROR: tavily_tavily_map failed: Tavily answered with error 429: Map failed: Your request has been blocked due to excessive requests. Verify you are using production API keys. This is an error from Tavily, not a result. Next step: Wait a minute, then retry; if it keeps happening, check your Tavily plan and API key at https://app.tavily.com.",
    )
  })
})
