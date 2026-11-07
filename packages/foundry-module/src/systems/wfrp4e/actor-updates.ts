import { MODULE_ID } from '../../constants.js';
import { validateFoundryState, auditLog } from '../../services/support.js';
import type { FoundryDataAccess } from '../../data-access.js';

export class Wfrp4eActorService {
  constructor(private readonly access: FoundryDataAccess) {}

  /**
   * Update a WFRP4e actor's stat block (characteristics and/or wounds).
   * Writes initial/advances/modifier and wounds value/max; WFRP4e recomputes
   * the derived characteristic value/bonus on update.
   */
  async updateWfrp4eActor(data: {
    actor: string;
    characteristics?: Record<string, { initial?: number; advances?: number; modifier?: number }>;
    wounds?: { value?: number; max?: number };
    skills?: Array<{ name: string; advances: number }>;
    career?: string;
    movement?: number;
    biography?: string;
  }): Promise<any> {
    validateFoundryState();

    const systemId = (game.system as any).id;
    if (systemId !== 'wfrp4e') {
      return {
        success: false,
        error: `wfrp4e-update-actor requires the WFRP4e system (current: "${systemId}")`,
      };
    }

    // Resolve a world actor by id/name, or a scene token by id (an unlinked
    // token resolves to its own synthetic actor — see findActorByIdentifier).
    const actor = this.access.characters.findActorByIdentifier(data.actor);
    if (!actor) {
      return { success: false, error: `Actor not found: ${data.actor}` };
    }

    const CHAR_KEYS = ['ws', 'bs', 's', 't', 'i', 'ag', 'dex', 'int', 'wp', 'fel'];
    const FIELDS = ['initial', 'advances', 'modifier'] as const;
    const sys = actor.system || {};
    const update: Record<string, any> = {};
    const itemUpdates: Array<Record<string, any>> = [];
    const applied: {
      characteristics: Record<string, any>;
      wounds: Record<string, any>;
      skills: Record<string, any>;
      career?: string;
      details?: Record<string, any>;
    } = {
      characteristics: {},
      wounds: {},
      skills: {},
    };
    const warnings: string[] = [];

    if (data.characteristics) {
      for (const [rawKey, fields] of Object.entries(data.characteristics)) {
        const key = rawKey.toLowerCase();
        if (!CHAR_KEYS.includes(key)) {
          warnings.push(`Unknown characteristic "${rawKey}" — skipped`);
          continue;
        }
        const current = sys.characteristics?.[key] || {};
        const record: Record<string, any> = {};
        for (const field of FIELDS) {
          const val = (fields as any)[field];
          if (val !== undefined) {
            update[`system.characteristics.${key}.${field}`] = val;
            record[field] = { from: current[field], to: val };
          }
        }
        if (Object.keys(record).length > 0) {
          applied.characteristics[key.toUpperCase()] = record;
        }
      }
    }

    if (data.wounds) {
      const current = sys.status?.wounds || {};
      if (data.wounds.value !== undefined) {
        update['system.status.wounds.value'] = data.wounds.value;
        applied.wounds.value = { from: current.value, to: data.wounds.value };
      }
      if (data.wounds.max !== undefined) {
        update['system.status.wounds.max'] = data.wounds.max;
        applied.wounds.max = { from: current.max, to: data.wounds.max };
      }
    }

    // Detail fields: base movement and the biography/notes text.
    if (data.movement !== undefined) {
      update['system.details.move.value'] = data.movement;
      applied.details = applied.details || {};
      applied.details.movement = { from: sys.details?.move?.value, to: data.movement };
    }
    if (data.biography !== undefined) {
      update['system.details.biography.value'] = data.biography;
      applied.details = applied.details || {};
      applied.details.biography = { chars: data.biography.length };
    }

    // Existing embedded-item edits: bump advances on skills the actor already
    // has, and/or switch which career item is current. (Adding new skills or
    // careers is wfrp4e-add-items' job.)
    if (Array.isArray(data.skills)) {
      for (const s of data.skills) {
        const item = actor.items.find(
          (i: any) => i.type === 'skill' && i.name?.toLowerCase() === s.name.toLowerCase()
        );
        if (!item) {
          warnings.push(`Skill "${s.name}" not on ${actor.name} — use wfrp4e-add-items to add it.`);
          continue;
        }
        itemUpdates.push({ _id: item.id, 'system.advances.value': s.advances });
        applied.skills[item.name] = {
          advances: { from: item.system?.advances?.value, to: s.advances },
        };
      }
    }

    if (data.career) {
      const target = actor.items.find(
        (i: any) => i.type === 'career' && i.name?.toLowerCase() === data.career?.toLowerCase()
      );
      if (!target) {
        warnings.push(
          `Career "${data.career}" not on ${actor.name} — use wfrp4e-add-items to add it.`
        );
      } else {
        // Exactly one career is current; flip the target on and the rest off.
        for (const it of actor.items) {
          if (it.type === 'career') {
            itemUpdates.push({ _id: it.id, 'system.current.value': it.id === target.id });
          }
        }
        applied.career = target.name;
      }
    }

    if (Object.keys(update).length === 0 && itemUpdates.length === 0) {
      return {
        success: false,
        error: 'No valid fields to update.',
        ...(warnings.length ? { warnings } : {}),
      };
    }

    try {
      if (Object.keys(update).length > 0) {
        await actor.update(update);
      }
      if (itemUpdates.length > 0) {
        await actor.updateEmbeddedDocuments('Item', itemUpdates);
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Error updating WFRP4e actor:`, error);
      auditLog(
        'updateWfrp4eActor',
        { actor: data.actor },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Read back recomputed characteristic totals as confirmation.
    const after = actor.system || {};
    const newTotals: Record<string, any> = {};
    for (const key of CHAR_KEYS) {
      if (applied.characteristics[key.toUpperCase()]) {
        const c = after.characteristics?.[key];
        if (c) newTotals[key.toUpperCase()] = { total: c.value, bonus: c.bonus };
      }
    }

    auditLog('updateWfrp4eActor', { actor: data.actor }, 'success');

    return {
      success: true,
      actor: actor.name,
      id: actor.id,
      applied,
      newCharacteristicTotals: newTotals,
      ...(warnings.length ? { warnings } : {}),
    };
  }

  /**
   * Add items (skills, talents, traits, trappings, careers, weapons, spells, …)
   * to an existing WFRP4e actor. Each requested item is matched by name against
   * the installed WFRP4e compendiums and copied in full, so a skill keeps its
   * linked characteristic, a talent its tests/max, a career its progression.
   * Names with no compendium match are added as a blank item of the requested
   * (or default) type so homebrew still works.
   *
   * Per-item extras: `advances` sets a skill's advances; `quantity` sets a
   * gear count; `setCurrent` makes a career the active one (flipping the others
   * off). Resolution prefers the Core Rulebook pack, then the rest; pass `type`
   * and/or `pack` to disambiguate a name that exists in several places.
   */
  async addWfrp4eItems(data: {
    actor: string;
    items: Array<{
      name: string;
      type?: string;
      pack?: string;
      advances?: number;
      quantity?: number;
      setCurrent?: boolean;
    }>;
  }): Promise<any> {
    validateFoundryState();

    const systemId = (game.system as any).id;
    if (systemId !== 'wfrp4e') {
      return {
        success: false,
        error: `wfrp4e-add-items requires the WFRP4e system (current: "${systemId}")`,
      };
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      return {
        success: false,
        error: 'items array is required and must contain at least one entry',
      };
    }

    const actor = this.access.characters.findActorByIdentifier(data.actor);
    if (!actor) {
      return { success: false, error: `Actor not found: ${data.actor}` };
    }

    // Candidate Item packs, Core Rulebook first so a name shared across books
    // resolves to the canonical entry.
    const itemPacks: any[] = Array.from((game.packs as any) || []).filter(
      (p: any) => (p.metadata?.type ?? p.documentName) === 'Item'
    );
    itemPacks.sort((a: any, b: any) => {
      const rank = (p: any) => (String(p.metadata?.id || '').startsWith('wfrp4e-core') ? 0 : 1);
      return rank(a) - rank(b);
    });

    // Per-call index cache — each pack's index is loaded at most once.
    const indexCache = new Map<string, any>();
    const getIndex = async (pack: any) => {
      const id = pack.metadata.id;
      if (!indexCache.has(id)) indexCache.set(id, await pack.getIndex());
      return indexCache.get(id);
    };

    const warnings: string[] = [];
    const notFound: string[] = [];
    const ambiguous: Array<{ name: string; candidates: Array<{ pack: string; type: string }> }> =
      [];

    // Skill advances and gear quantity are baked into each item's creation data
    // (below) rather than patched afterwards, because createEmbeddedDocuments
    // does not guarantee it returns documents in the order we send them — so
    // positional alignment between the created docs and our requests is unsafe.
    const GEAR_TYPES = new Set([
      'weapon',
      'armour',
      'trapping',
      'ammunition',
      'container',
      'money',
      'cargo',
    ]);
    const applyExtras = (obj: Record<string, any>, type: string, req: any): void => {
      obj.system = obj.system || {};
      if (req.advances !== undefined && type === 'skill') {
        obj.system.advances = { ...(obj.system.advances || {}), value: req.advances };
      }
      if (req.quantity !== undefined && GEAR_TYPES.has(type)) {
        obj.system.quantity = { ...(obj.system.quantity || {}), value: req.quantity };
      }
    };

    const toCreate: Array<Record<string, any>> = [];
    // Keyed by `${type}::${name}` (the created doc's own name/type) so we can
    // match created documents back to their request without relying on order.
    const plan: Array<{
      nameLower: string;
      type: string;
      setCurrent: boolean | undefined;
      source: string;
    }> = [];

    // Find every compendium entry whose name (and optional type) matches, across
    // the candidate packs (their core-first order is preserved in the result).
    const findMatches = async (
      packs: any[],
      searchName: string,
      typeConstraint: string | undefined
    ): Promise<Array<{ packId: string; packLabel: string; entryId: string; type: string }>> => {
      const found: Array<{ packId: string; packLabel: string; entryId: string; type: string }> = [];
      for (const pack of packs) {
        const index = await getIndex(pack);
        for (const entry of index) {
          if (
            entry.name?.toLowerCase() === searchName &&
            (!typeConstraint || entry.type === typeConstraint)
          ) {
            found.push({
              packId: pack.metadata.id,
              packLabel: pack.metadata.label,
              entryId: entry._id,
              type: entry.type,
            });
          }
        }
      }
      return found;
    };

    for (const req of data.items) {
      const nameLower = req.name.toLowerCase();
      const typeWanted = req.type?.toLowerCase();
      const searchPacks = req.pack
        ? itemPacks.filter(
            (p: any) => p.metadata.id === req.pack || p.metadata.id.includes(req.pack as string)
          )
        : itemPacks;

      let matches = await findMatches(searchPacks, nameLower, typeWanted);

      // Grouped-skill fallback: a specialisation like "Entertain (Taunt)" often
      // has no dedicated entry, but the group's generic template "Entertain ()"
      // does — copy that (it carries the correct characteristic and grouping)
      // and rename the copy to the requested specialisation.
      let nameOverride: string | undefined;
      let templated = false;
      if (matches.length === 0 && (typeWanted === undefined || typeWanted === 'skill')) {
        const grouped = /^\s*(.+?)\s*\([^)]+\)\s*$/.exec(req.name);
        if (grouped) {
          const templateName = `${grouped[1]} ()`.toLowerCase();
          const templateMatches = await findMatches(searchPacks, templateName, 'skill');
          if (templateMatches.length > 0) {
            matches = templateMatches;
            nameOverride = req.name.trim();
            templated = true;
          }
        }
      }

      if (matches.length === 0) {
        const fallbackType = typeWanted || 'trapping';
        const obj: Record<string, any> = { name: req.name, type: fallbackType, system: {} };
        applyExtras(obj, fallbackType, req);
        toCreate.push(obj);
        plan.push({
          nameLower,
          type: fallbackType,
          setCurrent: req.setCurrent,
          source: 'custom (not in compendium)',
        });
        notFound.push(req.name);
        warnings.push(
          `"${req.name}" not found in any WFRP4e compendium — added as a blank ${fallbackType}.`
        );
        continue;
      }

      // Several distinct item types share this name and the caller didn't pick
      // one — don't guess.
      const distinctTypes = [...new Set(matches.map(m => m.type))];
      if (!typeWanted && distinctTypes.length > 1) {
        ambiguous.push({
          name: req.name,
          candidates: matches.map(m => ({ pack: m.packId, type: m.type })),
        });
        warnings.push(
          `"${req.name}" matches multiple item types (${distinctTypes.join(', ')}); pass "type" to choose — skipped.`
        );
        continue;
      }

      // matches preserves the core-first pack order, so [0] is the best source.
      const chosen = matches[0];
      const pack = (game.packs as any).get(chosen.packId);
      const sourceDoc = await pack.getDocument(chosen.entryId);
      const obj = sourceDoc.toObject();
      const finalName = nameOverride ?? obj.name;
      const clean: Record<string, any> = {
        name: finalName,
        type: obj.type,
        img: obj.img,
        system: obj.system || {},
        effects: obj.effects || [],
        flags: obj.flags || {},
      };
      applyExtras(clean, obj.type, req);
      toCreate.push(clean);
      plan.push({
        nameLower: String(finalName).toLowerCase(),
        type: obj.type,
        setCurrent: req.setCurrent,
        source: templated ? `${chosen.packLabel} (grouped template)` : chosen.packLabel,
      });
    }

    if (toCreate.length === 0) {
      return {
        success: false,
        error: 'No items could be added.',
        ...(notFound.length ? { notFound } : {}),
        ...(ambiguous.length ? { ambiguous } : {}),
        ...(warnings.length ? { warnings } : {}),
      };
    }

    let created: any[] = [];
    try {
      created = (await actor.createEmbeddedDocuments('Item', toCreate)) || [];

      // Make a career current if requested. Match the created career by NAME,
      // not by position (see the ordering note above). Exactly one career is
      // current, so flip the target on and every other career off.
      const setCurrentNames = new Set(
        plan.filter(p => p.setCurrent && p.type === 'career').map(p => p.nameLower)
      );
      if (setCurrentNames.size > 0) {
        let targetId: string | undefined;
        for (const doc of created) {
          if (doc.type === 'career' && setCurrentNames.has(String(doc.name).toLowerCase())) {
            targetId = doc.id;
          }
        }
        if (targetId) {
          const careerUpdates: Array<Record<string, any>> = [];
          for (const it of actor.items) {
            if (it.type === 'career') {
              careerUpdates.push({ _id: it.id, 'system.current.value': it.id === targetId });
            }
          }
          if (careerUpdates.length > 0) {
            await actor.updateEmbeddedDocuments('Item', careerUpdates);
          }
        }
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Error adding WFRP4e items:`, error);
      auditLog(
        'addWfrp4eItems',
        { actor: data.actor, count: toCreate.length },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Summarise, reading back derived skill totals / career state as confirmation.
    // Source is looked up by name+type (order-independent).
    const sourceByKey = new Map<string, string>();
    for (const p of plan) sourceByKey.set(`${p.type}::${p.nameLower}`, p.source);

    const createdSummary = created.map((doc: any) => {
      const after = actor.items.get(doc.id);
      const entry: Record<string, any> = {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        source: sourceByKey.get(`${doc.type}::${String(doc.name).toLowerCase()}`) ?? 'unknown',
      };
      if (after?.type === 'skill') {
        entry.advances = after.system?.advances?.value;
        entry.total = after.system?.total?.value;
        entry.characteristic = after.system?.characteristic?.value;
      }
      if (after?.type === 'career') entry.current = after.system?.current?.value ?? false;
      return entry;
    });

    auditLog('addWfrp4eItems', { actor: data.actor, count: created.length }, 'success');

    return {
      success: true,
      actor: actor.name,
      id: actor.id,
      created: createdSummary,
      ...(notFound.length ? { notFound } : {}),
      ...(ambiguous.length ? { ambiguous } : {}),
      ...(warnings.length ? { warnings } : {}),
    };
  }
}
