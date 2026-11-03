import { describe, expect, test } from "bun:test"
import { DEFAULT_RULES } from "../../src/permissions.js"
import { Tavily, type Status } from "../../src/rpc/index.js"
import { buildStatus, type StatusFacts } from "../../src/status.js"
import { schemaErrors } from "../schema.js"

const valid = (schema: Parameters<typeof schemaErrors>[0], value: unknown) => schemaErrors(schema, value).length === 0

const status = Tavily.methods.status

describe("RPC contract", () => {
  test("is tavily.web with one read-only method and no events", () => {
    expect(Tavily.id).toBe("tavily.web")
    expect(Object.keys(Tavily.methods)).toEqual(["status"])
    expect(Tavily.events).toEqual({})
  })

  test("takes an empty object", () => {
    expect(status.input).toEqual({ type: "object", properties: {}, additionalProperties: false })
    expect(valid(status.input, {})).toBe(true)
    expect(valid(status.input, { directory: "/" })).toBe(false)
    expect(valid(status.input, undefined)).toBe(false)
  })

  test("describes every status field and value", () => {
    expect(status.output.required).toEqual(["connection", "auth", "tools", "websearchDefault", "host", "nextStep"])
    expect(status.output.properties.connection.enum).toEqual([
      "connected",
      "pending",
      "needs_auth",
      "failed",
      "disabled",
      "not_registered",
    ])
    expect(status.output.properties.auth.enum).toEqual(["oauth", "key_connected", "key_env", "user_server", "none"])
    expect(status.output.properties.keyCheck.enum).toEqual(["accepted", "rejected", "unchecked"])
    expect(Object.keys(status.output.properties)).toEqual([
      "connection",
      "auth",
      "account",
      "keyCheck",
      "tools",
      "websearchDefault",
      "host",
      "unguardedAgents",
      "permissionsBlock",
      "nextStep",
    ])
  })

  test("every built status matches the output schema", () => {
    const base: StatusFacts = {
      userServer: false,
      tools: [{ id: "tavily_tavily_search" }, { id: "tavily_tavily_feedback" }],
      websearchDefault: false,
      host: { version: "2.2.3", tested: true },
      agents: [{ id: "build", permissions: [{ action: "*", resource: "*", effect: "allow" }, ...DEFAULT_RULES] }],
    }
    const statuses: Status[] = [
      buildStatus(base),
      ...(["connected", "pending", "needs_auth", "failed", "disabled"] as const).flatMap((connection) => [
        buildStatus({ ...base, server: { status: connection }, oauthAccount: "me" }),
        buildStatus({ ...base, server: { status: connection }, key: { key: "k", source: "connected", label: "Tavily" } }),
        buildStatus({ ...base, server: { status: connection }, key: { key: "k", source: "env" } }),
        ...(["accepted", "rejected", "unchecked"] as const).map((keyCheck) =>
          buildStatus({ ...base, server: { status: connection }, key: { key: "k", source: "env" }, keyCheck }),
        ),
        buildStatus({ ...base, server: { status: connection }, userServer: true }),
      ]),
      buildStatus({ ...base, server: { status: "connected" }, agents: [{ id: "reviewer", permissions: [] }] }),
      buildStatus({ ...base, server: { status: "connected" }, host: { version: "3.0.0", tested: false } }),
    ]
    for (const entry of statuses) expect(valid(status.output, entry)).toBe(true)
    expect(valid(status.output, { ...statuses[1], key: "k" })).toBe(false)
    expect(valid(status.output, { ...statuses[1], keyCheck: "maybe" })).toBe(false)
    expect(valid(status.output, { ...statuses[1], tools: { visible: 1.5, unknown: 0, unknownNames: [] } })).toBe(false)
  })

  test("its one error carries a next step", () => {
    expect(Object.keys(status.errors)).toEqual(["unavailable"])
    expect(valid(status.errors.unavailable, { nextStep: "Run /tavily-status again." })).toBe(true)
    expect(valid(status.errors.unavailable, {})).toBe(false)
  })
})
