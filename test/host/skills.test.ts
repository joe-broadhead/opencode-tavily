import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { parse as parseYaml } from "yaml"
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
      const text = readFileSync(join(run.repository, "skills", directory, "SKILL.md"), "utf8")
      const front = /^---\n([\s\S]*?)\n---\n/.exec(text)
      assert.ok(front !== null, `${directory}/SKILL.md has front matter`)
      const parsed = parseYaml(front[1] ?? "") as { name?: unknown; description?: unknown }
      assert.equal(parsed.name, directory, `${directory} front-matter name equals its directory`)
      assert.equal(typeof parsed.description, "string", `${directory} has a parsed description`)
      assert.notEqual(parsed.description, ">", `${directory} description is not an unparsed block scalar`)
      assert.notEqual(parsed.description, "|", `${directory} description is not an unparsed block scalar`)
      assert.ok((parsed.description as string).trim().length > 0, `${directory} description is not empty`)

      const skill = listed.get(directory)
      assert.ok(skill !== undefined, `${directory} is listed by the host`)
      assert.equal(skill.name, directory)
      assert.equal(skill.description, parsed.description, `${directory} registers the parsed description exactly`)
      assert.ok(skill.content.length > 0, `${directory} has content`)
      assert.ok(skill.path.endsWith(`skills/${directory}/SKILL.md`), `${directory} is read from its file`)
    }
  } finally {
    await run.host.close()
  }
})
