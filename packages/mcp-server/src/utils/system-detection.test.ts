import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSystemCache,
  detectGameSystem,
  extractSystemValue,
  formatSystemError,
  getCachedSystemId,
  getCreatureLevel,
  getCreatureType,
  getSystemPaths,
  hasSpellcasting,
  SystemPaths,
} from './system-detection.js';

function clientReturning(system: unknown) {
  return { query: vi.fn(async () => ({ system })) } as any;
}

afterEach(() => clearSystemCache());

describe('detectGameSystem', () => {
  it.each(['dnd5e', 'pf2e', 'cosmere-rpg', 'mgt2e', 'dsa5', 'wfrp4e'])('detects %s', async id => {
    expect(await detectGameSystem(clientReturning({ id, version: '1' }))).toBe(id);
    expect(getCachedSystemId()).toBe(id);
  });

  it('reads the system id from an older plain string, ignoring case', async () => {
    expect(await detectGameSystem(clientReturning('PF2E'))).toBe('pf2e');
  });

  it('reports other systems as other but remembers the id', async () => {
    expect(await detectGameSystem(clientReturning({ id: 'coc7' }))).toBe('other');
    expect(getCachedSystemId()).toBe('coc7');
  });

  it('treats a missing system as other', async () => {
    expect(await detectGameSystem(clientReturning(undefined))).toBe('other');
  });

  it('asks Foundry only once and logs the result', async () => {
    const client = clientReturning({ id: 'dnd5e' });
    const logger: any = { info: vi.fn(), warn: vi.fn() };
    await detectGameSystem(client, logger);
    await detectGameSystem(client, logger);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('Game system detected', {
      systemId: 'dnd5e',
      detectedAs: 'dnd5e',
    });
  });

  it('does not cache a failure, so the next call retries', async () => {
    const logger: any = { info: vi.fn(), warn: vi.fn() };
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error('not connected'))
      .mockResolvedValueOnce({ system: { id: 'pf2e' } });
    const client: any = { query };

    expect(await detectGameSystem(client, logger)).toBe('other');
    expect(logger.warn).toHaveBeenCalled();
    expect(await detectGameSystem(client)).toBe('pf2e');
  });

  it('survives a failure without a logger', async () => {
    const client: any = { query: vi.fn().mockRejectedValue(new Error('x')) };
    expect(await detectGameSystem(client)).toBe('other');
  });

  it('forgets the system when the cache is cleared', async () => {
    await detectGameSystem(clientReturning({ id: 'dnd5e' }));
    clearSystemCache();
    expect(getCachedSystemId()).toBeNull();
  });
});

describe('system paths', () => {
  it('returns paths for dnd5e and pf2e only', () => {
    expect(getSystemPaths('dnd5e')).toBe(SystemPaths.dnd5e);
    expect(getSystemPaths('pf2e')).toBe(SystemPaths.pf2e);
    expect(getSystemPaths('dsa5')).toBeNull();
    expect(getSystemPaths('other')).toBeNull();
  });

  it('extracts nested values and tolerates gaps', () => {
    const data = { system: { details: { cr: 5 }, zero: 0 } };
    expect(extractSystemValue(data, 'system.details.cr')).toBe(5);
    expect(extractSystemValue(data, 'system.zero')).toBe(0);
    expect(extractSystemValue(data, 'system.nope.deeper')).toBeUndefined();
    expect(extractSystemValue(data, null)).toBeUndefined();
    expect(extractSystemValue(undefined, 'a')).toBeUndefined();
  });
});

describe('getCreatureLevel', () => {
  it('uses the challenge rating, then the level, for dnd5e', () => {
    expect(getCreatureLevel({ system: { details: { cr: '0.5' } } }, 'dnd5e')).toBe(0.5);
    expect(getCreatureLevel({ system: { details: { level: { value: 7 } } } }, 'dnd5e')).toBe(7);
    expect(getCreatureLevel({}, 'dnd5e')).toBeUndefined();
  });

  it('uses the level for pf2e', () => {
    expect(getCreatureLevel({ system: { details: { level: { value: 3 } } } }, 'pf2e')).toBe(3);
    expect(getCreatureLevel({}, 'pf2e')).toBeUndefined();
  });

  it('uses the tier, then the level, for cosmere-rpg, numbers only', () => {
    expect(getCreatureLevel({ system: { tier: 2 } }, 'cosmere-rpg')).toBe(2);
    expect(getCreatureLevel({ system: { level: 4 } }, 'cosmere-rpg')).toBe(4);
    expect(getCreatureLevel({ system: { tier: '2' } }, 'cosmere-rpg')).toBeUndefined();
  });

  it('knows nothing about other systems', () => {
    expect(getCreatureLevel({ system: { details: { cr: 1 } } }, 'dsa5')).toBeUndefined();
  });
});

describe('getCreatureType', () => {
  it('returns the type string for dnd5e', () => {
    expect(getCreatureType({ system: { details: { type: { value: 'beast' } } } }, 'dnd5e')).toBe(
      'beast'
    );
  });

  it('returns the traits for pf2e, if they are a list', () => {
    expect(getCreatureType({ system: { traits: { value: ['goblin'] } } }, 'pf2e')).toEqual([
      'goblin',
    ]);
    expect(getCreatureType({ system: { traits: { value: 'goblin' } } }, 'pf2e')).toBeUndefined();
  });

  it('knows nothing about other systems', () => {
    expect(getCreatureType({}, 'other')).toBeUndefined();
  });
});

describe('hasSpellcasting', () => {
  it('checks dnd5e spells and spell level', () => {
    expect(hasSpellcasting({ system: { spells: { spell1: {} } } }, 'dnd5e')).toBe(true);
    expect(hasSpellcasting({ system: { details: { spellLevel: 3 } } }, 'dnd5e')).toBe(true);
    expect(hasSpellcasting({}, 'dnd5e')).toBe(false);
  });

  it('checks pf2e spellcasting entries', () => {
    expect(hasSpellcasting({ system: { spellcasting: { a: {} } } }, 'pf2e')).toBe(true);
    expect(hasSpellcasting({ system: { spellcasting: {} } }, 'pf2e')).toBe(false);
  });

  it('is false for other systems', () => {
    expect(hasSpellcasting({ system: { spells: {} } }, 'other')).toBe(false);
  });
});

describe('formatSystemError', () => {
  it('names the unsupported system', () => {
    expect(formatSystemError('other', 'coc7')).toContain('"coc7"');
    expect(formatSystemError('other', null)).toContain('"unknown"');
  });

  it('has a generic message for supported systems', () => {
    expect(formatSystemError('dnd5e', 'dnd5e')).toBe('Unknown system error');
  });
});
