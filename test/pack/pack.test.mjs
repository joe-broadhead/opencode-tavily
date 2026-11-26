// The packed tarball: what it carries, what it must not, and that its server entry loads as a Plugin.define value.
//
//   npm run test:pack
//
// `opencode plugin add <local path>` is not tested: OpenCode 2.4.1 refuses a local path ("must be an npm registry
// package or Git package specifier"). The tarball is installed the way a registry or git install resolves it instead.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const PACKAGE = "@we-the-rebel-alliance/tavily-plugin"

const REQUIRED = [
  "package.json",
  "README.md",
  "LICENSE",
  "NOTICE",
  "dist/index.js",
  "skills/tavily/SKILL.md",
  "skills/tavily-research/SKILL.md",
  "assets/icon.svg",
  "assets/icon-128.png",
  "assets/icon-256.png",
]

const NOT_PACKED = ["src/", "test/", "scripts/", "docs/", "fixtures/", "AGENTS.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", ".github/"]

const LIFECYCLE = ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack", "prepublish", "prepublishOnly"]

function pack(destination) {
  if (!existsSync(join(root, "dist", "index.js"))) execFileSync("npm", ["run", "bundle"], { cwd: root, stdio: "inherit" })
  const output = execFileSync("npm", ["pack", "--json", "--pack-destination", destination], { cwd: root, encoding: "utf8" })
  const [packed] = JSON.parse(output)
  assert.ok(packed !== undefined, "npm pack answered one tarball")
  return packed
}

test("the tarball carries the runtime, the skills and the icons, and nothing else", () => {
  const destination = mkdtempSync(join(tmpdir(), "tavily-pack-"))
  try {
    const packed = pack(destination)
    assert.equal(packed.name, PACKAGE)
    assert.equal(packed.version, "0.0.0")
    assert.equal(packed.filename, "we-the-rebel-alliance-tavily-plugin-0.0.0.tgz")
    const files = packed.files.map((file) => file.path).sort()
    for (const path of REQUIRED) assert.ok(files.includes(path), `${path} is packed`)
    for (const file of files) {
      for (const prefix of NOT_PACKED) assert.ok(!file.startsWith(prefix), `${file} is not packed`)
    }
    for (const file of packed.files) {
      assert.equal(file.mode & 0o111, 0, `${file.path} is not executable`)
    }
    assert.ok(codeOf(join(destination, packed.filename)) !== undefined)
  } finally {
    rmSync(destination, { recursive: true, force: true })
  }
})

function codeOf(path) {
  return readFileSync(path).subarray(0, 2).toString("latin1") === "\u001f\u008b" ? "gzip" : undefined
}

test("the package declares no runtime dependency and no lifecycle script", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  for (const key of ["dependencies", "peerDependencies", "optionalDependencies", "bundleDependencies", "bundledDependencies"]) {
    assert.equal(pkg[key], undefined, `package.json has no ${key}`)
  }
  for (const name of LIFECYCLE) assert.equal(pkg.scripts?.[name], undefined, `package.json has no ${name} script`)
  assert.equal(pkg.exports["./server"], "./dist/index.js")
  assert.deepEqual(pkg.files, ["dist", "skills", "assets", "README.md", "LICENSE", "NOTICE"])
})

test("the packed server entry imports as a Plugin.define value, without running setup", () => {
  const destination = mkdtempSync(join(tmpdir(), "tavily-install-"))
  try {
    const packed = pack(destination)
    const tarball = join(destination, packed.filename)
    const project = join(destination, "project")
    mkdirSync(project)
    writeFileSync(join(project, "package.json"), `${JSON.stringify({ name: "tavily-pack-test", private: true, type: "module" }, null, 2)}\n`)
    execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball, "@opencode/plugin@2.4.1"], {
      cwd: project,
      stdio: "pipe",
      encoding: "utf8",
    })
    const installed = JSON.parse(readFileSync(join(project, "node_modules", PACKAGE, "package.json"), "utf8"))
    assert.equal(installed.name, PACKAGE)
    assert.equal(installed.version, "0.0.0")
    assert.ok(existsSync(join(project, "node_modules", PACKAGE, "NOTICE")), "the installed package carries NOTICE")

    writeFileSync(
      join(project, "main.mjs"),
      [
        `const mod = await import(${JSON.stringify(`${PACKAGE}/server`)})`,
        `const plugin = mod.default`,
        `if (typeof plugin !== "object" || plugin === null) throw new Error("the server entry exports no plugin object")`,
        `if (typeof plugin.id !== "string" || typeof plugin.setup !== "function") throw new Error("the plugin has no id and setup")`,
        `console.log(JSON.stringify({ id: plugin.id, keys: Object.keys(plugin).sort() }))`,
        "",
      ].join("\n"),
    )
    const answer = JSON.parse(execFileSync("node", ["main.mjs"], { cwd: project, encoding: "utf8" }))
    assert.deepEqual(answer, { id: "tavily", keys: ["id", "setup"] })
  } finally {
    rmSync(destination, { recursive: true, force: true })
  }
})
