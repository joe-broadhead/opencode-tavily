import { readFileSync } from "node:fs"
import { describe, expect, it } from "bun:test"

/**
 * The committed capture (`test/fixtures/live-tools.json`) is a live one of this plugin's server. The release kit's drift
 * check (`scripts/check-drift.mjs`: the kit tests run it in `npm run check`, and the release build runs it as a gate)
 * checks the declaration, the registry and `provenance.json` against it: every served tool declared with the server's
 * readOnlyHint or a recorded override, nothing declared that is not served unless it is the plugin's own or gated with a
 * reason and a note, the plugin's own tools off the server's list, no registry entry that no longer applies, every tool
 * allow, every permission in the namespace, and the capture's count, digest and provenance. It only warns on a
 * names-only capture, so this plugin, which has a live one, keeps that case here.
 */

const NAMESPACE = "tavily"
const capture = JSON.parse(readFileSync(new URL("../../test/fixtures/live-tools.json", import.meta.url), "utf8")) as { evidence: string; server: string }

describe("the committed capture", () => {
  it("is a live capture of this plugin's own server, never a names-only one", () => {
    expect(capture.evidence).toBe("live-observed")
    expect(capture.server).toBe(NAMESPACE)
  })
})
