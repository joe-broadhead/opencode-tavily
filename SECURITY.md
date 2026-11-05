# Security

## Supported versions

Only the latest version gets security fixes. It is tested on OpenCode `>=2.2.3 <2.3.0`.

## Reporting a vulnerability

Report a vulnerability privately, through [GitHub private vulnerability reporting](https://github.com/joe-broadhead/opencode-tavily/security/advisories/new): open the **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a security problem.

Include the plugin version, the OpenCode version, what you did, and what happened. Never include your Tavily API key or an OAuth token.

## Data handling

### Your Tavily key and sign-in

- OpenCode keeps your credentials, not the plugin. A key that you connect with `/connect` → **Tavily** or `opencode auth login tavily`, and the OAuth token from `/connect` → **Tavily MCP**, are stored in OpenCode's credential store. `TAVILY_API_KEY` stays in the OpenCode server's environment. `opencode service set env TAVILY_API_KEY <key>` stores the key in plain text in OpenCode's service settings file, readable only by you, and puts it in your shell history; `/connect` avoids both.
- Never put a key in the plugin's options or in `opencode.json`. The plugin has no option for one.
- The plugin reads the key from OpenCode when it starts and when a credential changes. It keeps the key in memory, in the `Authorization` header of the `tavily` server's settings. It never logs the key, writes it to disk or returns it in its status.
- The key never goes in a URL. Tavily accepts `?tavilyApiKey=` in the server URL, but OpenCode shows a server's URL in its status errors and logs.
- OpenCode does not show that header in its MCP, config, agent or plugin APIs, and the plugin's status and RPC never contain the key.
- **OpenCode's own credential API returns stored secrets in full.** `GET /api/credential` on the OpenCode server returns each stored key value, and `opencode auth export` prints stored credentials, secrets included. Anyone who can call your OpenCode server can read your Tavily key. Keep the server on your own machine, and do not share its address or password.

### Content from Tavily is not trusted

Search results, page text from Extract and Crawl, and Research reports come from the web. They can contain instructions written to mislead the model.

- The plugin passes Tavily's results to the model unchanged. It does not filter them.
- The skills tell the model to treat this content as data, never as instructions, and not to run tools, change files or send data because of it.
- Check important claims against the cited sources. Keep the prompts for actions with side effects, such as edits and shell commands, while you work with web content.

### What the plugin sends and stores

- The plugin itself makes one kind of request: with an API key, `GET https://api.tavily.com/usage`, with the key in the `Authorization` header, to check that Tavily accepts the key. It runs once per key, and again only after a check that could not reach Tavily. It costs no credits, sends nothing else, and the plugin keeps only the answer: accepted, rejected or not checked. With OAuth, the plugin makes no requests.
- OpenCode's MCP client connects to `https://mcp.tavily.com/mcp/`, and OpenCode's built-in web search provider calls Tavily's search API.
- The plugin stores nothing and collects no telemetry.
- `npm run check:upstream` is a maintainer tool. It calls Tavily's MCP server without a key and sends no user data.

## Permissions

- The plugin adds default rules to each agent: Tavily's five read-only tools run without a prompt, and every other tool on the `tavily` server asks. See [Configuration](https://github.com/joe-broadhead/opencode-tavily/blob/HEAD/docs/configuration.md#permissions).
- **A saved "Always allow" applies to the whole project and to every agent in it, Plan included.** OpenCode saves the approval for the project, not for the agent or the session. A `deny` rule in your config still wins over it.
- A git repository with no commits yet belongs to OpenCode's shared `global` project. An approval saved there also applies in every other repository that has no commits.
- Agents that you define only in your config do not get the plugin's rules, so a new Tavily tool runs there without a prompt. `/tavily-status` names these agents and gives the fix; see [Configuration](https://github.com/joe-broadhead/opencode-tavily/blob/HEAD/docs/configuration.md#agents-defined-only-in-your-config).
- The `tavily_*` rule also matches tools of any other MCP server whose name starts with `tavily_`.
- In a Code Mode program on OpenCode 2.2.3, a declined call becomes an error that the program can catch, and the program continues. The `tavily` skill tells the model to accept a decline and not to try another route. See [Architecture](https://github.com/joe-broadhead/opencode-tavily/blob/HEAD/docs/architecture.md#code-mode-and-declined-calls).

## Scripts

The tools RPC (`tavily.web.tools`, see [docs/scripting.md](https://github.com/joe-broadhead/opencode-tavily/blob/HEAD/docs/scripting.md)) runs Tavily's five tools for a script, with no model. It adds no authority:

- A script names a session that names an agent, and runs as them. A tool that the agent's or the session's rules hide from the model is refused. OpenCode's own executor then checks the call against the agent's rules, the session's rules and saved approvals, as it does for the model.
- An ask on a script's call is denied, not prompted: no one is there to answer it. The plugin's permission hook changes only an ask on one of its own script calls in flight, only to a deny, and leaves every other call alone.
- Only the five known reads are methods. A tool that Tavily adds later is never one, even with an allow rule.
- The call goes through OpenCode's own MCP connection and sign-in. The plugin never sees the key or the token, and returns neither.
- Tavily's error text reaches the script only as the first line, at most 300 characters, with tokens and URL query strings removed.
- OpenCode's `execute.before` and `execute.after` tool hooks, from any plugin, do not run for a script's call, so another plugin's policy hook does not see it. A script's calls are not recorded in the session.
- The RPC is reachable only by callers of the OpenCode server API, who already hold the server's full authority. The session is not a login: it scopes a script to what its agent may do.
