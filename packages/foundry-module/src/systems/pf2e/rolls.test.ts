/**
 * PF2e roll requests and use-item: statistics lookup, formula building, and use-item
 * returning the chat messages it created.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemService } from '../../services/items.js';
import { RollService } from '../../services/rolls.js';
import { pf2eModifier, pf2eStatistic } from './rolls.js';
import { startCollectingMessages } from '../../services/chat-log.js';

const actor: any = {
  skills: { stealth: { mod: 9 }, acrobatics: { mod: -1 } },
  perception: { mod: 11 },
  saves: { fortitude: { mod: 7 }, reflex: { mod: 8 }, will: { mod: 12 } },
  abilities: { dex: { mod: 3 } },
  getRollData: () => ({}),
};

describe('pf2e statistics', () => {
  it('finds skills by name, alias and case, and perception as a skill', () => {
    expect(pf2eModifier(actor, 'skill', 'Stealth')).toBe(9);
    expect(pf2eModifier(actor, 'skill', 'ste')).toBe(9);
    expect(pf2eModifier(actor, 'skill', 'prc')).toBe(11);
    expect(pf2eModifier(actor, 'skill', 'perception')).toBe(11);
  });

  it('finds saves, including short names, and ability modifiers', () => {
    expect(pf2eModifier(actor, 'save', 'fort')).toBe(7);
    expect(pf2eModifier(actor, 'save', 'Will')).toBe(12);
    expect(pf2eModifier(actor, 'ability', 'dexterity')).toBe(3);
  });

  it('returns null for something the actor does not have', () => {
    expect(pf2eModifier(actor, 'skill', 'thievery')).toBeNull();
    expect(pf2eModifier(actor, 'save', 'luck')).toBeNull();
    expect(pf2eStatistic(actor, 'skill', 'thievery')).toBeNull();
  });
});

describe('request-player-rolls formula on pf2e', () => {
  beforeEach(() => vi.stubGlobal('game', { system: { id: 'pf2e' } }));
  afterEach(() => vi.unstubAllGlobals());

  const build = (type: string, target: string, mod = '') =>
    (new RollService() as any).buildRollFormula(type, target, mod, actor);

  it('uses the statistic modifier instead of dnd5e roll data', () => {
    expect(build('skill', 'stealth')).toBe('1d20+9');
    expect(build('skill', 'acrobatics')).toBe('1d20-1');
    expect(build('save', 'will')).toBe('1d20+12');
  });

  it('appends an extra modifier and keeps custom formulas as written', () => {
    expect(build('skill', 'stealth', '+2')).toBe('1d20+9+2');
    expect(build('custom', '2d6+3')).toBe('2d6+3');
  });
});

describe('startCollectingMessages', () => {
  it('returns the matching messages created while listening, and stops listening', async () => {
    const handlers: Array<(m: any) => void> = [];
    vi.stubGlobal('Hooks', {
      on: (_name: string, fn: (m: any) => void) => handlers.push(fn),
      off: vi.fn(),
    });

    const collector = startCollectingMessages(m => m.speaker.actor === 'a1');
    handlers[0]({ id: 'x', speaker: { actor: 'other' } });
    handlers[0]({ id: 'y', speaker: { actor: 'a1' } });
    const found = await collector.finish(1000);

    expect(found.map(m => m.id)).toEqual(['y']);
    expect((globalThis as any).Hooks.off).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('gives up after waitMs when nothing arrives', async () => {
    vi.stubGlobal('Hooks', { on: () => 1, off: vi.fn() });
    const found = await startCollectingMessages(() => true).finish(150);

    expect(found).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('use-item on a pf2e spell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('casts through the spellcasting entry, picks the prepared slot, and returns the chat message', async () => {
    const handlers: Array<(m: any) => void> = [];
    vi.stubGlobal('Hooks', {
      on: (_n: string, fn: (m: any) => void) => handlers.push(fn),
      off: vi.fn(),
    });
    vi.stubGlobal('game', {
      ready: true,
      world: { id: 'w' },
      system: { id: 'pf2e' },
      user: { id: 'gm1' },
      users: { get: () => ({ name: 'GM' }) },
      actors: { get: () => undefined },
      scenes: { active: null },
    });
    vi.stubGlobal('fromUuidSync', () => ({
      name: 'Fireball',
      type: 'spell',
      system: { level: { value: 3 } },
    }));

    const cast = vi.fn(async () => {
      handlers[0]({
        id: 'msg1',
        timestamp: 1000,
        author: { name: 'GM' },
        speaker: { actor: 'aria', alias: 'Aria' },
        whisper: [],
        rolls: [],
        content: '<h3>Fireball</h3>',
        flags: {
          pf2e: { origin: { type: 'spell', uuid: 'Actor.aria.Item.fb' }, casting: { level: 3 } },
        },
      });
    });
    const spell: any = {
      id: 'fb',
      name: 'Fireball',
      type: 'spell',
      rank: 3,
      system: { level: { value: 3 } },
      spellcasting: {
        cast,
        system: {
          prepared: { value: 'prepared' },
          slots: { slot3: { prepared: { 0: { id: 'other' }, 1: { id: 'fb', expended: false } } } },
        },
      },
    };
    const actor: any = { id: 'aria', name: 'Aria', items: { find: (fn: any) => [spell].find(fn) } };

    const da = new ItemService({
      characters: { findActorByIdentifier: () => actor },
    } as any) as any;
    da.applyItemTargets = async () => ({
      targeting: { applied: [], status: 'none' },
      warnings: [],
    });

    const result = await da.useItem({
      actorIdentifier: 'Aria',
      itemIdentifier: 'Fireball',
      options: { waitMs: 1000 },
    });

    expect(cast).toHaveBeenCalledWith(spell, { rank: 3, consume: true, message: true, slotId: 1 });
    expect(result.chatMessages).toHaveLength(1);
    expect(result.chatMessages[0]).toMatchObject({
      id: 'msg1',
      kind: 'spell-cast',
      item: { name: 'Fireball' },
    });
    expect(result.message).toMatch(/1 chat message/);
  });
});
