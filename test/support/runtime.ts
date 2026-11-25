/** The handlers, driven through their real entry, with a synthetic MCP server list and no host. */
import type { UnguardedAgentsResult } from "@we-the-rebel-alliance/plugin-contract/access"
import type { Bus } from "@we-the-rebel-alliance/plugin-contract/bus"
import type { MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import { handlersFor, type HandlerRuntime } from "../../src/handlers/index.ts"
import { manifest, version } from "../../src/manifest.ts"
import type { ServerEntry } from "../../src/provider/client.ts"

/** The options the fixture and the tests use: two invented aliases. */
export const OPTIONS = { accounts: { work: {}, personal: {} } } as const

/** The servers the synthetic runtime reports: both aliases connected. No Tavily server was contacted. */
export const SERVERS: readonly ServerEntry[] = [
  { name: "tavily-work", status: { status: "connected" } },
  { name: "tavily-personal", status: { status: "connected" } },
]

/** A runtime with the real manifest, the two invented aliases and an in-memory MCP server list. */
export function runtimeFor(overrides: Partial<HandlerRuntime> = {}): HandlerRuntime {
  return {
    manifest,
    version,
    hostVersion: "2.4.1",
    options: OPTIONS,
    mcp: { list: async () => ({ data: SERVERS }) },
    accountProblems: [],
    ...overrides,
  }
}

/** The bus writer a handler call carries. No method of this plugin emits, so an emit is a test failure. */
const BUS: Bus = {
  emit: async () => {
    throw new Error("this plugin declares no bus event, so nothing may emit")
  },
} as unknown as Bus

/** The call context a handler sees, as `register` builds it. */
export function callFor(account: string, overrides: CallOverrides = {}): MethodCall {
  return {
    sessionID: "ses_test",
    agent: "build",
    messageID: "msg_test",
    id: "call_test",
    signal: new AbortController().signal,
    progress: async () => undefined,
    account,
    bus: BUS,
    unguardedAgents: overrides.unguardedAgents ?? (async () => ({ ok: true, agents: [] })),
    door: "tool",
  }
}

/** The parts of a call a test overrides: the agent list it answers, or the error it reports. */
export interface CallOverrides {
  readonly unguardedAgents?: () => Promise<UnguardedAgentsResult>
}

/** Run one handler with an account and the input `register` would pass. */
export async function run(
  runtime: HandlerRuntime,
  method: "status" | "probe",
  input: Readonly<Record<string, unknown>>,
  account = "work",
  call: CallOverrides = {},
): Promise<unknown> {
  return handlersFor(runtime)[method]!.run(input, callFor(account, call))
}

/** The code and message a call refuses with, or undefined when it answers. */
export async function refusalOfCall(action: () => Promise<unknown>): Promise<{ code: string; message: string } | undefined> {
  try {
    await action()
    return undefined
  } catch (error) {
    if (error instanceof Error && "refusal" in error) {
      const refusal = (error as { refusal: { code: string; message: string } }).refusal
      return { code: refusal.code, message: refusal.message }
    }
    throw error
  }
}
