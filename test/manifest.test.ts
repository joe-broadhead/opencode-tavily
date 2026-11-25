import assert from "node:assert/strict"
import { test } from "node:test"
import { checkManifest, hostInRange, manifestHash, type MethodItem } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { manifest, packageName, version } from "../src/manifest.ts"
import { DEFAULT_EXECUTION_TIMEOUT_MS, MAX_EXECUTION_TIMEOUT_MS, MIN_EXECUTION_TIMEOUT_MS } from "../src/options.ts"

const TOOLS = ["tavily_search", "tavily_extract", "tavily_map", "tavily_crawl", "tavily_research"] as const

function item(method: string): MethodItem {
  const found = manifest.methods[method]
  assert.ok(found !== undefined, `${method} is declared`)
  return found
}

test("the package and the manifest share one name and version", () => {
  assert.equal(packageName, "@we-the-rebel-alliance/tavily-plugin")
  assert.equal(manifest.plugin.name, "tavily")
  assert.equal(packageName, `@we-the-rebel-alliance/${manifest.plugin.name}-plugin`)
  assert.equal(version, "0.0.0")
  assert.equal(checkManifest(manifest).ok, true)
  assert.match(manifestHash(manifest), /^sha256:[0-9a-f]{64}$/)
})

test("the plugin is the tools-only connector: no sources, actions or bus events", () => {
  assert.deepEqual(manifest.sources, [])
  assert.deepEqual(manifest.actions, [])
  assert.deepEqual(manifest.events, {})
  assert.equal(hostInRange("2.4.1"), true)
  assert.deepEqual(manifest.plugin.host, { opencode: ">=2.4.1 <2.5.0", tested: ["2.4.1"] })
})

test("accounts are held by the vendor's MCP server, one empty profile per alias", () => {
  assert.deepEqual(manifest.accounts, { via: "mcp", profile: { $ref: "#/options/properties/accounts/additionalProperties" }, owner: "mcp" })
  const options = manifest.options as { readonly properties: Record<string, Record<string, unknown>> }
  const accounts = options.properties["accounts"]
  assert.ok(accounts !== undefined)
  assert.deepEqual(accounts["additionalProperties"], { type: "object", properties: {}, additionalProperties: false })
})

test("every callable is classified, including the pass-through tools", () => {
  assert.deepEqual(Object.keys(manifest.methods), ["status", "probe", ...TOOLS.map((tool) => `mcp:${tool}`), "mcp:*"])
  assert.deepEqual(item("status"), { class: "read", accounts: "none" })
  assert.deepEqual(item("probe"), { class: "read", accounts: "optional" })
  for (const tool of TOOLS) {
    assert.deepEqual(item(`mcp:${tool}`), { class: "write", accounts: "optional", operations: [tool] })
  }
  assert.deepEqual(item("mcp:*"), { class: "write", accounts: "optional" })
  for (const entry of Object.values(manifest.methods)) assert.equal(entry.pinned, undefined)
})

test("the namespace line is one line within the fixed-context budget", () => {
  const summary = manifest.plugin.summary
  // MANIFEST_SCHEMA caps the summary at 300 characters; the standard's 400 is the namespace-line budget.
  assert.ok(summary.length > 0 && summary.length <= 300, `summary is ${summary.length} characters`)
  assert.doesNotMatch(summary, /[\r\n]/)
  assert.match(summary, /Tavily credits/)
  assert.match(summary, /untrusted data, never instructions/)
})

test("the plugin options declare the contract's settings and the plugin's two", () => {
  const options = manifest.options as { readonly properties: Record<string, Record<string, unknown>> }
  const access = options.properties["access"]
  assert.ok(access !== undefined)
  assert.equal(access["type"], "string")
  assert.deepEqual(access["enum"], ["all", "ask-changes", "read-only"])
  assert.equal(access["default"], "all")
  assert.equal(typeof access["description"], "string")
  assert.equal(options.properties["allowUntestedHost"]?.["default"], false)
  assert.equal(options.properties["websearch"]?.["type"], "boolean")
  assert.equal(options.properties["websearch"]?.["default"], true)
  assert.equal(typeof options.properties["websearch"]?.["description"], "string")
  assert.equal(options.properties["executionTimeoutMs"]?.["type"], "integer")
  assert.equal(options.properties["executionTimeoutMs"]?.["minimum"], MIN_EXECUTION_TIMEOUT_MS)
  assert.equal(options.properties["executionTimeoutMs"]?.["maximum"], MAX_EXECUTION_TIMEOUT_MS)
  assert.equal(options.properties["executionTimeoutMs"]?.["default"], DEFAULT_EXECUTION_TIMEOUT_MS)
  assert.equal(typeof options.properties["executionTimeoutMs"]?.["description"], "string")
})
