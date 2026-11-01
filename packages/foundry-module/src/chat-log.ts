/**
 * Structured chat log.
 *
 * Turns Foundry chat messages into events an agent can reason about: who did something,
 * what kind of event it was (spell cast, attack, damage, save, skill check, item use, damage
 * applied, plain chat...), which item or spell was involved, the targets, DC and outcome,
 * and the dice. The system-specific parts read the flags dnd5e and pf2e put on messages.
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export type ChatKind =
  | 'spell-cast'
  | 'item-use'
  | 'attack'
  | 'damage'
  | 'damage-applied'
  | 'saving-throw'
  | 'skill-check'
  | 'perception-check'
  | 'ability-check'
  | 'initiative'
  | 'flat-check'
  | 'death-save'
  | 'roll'
  | 'chat'
  | 'other';

export interface ChatEnv {
  systemId: string;
  users: { get(id: string): any };
  actors: { get(id: string): any };
  /** Synchronous UUID lookup; may throw or return null for unknown documents. */
  fromUuidSync: (uuid: string) => any;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

export function stripHtml(html: unknown): string {
  if (!html) return '';
  return decode(
    String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const PF2E_CONTEXT_KIND: Record<string, ChatKind> = {
  'attack-roll': 'attack',
  'spell-attack-roll': 'attack',
  'damage-roll': 'damage',
  'saving-throw': 'saving-throw',
  'skill-check': 'skill-check',
  'perception-check': 'perception-check',
  initiative: 'initiative',
  'flat-check': 'flat-check',
  'spell-cast': 'spell-cast',
};

const DND5E_ROLL_KIND: Record<string, ChatKind> = {
  attack: 'attack',
  damage: 'damage',
  save: 'saving-throw',
  skill: 'skill-check',
  ability: 'ability-check',
  tool: 'skill-check',
  death: 'death-save',
  initiative: 'initiative',
  hitDie: 'roll',
};

function safeUuid(env: ChatEnv, uuid?: string): any {
  if (!uuid) return null;
  try {
    return env.fromUuidSync(uuid) ?? null;
  } catch {
    return null;
  }
}

function describeItem(
  env: ChatEnv,
  actor: any,
  ref: { uuid?: string; id?: string; type?: string }
) {
  let doc = safeUuid(env, ref.uuid);
  if (!doc && ref.id && actor?.items?.get) doc = actor.items.get(ref.id);
  if (!doc && !ref.uuid) return null;
  const type = doc?.type ?? ref.type;
  const rawLevel = doc?.system?.level;
  const level = typeof rawLevel === 'number' ? rawLevel : rawLevel?.value;
  return {
    name: doc?.name ?? null,
    type: type ?? null,
    uuid: ref.uuid ?? doc?.uuid ?? null,
    ...(type === 'spell' && typeof level === 'number' ? { level } : {}),
  };
}

function targetNames(
  env: ChatEnv,
  refs: Array<{ name?: string; uuid?: string } | string | undefined>
) {
  const names: string[] = [];
  for (const ref of refs) {
    if (!ref) continue;
    if (typeof ref === 'object' && ref.name) {
      names.push(ref.name);
      continue;
    }
    const uuid = typeof ref === 'string' ? ref : ref.uuid;
    const doc = safeUuid(env, uuid);
    names.push(doc?.name ?? doc?.actor?.name ?? (uuid as string));
  }
  return [...new Set(names)];
}

function describeRolls(m: any) {
  return (m.rolls ?? []).map((r: any) => {
    const d20 = r.dice?.find((d: any) => d.faces === 20);
    const instances = r.instances?.map((i: any) => ({ type: i.type, total: i.total }));
    return {
      formula: r.formula,
      total: r.total,
      ...(d20?.results?.length
        ? { natural: d20.results.find((x: any) => x.active !== false)?.result }
        : {}),
      dice: (r.dice ?? []).map((d: any) => ({
        faces: d.faces,
        results: (d.results ?? []).map((x: any) => x.result),
      })),
      ...(instances?.length ? { damage: instances } : {}),
    };
  });
}

interface Facts {
  kind: ChatKind;
  item: ReturnType<typeof describeItem>;
  targets: string[];
  outcome: string | null;
  dc: number | null;
  dcAgainst: string | null;
}

function pf2eFacts(env: ChatEnv, m: any, actor: any): Facts | null {
  const pf2e = m.flags?.pf2e;
  if (!pf2e) return null;
  const ctx = pf2e.context;
  const origin = pf2e.origin;
  const casting = pf2e.casting;

  let kind: ChatKind | null = ctx?.type ? (PF2E_CONTEXT_KIND[ctx.type] ?? 'roll') : null;
  if (pf2e.appliedDamage) kind = 'damage-applied';
  // Spell cards carry an origin and a casting block but no check context.
  if (!kind && origin) kind = origin.type === 'spell' ? 'spell-cast' : 'item-use';
  if (!kind) return null;

  const item = origin?.uuid
    ? describeItem(env, actor, { uuid: origin.uuid, type: origin.type })
    : null;
  if (item && casting?.level !== undefined && item.type === 'spell') {
    (item as any).level = casting.level; // the rank it was cast at, which may be heightened
  }
  const targets = targetNames(env, [ctx?.target?.actor, ctx?.target?.token, pf2e.target?.actor]);
  return {
    kind,
    item,
    targets: targets.length ? [targets[0]!] : [],
    outcome: ctx?.outcome ?? null,
    dc: typeof ctx?.dc?.value === 'number' ? ctx.dc.value : null,
    dcAgainst: ctx?.dc?.slug ?? null,
  };
}

function dnd5eFacts(env: ChatEnv, m: any, actor: any): Facts | null {
  const dnd = m.flags?.dnd5e;
  if (!dnd) return null;
  const roll = dnd.roll;
  const itemRef =
    dnd.item ?? (roll?.itemUuid || roll?.itemId ? { uuid: roll.itemUuid, id: roll.itemId } : null);

  let kind: ChatKind | null = roll?.type ? (DND5E_ROLL_KIND[roll.type] ?? 'roll') : null;
  const item = itemRef
    ? describeItem(env, actor, {
        uuid: itemRef.uuid ?? roll?.itemUuid,
        id: itemRef.id ?? roll?.itemId,
        type: itemRef.type,
      })
    : null;
  if (!kind && (dnd.messageType === 'usage' || itemRef)) {
    kind = item?.type === 'spell' ? 'spell-cast' : 'item-use';
  }
  if (!kind) return null;

  const first = m.rolls?.[0];
  let outcome: string | null = null;
  if (first?.isCritical) outcome = 'criticalSuccess';
  else if (first?.isFumble) outcome = 'criticalFailure';
  return {
    kind,
    item,
    targets: targetNames(env, dnd.targets ?? []),
    outcome,
    dc: typeof roll?.dc === 'number' ? roll.dc : null,
    dcAgainst: null,
  };
}

const VERBS: Record<ChatKind, string> = {
  'spell-cast': 'cast',
  'item-use': 'used',
  attack: 'attacked with',
  damage: 'rolled damage for',
  'damage-applied': 'had damage applied',
  'saving-throw': 'rolled a saving throw',
  'skill-check': 'rolled a skill check',
  'perception-check': 'rolled Perception',
  'ability-check': 'rolled an ability check',
  initiative: 'rolled initiative',
  'flat-check': 'rolled a flat check',
  'death-save': 'rolled a death save',
  roll: 'rolled',
  chat: 'said',
  other: 'posted',
};

export interface DescribeOptions {
  /** auto: text for plain chat, other and damage-applied; all: for every message; none: never. */
  includeText?: 'auto' | 'all' | 'none';
  textLength?: number;
}

export function describeMessage(m: any, env: ChatEnv, options: DescribeOptions = {}) {
  const includeText = options.includeText ?? 'auto';
  const textLength = options.textLength ?? 300;
  const actor = m.speaker?.actor ? env.actors.get(m.speaker.actor) : null;
  const facts = env.systemId === 'pf2e' ? pf2eFacts(env, m, actor) : dnd5eFacts(env, m, actor);

  const hasRolls = (m.rolls?.length ?? 0) > 0;
  const kind: ChatKind =
    facts?.kind ?? (hasRolls ? 'roll' : m.content || m.flavor ? 'chat' : 'other');
  const rolls = describeRolls(m);
  const total = rolls[0]?.total;

  const who = actor?.name ?? m.speaker?.alias ?? m.author?.name ?? 'Someone';
  const flavor = stripHtml(m.flavor);
  const text = stripHtml(m.content);

  // Build a one-line summary an agent can read without opening the details.
  let summary = `${who} ${VERBS[kind]}`;
  if (kind === 'chat') summary = `${who} said: ${text.slice(0, 120)}`;
  else {
    if (facts?.item?.name) summary += ` ${facts.item.name}`;
    else if (flavor && !['spell-cast', 'item-use'].includes(kind))
      summary += ` (${flavor.slice(0, 80)})`;
    if (facts?.targets.length) summary += ` on ${facts.targets.join(', ')}`;
    if (total !== undefined && kind !== 'spell-cast' && kind !== 'item-use')
      summary += ` = ${total}`;
    if (facts?.dc !== null && facts?.dc !== undefined) summary += ` vs DC ${facts.dc}`;
    if (facts?.outcome) summary += ` (${facts.outcome})`;
  }

  const showText =
    includeText === 'all' ||
    (includeText === 'auto' && ['chat', 'other', 'damage-applied'].includes(kind));

  const visibility = m.blind ? 'blind' : m.whisper?.length ? 'whisper' : 'public';
  const entry: Record<string, unknown> = {
    id: m.id,
    time: new Date(m.timestamp).toISOString(),
    kind,
    summary,
    who: {
      user: m.author?.name ?? null,
      actor: actor?.name ?? null,
      actorId: m.speaker?.actor ?? null,
      alias: m.speaker?.alias ?? null,
    },
    visibility,
  };
  if (visibility !== 'public') {
    entry.whisperTo = (m.whisper ?? []).map((id: string) => env.users.get(id)?.name ?? id);
  }
  if (facts?.item) entry.item = facts.item;
  if (facts?.targets.length) entry.targets = facts.targets;
  if (facts?.outcome) entry.outcome = facts.outcome;
  if (facts?.dc !== null && facts?.dc !== undefined) {
    entry.dc = facts.dc;
    if (facts.dcAgainst) entry.dcAgainst = facts.dcAgainst;
  }
  if (rolls.length) entry.rolls = rolls;
  if (flavor) entry.flavor = flavor.slice(0, 200);
  if (showText && textLength > 0 && text) entry.text = text.slice(0, textLength);
  return entry;
}

export interface ChatLogQuery {
  limit?: number;
  /** Only messages newer than this ISO time. */
  since?: string;
  /** Return messages older than the message with this id (paging backwards). */
  beforeId?: string;
  /** Actor name (substring) or id; matches the speaker. */
  actor?: string;
  kinds?: ChatKind[];
  rollsOnly?: boolean;
  includeText?: 'auto' | 'all' | 'none';
  textLength?: number;
}

export function buildChatLog(messages: any[], query: ChatLogQuery, env: ChatEnv) {
  const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  let list = messages;

  if (query.beforeId) {
    const index = list.findIndex(m => m.id === query.beforeId);
    if (index >= 0) list = list.slice(0, index);
  }
  if (query.since) {
    const since = Date.parse(query.since);
    if (!Number.isNaN(since)) list = list.filter(m => m.timestamp > since);
  }
  if (query.rollsOnly) list = list.filter(m => m.rolls?.length);
  if (query.actor) {
    const needle = query.actor.toLowerCase();
    list = list.filter(m => {
      const actor = m.speaker?.actor ? env.actors.get(m.speaker.actor) : null;
      return (
        m.speaker?.actor === query.actor ||
        String(actor?.name ?? m.speaker?.alias ?? '')
          .toLowerCase()
          .includes(needle)
      );
    });
  }

  const describeOptions: DescribeOptions = {};
  if (query.includeText) describeOptions.includeText = query.includeText;
  if (query.textLength !== undefined) describeOptions.textLength = query.textLength;
  let events = list.map(m => describeMessage(m, env, describeOptions));
  if (query.kinds?.length) events = events.filter(e => query.kinds!.includes(e.kind as ChatKind));

  const page = events.slice(-limit);
  return {
    success: true,
    count: page.length,
    // Pass this as beforeId to read older messages.
    oldestId: page[0]?.id ?? null,
    events: page,
  };
}

/** `getChatMessages` query handler: reads the live chat log (GM view, includes whispers). */
export async function getChatLog(data: ChatLogQuery): Promise<any> {
  const g = (globalThis as any).game;
  if (!g?.user?.isGM) throw new Error('Access denied');
  const env: ChatEnv = {
    systemId: g.system?.id ?? '',
    users: g.users,
    actors: g.actors,
    fromUuidSync: (uuid: string) => (globalThis as any).fromUuidSync(uuid),
  };
  return buildChatLog(g.messages.contents, data ?? {}, env);
}

/** Environment backed by the live game, for callers inside the bridge. */
export function liveChatEnv(): ChatEnv {
  const g = (globalThis as any).game;
  return {
    systemId: g.system?.id ?? '',
    users: g.users,
    actors: g.actors,
    fromUuidSync: (uuid: string) => (globalThis as any).fromUuidSync(uuid),
  };
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Collect the chat messages created while an action runs. Start it before the action;
 * `finish(waitMs)` waits for the first matching message (then a short moment for follow-ups
 * such as a damage card) or until the time is up, and always stops listening.
 */
export function startCollectingMessages(match: (message: any) => boolean) {
  const Hooks = (globalThis as any).Hooks;
  const found: any[] = [];
  // Without Hooks (outside Foundry) there is nothing to listen to; finish() returns at once.
  if (!Hooks?.on) return { stop: () => {}, finish: async () => found };
  const hookId = Hooks.on('createChatMessage', (message: any) => {
    try {
      if (match(message)) found.push(message);
    } catch {
      // a broken matcher must not break chat
    }
  });
  // Hooks.on returns an id in Foundry; without one there is nothing to wait for.
  if (hookId === undefined) return { stop: () => {}, finish: async () => found };
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    Hooks.off?.('createChatMessage', hookId);
  };
  return {
    stop,
    async finish(waitMs: number): Promise<any[]> {
      const started = Date.now();
      while (Date.now() - started < waitMs && found.length === 0) await sleep(100);
      if (found.length > 0) await sleep(400);
      stop();
      return found;
    },
  };
}
