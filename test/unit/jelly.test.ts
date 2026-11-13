import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { INTEGRATION_ID } from "../../src/credential.js"
import { SERVER_NAME } from "../../src/mcp.js"
import { parseOptions } from "../../src/options.js"
import { defaultRules, KNOWN_ACTIONS } from "../../src/permissions.js"
import { declarationProblems, docProblems, effectFromRules, readPackage } from "../support/jelly-kit.js"
import { ACCESS_CHOICES, type DeclaredSetting, settingChoices, settingsProblems, settingValueIssue } from "../support/jelly-settings.js"

/**
 * The `jelly` section of package.json, which Jelly reads without loading the plugin. Jelly's agents have no base
 * "allow everything" rule, so this plugin's own default rules never reach them; Jelly writes each declared "ask" or
 * "deny" as that tool's default instead. The shared kit checks the declaration against Jelly's plugin authors'
 * standard; the tests below add what only Tavily declares.
 */
const ROOT = new URL("../../", import.meta.url)
const pkg = readPackage(ROOT)
const signIns = pkg.jelly?.signIns ?? []

describe("the jelly declaration", () => {
  test("follows the plugin authors' standard, with the effects the plugin's own default rules give", () => {
    expect(declarationProblems(ROOT, { effectOf: effectFromRules(defaultRules()), registered: KNOWN_ACTIONS })).toEqual([])
  })

  test("declares each tool read-only", () => {
    for (const tool of pkg.jelly?.tools ?? []) expect(tool.readOnly, tool.name).toBe(true)
  })

  const settings = (pkg.jelly?.contributes as { settings: DeclaredSetting[] }).settings
  const setting = (key: string) => settings.find((item) => item.key === key)!

  test("exposes the flat access, websearch and executionTimeoutMs options, each default the parser's", () => {
    expect(settings.map(({ key, type }) => ({ key, type }))).toEqual([
      { key: "access", type: "string" },
      { key: "websearch", type: "boolean" },
      { key: "executionTimeoutMs", type: "number" },
    ])
    expect(parseOptions({ access: "read-only", websearch: false })).toMatchObject({ access: "read-only", websearch: false })
    const defaults = parseOptions({})
    for (const item of settings) expect([item.key, item.default]).toEqual([item.key, defaults[item.key as "access" | "websearch" | "executionTimeoutMs"]])
  })

  test("passes Jelly's setting contract: access offers Jelly's three choices, the timeout is a bounded whole number", () => {
    expect(settingsProblems(settings)).toEqual([])
    expect(setting("access").choices).toEqual([...ACCESS_CHOICES])
    expect(setting("executionTimeoutMs")).toMatchObject({ integer: true, min: 60_000, max: 3_600_000 })
    expect(setting("executionTimeoutMs").step).toBeUndefined()
  })

  test("offers only access values the parser takes, and the parser refuses one outside the set", () => {
    const access = setting("access")
    for (const value of settingChoices(access)!.map((choice) => choice.value)) {
      expect(settingValueIssue(access, value)).toBeNull()
      expect(parseOptions({ access: value }).access as string).toBe(value)
    }
    for (const outside of ["write", "read", "none", ""]) {
      expect(settingValueIssue(access, outside)).not.toBeNull()
      expect(() => parseOptions({ access: outside })).toThrow("OPTIONS_INVALID")
    }
  })

  test("bounds executionTimeoutMs exactly as the parser does: its ends are taken, a step past either end or a fraction refused", () => {
    const timeout = setting("executionTimeoutMs")
    for (const value of [timeout.min!, timeout.max!]) {
      expect(settingValueIssue(timeout, value)).toBeNull()
      expect(parseOptions({ executionTimeoutMs: value }).executionTimeoutMs).toBe(value)
    }
    for (const value of [timeout.min! - 1, timeout.max! + 1, timeout.min! + 0.5]) {
      expect(settingValueIssue(timeout, value)).not.toBeNull()
      expect(() => parseOptions({ executionTimeoutMs: value })).toThrow("OPTIONS_INVALID")
    }
  })

  test("declares the two sign-ins: an API key through the built-in Tavily entry, or OAuth with a Tavily account", () => {
    const key = signIns.find((signIn) => signIn.id === "key")
    const account = signIns.find((signIn) => signIn.id === "account")
    expect(signIns).toHaveLength(2)
    expect(key).toMatchObject({ integration: INTEGRATION_ID, label: "Tavily" })
    expect(account).toMatchObject({ server: SERVER_NAME, label: "Tavily account" })
    expect((key as { group?: string }).group).toBe((account as { group?: string }).group)
  })
})

describe("docs/jelly.md", () => {
  test("follows the plugin authors' standard", () => {
    expect(docProblems(ROOT)).toEqual([])
  })

  test("quotes the message /connect shows for a rejected key", () => {
    expect(readFileSync(new URL("docs/jelly.md", ROOT), "utf8")).toContain(
      "> Tavily did not accept this API key. Replace it, or remove it to sign in with your Tavily account.",
    )
  })
})
