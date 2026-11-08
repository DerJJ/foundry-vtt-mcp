/**
 * Export test fixtures from a live Foundry world.
 *
 * Run it as a Script macro, as the GM, in the world you want to capture (create a macro of type
 * "Script", paste this file, execute it). The browser downloads one JSON file:
 *   fixtures-<system>-<version>.json
 * Move it to packages/foundry-module/src/__fixtures__/ (see the README in that folder).
 *
 * It only reads. What it exports: world and system info, up to a few actors of each type, a few
 * items of each type, the active scene, a handful of chat messages, active effects on those
 * actors and the first rows of a few compendium indexes. User ids, ownership, audit data and
 * anything that looks like a secret are removed. Open the file and look through it before you
 * commit it: names of players and campaign secrets can still sit in notes or biographies.
 */
(async () => {
  const PER_TYPE = 3;
  const MESSAGES = 10;
  const PACKS = 3;
  const PACK_ROWS = 25;

  const SECRET_KEYS = new Set([
    'password',
    'token',
    'secret',
    'auth',
    'credential',
    'session',
    'cookie',
  ]);

  // Remove what must not leave the world: user ids, secrets, bulky internals.
  function scrub(value, depth = 0) {
    if (value === null || typeof value !== 'object') return value;
    if (depth > 40) return '[Max depth reached]';
    if (Array.isArray(value)) return value.map(v => scrub(v, depth + 1));
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (SECRET_KEYS.has(key)) continue;
      if (key === '_stats') continue;
      if (key === 'ownership') {
        out.ownership = { default: val?.default ?? 0 };
        continue;
      }
      if (key === 'author' || key === 'user' || key === 'whisper') {
        out[key] = Array.isArray(val) ? val.map(() => 'user') : 'user';
        continue;
      }
      out[key] = scrub(val, depth + 1);
    }
    return out;
  }

  const plain = doc => scrub(JSON.parse(JSON.stringify(doc.toObject())));

  function sampleByType(collection) {
    const seen = new Map();
    const picked = [];
    for (const doc of collection.contents) {
      const n = seen.get(doc.type) ?? 0;
      if (n >= PER_TYPE) continue;
      seen.set(doc.type, n + 1);
      picked.push(doc);
    }
    return picked;
  }

  // CONFIG.statusEffects is an array in some systems and a map or plain object in others (PF2e).
  function statusEffectIds() {
    const raw = CONFIG.statusEffects;
    if (!raw) return [];
    const list = Array.isArray(raw)
      ? raw
      : typeof raw.values === 'function'
        ? Array.from(raw.values())
        : Object.values(raw);
    return [...new Set(list.map(entry => entry?.id).filter(Boolean))];
  }

  const actors = sampleByType(game.actors);
  const items = sampleByType(game.items);
  const scene = game.scenes.active ?? game.scenes.contents[0] ?? null;

  const packs = [];
  for (const pack of game.packs.contents.slice(0, PACKS)) {
    const index = await pack.getIndex();
    packs.push({
      collection: pack.collection,
      documentName: pack.documentName,
      title: pack.title,
      total: index.size,
      rows: index.contents.slice(0, PACK_ROWS).map(row => scrub(JSON.parse(JSON.stringify(row)))),
    });
  }

  const fixtures = {
    exportedAt: new Date().toISOString(),
    foundry: { version: game.version, release: game.release?.generation },
    system: { id: game.system.id, version: game.system.version },
    world: { id: game.world.id, title: game.world.title },
    conditions: statusEffectIds(),
    actors: actors.map(plain),
    items: items.map(plain),
    effects: actors.flatMap(actor => actor.effects.contents.slice(0, PER_TYPE).map(plain)),
    scene: scene ? plain(scene) : null,
    chat: game.messages.contents.slice(-MESSAGES).map(plain),
    packs,
  };

  const name = `fixtures-${game.system.id}-${game.system.version}.json`;
  saveDataToFile(JSON.stringify(fixtures, null, 2), 'application/json', name);
  ui.notifications.info(
    `Exported ${fixtures.actors.length} actors, ${fixtures.items.length} items, ${fixtures.chat.length} messages to ${name}`
  );
})();
