# repo-intelligence-mcp

An MCP server for [repo-intelligence](../README.md). It exposes deterministic impact analysis, architecture maps and cited Q&A over indexed TypeScript repositories as tools for AI coding assistants.

```bash
npm install && npm run build
claude mcp add repo-intelligence -- node "$(pwd)/dist/index.js"
```

For other clients (Claude Desktop, Cursor), add it to the client's MCP config:

```json
{
  "mcpServers": {
    "repo-intelligence": {
      "command": "node",
      "args": ["/absolute/path/to/repo-intelligence/mcp/dist/index.js"],
      "env": { "REPO_INTELLIGENCE_URL": "https://repo-intelligence-demo.fly.dev" }
    }
  }
}
```

The tools, the env vars and the design are described in the main README's [MCP server](../README.md#mcp-server) section.
