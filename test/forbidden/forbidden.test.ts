// Scans the source and the built output for APIs and practices the repository forbids (AGENTS.md), and the tests for
// imports of host source. Module rules match import specifiers, not identifiers: the built TUI calls Solid's
// `effect` helper, which is not the `effect` package. Run it after `npm run build` (check does).
import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = fileURLToPath(new URL("../../", import.meta.url))
const SOURCE = /\.(ts|tsx|js|mjs)$/

function files(directory: string): string[] {
  return readdirSync(join(REPO, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return files(path)
    return SOURCE.test(entry.name) ? [path] : []
  })
}

interface Finding {
  readonly file: string
  readonly line: number
  readonly text: string
}

const lineAt = (text: string, index: number) => text.slice(0, index).split("\n").length

function matches(file: string, pattern: RegExp): Finding[] {
  const text = readFileSync(join(REPO, file), "utf8")
  return [...text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))].map((match) => ({
    file,
    line: lineAt(text, match.index),
    text: match[0],
  }))
}

/** Every module specifier of import and re-export statements, side-effect imports and dynamic imports, types included. */
function specifiers(file: string): Finding[] {
  const pattern = /\b(?:import|export)\s[^'"`;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  const text = readFileSync(join(REPO, file), "utf8")
  return [...text.matchAll(pattern)].map((match) => ({ file, line: lineAt(text, match.index), text: match[1] ?? match[2] ?? match[3] }))
}

/** `permission.assert(…)` calls that pass more than one argument, such as a signal option. */
function assertWithOptions(file: string): Finding[] {
  const text = readFileSync(join(REPO, file), "utf8")
  return [...text.matchAll(/permission\s*\.\s*assert\s*\(/g)].flatMap((match) => {
    let depth = 0
    let quote: string | undefined
    for (let index = match.index + match[0].length; index < text.length; index++) {
      const char = text[index]
      if (quote) {
        if (char === "\\") index++
        else if (char === quote) quote = undefined
      } else if (char === '"' || char === "'" || char === "`") quote = char
      else if ("([{".includes(char)) depth++
      else if (depth > 0 && ")]}".includes(char)) depth--
      else if (char === ")") return []
      else if (char === "," && depth === 0) {
        const rest = text.slice(index + 1).trimStart()
        // A trailing comma before the closing parenthesis is still one argument.
        return rest.startsWith(")") ? [] : [{ file, line: lineAt(text, match.index), text: match[0] }]
      }
    }
    return []
  })
}

const isEffect = (specifier: string) => specifier === "effect" || specifier.startsWith("effect/")
const isUi = (specifier: string) => specifier.startsWith("@opentui/") || specifier === "solid-js" || specifier.startsWith("solid-js/")
const inTui = (file: string) => file.startsWith(join("src", "tui")) || file === join("dist", "tui.js")

if (!existsSync(join(REPO, "dist", "index.js"))) throw new Error("dist/ is missing. Run npm run build first.")
const shipped = [...files("src"), ...files("dist")]

const RULES: readonly { readonly name: string; readonly find: (file: string) => Finding[] }[] = [
  { name: "ctx.mcp.catalog", find: (file) => matches(file, /\bmcp\s*\.\s*catalog\b/) },
  { name: "ctx.mcp.attest", find: (file) => matches(file, /\.attest\s*\(/) },
  { name: "supports* markers", find: (file) => matches(file, /\bsupports[A-Z]\w*/) },
  { name: "MCP config responsePolicy", find: (file) => matches(file, /\bresponsePolicy\b/) },
  { name: "MCP config capabilities", find: (file) => matches(file, /\bcapabilities\s*:/) },
  { name: "tool options.mcp delegation", find: (file) => matches(file, /\boptions\s*\.\s*mcp\b/) },
  { name: "Plugin.image or an image field", find: (file) => matches(file, /\bPlugin\s*\.\s*image\b|\bimage\s*:/) },
  { name: "ctx.generate.text", find: (file) => matches(file, /\bgenerate\s*\.\s*text\b/) },
  { name: "experimental.policies", find: (file) => matches(file, /\bexperimental\s*\.\s*policies\b/) },
  { name: "ctx.experimental.artifact", find: (file) => matches(file, /\bexperimental\s*\.\s*artifact\b/) },
  { name: "the V1 @opencode-ai/ packages", find: (file) => matches(file, /@opencode-ai\//) },
  { name: "importing @opencode/ai", find: (file) => specifiers(file).filter(({ text }) => text === "@opencode/ai" || text.startsWith("@opencode/ai/")) },
  { name: "a second permission.assert argument", find: assertWithOptions },
  { name: 'permission.hook("evaluate")', find: (file) => matches(file, /permission\s*\.\s*hook\s*\(\s*["'`]evaluate/) },
  { name: "importing effect", find: (file) => specifiers(file).filter(({ text }) => isEffect(text)) },
  { name: "OpenTUI or Solid outside the TUI", find: (file) => (inTui(file) ? [] : specifiers(file).filter(({ text }) => isUi(text))) },
]

const show = (findings: Finding[]) => findings.map(({ file, line, text }) => `${relative(REPO, join(REPO, file))}:${line} ${text}`)

describe("src/ and dist/ use no forbidden API", () => {
  test("both are scanned", () => {
    expect(shipped.some((file) => file.startsWith("src"))).toBe(true)
    expect(shipped.filter((file) => file.startsWith("dist")).sort()).toEqual([join("dist", "index.js"), join("dist", "tui.js")])
  })

  for (const rule of RULES) test(rule.name, () => expect(show(shipped.flatMap(rule.find))).toEqual([]))
})

describe("tests import no host source", () => {
  // Public packages only: the plugin SDK, the embedded host SDK and its client, and the TUI stack for the TUI tests.
  const PUBLIC = /^(\.{1,2}\/|node:|bun:test$|@opencode\/(plugin|sdk|client)(\/|$)|@opentui\/|solid-js(\/|$))/
  test("every test import is relative, a Node or Bun built-in, or a public package", () => {
    const imports = files("test").flatMap(specifiers)
    expect(imports.length).toBeGreaterThan(0)
    expect(show(imports.filter(({ text }) => !PUBLIC.test(text)))).toEqual([])
  })
})
