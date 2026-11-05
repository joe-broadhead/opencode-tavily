import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"

/**
 * Every error code the plugin raises is documented, and every documented code is one it raises: the plugin's own
 * codes in docs/configuration.md and the README, and the tools RPC's codes in docs/scripting.md.
 */

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")
const sorted = (codes: Iterable<string>) => [...new Set(codes)].sort()

/** The codes in a Markdown section's table: each code cell's backticked SCREAMING_SNAKE names. */
function documented(text: string, heading: string) {
  const start = text.indexOf(`\n${heading}\n`)
  expect(start, heading).toBeGreaterThan(-1)
  const section = text.slice(start + heading.length + 2).split(/\n#{1,2} /)[0]
  return sorted(
    section
      .split("\n")
      .filter((line) => line.startsWith("| `"))
      .flatMap((line) => [...line.split("|")[1].matchAll(/`([A-Z][A-Z_]+)`/g)].map((match) => match[1])),
  )
}

/** The codes the plugin's own source raises, outside the tools RPC: string literals that start with `CODE: `. */
const raised = sorted(
  readdirSync(new URL("../../src/", import.meta.url), { recursive: true, encoding: "utf8" })
    .filter((path) => /\.tsx?$/.test(path) && path !== "host/tools-rpc.ts")
    .flatMap((path) => [...read(`src/${path}`).matchAll(/[`"']([A-Z][A-Z_]{2,}): /g)].map((match) => match[1])),
)

/** The tools RPC's codes: its `Code` union, without ACCOUNT_UNKNOWN (Tavily has one server, no accounts). */
const rpcCodes = sorted(
  [...read("src/host/tools-rpc.ts").match(/type Code =([\s\S]*?)\n\n/)![1].matchAll(/"([A-Z_]+)"/g)]
    .map((match) => match[1])
    .filter((code) => code !== "ACCOUNT_UNKNOWN"),
)

describe("the documented errors", () => {
  test("the plugin raises some codes, and the RPC has its own", () => {
    expect(raised).toContain("UPSTREAM_ERROR")
    expect(rpcCodes).toContain("PERMISSION_DENIED")
  })

  test("docs/configuration.md lists exactly the codes the plugin raises", () => {
    expect(documented(read("docs/configuration.md"), "## Errors")).toEqual(raised)
  })

  test("the README's Troubleshooting lists exactly the codes the plugin raises", () => {
    expect(documented(read("README.md"), "## Troubleshooting")).toEqual(raised)
  })

  test("docs/scripting.md lists exactly the tools RPC's codes", () => {
    expect(documented(read("docs/scripting.md"), "## Errors")).toEqual(rpcCodes)
  })
})
