/**
 * Where Claude Desktop keeps its config, and what `init` writes there.
 *
 * Pure functions: the caller passes the platform, paths and an `exists` probe,
 * so every branch (including Windows, from a Mac) is testable without touching
 * the real filesystem.
 */

import { posix, win32 } from 'path';

export interface Host {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
}

export interface ServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

const CONFIG_FILE = 'claude_desktop_config.json';
const NPX_ARGS = ['-y', 'exponential-mcp', 'serve'];
const POSIX_SYSTEM_PATH = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

/**
 * The config file Claude Desktop reads on this platform.
 *
 * macOS keeps its old fallback to `~/.claude/` when only that file exists.
 * Windows and Linux do not: earlier versions wrote there on those platforms
 * and Claude Desktop never read it, so following it would repeat the bug.
 */
export function claudeDesktopConfigPath(host: Host): string {
  if (host.platform === 'win32') {
    const appData = host.env.APPDATA ?? win32.join(host.home, 'AppData', 'Roaming');
    return win32.join(appData, 'Claude', CONFIG_FILE);
  }

  if (host.platform === 'darwin') {
    const current = posix.join(host.home, 'Library', 'Application Support', 'Claude', CONFIG_FILE);
    const legacy = posix.join(host.home, '.claude', CONFIG_FILE);
    return !host.exists(current) && host.exists(legacy) ? legacy : current;
  }

  const configHome = host.env.XDG_CONFIG_HOME ?? posix.join(host.home, '.config');
  return posix.join(configHome, 'Claude', CONFIG_FILE);
}

/**
 * Claude Desktop creates its config directory on first launch, so a missing
 * directory means there is no Claude Desktop here to configure.
 */
export function isClaudeDesktopInstalled(host: Host, configPath: string): boolean {
  const pathLib = host.platform === 'win32' ? win32 : posix;
  return host.exists(configPath) || host.exists(pathLib.dirname(configPath));
}

/** npx unpacks into `~/.npm/_npx/<hash>/`, which it is free to delete. */
export function isNpxCachePath(path: string): boolean {
  return /[\\/]_npx[\\/]/.test(path);
}

/**
 * The `mcpServers.exponential` entry for Claude Desktop.
 *
 * A global install or a clone has a stable path, so the entry runs it directly
 * with this Node binary. Run through `npx`, this file sits in npx's cache: a
 * path that disappears when the cache is cleared and never sees a new release.
 * Then the entry calls `npx` instead.
 *
 * Claude Desktop does not start servers with the shell's PATH. Under nvm (or
 * any Node outside the system directories) a bare `npx` is not found, and an
 * absolute `npx` still fails with "env: node: No such file or directory",
 * because npx and the server both start through `#!/usr/bin/env node`. So the
 * entry names `npx` by absolute path and puts Node's directory on PATH.
 */
export function serverEntry(
  host: Pick<Host, 'platform' | 'exists'>,
  runtime: { execPath: string; serverPath: string },
): ServerEntry {
  if (!isNpxCachePath(runtime.serverPath)) {
    return { command: runtime.execPath, args: [runtime.serverPath] };
  }

  // The Node installer for Windows puts npx on the system PATH.
  if (host.platform === 'win32') {
    return { command: 'npx', args: [...NPX_ARGS] };
  }

  const nodeDir = posix.dirname(runtime.execPath);
  const npx = posix.join(nodeDir, 'npx');
  if (!host.exists(npx)) {
    return { command: 'npx', args: [...NPX_ARGS] };
  }

  const path = [nodeDir, ...POSIX_SYSTEM_PATH.filter((dir) => dir !== nodeDir)].join(':');
  return { command: npx, args: [...NPX_ARGS], env: { PATH: path } };
}

function isAbsolutePath(path: string): boolean {
  return posix.isAbsolute(path) || win32.isAbsolute(path);
}

/** What is wrong with an existing `mcpServers.exponential` entry, if anything. */
export function diagnoseServerEntry(entry: unknown, exists: (path: string) => boolean): string[] {
  const issues: string[] = [];
  const { command, args } = (entry ?? {}) as { command?: unknown; args?: unknown };

  if (typeof command !== 'string' || command === '') {
    issues.push('MCP config is missing "command" for Exponential.');
  } else if (isAbsolutePath(command) && !exists(command)) {
    issues.push(`MCP command not found: ${command}`);
  }

  const argList = Array.isArray(args) ? args.filter((arg): arg is string => typeof arg === 'string') : [];
  const runsThroughNpx = argList.some((arg) => arg === 'exponential-mcp' || arg.startsWith('exponential-mcp@'));
  if (runsThroughNpx) {
    return issues;
  }

  const serverPath = argList[0];
  if (!serverPath) {
    issues.push('MCP config args missing server entry point.');
  } else if (!exists(serverPath)) {
    issues.push(`MCP server entry not found: ${serverPath}`);
  } else if (isNpxCachePath(serverPath)) {
    issues.push(
      `MCP server entry is inside npx's cache, which npx may delete and which never updates: ${serverPath}`,
    );
  }

  return issues;
}
