import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callTool, listTools } from 'exponential-mcp/tools';

test('exponential-mcp/tools imports with no key, no config and no side effects', () => {
  const home = mkdtempSync(join(tmpdir(), 'mcp-tools-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const m = await import('exponential-mcp/tools'); console.log(m.listTools().length);",
      ],
      { env: { PATH: process.env.PATH, HOME: home }, encoding: 'utf-8' }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(Number(result.stdout.trim()) > 0);
    assert.deepEqual(readdirSync(home), [], 'importing wrote files under HOME');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('tool names are unique', () => {
  const names = listTools().map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
});

test('callTool runs a hand-written tool through the client', async () => {
  const client = { workspaces: { list: async () => [{ id: 'w1', name: 'Acme' }] } };
  const result = await callTool(client, 'get_workspaces', {});
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), [{ id: 'w1', name: 'Acme' }]);
});

test('callTool runs a domain tool', async () => {
  const result = await callTool({}, 'workspaces', { operation: 'describe' });
  assert.equal(result.isError, undefined);
  assert.ok(Object.keys(JSON.parse(result.content[0].text)).length > 0);
});

test('callTool returns an error result for an unknown tool instead of throwing', async () => {
  const result = await callTool({}, 'no_such_tool', {});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Unknown tool: no_such_tool/);
});

const RUN_TOOL_NAMES = ['report_progress', 'ask_owner', 'finish_run'];

test('run tools are absent without a run context', () => {
  for (const options of [undefined, {}, { runContext: null }]) {
    const names = listTools(options).map((t) => t.name);
    for (const runTool of RUN_TOOL_NAMES) assert.ok(!names.includes(runTool), `${runTool} listed`);
  }
});

test('all three run tools are listed with a run context', () => {
  const names = listTools({ runContext: { runId: 'run-1' } }).map((t) => t.name);
  assert.deepEqual(names.slice(0, 3), RUN_TOOL_NAMES);
  assert.equal(names.length, listTools().length + 3);
});

test('a run tool cannot be called without a run context', async () => {
  const result = await callTool({}, 'report_progress', { text: 'working' });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Unknown tool: report_progress/);
});

test('a run tool is called with the run context', async () => {
  const calls = [];
  const client = {
    agentRuns: {
      finish: async (...args) => {
        calls.push(args);
        return { finished: true };
      },
    },
  };
  const runContext = { runId: 'run-1', runnerId: 'laptop' };

  const progress = await callTool(client, 'report_progress', { text: 'working' }, { runContext });
  assert.deepEqual(JSON.parse(progress.content[0].text), { ok: true, text: 'working' });

  const finished = await callTool(client, 'finish_run', { summary: 'Done', readyToClose: true }, { runContext });
  assert.equal(finished.isError, undefined);
  assert.deepEqual(calls, [['run-1', { status: 'SUCCEEDED', summary: 'Done', readyToClose: true }, 'laptop']]);
});
