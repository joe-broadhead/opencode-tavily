import { describe, expect, test } from "bun:test"
import { checkHost, isTestedHost, TESTED_HOST } from "../../src/host-version.js"
import pkg from "../../package.json" with { type: "json" }

describe("host check", () => {
  test("the tested range is the 2.2 line from 2.2.3, matches opencode.host, and the package declares no peers", () => {
    expect(TESTED_HOST).toBe(">=2.2.3 <2.3.0")
    expect(pkg.opencode.host).toBe(TESTED_HOST)
    expect(pkg).not.toHaveProperty("peerDependencies")
    expect(pkg).not.toHaveProperty("peerDependenciesMeta")
  })

  test.each(["2.2.3", "2.2.4", "2.2.10"])("%s is tested", (version) => {
    expect(isTestedHost(version)).toBe(true)
    expect(checkHost(version, false, () => {})).toEqual({ version, tested: true })
  })

  test.each([
    "2.2.2",
    "2.1.9",
    "2.3.0",
    "2.9.0",
    "2.10.12",
    "3.0.0",
    "1.9.9",
    "0.0.0-dev-1",
    "2.2.4-beta.1",
    "2.3.0-rc.1",
    "v2.2.3",
    "",
  ])("%p is refused", (version) => {
    expect(isTestedHost(version)).toBe(false)
    expect(() => checkHost(version, false, () => {})).toThrow(
      `HOST_UNTESTED: This plugin supports OpenCode >=2.2.3 <2.3.0, and this is ${version}. Next step: Use OpenCode 2.2.3 or a later 2.2 release, or set "allowUntestedHost": true to run anyway.`,
    )
  })

  test.each(["2.3.0", "3.0.0", "2.2.2", "0.0.0-dev-1"])("the override warns once for %p and continues", (version) => {
    const warnings: string[] = []
    expect(checkHost(version, true, (message) => warnings.push(message))).toEqual({ version, tested: false })
    expect(warnings).toEqual([
      `HOST_UNTESTED: This plugin supports OpenCode >=2.2.3 <2.3.0, and this is ${version}; it runs because "allowUntestedHost" is true. Next step: If Tavily misbehaves, use OpenCode 2.2.3 or a later 2.2 release.`,
    ])
  })

  test("a tested host does not warn, even with the override", () => {
    const warnings: string[] = []
    checkHost("2.2.3", true, (message) => warnings.push(message))
    expect(warnings).toEqual([])
  })
})
