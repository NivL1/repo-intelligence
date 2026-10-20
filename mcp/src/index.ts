#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient } from './api-client';
import { createServer } from './server';

// The public demo serves every read route without an account, so the
// server works out of the box. Point it at your own deployment with
// REPO_INTELLIGENCE_URL, plus REPO_INTELLIGENCE_TOKEN if that deployment
// isn't running in demo mode.
const DEFAULT_URL = 'https://repo-intelligence-demo.fly.dev';

async function main(): Promise<void> {
  const api = new ApiClient({
    baseUrl: process.env.REPO_INTELLIGENCE_URL || DEFAULT_URL,
    token: process.env.REPO_INTELLIGENCE_TOKEN || undefined,
  });
  await createServer(api).connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  // stdout is the MCP protocol channel — anything diagnostic goes to stderr.
  console.error('repo-intelligence-mcp failed to start:', error);
  process.exit(1);
});
