/** The OpenCode line this plugin is tested on. Matches `opencode.host` in package.json. */
export const TESTED_HOST = ">=2.2.3 <2.3.0"

export interface HostCheck {
  readonly version: string
  readonly tested: boolean
}

/** `>=2.2.3 <2.3.0`: the 2.2 line from 2.2.3. Later lines, prereleases and dev builds such as `0.0.0-dev-*` are untested. */
export function isTestedHost(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) return false
  const [major, minor, patch] = match.slice(1).map(Number)
  return major === 2 && minor === 2 && patch >= 3
}

export function checkHost(version: string, allowUntestedHost: boolean, warn: (message: string) => void): HostCheck {
  if (isTestedHost(version)) return { version, tested: true }
  const found = `HOST_UNTESTED: This plugin supports OpenCode ${TESTED_HOST}, and this is ${version}`
  if (!allowUntestedHost)
    throw new Error(`${found}. Next step: Use OpenCode 2.2.3 or a later 2.2 release, or set "allowUntestedHost": true to run anyway.`)
  warn(`${found}; it runs because "allowUntestedHost" is true. Next step: If Tavily misbehaves, use OpenCode 2.2.3 or a later 2.2 release.`)
  return { version, tested: false }
}
