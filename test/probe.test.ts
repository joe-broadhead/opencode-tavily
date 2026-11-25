import assert from "node:assert/strict"
import { test } from "node:test"
import { handlersFor } from "../src/handlers/index.ts"
import { refusalOfCall, run, runtimeFor } from "./support/runtime.ts"

test("probe answers the account and OpenCode's connection identity", async () => {
  const answer = (await run(runtimeFor(), "probe", {}, "work")) as Record<string, unknown>
  assert.deepEqual(answer, {
    account: "work",
    owner: { id: "mcp:tavily-work", label: "Tavily (work)", verified: false },
    trust: "untrusted",
  })
})

test("each alias probes its own server, and the default alias its own", async () => {
  const answer = (await run(runtimeFor(), "probe", {}, "personal")) as Record<string, unknown>
  assert.deepEqual(answer["owner"], { id: "mcp:tavily-personal", label: "Tavily (personal)", verified: false })
  const fallback = (await run(runtimeFor({ mcp: { list: async () => ({ data: [{ name: "tavily", status: { status: "connected" } }] }) } }), "probe", {}, "default")) as Record<string, unknown>
  assert.deepEqual(fallback["owner"], { id: "mcp:tavily", label: "Tavily", verified: false })
})

test("probe carries no source and no content", async () => {
  const answer = (await run(runtimeFor(), "probe", {}, "work")) as Record<string, unknown>
  assert.deepEqual(Object.keys(answer).sort(), ["account", "owner", "trust"])
  assert.equal(answer["source"], undefined)
  assert.deepEqual(Object.keys(answer["owner"] as Record<string, unknown>).sort(), ["id", "label", "verified"])
})

test("probe refuses an alias OpenCode lists no server for", async () => {
  const refusal = await refusalOfCall(() => run(runtimeFor(), "probe", {}, "team"))
  assert.equal(refusal?.code, "UNAVAILABLE")
  assert.match(refusal?.message ?? "", /^UNAVAILABLE: OpenCode lists no tavily-team server for team\. Next step: /)
})

test("probe refuses with a redacted reason when the server list cannot be read", async () => {
  const refusal = await refusalOfCall(() =>
    run(
      runtimeFor({
        mcp: {
          list: async () => {
            throw new Error("the host failed at https://mcp.tavily.com/cb?access_token=hidden-secret")
          },
        },
      }),
      "probe",
      {},
      "work",
    ),
  )
  assert.equal(refusal?.code, "UNAVAILABLE")
  assert.doesNotMatch(refusal?.message ?? "", /hidden-secret/)
  assert.match(refusal?.message ?? "", /Next step: /)
})

test("the probe handler declares a closed input and a closed answer", () => {
  const handler = handlersFor(runtimeFor())["probe"]
  assert.ok(handler !== undefined)
  assert.deepEqual(handler.input, { type: "object", properties: {}, additionalProperties: false })
  assert.equal(handler.output["additionalProperties"], false)
  assert.deepEqual(handler.output["required"], ["account", "owner", "trust"])
  assert.match(handler.description, /reads no web content/i)
})
