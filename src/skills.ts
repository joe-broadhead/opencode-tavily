/**
 * The plugin's skills: `skills/<name>/SKILL.md`, registered with OpenCode through `ctx.skill`.
 *
 * A plugin package's `skills/` folder is not read by OpenCode on its own, so setup registers both skill files. A
 * malformed file is `SKILLS_INVALID` and stops setup: a skill that cannot load is a broken install, not a warning.
 */
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Skill, type Plugin } from "@opencode/plugin"

/** `skills/` at the package root, next to `dist/` (and next to `src/` in the repository). */
const SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url))

/** One parsed `SKILL.md`. */
export interface SkillFile {
  /** The skill's id and name: its directory name. */
  readonly id: string
  readonly description: string
  /** The file's absolute path, which OpenCode reads the skill from. */
  readonly path: string
  readonly content: string
}

const invalid = (what: string): Error => new Error(`SKILLS_INVALID: ${what}. Next step: reinstall the plugin so its skills folder is complete.`)

/** Parse one `SKILL.md`: a `---` front matter with `name` and `description`, then the body. */
export function parseSkill(directory: string, path: string, text: string): SkillFile {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"))
  const where = `skills/${directory}/SKILL.md`
  if (!match) throw invalid(`${where} has no front matter`)
  const fields = new Map(
    (match[1] ?? "").split("\n").flatMap((line) => {
      const separator = line.indexOf(":")
      return separator === -1 ? [] : [[line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const]
    }),
  )
  const name = fields.get("name")
  const description = fields.get("description")
  if (name === undefined || name === "") throw invalid(`${where} has no "name" in its front matter`)
  if (description === undefined || description === "") throw invalid(`${where} has no "description" in its front matter`)
  if (name !== directory) throw invalid(`${where} is named "${name}" and must be named "${directory}"`)
  return { id: name, description, path, content: (match[2] ?? "").trim() }
}

/** Every skill under `directory`, sorted by directory name. */
export async function loadSkills(directory = SKILLS_DIR): Promise<readonly SkillFile[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    throw invalid("the plugin's skills folder is missing")
  }
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  const skills: SkillFile[] = []
  for (const name of names) {
    const path = join(directory, name, "SKILL.md")
    let text: string
    try {
      text = await readFile(path, "utf8")
    } catch {
      throw invalid(`skills/${name} has no SKILL.md`)
    }
    skills.push(parseSkill(name, path, text))
  }
  return skills
}

/** Register every loaded skill with OpenCode. */
export function registerSkills(skill: Pick<Plugin.Context["skill"], "transform">, skills: readonly SkillFile[]) {
  return skill.transform((editor) => {
    for (const entry of skills) {
      editor.add({
        id: Skill.ID.make(entry.id),
        name: Skill.Name.make(entry.id),
        description: entry.description,
        path: Skill.Info.fields.path.make(entry.path),
        content: entry.content,
      })
    }
  })
}
