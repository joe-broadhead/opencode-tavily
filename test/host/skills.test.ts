import assert from "node:assert/strict"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { activate } from "../support/host.ts"

test("every packaged skill is registered and listed by the real 2.4.1 host", async () => {
  const run = await activate()
  try {
    const answer = await run.host.skill.list({ location: { directory: run.directory } })
    const data = answer.data as { id: string; name: string; description?: string; path: string; content: string }[]
    const listed = new Map(data.map((skill) => [String(skill.id), skill]))
    const directories = readdirSync(join(run.repository, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    assert.deepEqual(directories, ["tavily", "tavily-research"])
    for (const directory of directories) {
      const skill = listed.get(directory)
      assert.ok(skill !== undefined, `${directory} is listed by the host`)
      assert.equal(skill.name, directory)
      assert.ok((skill.description ?? "").length > 0, `${directory} has a description`)
      assert.ok(skill.content.length > 0, `${directory} has content`)
      assert.ok(skill.path.endsWith(`skills/${directory}/SKILL.md`), `${directory} is read from its file`)
    }
  } finally {
    await run.host.close()
  }
})
