/**
 * PF2e variants of apply-damage, party-status and gm-roll, against fake actors.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDamagePf2e, gmRollPf2e, partyStatusPf2e } from './table-actions.js';
import type { TableHelpers } from '../../services/table-actions.js';

function makeHelpers(actors: any[], partyActors: any[] = actors): TableHelpers {
  return {
    requireGM: () => {},
    resolveScene: () => ({ id: 's1' }),
    resolveTargets: () => actors.map(actor => ({ actor, token: actor.tokenDoc, name: actor.name })),
    hpOf: (a: any) => {
      const hp = a?.system?.attributes?.hp;
      return hp ? { value: hp.value, max: hp.max, temp: hp.temp || 0 } : null;
    },
    partyActors: () => partyActors,
    statusName: (id: string) => id,
    natural: (roll: any) => roll?.dice?.find((d: any) => d.faces === 20)?.total ?? null,
    rollModes: { blind: 'blindroll', gm: 'gmroll' },
  } as unknown as TableHelpers;
}

function makeActor(extra: Record<string, any> = {}) {
  const actor: any = {
    name: 'Goblin',
    tokenDoc: { id: 't1' },
    system: {
      attributes: {
        hp: { value: 20, max: 20, temp: 0 },
        dying: { value: 0 },
        wounded: { value: 0 },
      },
    },
    applyDamage: vi.fn(async () => {
      actor.system.attributes.hp.value = 12;
    }),
    update: vi.fn(),
    ...extra,
  };
  return actor;
}

describe('PF2e apply-damage', () => {
  beforeEach(() => {
    class DamageRoll {
      constructor(public formula: string) {}
      async evaluate() {
        return this;
      }
    }
    vi.stubGlobal('CONFIG', {
      PF2E: { damageTypes: { fire: 'fire' } },
      Dice: { rolls: [DamageRoll] },
    });
    vi.stubGlobal('game', { system: { id: 'pf2e' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('applies typed damage as a DamageRoll on the token and reports the result', async () => {
    const actor = makeActor();
    const out = await applyDamagePf2e(
      { targets: ['Goblin'], amount: 8, type: 'fire' },
      makeHelpers([actor])
    );

    const call = actor.applyDamage.mock.calls[0][0];
    expect(call.token).toBe(actor.tokenDoc);
    expect(call.damage.formula).toBe('(8)[fire]');
    expect(out.results[0]).toMatchObject({ before: { value: 20 }, after: { value: 12 } });
  });

  it('heals with negative damage and halves with the multiplier, rounding down', async () => {
    const healer = makeActor();
    await applyDamagePf2e({ targets: ['x'], amount: 9, type: 'healing' }, makeHelpers([healer]));
    expect(healer.applyDamage.mock.calls[0][0].damage).toBe(-9);

    const half = makeActor();
    await applyDamagePf2e({ targets: ['x'], amount: 9, multiplier: 0.5 }, makeHelpers([half]));
    expect(half.applyDamage.mock.calls[0][0].damage).toBe(4);
  });

  it('keeps the higher temp HP value instead of stacking', async () => {
    const actor = makeActor();
    actor.system.attributes.hp.temp = 5;
    await applyDamagePf2e({ targets: ['x'], amount: 3, type: 'temphp' }, makeHelpers([actor]));

    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.hp.temp': 5 });
    expect(actor.applyDamage).not.toHaveBeenCalled();
  });

  it('rejects an unknown damage type', async () => {
    await expect(
      applyDamagePf2e(
        { targets: ['x'], amount: 1, type: 'radiant-ish' },
        makeHelpers([makeActor()])
      )
    ).rejects.toThrow(/Unknown type/);
  });
});

describe('PF2e gm-roll', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rolls a skill through the statistic and maps the degree of success', async () => {
    const roll = vi.fn(async () => ({
      total: 23,
      degreeOfSuccess: 3,
      dice: [{ faces: 20, total: 18 }],
    }));
    const actor = makeActor({ skills: { stealth: { roll } } });
    const out = await gmRollPf2e(
      { rollType: 'skill', key: 'Stealth', targets: ['Goblin'] },
      makeHelpers([actor])
    );

    expect(roll).toHaveBeenCalledWith({
      skipDialog: true,
      rollMode: 'blindroll',
      createMessage: true,
    });
    expect(out.results[0]).toMatchObject({
      total: 23,
      natural: 18,
      degreeOfSuccess: 'criticalSuccess',
    });
  });

  it('rolls perception and saves, and reports a missing statistic per target', async () => {
    const perception = { roll: vi.fn(async () => ({ total: 10, degreeOfSuccess: 2, dice: [] })) };
    const actor = makeActor({ perception, saves: {} });
    const h = makeHelpers([actor]);

    const ok = await gmRollPf2e({ rollType: 'skill', key: 'perception', targets: ['x'] }, h);
    expect(ok.results[0].total).toBe(10);

    const bad = await gmRollPf2e({ rollType: 'save', key: 'will', targets: ['x'] }, h);
    expect(bad.results[0].error).toMatch(/no save "will"/);
  });

  it('returns modifier and DC for passive instead of rolling', async () => {
    const actor = makeActor({ perception: { mod: 7, dc: { value: 17 } } });
    const out = await gmRollPf2e(
      { rollType: 'passive', key: 'perception', targets: ['x'] },
      makeHelpers([actor])
    );

    expect(out.results[0]).toMatchObject({ modifier: 7, dc: 17 });
  });

  it('refuses ability checks and warns that advantage is ignored', async () => {
    await expect(
      gmRollPf2e({ rollType: 'ability', key: 'str', targets: ['x'] }, makeHelpers([makeActor()]))
    ).rejects.toThrow(/no raw ability checks/);

    const actor = makeActor({
      saves: { will: { roll: vi.fn(async () => ({ total: 5, dice: [] })) } },
    });
    const out = await gmRollPf2e(
      { rollType: 'save', key: 'will', targets: ['x'], advantageMode: 'advantage' },
      makeHelpers([actor])
    );
    expect(out.warnings[0]).toMatch(/ignored on PF2e/);
  });
});

describe('PF2e party-status', () => {
  beforeEach(() => {
    vi.stubGlobal('game', { users: { filter: () => [] } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('summarises HP, saves, spellcasting DC/attack/slots and pools', async () => {
    const actor = makeActor({
      system: {
        attributes: {
          hp: { value: 30, max: 40, temp: 0 },
          ac: { value: 21 },
          dying: { value: 0 },
          wounded: { value: 1 },
        },
        details: { level: { value: 5 } },
        resources: { focus: { value: 1, max: 2 }, heroPoints: { value: 1, max: 3 } },
      },
      items: { filter: () => [] },
      perception: { mod: 11, dc: { value: 21 } },
      saves: { fortitude: { mod: 9 }, reflex: { mod: 8 }, will: { mod: 12 } },
      classDC: { dc: { value: 24 } },
      statuses: new Set(['frightened']),
      spellcasting: {
        contents: [
          {
            name: 'Primal Spontaneous',
            system: {
              tradition: { value: 'primal' },
              prepared: { value: 'spontaneous' },
              slots: { slot0: { value: 0, max: 5 }, slot2: { value: 2, max: 3 } },
            },
            statistic: { dc: { value: 24 }, check: { mod: 14 } },
          },
        ],
      },
    });
    const out = await partyStatusPf2e({}, makeHelpers([actor]));
    const pc = out.party[0];

    expect(pc).toMatchObject({
      level: 5,
      ac: 21,
      wounded: 1,
      perception: { modifier: 11, dc: 21 },
      saves: { fortitude: 9, reflex: 8, will: 12 },
      classDC: 24,
      focusPoints: '1/2',
      heroPoints: '1/3',
      conditions: ['frightened'],
    });
    expect(pc.spellcasting[0]).toMatchObject({ tradition: 'primal', dc: 24, attack: 14 });
    expect(pc.spellcasting[0].slots).toEqual({ cantrip: '0/5', '2': '2/3' });
  });
});
