# Scripting

Unofficial plugin. Not affiliated with Tavily.

A script can call Tavily's tools with no model: a cron job, a shell script, or any program that can reach the OpenCode server. It uses the tools RPC, `tavily.web.tools`, through `opencode api` or an OpenCode client.

| Method | The tool |
| --- | --- |
| `tavily_search` | `tavily_tavily_search` |
| `tavily_extract` | `tavily_tavily_extract` |
| `tavily_map` | `tavily_tavily_map` |
| `tavily_crawl` | `tavily_tavily_crawl` |
| `tavily_research` | `tavily_tavily_research` |
| `describe` | none: lists the methods, their permission actions, whether OpenCode lists each tool now, and each tool's input as JSON Schema |

Each method runs the tool with the same input: Tavily's own tool, through OpenCode's own connection and sign-in. The plugin never sees the API key or the OAuth token. A tool that Tavily adds later is never a method, even with an allow rule.

Each call spends the user's Tavily credits, as the tool does for the model. `tavily_research` takes minutes and holds the request open until it ends or `executionTimeoutMs` stops it.

## A script runs as a session

Every call names a session, and the session must name an agent. The script runs as that agent, with exactly the access its model would have:

- A tool that the agent's rules or the session's rules hide from the model is refused. OpenCode hides a tool when the last rule that matches its permission name, such as `tavily_tavily_search`, on resource `*` is a `deny`.
- OpenCode then checks the call itself, as it does for the model: the agent's rules, the session's rules, then saved approvals.
- No one answers a prompt for a script, so an `ask` is refused with `PERMISSION_DENIED` at once, and no prompt is left waiting. The plugin's default rules allow the five tools, so an agent with the default rules needs nothing more.

Create the session once, with the agent the script runs as, and keep its id:

```sh
opencode api post /api/session -d '{"title":"news digest","agent":"build"}'
```

Session rules come after the agent's, so a session can narrow what its script may do. This one can search and extract, but not crawl, map or research:

```sh
opencode api post /api/session -d '{"title":"news digest","agent":"build","permissions":[
  {"action":"tavily_*","resource":"*","effect":"deny"},
  {"action":"tavily_tavily_search","resource":"*","effect":"allow"},
  {"action":"tavily_tavily_extract","resource":"*","effect":"allow"}
]}'
```

## Calling a method

The body is `{"input": {"sessionID": "<session>", "input": <the tool's input>}}`. Both keys are required, and no other key is allowed:

```sh
opencode api post /api/rpc/tavily.web.tools/tavily_search -d '{"input":{
  "sessionID":"ses_…",
  "input":{"query":"OpenCode plugin API","max_results":5}
}}'
```

The tool's input is Tavily's: `describe` shows each tool's schema as OpenCode lists it now.

```sh
opencode api post /api/rpc/tavily.web.tools/describe -d '{"input":{}}'
```

A result is `{"output": {"output": <the tool's structured content, or its text when it has none>, "text": <the tool's text>}}`, as plain JSON. Web content in it is untrusted data.

`opencode api` calls run in the service's default location, your home directory, and use that location's `tavily` connection. To target a project, call the HTTP API with `?location[directory]=<dir>`, or create the session with `"location":{"directory":"<dir>"}`. The session may belong to another directory.

## Errors

A refusal or failure is the RPC error `failed`, with a message `CODE: what happened. Next step: what to do.` and `data: { code, next }`.

`opencode api` prints the error as JSON, then `HTTP 400 Bad Request`, and exits with status 1 for any RPC error, so a shell script can test `$?`.

| Code | When |
| --- | --- |
| `SESSION_UNKNOWN` | OpenCode says the session does not exist. Any other failure to look the session up is OpenCode's own error. |
| `SESSION_AGENT_REQUIRED` | The session names no agent, or an agent that does not exist. |
| `PERMISSION_DENIED` | The agent's or the session's rules deny the tool, or ask for an approval. A deny names the denied action, such as `tavily_tavily_search`, and the next step says which rule to remove, narrow or override. |
| `SERVER_CONFLICT` | Your `opencode.json` defines its own `tavily` server at a URL that is not Tavily's (`https://mcp.tavily.com/mcp/`). Scripts use your own server only at that URL; `/tavily-status` says so too. |
| `AUTH_REQUIRED`, `CONNECTING`, `CONNECTION_FAILED`, `DISABLED`, `NOT_REGISTERED` | The `tavily` server needs a sign-in, is still connecting, could not connect, is disabled, or is missing. `/tavily-status` gives the details. |
| `TOOL_UNAVAILABLE` | The server is connected, but OpenCode does not list the tool. |
| `UPSTREAM_ERROR` | Tavily answered with an error, such as an invalid input, its rate limit (429) or a used-up plan (432, 433). Tavily's server sends some of these as an ordinary result, an object such as `{"error":"Map failed","status":429,"detail":{…}}`; the plugin turns that into this error too. The message holds the first line of Tavily's text, or its status and words, at most 300 characters, with tokens and URL query strings removed. For a 429 the next step is to wait a minute and retry, then check the Tavily plan and key. |
| `CANCELLED` | The request was cancelled. |

OpenCode itself answers `rpc.invalid_input` for a body that is not the envelope above, and `rpc.method_not_found` for a method that does not exist, such as a tool Tavily added later.

## What scripts cannot do

- Call a tool that is not one of the five, even with an allow rule.
- Answer an approval prompt, or use a tool that asks.
- Use a key or token: the plugin has none to give.

A script's calls write nothing to the session, and OpenCode's `execute.before` and `execute.after` tool hooks, from any plugin, do not run for them. The plugin's own handling of Tavily's error objects, which a hook does for the model, is built into the tools RPC.
