import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMAINS, toolDefinition } from '../dist/domains/index.js';

const EFFECTS = new Set(['read', 'write', 'delete']);

test('every domain operation declares an effect', () => {
  for (const domain of DOMAINS.values()) {
    for (const [name, operation] of Object.entries(domain.operations)) {
      assert.ok(EFFECTS.has(operation.effect), `${domain.name}.${name} has effect ${operation.effect}`);
    }
  }
});

test('every domain tool carries title, readOnlyHint and destructiveHint derived from its operations', () => {
  for (const domain of DOMAINS.values()) {
    const { annotations } = toolDefinition(domain);
    const effects = Object.values(domain.operations).map((o) => o.effect);
    assert.equal(typeof annotations?.title, 'string', `${domain.name} title`);
    assert.ok(annotations.title.length > 0);
    assert.equal(annotations.readOnlyHint, effects.every((e) => e === 'read'), `${domain.name} readOnlyHint`);
    assert.equal(annotations.destructiveHint, effects.includes('delete'), `${domain.name} destructiveHint`);
  }
});

test('a read-only domain and a destructive one are annotated as such', () => {
  assert.deepEqual(toolDefinition(DOMAINS.get('workspaces')).annotations, {
    title: 'Workspaces',
    readOnlyHint: true,
    destructiveHint: false,
  });
  assert.deepEqual(toolDefinition(DOMAINS.get('key_results')).annotations, {
    title: 'Key results',
    readOnlyHint: false,
    destructiveHint: true,
  });
});
