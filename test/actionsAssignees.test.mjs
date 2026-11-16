import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from 'exponential-mcp/tools';

function fakeClient() {
  const calls = [];
  const rec = (name) => async (...args) => { calls.push([name, ...args]); return { id: 'a1' }; };
  return {
    calls,
    actions: { create: rec('create'), update: rec('update'), assign: rec('assign'), unassign: rec('unassign') },
  };
}

test('actions create maps mixed assignees to assigneeIds and assigneeEmails', async () => {
  const client = fakeClient();
  const res = await callTool(client, 'actions', {
    operation: 'create',
    params: { name: 'Follow up', assignees: ['cmdfuz6eu0000a08xmknsk4gc', 'ada@example.com'] },
  });
  assert.equal(res.isError, undefined, res.content?.[0]?.text);
  assert.deepEqual(client.calls, [
    ['create', { name: 'Follow up', assigneeIds: ['cmdfuz6eu0000a08xmknsk4gc'], assigneeEmails: ['ada@example.com'] }],
  ]);
});

test('actions create without assignees sends no assignee fields', async () => {
  const client = fakeClient();
  await callTool(client, 'actions', { operation: 'create', params: { name: 'Follow up' } });
  assert.deepEqual(client.calls, [['create', { name: 'Follow up' }]]);
});

test('actions update with only addAssignees assigns and skips the field update', async () => {
  const client = fakeClient();
  await callTool(client, 'actions', { operation: 'update', params: { id: 'a1', addAssignees: ['u1'] } });
  assert.deepEqual(client.calls, [['assign', 'a1', { userIds: ['u1'], emails: [] }]]);
});

test('actions update clears, removes, then adds, after any field change', async () => {
  const client = fakeClient();
  await callTool(client, 'actions', {
    operation: 'update',
    params: { id: 'a1', name: 'Renamed', clearAssignees: true, removeAssignees: ['b@example.com'], addAssignees: ['u1'] },
  });
  assert.deepEqual(client.calls.map((c) => c[0]), ['update', 'unassign', 'unassign', 'assign']);
  assert.deepEqual(client.calls[0], ['update', { id: 'a1', name: 'Renamed' }]);
  assert.deepEqual(client.calls[1], ['unassign', 'a1', { all: true }]);
  assert.deepEqual(client.calls[2], ['unassign', 'a1', { userIds: [], emails: ['b@example.com'] }]);
});

test('describe lists the assignee params on create and update', async () => {
  const res = await callTool({}, 'actions', { operation: 'describe' });
  const schema = JSON.parse(res.content[0].text);
  const text = JSON.stringify(schema);
  for (const key of ['assignees', 'addAssignees', 'removeAssignees', 'clearAssignees']) {
    assert.ok(text.includes(key), `${key} missing from describe`);
  }
});
