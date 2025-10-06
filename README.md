# Filesystem for Codex

Turnkey MCP Filesystem gateway that fronts the official Filesystem MCP server over HTTP so you can register it as a custom connector in ChatGPT and a tool in Codex CLI.

## Overview

- Gateway: Node.js + Express
- Transport to FS server: stdio
- Auth: API key via Authorization: Bearer
- Policy: jailed root with read and write allow lists
- Deploy: Windows service or Docker
- Integrations: Codex CLI and ChatGPT MCP connector

## Quick start

1. Install Node 20 or later.
2. Copy `.env.example` to `.env` and set variables.
3. Install deps:
   ```bash
   npm i
   npm run build
   npm run start
   ```
4. Register the connector in Codex CLI and ChatGPT using the URL and Authorization header.

## Linking the official Filesystem MCP server

This gateway expects to spawn the official Filesystem MCP server via stdio.

Options:
- Use the git submodule included at `external/modelcontextprotocol` then build the filesystem server package.
- Or set `FS_MCP_COMMAND` and `FS_MCP_ARGS` in `.env` to point to your local filesystem server runner.

Example:
```
FS_MCP_COMMAND=node
FS_MCP_ARGS=external/modelcontextprotocol/packages/servers/dist/filesystem-stdio.js
```

If you prefer a separate repo for the upstream server, update the path accordingly.

## Security

- Keep the jail root tight. Default is read-only. Enable writes only in specific subfolders.
- Use a long API key. Rotate it periodically.
- Consider reverse proxy TLS termination and IP allow lists.
- Audit logs are written to `logs/audit.ndjson`.

## Policy file

See `policy.json`. This is loaded at startup. Paths are normalized and enforced inside the gateway in addition to whatever checks the FS server performs.

## Codex CLI config

`~/.codex/config.toml`:
```toml
[mcp_servers.filesystem]
transport = "http"
url = "https://your-domain.example/mcp"
authorization = "Bearer YOUR_API_KEY"
allowed_tools = ["fs.read","fs.write","fs.search","fs.list"]
```

## ChatGPT connector

Add a custom MCP connector and set:
- Endpoint: `https://your-domain.example/mcp`
- Header: `Authorization: Bearer YOUR_API_KEY`

## Docker

```bash
docker compose up --build
```

The compose file binds a host path to `/data` and exposes port 8080.

## Windows service

You can use PM2 or NSSM. A sample PowerShell helper is provided at `scripts/install-service.ps1`.

## License

MIT
