/** The OpenCode releases this plugin supports. Matches `opencode.host` in package.json. */
export const HOST_RANGE = ">=2.4.1 <2.5.0"

/** The releases the checks run on: the host, pack and stock stages, and CI. Every one is inside HOST_RANGE. */
export const TESTED_HOSTS: readonly string[] = ["2.4.1"]

/** The tested releases in words: "2.4.1". */
export const TESTED_TEXT = TESTED_HOSTS.join(", ")

export interface HostCheck {
  /** OpenCode's version; null when it reports none. */
  readonly version: string | null
  /** True only for a release in TESTED_HOSTS. */
  readonly tested: boolean
  /** True for a release in HOST_RANGE. */
  readonly inRange: boolean
}

/** `>=2.4.1 <2.5.0`: the 2.4 line from 2.4.1. Earlier lines, 2.5 and later, prereleases and dev builds such as `0.0.0-dev-*` are outside. */
export function inHostRange(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) return false
  const [major, minor, patch] = match.slice(1).map(Number)
  return major === 2 && minor === 4 && patch >= 1
}

/**
 * Accepts every release in the range; a later 2.4 release that is not tested runs normally, and status says it is
 * untested. Outside the range the plugin does not start, unless `allowUntestedHost` is set.
 */
export function checkHost(version: string, allowUntestedHost: boolean, warn: (message: string) => void): HostCheck {
  const reported = version.trim() === "" ? null : version
  const inRange = reported !== null && inHostRange(reported)
  const check = { version: reported, tested: reported !== null && TESTED_HOSTS.includes(reported), inRange }
  if (inRange) return check
  const found = `HOST_UNTESTED: This plugin supports OpenCode ${HOST_RANGE}, and this is ${reported ?? "a release that reports no version"}`
  if (!allowUntestedHost)
    throw new Error(`${found}. Next step: Use OpenCode ${TESTED_TEXT}, or set "allowUntestedHost": true to run anyway.`)
  warn(`${found}; it runs because "allowUntestedHost" is true. Next step: If Tavily misbehaves, use OpenCode ${TESTED_TEXT}.`)
  return check
}
