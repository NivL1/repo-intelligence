import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiClient } from './api-client';
import { registerTools } from './tools';

// Read from package.json at runtime rather than duplicated as a literal.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json') as { version: string };

export function createServer(api: ApiClient): McpServer {
  const server = new McpServer(
    { name: 'repo-intelligence', version },
    {
      instructions:
        'Codebase intelligence for indexed TypeScript repositories. Start with ' +
        'list_repositories. impact and map are deterministic graph queries (no LLM) — prefer ' +
        'them for structural questions such as "what calls this?" or "what depends on this ' +
        'module?". Use ask for conceptual "how does X work?" questions; it is LLM-backed and ' +
        'rate-limited. Use find_symbols to get an exact qualified name before calling impact.',
    },
  );
  registerTools(server, api);
  return server;
}
