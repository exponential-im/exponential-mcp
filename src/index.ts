#!/usr/bin/env node
/**
 * Exponential MCP Server
 * Connects Claude to your Exponential workspace
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ExponentialClient, createConfigStore } from 'exponential-sdk';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { runContextFromEnv } from './runTools.js';
import { callTool, listTools } from './tools.js';

const LEGACY_CONFIG_PATH = join(homedir(), '.config', 'exponential-mcp', 'config.json');

// Report the real package version rather than a hand-maintained literal that drifts.
const PKG_VERSION: string = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8')
).version;
const configStore = createConfigStore({ projectName: 'exponential-mcp' });

/**
 * Read the `exp` claim out of a JWT, without verifying the signature — we only
 * want to know whether it is worth sending, not whether it is trustworthy.
 *
 * Returns null for opaque tokens (`exp_agent_…` keys, which never expire) and
 * for anything that does not parse as a JWT.
 */
function getTokenExpiry(token: string): Date | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));
    return typeof payload?.exp === 'number' ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

function assertTokenIsUsable(token: string, source: string): void {
  const expiry = getTokenExpiry(token);
  if (!expiry || expiry.getTime() > Date.now()) {
    return;
  }

  console.error(`Error: token expired on ${expiry.toISOString().slice(0, 10)} (${source}).`);
  console.error('Run "npx exponential-mcp init" to store a fresh token.');
  process.exit(1);
}

function migrateLegacyConfig(): void {
  if (configStore.isAuthenticated() || !existsSync(LEGACY_CONFIG_PATH)) {
    return;
  }

  try {
    const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, 'utf-8'));
    if (!legacy?.apiKey) {
      return;
    }

    // Don't resurrect a dead token: the legacy file long outlives the JWT in it,
    // so migrating one blindly turns every config reset into a silent 401.
    const expiry = getTokenExpiry(legacy.apiKey);
    if (expiry && expiry.getTime() <= Date.now()) {
      console.error(
        `Note: ignoring legacy config at ${LEGACY_CONFIG_PATH} — its token expired on ${expiry
          .toISOString()
          .slice(0, 10)}.`
      );
      return;
    }

    configStore.saveConfig({
      token: legacy.apiKey,
      apiUrl: legacy.baseUrl || 'https://www.exponential.im',
    });
  } catch {
    // Ignore legacy config parsing errors.
  }
}

function loadClientConfig(): { token: string; apiUrl: string } {
  // An explicit key in the environment wins over the stored config: a process
  // that starts this server for a specific principal — `exponential runner
  // start` launching it for an Assistant run with the Assistant's agent key —
  // must act as that principal, not as whoever last ran `init` here.
  const envToken = process.env.EXPONENTIAL_API_KEY || process.env.EXPONENTIAL_API_TOKEN;
  if (envToken) {
    assertTokenIsUsable(envToken, 'EXPONENTIAL_API_KEY');
    return {
      token: envToken,
      apiUrl:
        process.env.EXPONENTIAL_API_URL ||
        process.env.EXPONENTIAL_BASE_URL ||
        'https://www.exponential.im',
    };
  }
  migrateLegacyConfig();

  if (configStore.isAuthenticated()) {
    const config = configStore.loadConfig();
    assertTokenIsUsable(config.token, 'stored config');
    return { token: config.token, apiUrl: config.apiUrl };
  }

  console.error('Error: No API key found.');
  console.error('Run "npx exponential-mcp init" to set up, or set EXPONENTIAL_API_KEY env var.');
  process.exit(1);
}

async function main() {
  const config = loadClientConfig();
  const client = new ExponentialClient({
    token: config.token,
    apiUrl: config.apiUrl,
  });

  const server = new Server(
    {
      name: 'exponential-mcp',
      version: PKG_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  // Started for an Agent run (`exponential runner start` sets EXPONENTIAL_RUN_ID):
  // the session gets the three run tools on top of everything else.
  const runContext = runContextFromEnv();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listTools({ runContext }),
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return callTool(client, name, args, { runContext });
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Exponential MCP server running');
}

main().catch(console.error);
