import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claudeDesktopConfigPath,
  diagnoseServerEntry,
  isClaudeDesktopInstalled,
  isNpxCachePath,
  serverEntry,
} from '../dist/clientConfig.js';

const host = (platform, { home = '/Users/sam', env = {}, files = [] } = {}) => ({
  platform,
  home,
  env,
  exists: (path) => files.includes(path),
});

const MAC_CONFIG = '/Users/sam/Library/Application Support/Claude/claude_desktop_config.json';
const MAC_LEGACY = '/Users/sam/.claude/claude_desktop_config.json';

test('macOS uses Application Support', () => {
  assert.equal(claudeDesktopConfigPath(host('darwin')), MAC_CONFIG);
});

test('macOS falls back to ~/.claude only when that is the one file that exists', () => {
  assert.equal(claudeDesktopConfigPath(host('darwin', { files: [MAC_LEGACY] })), MAC_LEGACY);
  assert.equal(claudeDesktopConfigPath(host('darwin', { files: [MAC_LEGACY, MAC_CONFIG] })), MAC_CONFIG);
});

test('Windows uses %APPDATA%\\Claude, not ~/.claude', () => {
  const windows = host('win32', {
    home: 'C:\\Users\\sam',
    env: { APPDATA: 'C:\\Users\\sam\\AppData\\Roaming' },
    // A file left behind by an earlier init must not be followed.
    files: ['C:\\Users\\sam\\.claude\\claude_desktop_config.json'],
  });
  assert.equal(
    claudeDesktopConfigPath(windows),
    'C:\\Users\\sam\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
  );
});

test('Windows without APPDATA derives it from the home directory', () => {
  assert.equal(
    claudeDesktopConfigPath(host('win32', { home: 'C:\\Users\\sam' })),
    'C:\\Users\\sam\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
  );
});

test('Linux uses XDG_CONFIG_HOME, defaulting to ~/.config', () => {
  assert.equal(
    claudeDesktopConfigPath(host('linux', { home: '/home/sam' })),
    '/home/sam/.config/Claude/claude_desktop_config.json',
  );
  assert.equal(
    claudeDesktopConfigPath(host('linux', { home: '/home/sam', env: { XDG_CONFIG_HOME: '/xdg' } })),
    '/xdg/Claude/claude_desktop_config.json',
  );
});

test('Claude Desktop counts as installed once its config directory exists', () => {
  const dir = '/Users/sam/Library/Application Support/Claude';
  assert.equal(isClaudeDesktopInstalled(host('darwin'), MAC_CONFIG), false);
  assert.equal(isClaudeDesktopInstalled(host('darwin', { files: [dir] }), MAC_CONFIG), true);
  assert.equal(isClaudeDesktopInstalled(host('darwin', { files: [MAC_CONFIG] }), MAC_CONFIG), true);
});

test('recognises npx cache paths on both path styles', () => {
  assert.equal(isNpxCachePath('/Users/sam/.npm/_npx/abc123/node_modules/exponential-mcp/dist/index.js'), true);
  assert.equal(isNpxCachePath('C:\\Users\\sam\\AppData\\Local\\npm-cache\\_npx\\abc\\node_modules\\x.js'), true);
  assert.equal(isNpxCachePath('/usr/local/lib/node_modules/exponential-mcp/dist/index.js'), false);
});

const NVM_BIN = '/Users/sam/.nvm/versions/node/v22.1.0/bin';
const NPX_CACHED = '/Users/sam/.npm/_npx/abc123/node_modules/exponential-mcp/dist/index.js';

test('a global install or clone runs its own stable path', () => {
  const serverPath = '/usr/local/lib/node_modules/exponential-mcp/dist/index.js';
  assert.deepEqual(serverEntry(host('darwin'), { execPath: '/usr/local/bin/node', serverPath }), {
    command: '/usr/local/bin/node',
    args: [serverPath],
  });
});

test('run through npx, the entry calls npx and never the cache path', () => {
  const entry = serverEntry(host('darwin', { files: [`${NVM_BIN}/npx`] }), {
    execPath: `${NVM_BIN}/node`,
    serverPath: NPX_CACHED,
  });
  assert.equal(entry.command, `${NVM_BIN}/npx`);
  assert.deepEqual(entry.args, ['-y', 'exponential-mcp', 'serve']);
  assert.equal(JSON.stringify(entry).includes('_npx'), false);
});

test('the npx entry puts Node on PATH so the #!/usr/bin/env node shebangs resolve', () => {
  const entry = serverEntry(host('darwin', { files: [`${NVM_BIN}/npx`] }), {
    execPath: `${NVM_BIN}/node`,
    serverPath: NPX_CACHED,
  });
  assert.equal(entry.env.PATH, `${NVM_BIN}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`);
});

test('a Node in a system directory is not listed twice on PATH', () => {
  const entry = serverEntry(host('darwin', { files: ['/usr/local/bin/npx'] }), {
    execPath: '/usr/local/bin/node',
    serverPath: NPX_CACHED,
  });
  assert.equal(entry.env.PATH, '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin');
});

test('without an npx beside Node, the entry falls back to a bare npx', () => {
  assert.deepEqual(serverEntry(host('linux'), { execPath: '/opt/node/bin/node', serverPath: NPX_CACHED }), {
    command: 'npx',
    args: ['-y', 'exponential-mcp', 'serve'],
  });
});

test('Windows calls npx from the system PATH', () => {
  const entry = serverEntry(host('win32'), {
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    serverPath: 'C:\\Users\\sam\\AppData\\Local\\npm-cache\\_npx\\abc\\node_modules\\exponential-mcp\\dist\\index.js',
  });
  assert.deepEqual(entry, { command: 'npx', args: ['-y', 'exponential-mcp', 'serve'] });
});

test('doctor accepts an npx entry, bare or absolute', () => {
  const args = ['-y', 'exponential-mcp', 'serve'];
  assert.deepEqual(diagnoseServerEntry({ command: 'npx', args }, () => false), []);
  assert.deepEqual(diagnoseServerEntry({ command: 'npx', args: ['-y', 'exponential-mcp@latest', 'serve'] }, () => false), []);
  assert.deepEqual(diagnoseServerEntry({ command: `${NVM_BIN}/npx`, args }, (path) => path === `${NVM_BIN}/npx`), []);
});

test('doctor reports an absolute command that is gone', () => {
  const issues = diagnoseServerEntry({ command: `${NVM_BIN}/npx`, args: ['-y', 'exponential-mcp', 'serve'] }, () => false);
  assert.deepEqual(issues, [`MCP command not found: ${NVM_BIN}/npx`]);
});

test('doctor flags an entry that still points into the npx cache', () => {
  const issues = diagnoseServerEntry({ command: '/usr/local/bin/node', args: [NPX_CACHED] }, () => true);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /inside npx's cache/);
});

test('doctor reports a missing entry point and a missing command', () => {
  assert.deepEqual(diagnoseServerEntry({ command: '/usr/local/bin/node', args: ['/gone/index.js'] }, (path) => path === '/usr/local/bin/node'), [
    'MCP server entry not found: /gone/index.js',
  ]);
  assert.deepEqual(diagnoseServerEntry({}, () => true), [
    'MCP config is missing "command" for Exponential.',
    'MCP config args missing server entry point.',
  ]);
});
