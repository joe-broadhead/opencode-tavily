import assert from "node:assert/strict"
import { test } from "node:test"
import type { Plugin } from "@opencode/plugin"
import { applyWebsearchDefault } from "../src/websearch.ts"

type Selection = string | false | undefined

function editor(initial: Selection) {
  const state = { selection: initial, transforms: 0, disposed: 0 }
  const websearch = {
    transform: async (callback: (value: { default: { get(): Selection; set(selection: string | false): void } }) => void) => {
      state.transforms += 1
      callback({
        default: {
          get: () => state.selection,
          set: (selection) => {
            state.selection = selection
          },
        },
      })
      return {
        dispose: async () => {
          state.disposed += 1
        },
      }
    },
  } as unknown as Pick<Plugin.Context["websearch"], "transform">
  return { state, websearch }
}

test("web search on selects OpenCode's built-in Tavily provider when nothing chose one", async () => {
  const { state, websearch } = editor(undefined)
  const registration = applyWebsearchDefault(websearch, true)
  assert.ok(registration !== undefined)
  const installed = await registration
  assert.equal(state.selection, "tavily")
  assert.equal(state.transforms, 1)
  await installed.dispose()
  assert.equal(state.disposed, 1)
})

test("an earlier provider choice wins", async () => {
  const { state, websearch } = editor("other-provider")
  await applyWebsearchDefault(websearch, true)
  assert.equal(state.selection, "other-provider")
  assert.equal(state.transforms, 1)
})

test("a person's web search off is a choice, not an empty slot", async () => {
  const { state, websearch } = editor(false)
  await applyWebsearchDefault(websearch, true)
  assert.equal(state.selection, false)
})

test("the option off leaves OpenCode's web search entirely alone", () => {
  const { state, websearch } = editor(undefined)
  assert.equal(applyWebsearchDefault(websearch, false), undefined)
  assert.equal(state.transforms, 0)
  assert.equal(state.selection, undefined)
})
