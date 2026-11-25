import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from 'exponential-mcp/tools';

function fakeClient() {
  const calls = [];
  const rec = (name, result) => async (...args) => { calls.push([name, ...args]); return result; };
  return {
    calls,
    labels: {
      setEntityTags: rec('setEntityTags', { entityType: 'decision', entityId: 'd1', tags: [] }),
      listForEntity: rec('listForEntity', []),
    },
    decisions: { list: rec('list', []) },
  };
}

const SERVER_ENTITY_TYPES = [
  'action',
  'ticket',
  'feature',
  'epic',
  'project',
  'goal',
  'resource',
  'recurringTask',
  'decision',
];

test('labels set_for_entity files a decision under a Pillar', async () => {
  const client = fakeClient();
  const res = await callTool(client, 'labels', {
    operation: 'set_for_entity',
    params: { entityType: 'decision', entityId: 'd1', tagIds: ['pillar1', 'label1'] },
  });
  assert.equal(res.isError, undefined, res.content?.[0]?.text);
  assert.deepEqual(client.calls, [
    ['setEntityTags', { entityType: 'decision', entityId: 'd1', tagIds: ['pillar1', 'label1'] }],
  ]);
});

test("labels list_for_entity accepts every one of the server's entity types", async () => {
  for (const entityType of SERVER_ENTITY_TYPES) {
    const client = fakeClient();
    const res = await callTool(client, 'labels', {
      operation: 'list_for_entity',
      params: { entityType, entityId: '1' },
    });
    assert.equal(res.isError, undefined, `${entityType}: ${res.content?.[0]?.text}`);
    assert.deepEqual(client.calls, [['listForEntity', { entityType, entityId: '1' }]]);
  }
});

test('labels rejects an entity type the server does not know', async () => {
  const client = fakeClient();
  const res = await callTool(client, 'labels', {
    operation: 'list_for_entity',
    params: { entityType: 'meeting', entityId: '1' },
  });
  assert.equal(res.isError, true);
  assert.deepEqual(client.calls, []);
});

test('labels describe says which entity types take Pillars only', async () => {
  const res = await callTool({}, 'labels', { operation: 'describe' });
  const text = res.content[0].text;
  assert.ok(text.includes('decision'), 'decision missing');
  assert.ok(text.includes('Pillars only'), 'Pillar-only note missing');
  assert.ok(text.includes('recurringTask'), 'recurringTask missing');
});

test('decisions list sends tagIds through', async () => {
  const client = fakeClient();
  const res = await callTool(client, 'decisions', {
    operation: 'list',
    params: { workspaceId: 'w1', tagIds: ['pillar1'] },
  });
  assert.equal(res.isError, undefined, res.content?.[0]?.text);
  assert.deepEqual(client.calls, [['list', { workspaceId: 'w1', tagIds: ['pillar1'] }]]);
});

test('decisions list refuses more than 50 tagIds, as the server does', async () => {
  const client = fakeClient();
  const res = await callTool(client, 'decisions', {
    operation: 'list',
    params: { workspaceId: 'w1', tagIds: Array.from({ length: 51 }, (_, i) => `t${i}`) },
  });
  assert.equal(res.isError, true);
  assert.deepEqual(client.calls, []);
});

test('decisions describe explains tags and where to set them', async () => {
  const res = await callTool({}, 'decisions', { operation: 'describe' });
  const text = res.content[0].text;
  for (const needle of ['tagIds', 'set_for_entity', 'entityType', 'Takes no Pillars or labels']) {
    assert.ok(text.includes(needle), `${needle} missing from describe`);
  }
});
