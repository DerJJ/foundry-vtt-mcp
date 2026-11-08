/**
 * Instance scoping — lets a second backend (e.g. a dev build) run alongside the
 * installed one instead of silently sharing its control channel and lock.
 */

import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_CONTROL_PORT, resolveControlPort, resolveLockFile } from './instance.js';

describe('resolveControlPort', () => {
  it('defaults to the installed backend port when unset', () => {
    expect(resolveControlPort({})).toBe(DEFAULT_CONTROL_PORT);
  });

  it('uses FOUNDRY_MCP_CONTROL_PORT when set', () => {
    expect(resolveControlPort({ FOUNDRY_MCP_CONTROL_PORT: '31424' })).toBe(31424);
  });

  it('rejects a non-numeric port rather than silently falling back', () => {
    expect(() => resolveControlPort({ FOUNDRY_MCP_CONTROL_PORT: 'banana' })).toThrow(
      /FOUNDRY_MCP_CONTROL_PORT/
    );
  });
});

describe('resolveLockFile', () => {
  it('keeps the original lock filename on the default port', () => {
    expect(resolveLockFile(DEFAULT_CONTROL_PORT)).toBe(
      path.join(os.tmpdir(), 'foundry-mcp-backend.lock')
    );
  });

  it('scopes the lock file per port so instances cannot evict each other', () => {
    expect(resolveLockFile(31424)).toBe(path.join(os.tmpdir(), 'foundry-mcp-backend-31424.lock'));
  });
});
