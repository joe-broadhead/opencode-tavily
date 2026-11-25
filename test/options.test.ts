import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULT_EXECUTION_TIMEOUT_MS, MAX_EXECUTION_TIMEOUT_MS, MIN_EXECUTION_TIMEOUT_MS, pluginOptions } from "../src/options.ts"

test("the defaults are the manifest's: web search on and fifteen minutes", () => {
  assert.deepEqual(pluginOptions({}), { websearch: true, executionTimeoutMs: DEFAULT_EXECUTION_TIMEOUT_MS })
})

test("the contract's options pass through untouched", () => {
  assert.deepEqual(pluginOptions({ access: "read-only", accounts: { work: {} }, allowUntestedHost: true }), {
    websearch: true,
    executionTimeoutMs: DEFAULT_EXECUTION_TIMEOUT_MS,
  })
})

test("both plugin options are read", () => {
  assert.deepEqual(pluginOptions({ websearch: false, executionTimeoutMs: MIN_EXECUTION_TIMEOUT_MS }), {
    websearch: false,
    executionTimeoutMs: MIN_EXECUTION_TIMEOUT_MS,
  })
  assert.equal(pluginOptions({ executionTimeoutMs: MAX_EXECUTION_TIMEOUT_MS }).executionTimeoutMs, MAX_EXECUTION_TIMEOUT_MS)
})

test("a bad timeout is refused in the contract's one form", () => {
  for (const value of [MIN_EXECUTION_TIMEOUT_MS - 1, MAX_EXECUTION_TIMEOUT_MS + 1, 1.5, "900000", null]) {
    assert.throws(
      () => pluginOptions({ executionTimeoutMs: value }),
      (error: unknown) => error instanceof Error && error.message.startsWith("OPTIONS_INVALID: ") && error.message.includes("Next step: "),
      String(value),
    )
  }
})

test("a bad web search value is refused", () => {
  assert.throws(
    () => pluginOptions({ websearch: "yes" }),
    (error: unknown) => error instanceof Error && error.message.startsWith("OPTIONS_INVALID: "),
  )
})

test("an option the manifest does not declare is refused, never ignored", () => {
  assert.throws(
    () => pluginOptions({ allowEveryTool: true }),
    (error: unknown) => error instanceof Error && error.message.startsWith("OPTIONS_INVALID: ") && error.message.includes("allowEveryTool"),
  )
})
