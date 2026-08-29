/**
 * Instance scoping for the backend control channel.
 *
 * The wrapper connects to an already-running backend before starting one, and the
 * backend holds a single-instance lock. Both keyed on fixed values means a second
 * build silently attaches to the installed backend instead of running its own code.
 * Scoping them by port lets a dev instance run alongside without evicting it.
 *
 * Kept free of side effects so it can be imported by tests; backend.ts runs on import.
 */

import * as os from 'os';
import * as path from 'path';

export const DEFAULT_CONTROL_PORT = 31414;

export function resolveControlPort(env: Record<string, string | undefined>): number {
  const raw = env.FOUNDRY_MCP_CONTROL_PORT;
  if (raw === undefined || raw === '') return DEFAULT_CONTROL_PORT;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`FOUNDRY_MCP_CONTROL_PORT must be a port number 1-65535, got "${raw}"`);
  }
  return port;
}

export function resolveLockFile(port: number): string {
  // The default port keeps the original filename so an installed backend still
  // recognises locks written by builds that predate this scoping.
  const name =
    port === DEFAULT_CONTROL_PORT
      ? 'foundry-mcp-backend.lock'
      : `foundry-mcp-backend-${port}.lock`;
  return path.join(os.tmpdir(), name);
}
