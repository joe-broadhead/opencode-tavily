import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { build } from "esbuild"

const root = fileURLToPath(new URL("../..", import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { readonly name: string; readonly version: string }

/** The package root of a metafile input under node_modules, scoped-aware; undefined for the plugin's own files. */
function packageOf(input: string): string | undefined {
  const normalized = input.replace(/\\/g, "/")
  const marker = "node_modules/"
  const at = normalized.lastIndexOf(marker)
  if (at === -1) return undefined
  const rest = normalized.slice(at + marker.length).split("/")
  const first = rest[0]
  if (first === undefined || first === "") return undefined
  return first.startsWith("@") ? `${first}/${rest[1] ?? ""}` : first
}

/** The same build scripts/build.mjs runs, with a metafile so the test sees exactly what was inlined. */
async function bundledPackages(): Promise<string[]> {
  const outdir = mkdtempSync(join(tmpdir(), "tavily-notice-"))
  try {
    const result = await build({
      absWorkingDir: root,
      entryPoints: [{ in: join(root, "src", "index.ts"), out: "index" }],
      outdir,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node24",
      external: ["@opencode/*"],
      legalComments: "none",
      logLevel: "warning",
      metafile: true,
      banner: { js: `import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\n// ${pkg.name} ${pkg.version}. Built by scripts/build.mjs; do not edit.` },
    })
    return [...new Set(Object.keys(result.metafile.inputs).map(packageOf).filter((value): value is string => value !== undefined))].sort()
  } finally {
    rmSync(outdir, { recursive: true, force: true })
  }
}

test("NOTICE covers every package inlined into dist/index.js, with its verbatim license", async () => {
  const packages = await bundledPackages()
  assert.deepEqual(packages, ["@we-the-rebel-alliance/plugin-contract", "yaml"], "the bundle inlines exactly the contract and yaml")
  const notice = readFileSync(join(root, "NOTICE"), "utf8")
  for (const name of packages) {
    const directory = join(root, "node_modules", name)
    const meta = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { readonly version: string; readonly license?: string }
    const spdx = meta.license ?? ""
    assert.ok(notice.includes(`## ${name} ${meta.version} (${spdx})`), `NOTICE has no heading for ${name} ${meta.version} (${spdx})`)
    const license = readFileSync(join(directory, "LICENSE"), "utf8")
    assert.ok(notice.includes(license.trim()), `NOTICE has no verbatim license for ${name} ${meta.version}`)
  }
})
