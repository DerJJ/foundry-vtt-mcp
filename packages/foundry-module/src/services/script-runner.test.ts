/**
 * Script and macro execution is opt-in: with the world setting off (the default) neither
 * execute-script nor macro execution may run anything, and a non-GM never gets through.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeScript, manageMacros } from './script-runner.js';

function installGame(opts: { isGM?: boolean; allow?: boolean; macros?: any[] } = {}) {
  const create = vi.fn().mockResolvedValue({});
  (globalThis as any).game = {
    user: { id: 'gm1', isGM: opts.isGM ?? true },
    settings: { get: vi.fn(() => opts.allow ?? false) },
    macros: Object.assign([...(opts.macros ?? [])], {}),
    folders: [],
  };
  (globalThis as any).ChatMessage = { create };
  (globalThis as any).ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
  return { create };
}

describe('script execution guard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).game;
    delete (globalThis as any).ChatMessage;
    delete (globalThis as any).ui;
  });

  it('refuses execute-script while the setting is off (default)', async () => {
    const { create } = installGame({ allow: false });
    await expect(executeScript({ code: 'return 1;' })).rejects.toThrow(/disabled/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a non-GM even with the setting on', async () => {
    installGame({ isGM: false, allow: true });
    await expect(executeScript({ code: 'return 1;' })).rejects.toThrow('Access denied');
  });

  it('runs a script when allowed, passes args, and whispers an audit card to the GM', async () => {
    const { create } = installGame({ allow: true });
    const out = await executeScript({
      code: 'console.log("hi"); return args.n * 2;',
      args: { n: 21 },
    });

    expect(out.success).toBe(true);
    expect(out.result).toBe(42);
    expect(out.logs.join('\n')).toContain('hi');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].whisper).toEqual(['gm1']);
  });

  it('reports a thrown error instead of throwing', async () => {
    installGame({ allow: true });
    const out = await executeScript({ code: 'throw new Error("boom");' });

    expect(out.success).toBe(false);
    expect(out.error.message).toBe('boom');
  });

  it('gives up waiting after the timeout', async () => {
    installGame({ allow: true });
    const out = await executeScript({ code: 'await new Promise(() => {});', timeoutMs: 1000 });

    expect(out.success).toBe(false);
    expect(out.error.message).toMatch(/Timed out/);
  });

  it('refuses macro execute while the setting is off but still lists macros', async () => {
    const macro = {
      id: 'm1',
      name: 'Shop',
      type: 'script',
      img: '',
      command: 'x',
      execute: vi.fn(),
    };
    installGame({ allow: false, macros: [macro] });

    await expect(manageMacros({ action: 'execute', macro: 'Shop' })).rejects.toThrow(/disabled/i);
    expect(macro.execute).not.toHaveBeenCalled();

    const listed = await manageMacros({ action: 'list' });
    expect(listed.macros).toHaveLength(1);
  });
});
