import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("the built bundle calls .skill.transform directly", () => {
  // The release bot reads the bundle for this literal, so setup must call `context.skill.transform(...)` itself, not
  // through a helper whose name is the only thing the bundle preserves. A missing dist is a failure, never a skip.
  const bundle = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8")
  assert.ok(bundle.includes(".skill.transform"), "dist/index.js must contain the literal .skill.transform")
})
