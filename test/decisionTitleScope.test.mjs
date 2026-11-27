import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from 'exponential-mcp/tools';

function fakeClient() {
  const calls = [];
  const rec = (name, result) => async (...args) => { calls.push([name, ...args]); return result; };
  return {
    calls,
    decisions: {
      create: rec('create', { id: 'd1', label: 'D-0001' }),
      update: rec('update', { id: 'd1' }),
      linkScope: rec('linkScope', { id: 'l1', scopeId: 's1' }),
    },
  };
}

test('decisions create sends the title through', async () => {
  const client = fakeClient();
  const res = await callTool(client, 'decisions', {
    operation: 'create',
    params: { workspaceId: 'w1', title: 'Ship Fridays', statement: 'We ship on Friday' },
  });
  assert.equal(res.isError, undefined, res.content?.[0]?.text);
  assert.deepEqual(client.calls, [
    ['create', { workspaceId: 'w1', title: 'Ship Fridays', statement: 'We ship on Friday' }],
  ]);
});

test('decisions update clears the title with null', async () => {
  const client = fakeClient();
  const res = await callTool(client, 'decisions', {
    operation: 'update',
    params: { workspaceId: 'w1', decisionId: 'd1', title: null },
  });
  assert.equal(res.isError, undefined, res.content?.[0]?.text);
  assert.deepEqual(client.calls, [['update', { workspaceId: 'w1', decisionId: 'd1', title: null }]]);
});

test('decisions create refuses a title over 120 characters, as the server does', async () => {
  const client = fakeClient();
  const res = await callTool(client, 'decisions', {
    operation: 'create',
    params: { workspaceId: 'w1', title: 'x'.repeat(121), statement: 'x' },
  });
  assert.equal(res.isError, true);
  assert.deepEqual(client.calls, []);
});

test('decisions link_scope links a decision to a feature scope', async () => {
  const client = fakeClient();
  const res = await callTool(client, 'decisions', {
    operation: 'link_scope',
    params: { workspaceId: 'w1', decisionId: 'd1', scopeId: 's1' },
  });
  assert.equal(res.isError, undefined, res.content?.[0]?.text);
  assert.deepEqual(client.calls, [['linkScope', 'w1', 'd1', 's1']]);
});

test('decisions describe explains titles and scope links', async () => {
  const res = await callTool({}, 'decisions', { operation: 'describe' });
  const text = res.content[0].text;
  for (const needle of ['link_scope', 'title', 'six words']) {
    assert.ok(text.includes(needle), `${needle} missing from describe`);
  }
});
