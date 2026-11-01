/**
 * PF2e variants of the table tools. table-actions.ts dispatches here when the world runs
 * the pf2e system; everything else keeps the dnd5e implementation.
 */

import type { TableHelpers } from './table-actions.js';

const g = (): any => (globalThis as any).game;
const cfg = (): any => (globalThis as any).CONFIG;

const PF2E_DEGREES = ['criticalFailure', 'failure', 'success', 'criticalSuccess'];

// ── apply-damage ──

export async function applyDamagePf2e(data: any, h: TableHelpers): Promise<any> {
  h.requireGM();
  const scene = h.resolveScene(data.sceneIdentifier);
  const type: string | undefined = data.type || undefined;
  const damageTypes = cfg().PF2E?.damageTypes ?? {};
  if (type && type !== 'healing' && type !== 'temphp' && !(type in damageTypes)) {
    throw new Error(
      `Unknown type ${type}. Allowed: healing, temphp, ${Object.keys(damageTypes).join(', ')}`
    );
  }
  const multiplier = data.multiplier ?? 1;
  const amount = Math.floor(data.amount * multiplier);
  const entries = h.resolveTargets(scene, data.targets, {
    allMatches: data.allMatches,
    actorFallback: true,
  });

  const results = [];
  for (const e of entries) {
    const before = h.hpOf(e.actor);
    if (!before) {
      results.push({ name: e.name, error: 'has no HP' });
      continue;
    }
    if (type === 'temphp') {
      // PF2e temp HP does not stack: keep the higher value.
      await e.actor.update({ 'system.attributes.hp.temp': Math.max(before.temp, amount) });
    } else {
      const token = e.token ?? e.actor.getActiveTokens?.(true, true)?.[0];
      if (!token) {
        results.push({ name: e.name, error: 'PF2e needs a token on the scene to apply damage' });
        continue;
      }
      let damage: any = type === 'healing' ? -amount : amount;
      if (type && type !== 'healing') {
        // A typed DamageRoll lets PF2e apply resistances, weaknesses and immunities.
        const DamageRoll = cfg().Dice?.rolls?.find((r: any) => r.name === 'DamageRoll');
        if (!DamageRoll) throw new Error('PF2e DamageRoll class not found');
        damage = await new DamageRoll(`(${amount})[${type}]`).evaluate();
      }
      await e.actor.applyDamage({ damage, token });
    }
    const after = h.hpOf(e.actor);
    const attr = e.actor.system?.attributes ?? {};
    results.push({
      name: e.name,
      tokenId: e.token?.id ?? null,
      before,
      after,
      down: after?.value === 0,
      dying: attr.dying?.value ?? 0,
      wounded: attr.wounded?.value ?? 0,
    });
  }
  return { success: true, type: type ?? 'untyped', amount: data.amount, multiplier, results };
}

// ── party-status ──

function slotsOf(entry: any): Record<string, string> {
  const out: Record<string, string> = {};
  const prepared = entry.system?.prepared?.value === 'prepared';
  for (const [key, s] of Object.entries<any>(entry.system?.slots ?? {})) {
    if (!(s?.max > 0)) continue;
    const rank = key.replace('slot', '');
    const remaining = prepared
      ? Object.values<any>(s.prepared ?? {}).filter(p => p?.id && !p.expended).length
      : s.value;
    out[rank === '0' ? 'cantrip' : rank] = `${remaining}/${s.max}`;
  }
  return out;
}

const pool = (r: any) => (r ? `${r.value}/${r.max}` : null);

export async function partyStatusPf2e(data: any, h: TableHelpers): Promise<any> {
  h.requireGM();
  const players = g().users.filter((u: any) => !u.isGM);
  const party = h.partyActors().map((a: any) => {
    const sys = a.system ?? {};
    const attr = sys.attributes ?? {};
    const entries =
      a.spellcasting?.contents ?? a.items.filter((i: any) => i.type === 'spellcastingEntry');
    const out: any = {
      name: a.name,
      player: players.find((u: any) => u.character?.id === a.id)?.name ?? null,
      level: sys.details?.level?.value ?? null,
      hp: h.hpOf(a),
      ac: attr.ac?.value ?? null,
      dying: attr.dying?.value ?? 0,
      wounded: attr.wounded?.value ?? 0,
      perception: { modifier: a.perception?.mod ?? null, dc: a.perception?.dc?.value ?? null },
      saves: Object.fromEntries(
        ['fortitude', 'reflex', 'will'].map(k => [k, a.saves?.[k]?.mod ?? null])
      ),
      classDC: a.classDC?.dc?.value ?? null,
      spellcasting: [...entries].map((entry: any) => ({
        name: entry.name,
        tradition: entry.system?.tradition?.value ?? null,
        dc: entry.statistic?.dc?.value ?? null,
        attack: entry.statistic?.check?.mod ?? null,
        slots: slotsOf(entry),
      })),
      focusPoints: pool(sys.resources?.focus),
      heroPoints: pool(sys.resources?.heroPoints),
      conditions: [...(a.statuses ?? [])].map(h.statusName),
    };
    if (data?.includeFeatures) {
      out.limitedUses = a.items
        .filter((i: any) => i.system?.frequency?.max > 0)
        .map((i: any) => {
          const f = i.system.frequency;
          return `${i.name} ${f.value}/${f.max}${f.per ? ` per ${f.per}` : ''}`;
        });
    }
    return out;
  });
  return { success: true, party };
}

// ── gm-roll ──

export async function gmRollPf2e(data: any, h: TableHelpers): Promise<any> {
  h.requireGM();
  const visibility = data.visibility ?? 'blind';
  const rollMode = h.rollModes[visibility];
  const toChat = visibility !== 'none';

  if (!data.rollType || !data.targets?.length)
    throw new Error('Give formula, or rollType + targets');
  if (data.rollType === 'ability') {
    throw new Error(
      'PF2e has no raw ability checks. Use rollType skill (key: a skill such as acrobatics, or perception) or save (fortitude, reflex, will).'
    );
  }
  const key = String(data.key ?? '').toLowerCase();
  const scene = h.resolveScene(data.sceneIdentifier);
  const entries = h.resolveTargets(scene, data.targets, { allMatches: true, actorFallback: true });
  const warnings =
    data.advantageMode && data.advantageMode !== 'normal'
      ? ['advantageMode is ignored on PF2e (fortune and misfortune come from rule elements)']
      : [];

  const results = [];
  for (const e of entries) {
    const a = e.actor;
    const statistic =
      data.rollType === 'save'
        ? a.saves?.[key]
        : key === 'perception'
          ? a.perception
          : a.skills?.[key];
    if (!statistic) {
      results.push({ name: e.name, error: `has no ${data.rollType} "${key}"` });
      continue;
    }
    if (data.rollType === 'passive') {
      // PF2e has no passive scores; the DC others roll against is 10 + modifier.
      results.push({
        name: e.name,
        modifier: statistic.mod ?? null,
        dc: statistic.dc?.value ?? null,
      });
      continue;
    }
    const roll = await statistic.roll({ skipDialog: true, rollMode, createMessage: toChat });
    results.push({
      name: e.name,
      total: roll?.total ?? null,
      natural: h.natural(roll),
      degreeOfSuccess: PF2E_DEGREES[roll?.degreeOfSuccess] ?? null,
    });
  }
  return {
    success: true,
    rollType: data.rollType,
    key,
    results,
    ...(warnings.length ? { warnings } : {}),
  };
}
