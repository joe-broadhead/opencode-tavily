// A loopback Streamable-HTTP MCP server that lists `tools` and answers in Server-Sent Events, as Tavily's hosted
// server does. It stands in for a user's own `tavily` server and for Tavily in the drift check's test.
import { createServer, type IncomingMessage } from "node:http"
import type { AddressInfo } from "node:net"
import type { CatalogTool } from "./catalog.js"

export interface FakeRequest {
  /** The JSON-RPC method, or the HTTP method for a request without a body. */
  readonly method: string
  /** `x-tavily-host-test`, which tells whose server config the host used. */
  readonly marker?: string
  /** `x-tavily-access-mode`, which the drift check sets to `keyless`. */
  readonly accessMode?: string
  /** Whether the request carried an Authorization header (its value is never read). */
  readonly authorized: boolean
}

export interface FakeTavily {
  readonly url: string
  readonly requests: FakeRequest[]
  close(): Promise<void>
}

type Message = { jsonrpc: "2.0"; id?: number | string; method: string; params?: { protocolVersion?: string } }

export async function startFakeTavily(tools: readonly CatalogTool[]): Promise<FakeTavily> {
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
    const body = request.method === "POST" ? (JSON.parse(await read(request)) as Message) : undefined
    requests.push({
      method: body?.method ?? request.method ?? "",
      marker: header(request, "x-tavily-host-test"),
      accessMode: header(request, "x-tavily-access-mode"),
      authorized: request.headers.authorization !== undefined,
    })
    if (request.method === "DELETE") return void response.writeHead(200).end()
    if (!body) return void response.writeHead(405, { allow: "POST, DELETE" }).end()
    if (body.id === undefined) return void response.writeHead(202).end()
    response
      .writeHead(200, { "content-type": "text/event-stream", "mcp-session-id": "fake-session" })
      .end(`event: message\ndata: ${JSON.stringify(answer(body))}\n\n`)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/mcp/`,
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
