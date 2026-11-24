import { describe, expect, test } from "bun:test"
import { checkHost, HOST_RANGE, inHostRange, TESTED_HOSTS, TESTED_TEXT } from "../../src/host-version.js"
import pkg from "../../package.json" with { type: "json" }

describe("host check", () => {
  test("the range is the 2.4 line from 2.4.1, matches opencode.host, and the package declares no peers", () => {
    expect(HOST_RANGE).toBe(">=2.4.1 <2.5.0")
    expect(pkg.opencode.host).toBe(HOST_RANGE)
    expect(pkg).not.toHaveProperty("peerDependencies")
    expect(pkg).not.toHaveProperty("peerDependenciesMeta")
  })

  test("the only tested release is 2.4.1, inside the range", () => {
    expect([...TESTED_HOSTS]).toEqual(["2.4.1"])
    expect(TESTED_HOSTS.every(inHostRange)).toBe(true)
    expect(TESTED_TEXT).toBe("2.4.1")
  })

  test("2.4.1 is tested", () => {
    expect(checkHost("2.4.1", false, () => {})).toEqual({ version: "2.4.1", tested: true, inRange: true })
  })

  test.each(["2.4.2", "2.4.99", "2.4.10"])("%s is inside the range but untested: it runs, without a warning", (version) => {
    const warnings: string[] = []
    expect(checkHost(version, false, (message) => warnings.push(message))).toEqual({ version, tested: false, inRange: true })
    expect(warnings).toEqual([])
  })

  test.each([
    "2.4.0",
    "2.3.9",
    "2.3.2",
    "2.2.3",
    "2.5.0",
    "2.9.0",
    "2.10.12",
    "3.0.0",
    "1.9.9",
    "0.0.0-dev-1",
    "2.4.1-beta.1",
    "2.5.0-rc.1",
    "v2.4.1",
  ])("%p is refused", (version) => {
    expect(inHostRange(version)).toBe(false)
    expect(() => checkHost(version, false, () => {})).toThrow(
      `HOST_UNTESTED: This plugin supports OpenCode >=2.4.1 <2.5.0, and this is ${version}. Next step: Use OpenCode 2.4.1, or set "allowUntestedHost": true to run anyway.`,
    )
  })

  test("a host that reports no version is refused, and reported as null with the override", () => {
    expect(() => checkHost("", false, () => {})).toThrow(
      `HOST_UNTESTED: This plugin supports OpenCode >=2.4.1 <2.5.0, and this is a release that reports no version. Next step:`,
    )
    expect(checkHost(" ", true, () => {})).toEqual({ version: null, tested: false, inRange: false })
  })

  test.each(["2.5.0", "3.0.0", "2.4.0", "0.0.0-dev-1"])("the override warns once for %p and continues", (version) => {
    const warnings: string[] = []
    expect(checkHost(version, true, (message) => warnings.push(message))).toEqual({ version, tested: false, inRange: false })
    expect(warnings).toEqual([
      `HOST_UNTESTED: This plugin supports OpenCode >=2.4.1 <2.5.0, and this is ${version}; it runs because "allowUntestedHost" is true. Next step: If Tavily misbehaves, use OpenCode 2.4.1.`,
    ])
  })

  test("a tested host does not warn, even with the override", () => {
    const warnings: string[] = []
    checkHost("2.4.1", true, (message) => warnings.push(message))
    expect(warnings).toEqual([])
  })
})
