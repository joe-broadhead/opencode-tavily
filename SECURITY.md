# Security

## Reporting a vulnerability

Report a vulnerability through GitHub's private vulnerability reporting on this repository. Do not open a public issue
with a credential, a token or a person's data in it.

## What this plugin holds

Nothing. Tavily's hosted MCP server holds the credential, and OpenCode owns the OAuth sign-in. The plugin registers one
MCP server per alias and stores no token. It makes no network call itself; a Tavily tool runs on the vendor's server,
through OpenCode.

See [docs/security.md](docs/security.md) for what leaves the machine, the scopes, the untrusted-content rule, the spend
and the redaction.
