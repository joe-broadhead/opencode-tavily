// A loopback Streamable-HTTP MCP server that lists `tools` and answers in Server-Sent Events, as Tavily's hosted
// server does. It stands in for a user's own `tavily` server, for Tavily in the drift check's test, and, with
// `requireAuth`, for Tavily itself: like Tavily, it answers 401 without an Authorization header, accepts any bearer
// token at `initialize`, and answers Tavily's `GET /usage` key check.
import { createServer, type IncomingMessage } from "node:http"
import type { AddressInfo } from "node:net"
import type { CatalogTool } from "./catalog.js"

export interface FakeRequest {
  /** The JSON-RPC method, `usage` for the key check, or the HTTP method for a request without a body. */
  readonly method: string
  /** `x-tavily-host-test`, which tells whose server config the host used. */
  readonly marker?: string
  /** `x-tavily-access-mode`, which the drift check sets to `keyless`. */
  readonly accessMode?: string
  /** Whether the request carried an Authorization header. */
  readonly authorized: boolean
  /** The Authorization header, kept in memory for assertions on fake keys; never printed. */
  readonly authorization?: string
  /** The request's query string, so a test can tell that no key travels in the URL. */
  readonly search: string
}

export interface FakeTavilyOptions {
  /** Answer 401 to MCP requests without an Authorization header, as Tavily does before sign-in. */
  readonly requireAuth?: boolean
  /** Whether `GET /usage` accepts the bearer key; Tavily's MCP endpoint accepts any. Default: every key. */
  readonly accepts?: (key: string) => boolean
}

export interface FakeTavily {
  /** The MCP endpoint, `<origin>/mcp/`. */
  readonly url: string
  readonly origin: string
  readonly requests: FakeRequest[]
  close(): Promise<void>
}

type Message = { jsonrpc: "2.0"; id?: number | string; method: string; params?: { protocolVersion?: string } }

export async function startFakeTavily(tools: readonly CatalogTool[], options: FakeTavilyOptions = {}): Promise<FakeTavily> {
  const requests: FakeRequest[] = []
  const answer = (message: Message) => {
    const reply = (result: unknown) => ({ jsonrpc: "2.0", id: message.id, result })
    switch (message.method) {
      case "initialize":
        return reply({
          protocolVersion: message.params?.protocolVersion,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "fake-tavily", version: "0.0.0" },
        })
      case "tools/list":
        return reply({ tools })
      default:
        return { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } }
    }
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    const authorization = header(request, "authorization")
    const seen = (method: string) =>
      requests.push({
        method,
        marker: header(request, "x-tavily-host-test"),
        accessMode: header(request, "x-tavily-access-mode"),
        authorized: authorization !== undefined,
        authorization,
        search: url.search,
      })
    if (url.pathname.startsWith("/.well-known/")) return void response.writeHead(404).end("Not Found")
    if (request.method === "GET" && url.pathname === "/usage") {
      seen("usage")
      const key = /^Bearer (.+)$/.exec(authorization ?? "")?.[1]
      const accepted = key !== undefined && (options.accepts?.(key) ?? true)
      return void response.writeHead(accepted ? 200 : 401, { "content-type": "application/json" }).end(accepted ? "{}" : `{"detail":{}}`)
    }
    const body = request.method === "POST" ? (JSON.parse(await read(request)) as Message) : undefined
    seen(body?.method ?? request.method ?? "")
    if (options.requireAuth && authorization === undefined)
      return void response
        .writeHead(401, { "content-type": "application/json", "www-authenticate": `Bearer error="invalid_token"` })
        .end(JSON.stringify({ error: "invalid_token" }))
    if (request.method === "DELETE") return void response.writeHead(200).end()
    if (!body) return void response.writeHead(405, { allow: "POST, DELETE" }).end()
    if (body.id === undefined) return void response.writeHead(202).end()
    response
      .writeHead(200, { "content-type": "text/event-stream", "mcp-session-id": "fake-session" })
      .end(`event: message\ndata: ${JSON.stringify(answer(body))}\n\n`)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${port}`
  return {
    url: `${origin}/mcp/`,
    origin,
    requests,
    close: () => new Promise((resolve) => (server.closeAllConnections(), server.close(() => resolve()))),
  }
}

const header = (request: IncomingMessage, name: string) => [request.headers[name]].flat()[0]

async function read(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString("utf8")
}
