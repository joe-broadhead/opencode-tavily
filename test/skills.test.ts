import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { addPackagedSkills, loadSkills, parseSkill, type SkillFile } from "../src/skills.ts"

test("the package ships both skills, named in the plugin's namespace", async () => {
  const skills = await loadSkills()
  assert.deepEqual(skills.map((skill) => skill.id), ["tavily", "tavily-research"])
  for (const skill of skills) {
    assert.ok(skill.description.length > 0 && skill.description.length <= 300, `${skill.id} description is ${skill.description.length} characters`)
    assert.ok(skill.content.length > 0)
    assert.match(skill.path, /skills\/[a-z-]+\/SKILL\.md$/)
  }
})

test("the skills name the tools the manifest declares and no removed transport", async () => {
  const skills = await loadSkills()
  for (const skill of skills) {
    assert.doesNotMatch(skill.content, /tavily\.web/)
    assert.doesNotMatch(skill.content, /tavily-status/)
    assert.doesNotMatch(skill.content, /execute\.after|UPSTREAM_ERROR/)
    assert.doesNotMatch(skill.content, /cron job/i)
  }
})

test("the packaged skills add both with their ids and paths", async () => {
  const skills = await loadSkills()
  const added: { id: string; name: string; description?: string | undefined; path: string }[] = []
  addPackagedSkills(skills)({ add: (entry) => void added.push(entry) })
  assert.deepEqual(added.map((entry) => entry.id), ["tavily", "tavily-research"])
  assert.ok(added.every((entry) => entry.name === entry.id && entry.path.endsWith("SKILL.md")))
})

test("a skill with no front matter, or the wrong name, is refused", () => {
  assert.throws(
    () => parseSkill("tavily", "/tmp/skills/tavily/SKILL.md", "# No front matter\n"),
    (error: unknown) => error instanceof Error && error.message.startsWith("UNAVAILABLE: ") && error.message.includes("Next step: "),
  )
  assert.throws(
    () => parseSkill("tavily", "/tmp/skills/tavily/SKILL.md", "---\nname: other\ndescription: A skill.\n---\nBody\n"),
    (error: unknown) => error instanceof Error && error.message.startsWith("UNAVAILABLE: "),
  )
  assert.throws(
    () => parseSkill("tavily", "/tmp/skills/tavily/SKILL.md", "---\nname: tavily\n---\nBody\n"),
    (error: unknown) => error instanceof Error && error.message.startsWith("UNAVAILABLE: "),
  )
  assert.throws(
    () => parseSkill("tavily", "/tmp/skills/tavily/SKILL.md", "---\nname: tavily\ndescription: A skill.\n---\n\n"),
    (error: unknown) => error instanceof Error && error.message.startsWith("UNAVAILABLE: ") && error.message.includes("no content"),
  )
  for (const marker of [">", "|", ">-", "|+"]) {
    assert.throws(
      () => parseSkill("tavily", "/tmp/skills/tavily/SKILL.md", `---\nname: tavily\ndescription: ${marker}\n---\nBody\n`),
      (error: unknown) => error instanceof Error && error.message.startsWith("UNAVAILABLE: ") && error.message.includes("block-scalar"),
      marker,
    )
  }
  assert.throws(
    () => parseSkill("tavily", "/tmp/skills/tavily/SKILL.md", '---\nname: tavily\ndescription: ""\n---\nBody\n'),
    (error: unknown) => error instanceof Error && error.message.startsWith("UNAVAILABLE: "),
  )
  assert.equal(
    parseSkill("tavily", "/tmp/skills/tavily/SKILL.md", '---\nname: "tavily"\ndescription: "Quoted: text"\n---\nBody\n').description,
    "Quoted: text",
  )
})

test("a missing skills folder is a clean refusal, not a crash", async () => {
  await assert.rejects(
    () => loadSkills("/tmp/opencode/definitely-no-skills-here"),
    (error: unknown) => error instanceof Error && error.message.startsWith("UNAVAILABLE: "),
  )
})

test("a skills folder with a directory but no SKILL.md is refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavily-skills-"))
  try {
    await mkdir(join(root, "tavily"))
    await assert.rejects(
      () => loadSkills(root),
      (error: unknown) => error instanceof Error && error.message.startsWith("UNAVAILABLE: "),
    )
    await writeFile(join(root, "tavily", "SKILL.md"), "---\nname: tavily\ndescription: A skill.\n---\nBody\n")
    const skills: readonly SkillFile[] = await loadSkills(root)
    assert.deepEqual(skills.map((skill) => skill.id), ["tavily"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
