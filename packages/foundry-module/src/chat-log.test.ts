/**
 * The chat log must say who did what: spell casts, item use, attacks with outcome and DC,
 * damage, applied damage and plain chat, for both pf2e and dnd5e.
 */

import { describe, expect, it } from 'vitest';
import { buildChatLog, describeMessage, stripHtml, type ChatEnv } from './chat-log.js';

const docs: Record<string, any> = {
  'Actor.aria.Item.fireball': { name: 'Fireball', type: 'spell', system: { level: { value: 3 } } },
  'Actor.aria.Item.longsword': { name: 'Longsword', type: 'weapon', system: {} },
  'Actor.goblin': { name: 'Goblin Warrior' },
  'Item.dnd-fireball': { name: 'Fireball', type: 'spell', system: { level: 3 } },
};

function makeEnv(systemId: string): ChatEnv {
  const actors: Record<string, any> = {
    aria: {
      id: 'aria',
      name: 'Aria',
      items: {
        get: (id: string) =>
          id === 'sw' ? { name: 'Shortsword', type: 'weapon', system: {} } : undefined,
      },
    },
    gob: { id: 'gob', name: 'Goblin Warrior', items: { get: () => undefined } },
  };
  return {
    systemId,
    users: { get: (id: string) => ({ gm1: { name: 'Gamemaster' }, p1: { name: 'Pat' } })[id] },
    actors: { get: (id: string) => actors[id] },
    fromUuidSync: (uuid: string) => {
      if (docs[uuid]) return docs[uuid];
      throw new Error('not found');
    },
  };
}

const base = (over: any) => ({
  id: 'm' + Math.random().toString(36).slice(2, 8),
  timestamp: Date.parse('2026-11-01T10:00:00Z'),
  author: { name: 'Pat' },
  speaker: { actor: 'aria', alias: 'Aria' },
  whisper: [],
  blind: false,
  rolls: [],
  content: '',
  flavor: '',
  flags: {},
  ...over,
});

const d20 = (total: number) => ({
  formula: '1d20 + 7',
  total: total + 7,
  dice: [{ faces: 20, results: [{ result: total, active: true }] }],
});

describe('pf2e chat events', () => {
  const env = makeEnv('pf2e');

  it('recognises a spell cast and names the caster, spell and rank', () => {
    const e: any = describeMessage(
      base({
        content: '<h3>Fireball</h3><p>A burst of flame.</p>',
        flags: {
          pf2e: {
            origin: { type: 'spell', uuid: 'Actor.aria.Item.fireball' },
            casting: { id: 'e1', level: 4 },
          },
        },
      }),
      env
    );

    expect(e.kind).toBe('spell-cast');
    expect(e.item).toMatchObject({ name: 'Fireball', type: 'spell', level: 4 });
    expect(e.summary).toBe('Aria cast Fireball');
    expect(e.text).toBeUndefined();
  });

  it('describes an attack roll with target, DC and outcome', () => {
    const e: any = describeMessage(
      base({
        rolls: [d20(15)],
        flavor: '<strong>Strike: Longsword</strong>',
        flags: {
          pf2e: {
            origin: { type: 'weapon', uuid: 'Actor.aria.Item.longsword' },
            context: {
              type: 'attack-roll',
              outcome: 'success',
              dc: { value: 16, slug: 'ac' },
              target: { actor: 'Actor.goblin' },
            },
          },
        },
      }),
      env
    );

    expect(e).toMatchObject({
      kind: 'attack',
      outcome: 'success',
      dc: 16,
      dcAgainst: 'ac',
      targets: ['Goblin Warrior'],
    });
    expect(e.summary).toBe(
      'Aria attacked with Longsword on Goblin Warrior = 22 vs DC 16 (success)'
    );
    expect(e.rolls[0].natural).toBe(15);
  });

  it('keeps damage types from a damage roll', () => {
    const roll = {
      ...d20(0),
      formula: '2d6[fire]',
      total: 9,
      instances: [{ type: 'fire', total: 9 }],
    };
    const e: any = describeMessage(
      base({
        rolls: [roll],
        flags: {
          pf2e: {
            origin: { type: 'spell', uuid: 'Actor.aria.Item.fireball' },
            context: { type: 'damage-roll' },
          },
        },
      }),
      env
    );

    expect(e.kind).toBe('damage');
    expect(e.rolls[0].damage).toEqual([{ type: 'fire', total: 9 }]);
    expect(e.item.name).toBe('Fireball');
  });

  it('marks applied damage and keeps its text', () => {
    const e: any = describeMessage(
      base({
        speaker: { alias: 'Goblin Warrior' },
        content: '<p>Goblin Warrior takes 9 damage.</p>',
        flags: { pf2e: { appliedDamage: { isHealing: false } } },
      }),
      env
    );

    expect(e.kind).toBe('damage-applied');
    expect(e.text).toBe('Goblin Warrior takes 9 damage.');
  });

  it('treats a message without system flags as plain chat, and marks whispers', () => {
    const e: any = describeMessage(
      base({ content: '<p>I&#39;ll check the door.</p>', whisper: ['gm1'] }),
      env
    );

    expect(e.kind).toBe('chat');
    expect(e.visibility).toBe('whisper');
    expect(e.whisperTo).toEqual(['Gamemaster']);
    expect(e.summary).toBe("Aria said: I'll check the door.");
  });
});

describe('dnd5e chat events', () => {
  const env = makeEnv('dnd5e');

  it('recognises a spell usage card', () => {
    const e: any = describeMessage(
      base({
        flags: {
          dnd5e: {
            messageType: 'usage',
            item: { uuid: 'Item.dnd-fireball', type: 'spell' },
            targets: [{ name: 'Goblin Warrior', ac: 15 }],
          },
        },
      }),
      env
    );

    expect(e).toMatchObject({ kind: 'spell-cast', targets: ['Goblin Warrior'] });
    expect(e.item).toMatchObject({ name: 'Fireball', level: 3 });
    expect(e.summary).toBe('Aria cast Fireball on Goblin Warrior');
  });

  it('classifies roll messages and finds the item on the speaker', () => {
    const crit = { ...d20(20), isCritical: true };
    const e: any = describeMessage(
      base({ rolls: [crit], flags: { dnd5e: { roll: { type: 'attack', itemId: 'sw' } } } }),
      env
    );

    expect(e).toMatchObject({ kind: 'attack', outcome: 'criticalSuccess' });
    expect(e.item.name).toBe('Shortsword');
  });

  it('reads a saving throw', () => {
    const e: any = describeMessage(
      base({ rolls: [d20(9)], flags: { dnd5e: { roll: { type: 'save', dc: 15 } } } }),
      env
    );

    expect(e).toMatchObject({ kind: 'saving-throw', dc: 15 });
  });
});

describe('buildChatLog', () => {
  const env = makeEnv('pf2e');
  const msgs = [
    base({ id: 'a', timestamp: 1000, content: 'one' }),
    base({
      id: 'b',
      timestamp: 2000,
      speaker: { actor: 'gob', alias: 'Goblin Warrior' },
      rolls: [d20(5)],
    }),
    base({ id: 'c', timestamp: 3000, content: 'three' }),
  ];

  it('filters by actor and kind, and pages backwards', () => {
    expect(buildChatLog(msgs, { actor: 'goblin' }, env).events.map(e => e.id)).toEqual(['b']);
    expect(buildChatLog(msgs, { kinds: ['chat'] }, env).events.map(e => e.id)).toEqual(['a', 'c']);

    const page = buildChatLog(msgs, { limit: 1 }, env);
    expect(page.events.map(e => e.id)).toEqual(['c']);
    expect(
      buildChatLog(msgs, { limit: 1, beforeId: page.oldestId! }, env).events.map(e => e.id)
    ).toEqual(['b']);
  });

  it('filters by time and strips html safely', () => {
    expect(buildChatLog(msgs, { since: new Date(1500).toISOString() }, env).count).toBe(2);
    expect(stripHtml('<p>Hi&nbsp;<b>there</b></p><script>alert(1)</script>')).toBe('Hi there');
  });
});
