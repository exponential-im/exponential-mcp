import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_GUIDANCE_TOOLS, runAgentGuidanceTool } from '../dist/agentGuidance.js';

const CTX = {
  workspace: { id: 'w1', slug: 'acme', name: 'Acme' },
  project: null,
  authority: 'guidance',
  instructions: [],
  assembled: null,
  decisions: { items: [{ id: 'd1', label: 'D-0042', statement: 'Ship weekly', url: 'u' }], omitted: 2 },
  adrs: { items: [], omitted: 0 },
  revision: 'sha256:x',
  generatedAt: 'now',
  futureField: 7,
};

function fakeClient() {
  const calls = [];
  return {
    calls,
    agentGuidance: {
      context: async (input) => { calls.push(['context', input]); return CTX; },
      method: async (input) => { calls.push(['method', input]); return { version: '1.0.0' }; },
    },
  };
}

test('descriptions say guidance, not authority', () => {
  for (const tool of AGENT_GUIDANCE_TOOLS) assert.match(tool.description, /GUIDANCE, NOT AUTHORITY/);
});

test('get_agent_context passes the payload through unchanged', async () => {
  const client = fakeClient();
  const res = await runAgentGuidanceTool(client, 'get_agent_context', { workspaceId: 'w1', projectId: 'p1' });
  assert.deepEqual(client.calls, [['context', { workspaceId: 'w1', projectId: 'p1' }]]);
  assert.deepEqual(JSON.parse(res.content[0].text), CTX);
});

test('get_agent_context requires workspaceId', async () => {
  await assert.rejects(runAgentGuidanceTool(fakeClient(), 'get_agent_context', {}), /workspaceId is required/);
});

test('get_agent_method forwards an optional workspace', async () => {
  const client = fakeClient();
  await runAgentGuidanceTool(client, 'get_agent_method', {});
  assert.deepEqual(client.calls, [['method', { workspaceId: undefined }]]);
});
