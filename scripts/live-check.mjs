// Live check: walks the domain tools through a real MCP connection against the Foundry world
// that is connected right now, creates test objects, deletes them again, and prints a result per
// action. Needs the built server (`npm run build:server`) and the bridge connected in a GM
// browser. Everything it creates is named with PREFIX; whatever it cannot delete is listed.
//
//   node scripts/live-check.mjs            read, create, change and delete test objects
//   node scripts/live-check.mjs --chat     also posts one chat message (it cannot be deleted)
//
// What it can only check with a human: combat needs tokens in a combat, ownership needs a
// player user. Those steps report "skipped" with the reason instead of failing.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'zz-mcp-check';
const withChat = process.argv.includes('--chat');

const transport = new StdioClientTransport({
  command: 'node',
  args: [path.join(root, 'packages/mcp-server/dist/index.js')],
});
const client = new Client({ name: 'live-check', version: '1.0.0' });
await client.connect(transport);

const results = [];
const leftovers = [];

class Skip extends Error {}

async function call(tool, action, params = {}) {
  const response = await client.callTool({ name: tool, arguments: { action, params } });
  const text = (response.content ?? []).map(part => part.text ?? '').join('\n');
  if (response.isError) throw new Error(text.replace(/^Error: /, ''));
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function step(name, run) {
  try {
    const detail = await run();
    results.push({ name, status: 'pass', detail: typeof detail === 'string' ? detail : '' });
  } catch (error) {
    if (error instanceof Skip) results.push({ name, status: 'skip', detail: error.message });
    else
      results.push({ name, status: 'FAIL', detail: String(error.message ?? error).slice(0, 220) });
  }
}

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const skip = reason => {
  throw new Skip(reason);
};

// --- what the world is ---------------------------------------------------------------------
let caps;
// The bridge reconnects on a timer after the server starts, so wait for it for a while.
const waitUntil = Date.now() + 300_000;
let lastError = '';
while (!caps && Date.now() < waitUntil) {
  try {
    const answer = await call('world', 'capabilities');
    if (answer?.system?.id && answer?.accessLevel?.id) caps = answer;
    else lastError = 'no system or access level in the answer';
  } catch (error) {
    lastError = String(error.message ?? error);
  }
  if (!caps) await new Promise(resolve => setTimeout(resolve, 3000));
}
if (caps) {
  results.push({
    name: 'world.capabilities',
    status: 'pass',
    detail: `${caps.system.id} ${caps.system.version}, access: ${caps.accessLevel.label}`,
  });
} else {
  console.log(`The bridge did not answer within 5 minutes: ${lastError.slice(0, 200)}`);
  console.log('Is Foundry open with the bridge connected?');
  await client.close();
  process.exit(1);
}
const system = caps.system.id;
const canWrite = caps.accessLevel.allows.includes('write');
const canDelete = caps.accessLevel.allows.includes('delete');

await step('world.info', async () => {
  const info = await call('world', 'info');
  expect(info?.id || info?.world?.id || JSON.stringify(info).includes('id'), 'no world id');
});

for (const tool of [
  'world',
  'documents',
  'actors',
  'compendium',
  'scenes',
  'tokens',
  'combat',
  'chat',
  'journals',
  'modules',
  'settings',
  'time',
  'audio',
  'macros',
  'images',
]) {
  await step(`${tool}.describe`, async () => {
    const d = await call(tool, 'describe');
    expect(Array.isArray(d.actions) && d.actions.length > 0, 'no actions');
    expect(d.system === system, `describes ${d.system}, world is ${system}`);
    return `${d.actions.length} actions`;
  });
}

// --- documents.schema ---------------------------------------------------------------------------
let schema;
await step('documents.schema (overview)', async () => {
  schema = await call('documents', 'schema');
  expect(schema.system === system, 'wrong system');
  expect(schema.types?.Actor?.subtypes?.length > 0, 'no actor subtypes');
  expect(schema.types?.Actor?.embedded?.includes('Item'), 'actors do not list Item as embedded');
  expect(schema.kinds?.spells || schema.kinds?.inventory, 'no kinds');
  return `kinds: ${Object.keys(schema.kinds).join(', ')}`;
});
await step('documents.schema (Item, a subtype)', async () => {
  const subtype = schema?.kinds?.spells?.[0] ?? schema?.types?.Item?.subtypes?.[0];
  if (!subtype) skip('no item subtype');
  const r = await call('documents', 'schema', { type: 'Item', subtype });
  expect(r.system || r.fields, 'no fields');
  expect(JSON.stringify(r).length < 30_000, `schema answer too large: ${JSON.stringify(r).length}`);
  return `${subtype}: ${JSON.stringify(r).length} characters`;
});
await step('documents.schema (Actor npc)', async () => {
  const subtypes = schema?.types?.Actor?.subtypes ?? [];
  const subtype = subtypes.find(s => s === 'npc') ?? subtypes[0];
  const r = await call('documents', 'schema', { type: 'Actor', subtype });
  expect(r.fields && r.subtypes, 'no fields');
  expect(JSON.stringify(r).length < 30_000, `schema answer too large: ${JSON.stringify(r).length}`);
  return `${subtype}: ${JSON.stringify(r).length} characters`;
});

// --- reads ----------------------------------------------------------------------------------
let hasScene = false;
await step('scenes.list', async () => {
  const r = await call('scenes', 'list');
  hasScene = Array.isArray(r) ? r.length > 0 : JSON.stringify(r).length > 10;
  return hasScene ? 'has scenes' : 'no scenes';
});
await step('scenes.current', async () => {
  if (!hasScene) skip('the world has no scene');
  await call('scenes', 'current');
});
await step('compendium.packs', async () => {
  const r = await call('compendium', 'packs');
  expect(r.packs?.length > 0, 'no packs');
  const filtered = await call('compendium', 'packs', { type: 'Item' });
  expect(
    filtered.packs.every(p => p.type === 'Item'),
    'type filter does not filter'
  );
  return `${r.total} packs`;
});
await step('compendium.search', () => call('compendium', 'search', { query: 'dr', limit: 3 }));
await step('compendium.find-creatures', async () => {
  const r = await call('compendium', 'find-creatures', { limit: 3 });
  expect(r.creatures?.length >= 0, 'no creature answer');
});
await step('documents.list (Actor, paged)', async () => {
  const r = await call('documents', 'list', { type: 'Actor', limit: 2 });
  expect(r.hasMore !== undefined && r.total !== undefined, 'no paging fields');
  return `total ${r.total}`;
});
await step('journals.list', () => call('journals', 'list'));
await step('journals.search', () => call('journals', 'search', { searchQuery: 'a' }));
await step('documents.list (Playlist)', () => call('documents', 'list', { type: 'Playlist' }));
await step('documents.list (RollTable)', () => call('documents', 'list', { type: 'RollTable' }));
await step('tokens.list-conditions', () => call('tokens', 'list-conditions'));
await step('actors.list-ownership', () => call('actors', 'list-ownership', {}));
await step('documents.list (Item)', () => call('documents', 'list', { type: 'Item' }));

// --- modules ----------------------------------------------------------------------------------
let installed;
await step('modules.list', async () => {
  installed = await call('modules', 'list', { limit: 500 });
  expect(installed.total > 0 && installed.modules.length > 0, 'no modules');
  const bridge = installed.modules.find(m => m.id === 'foundry-mcp-bridge');
  expect(bridge?.active === true, 'the bridge module is not listed as running');
  const running = await call('modules', 'list', { active: true, limit: 500 });
  expect(
    running.modules.every(m => m.active),
    'active filter does not filter'
  );
  return `${installed.total} installed, ${installed.activeCount} running, ${installed.pendingReload} waiting for a reload`;
});
await step('modules.get', async () => {
  const r = await call('modules', 'get', { id: 'foundry-mcp-bridge' });
  expect(r.version && r.relationships && Array.isArray(r.dependents), 'incomplete answer');
});
await step('modules.set-active refuses to switch off the bridge', async () => {
  if (!canWrite) skip('read only');
  try {
    await call('modules', 'set-active', { id: 'foundry-mcp-bridge', active: false });
  } catch (error) {
    expect(/connection to this tool/.test(error.message), `unexpected refusal: ${error.message}`);
    return 'refused as expected';
  }
  throw new Error('the bridge module was switched off');
});
await step('modules.set-active to the state a module already has changes nothing', async () => {
  if (!canWrite) skip('read only');
  const library = installed?.modules?.find(
    m => m.active && !m.pendingReload && m.id !== 'foundry-mcp-bridge'
  );
  if (!library) skip('no running module to ask about');
  const r = await call('modules', 'set-active', { id: library.id, active: true });
  expect(r.reloadRequired === false && r.changed.length === 0, 'it changed something');
  return library.id;
});

// --- settings ---------------------------------------------------------------------------------
let someSetting;
await step('settings.list', async () => {
  const r = await call('settings', 'list', { limit: 500 });
  expect(r.total > 0 && r.settings.length > 0, 'no settings');
  expect(
    r.settings.every(s => s.key && s.scope),
    'a setting without key or scope'
  );
  someSetting = r.settings.find(
    s =>
      !s.key.startsWith('foundry-mcp-bridge.') &&
      !s.key.startsWith('core.moduleConfiguration') &&
      !s.key.startsWith('core.permissions') &&
      s.value !== '[hidden]' &&
      (typeof s.value === 'boolean' || typeof s.value === 'number')
  );
  const ns = await call('settings', 'list', { namespace: 'core', limit: 500 });
  expect(
    ns.settings.every(s => s.key.startsWith('core.')),
    'namespace filter does not filter'
  );
  return `${r.total} settings`;
});
await step('settings.get', async () => {
  if (!someSetting) skip('no simple setting to read');
  const r = await call('settings', 'get', { key: someSetting.key });
  expect(r.key === someSetting.key && 'default' in r, 'incomplete answer');
});
await step('settings.get says the bridge settings cannot be changed here', async () => {
  const r = await call('settings', 'get', { key: 'foundry-mcp-bridge.accessLevel' });
  expect(r.changeable === false, 'the access level is changeable through the tool');
});
await step('settings.set refuses the bridge settings, the module list and secrets', async () => {
  if (!canWrite) skip('read only');
  for (const key of [
    'foundry-mcp-bridge.accessLevel',
    'foundry-mcp-bridge.allowExecute',
    'core.moduleConfiguration',
  ]) {
    try {
      await call('settings', 'set', { key, value: key.endsWith('Configuration') ? {} : 'full' });
    } catch (error) {
      continue;
    }
    throw new Error(`${key} was changed`);
  }
  return 'all refused';
});
await step('settings.set to the value a setting already has changes nothing', async () => {
  if (!canWrite) skip('read only');
  if (!someSetting) skip('no simple setting to change');
  const r = await call('settings', 'set', { key: someSetting.key, value: someSetting.value });
  expect(JSON.stringify(r.from) === JSON.stringify(r.to), 'the value changed');
  return someSetting.key;
});

// --- compendium entries of every document type -------------------------------------------------
// Worlds rarely have Scene, Playlist, Cards or Adventure packs, so the check makes its own: one
// small world pack per type, with one entry created straight in the pack (no world document is
// made). The packs are deleted at the end.
const FIXTURE_PACKS = [
  { type: 'Scene', entry: { name: `${PREFIX}-scene` } },
  { type: 'Playlist', entry: { name: `${PREFIX}-playlist-entry` } },
  { type: 'Cards', entry: { name: `${PREFIX}-deck`, type: 'deck' } },
  { type: 'Adventure', entry: { name: `${PREFIX}-adventure` } },
];
const packNameOf = type => `${PREFIX}-${type.toLowerCase()}`;
const fixturePackTypes = [];
async function deleteFixturePack(type) {
  await call('compendium', 'delete-pack', {
    identifier: `world.${packNameOf(type)}`,
    confirmDelete: true,
  });
}
if (canWrite) {
  await step('fixture packs: a Scene, Playlist, Cards and Adventure entry', async () => {
    const made = [];
    for (const { type, entry } of FIXTURE_PACKS) {
      if (canDelete) {
        try {
          await deleteFixturePack(type); // a leftover of an earlier run
        } catch {
          // not there
        }
      }
      try {
        await call('compendium', 'create-pack', {
          label: `${PREFIX} ${type}`,
          type,
          name: packNameOf(type),
        });
        fixturePackTypes.push(type);
        const r = await call('documents', 'create', {
          type,
          pack: `world.${packNameOf(type)}`,
          data: entry,
        });
        expect(
          r?.created?.length === 1,
          `${type} entry not created: ${JSON.stringify(r).slice(0, 120)}`
        );
        made.push(type);
      } catch (error) {
        throw new Error(`${type}: ${String(error.message ?? error).slice(0, 150)}`);
      }
    }
    return made.join(', ');
  });
} else {
  results.push({ name: 'fixture packs', status: 'skip', detail: 'read only' });
}

const DOCUMENT_TYPES = [
  'Item',
  'Actor',
  'JournalEntry',
  'RollTable',
  'Scene',
  'Macro',
  'Playlist',
  'Cards',
  'Adventure',
];
const sample = {};
async function firstEntry(type) {
  if (type in sample) return sample[type];
  sample[type] = null;
  const listed = (await call('compendium', 'packs', { type })).packs ?? [];
  const mine = `world.${PREFIX}`;
  const packs = [...listed].sort(
    (a, b) => Number(b.id.startsWith(mine)) - Number(a.id.startsWith(mine))
  );
  for (const pack of packs.slice(0, 5)) {
    const r = await call('documents', 'list', { type, pack: pack.id, limit: 1 });
    const entry = r.documents?.[0];
    if (entry) {
      sample[type] = { packId: pack.id, itemId: entry.id, name: entry.name };
      break;
    }
  }
  return sample[type];
}
for (const type of DOCUMENT_TYPES) {
  await step(`compendium.get (${type})`, async () => {
    const found = await firstEntry(type);
    if (!found) skip(`no ${type} pack with entries in this world`);
    const full = await call('compendium', 'get', { packId: found.packId, itemId: found.itemId });
    expect(full && typeof full === 'object' && !full.error, 'no entry returned');
    if (type !== 'Item' && type !== 'Actor') {
      expect(full.documentName === type, `documentName is ${full.documentName}, expected ${type}`);
    }
    const compact = await call('compendium', 'get', {
      packId: found.packId,
      itemId: found.itemId,
      compact: true,
    });
    // Compact adds only the mode label, so allow a few characters of slack.
    expect(
      JSON.stringify(compact).length <= JSON.stringify(full).length + 20,
      'compact is longer than full'
    );
    return `${found.name} (${found.packId})`;
  });
}
await step('documents.get (a pack entry)', async () => {
  const found = await firstEntry('Item');
  if (!found) skip('no Item pack');
  const r = await call('documents', 'get', {
    type: 'Item',
    pack: found.packId,
    id: found.itemId,
    fields: ['name', 'type'],
  });
  expect(r.data?.name === found.name, 'wrong entry');
});

// --- access guard ---------------------------------------------------------------------------
await step('guard: delete is refused below full access', async () => {
  if (canDelete) skip('world is at full access');
  try {
    await call('documents', 'delete', { type: 'Actor', id: 'does-not-exist' });
  } catch (error) {
    expect(/Full access/.test(error.message), `unexpected refusal: ${error.message}`);
    return 'refused as expected';
  }
  throw new Error('delete was not refused');
});
await step('guard: write is refused at read only', async () => {
  if (canWrite) skip('world allows writing');
  try {
    await call('documents', 'update', { type: 'Actor', id: 'x', data: { name: 'x' } });
  } catch (error) {
    expect(/write access/.test(error.message), `unexpected refusal: ${error.message}`);
    return 'refused as expected';
  }
  throw new Error('write was not refused');
});
await step('image-generation is refused while switched off', async () => {
  if (caps.imageGenerationEnabled) skip('image generation is on');
  try {
    await call('images', 'status', { job_id: 'x' });
  } catch (error) {
    expect(/off/.test(error.message), `unexpected refusal: ${error.message}`);
    return 'refused as expected';
  }
  throw new Error('was not refused');
});

// --- leftovers of earlier runs (only with delete access) ----------------------------------------
const FOLDER_TYPES = [
  'Item',
  'Actor',
  'JournalEntry',
  'RollTable',
  'Scene',
  'Macro',
  'Playlist',
  'Cards',
];
const IMPORT_FOLDER = `${PREFIX}-import`;
async function deleteByName(type, startsWith) {
  const r = await call('documents', 'list', { type, query: startsWith, limit: 200 });
  const ids = (r.documents ?? []).filter(d => d.name?.startsWith(startsWith)).map(d => d.id);
  if (ids.length) await call('documents', 'delete', { type, id: ids, confirm: true });
  return ids.length;
}
async function deleteFolder(type, folder) {
  await call('documents', 'delete', {
    type: 'Folder',
    subtype: type,
    folder,
    deleteContents: true,
    confirm: true,
  });
}
if (canDelete) {
  await step('clean up leftovers of earlier runs', async () => {
    const removed = [];
    for (const type of ['Actor', 'Playlist', 'Macro', 'JournalEntry', 'RollTable', 'Scene']) {
      const n = await deleteByName(type, PREFIX);
      if (n) removed.push(`${n} ${type}`);
    }
    for (const type of FOLDER_TYPES) {
      for (const folder of [IMPORT_FOLDER, `${PREFIX}-folder`]) {
        try {
          await deleteFolder(type, folder);
          removed.push(`${type} folder`);
        } catch {
          // not there
        }
      }
    }
    return removed.length ? `removed ${removed.join(', ')}` : 'nothing to remove';
  });
}

// --- writes: create, change, delete ---------------------------------------------------------
const created = [];
const track = (type, id) => created.push({ type, id });

let actorId;
const actorName = `${PREFIX}-actor`;
await step('documents.create (Actor)', async () => {
  if (!canWrite) skip('read only');
  const subtypes = schema?.types?.Actor?.subtypes ?? [];
  const subtype = subtypes.includes('npc') ? 'npc' : subtypes[0];
  const r = await call('documents', 'create', {
    type: 'Actor',
    data: { name: actorName, type: subtype },
  });
  actorId = r.created?.[0]?.id;
  expect(actorId, 'no id in the answer');
  track('Actor', actorId);
});
await step('actors.get', async () => {
  if (!actorId) skip('no test actor');
  await call('actors', 'get', { identifier: actorName });
});
await step('documents.update (Actor)', async () => {
  if (!actorId) skip('no test actor');
  await call('documents', 'update', {
    type: 'Actor',
    id: actorId,
    data: { name: `${actorName}-renamed` },
  });
  const r = await call('documents', 'get', { type: 'Actor', id: actorId, fields: ['name'] });
  expect(r.data?.name === `${actorName}-renamed`, 'rename not visible');
});
await step('documents (an item on the actor: create, list by kind, update, delete)', async () => {
  if (!actorId) skip('no test actor');
  const parent = { type: 'Actor', id: actorId };
  const c = await call('documents', 'create', {
    type: 'Item',
    kind: 'inventory',
    parent,
    data: { name: `${PREFIX}-item`, type: 'equipment' },
  });
  const itemId = c.created?.[0]?.id;
  expect(itemId, 'item not created');
  const l = await call('documents', 'list', {
    type: 'Item',
    kind: 'inventory',
    parent,
    query: PREFIX,
  });
  expect(
    l.documents.some(d => d.id === itemId),
    'item not listed under inventory'
  );
  await call('documents', 'update', {
    type: 'Item',
    id: itemId,
    parent,
    data: { name: `${PREFIX}-item-2` },
  });
  if (!canDelete) skip('item created and changed; cannot delete below full access');
  await call('documents', 'delete', { type: 'Item', id: itemId, parent });
  const after = await call('documents', 'list', { type: 'Item', parent, query: PREFIX });
  expect(after.total === 0, 'item still there');
});
await step('documents (an effect on the actor)', async () => {
  if (!actorId) skip('no test actor');
  try {
    const r = await call('documents', 'create', {
      type: 'ActiveEffect',
      parent: { type: 'Actor', id: actorId },
      data: { name: `${PREFIX}-effect` },
    });
    expect(r.created?.length === 1, 'effect not created');
  } catch (error) {
    // PF2e models effects as items and may decline an ActiveEffect on an actor.
    if (system !== 'pf2e') throw error;
    return `pf2e: ${String(error.message).slice(0, 80)}`;
  }
});
await step('actors.set-ownership + remove-ownership', async () => {
  if (!actorId) skip('no test actor');
  skip('needs a player user; run by hand');
});

await step('documents (a playlist and a sound)', async () => {
  if (!canWrite) skip('read only');
  const r = await call('documents', 'create', {
    type: 'Playlist',
    data: { name: `${PREFIX}-playlist` },
  });
  const id = r.created?.[0]?.id;
  expect(id, 'playlist not created');
  track('Playlist', id);
  await call('documents', 'update', {
    type: 'Playlist',
    id,
    data: { name: `${PREFIX}-playlist-b` },
  });
  const sound = await call('documents', 'create', {
    type: 'PlaylistSound',
    parent: { type: 'Playlist', id },
    data: { name: `${PREFIX}-sound`, path: 'sounds/none.ogg' },
  });
  expect(sound.created?.length === 1, 'sound not created');
});
await step('documents (a macro)', async () => {
  if (!canWrite) skip('read only');
  const r = await call('documents', 'create', {
    type: 'Macro',
    data: { name: `${PREFIX}-macro`, type: 'script', command: 'return 1;' },
  });
  const id = r.created?.[0]?.id;
  expect(id, 'macro not created');
  track('Macro', id);
  const g = await call('documents', 'get', { type: 'Macro', id, fields: ['command'] });
  expect(g.data?.command === 'return 1;', 'command not stored');
});
await step('documents (a journal: its pages, change a page)', async () => {
  if (!canWrite) skip('read only');
  const r = await call('documents', 'create', {
    type: 'JournalEntry',
    data: {
      name: `${PREFIX}-journal`,
      pages: [{ name: 'One', type: 'text', text: { content: '<p>first</p>' } }],
    },
  });
  const id = r.created?.[0]?.id;
  expect(id, 'journal not created');
  track('JournalEntry', id);
  const parent = { type: 'JournalEntry', id };
  const pages = await call('documents', 'list', { type: 'JournalEntryPage', parent });
  expect(pages.total === 1, 'page not listed');
  await call('documents', 'update', {
    type: 'JournalEntryPage',
    id: pages.documents[0].id,
    parent,
    data: { 'text.content': '<p>second</p>' },
  });
  const got = await call('documents', 'get', {
    type: 'JournalEntryPage',
    id: pages.documents[0].id,
    parent,
    fields: ['text.content'],
  });
  expect(String(got.data?.text?.content).includes('second'), 'page not changed');
});
await step('documents (a roll table) + chat.roll-table', async () => {
  if (!canWrite) skip('read only');
  const r = await call('documents', 'create', {
    type: 'RollTable',
    data: {
      name: `${PREFIX}-table`,
      formula: '1d2',
      results: [
        { type: 'text', text: 'heads', range: [1, 1], weight: 1 },
        { type: 'text', text: 'tails', range: [2, 2], weight: 1 },
      ],
    },
  });
  const id = r.created?.[0]?.id;
  expect(id, 'table not created');
  track('RollTable', id);
  const drawn = await call('chat', 'roll-table', { table: `${PREFIX}-table`, visibility: 'gm' });
  expect(JSON.stringify(drawn).match(/heads|tails/), 'nothing drawn');
});
await step('documents (a scene with a background, and a wall in it)', async () => {
  if (!canWrite) skip('read only');
  const r = await call('documents', 'create', {
    type: 'Scene',
    data: {
      name: `${PREFIX}-scene`,
      width: 1000,
      height: 1000,
      background: { src: 'icons/svg/mystery-man.svg' },
    },
  });
  const id = r.created?.[0]?.id;
  expect(id, 'scene not created');
  track('Scene', id);
  const listed = await call('scenes', 'list');
  const mine = (Array.isArray(listed) ? listed : []).find(s => s.id === id);
  expect(
    mine?.background === 'icons/svg/mystery-man.svg',
    `background not set: ${mine?.background}`
  );
  const parent = { type: 'Scene', id };
  const wall = await call('documents', 'create', {
    type: 'Wall',
    parent,
    data: { c: [0, 0, 200, 0] },
  });
  expect(wall.created?.length === 1, 'wall not created');
  const walls = await call('documents', 'list', { type: 'Wall', parent });
  expect(walls.total === 1, 'wall not listed');
});
await step('documents (a folder: create, rename, move)', async () => {
  if (!canWrite) skip('read only');
  await call('documents', 'create', {
    type: 'Folder',
    subtype: 'Actor',
    folder: `${PREFIX}-folder/inner`,
  });
  const l = await call('documents', 'list', { type: 'Folder', subtype: 'Actor' });
  expect(
    l.folders?.some(f => f.path === `${PREFIX}-folder/inner`),
    'folder not listed'
  );
  await call('documents', 'update', {
    type: 'Folder',
    subtype: 'Actor',
    folder: `${PREFIX}-folder/inner`,
    data: { name: 'inner2' },
  });
  await call('documents', 'update', {
    type: 'Folder',
    subtype: 'Actor',
    folder: `${PREFIX}-folder/inner2`,
    data: { parent: null },
  });
});

await step('actors.place + tokens + documents (Token)', async () => {
  if (!actorId) skip('no test actor');
  if (!hasScene) skip('the world has no scene');
  const r = await call('actors', 'place', { actorIds: [actorId], placement: 'center' });
  const tokenId = r.tokenIds?.[0];
  expect(tokenId, 'no token id');
  const sceneId = (await call('scenes', 'current', {})).id;
  const t = await call('tokens', 'get', { tokenId });
  expect(t.id === tokenId, 'token not read');
  await call('tokens', 'move', { tokenId, x: 300, y: 300, animate: false });
  await call('documents', 'update', {
    type: 'Token',
    id: tokenId,
    parent: { type: 'Scene', id: sceneId },
    data: { rotation: 45 },
  });
  if (!canDelete) skip('token placed, moved and changed; cannot delete below full access');
  await call('documents', 'delete', {
    type: 'Token',
    id: tokenId,
    parent: { type: 'Scene', id: sceneId },
  });
});

if (withChat) {
  await step('chat.post (GM, html)', async () => {
    if (!canWrite) skip('read only');
    await call('chat', 'post', {
      content: `${PREFIX}: <b>live check</b> message, safe to delete`,
      html: true,
    });
    leftovers.push('one chat message (no tool deletes chat messages)');
  });
} else {
  results.push({ name: 'chat.post', status: 'skip', detail: 'run with --chat; the message stays' });
}

// --- copies from compendiums into a throwaway folder -----------------------------------------------
// Each copy goes into one folder per document type; deleting the folders with their contents
// at the end removes everything again.
const importedTypes = [];
for (const type of [
  'Item',
  'Actor',
  'JournalEntry',
  'RollTable',
  'Scene',
  'Macro',
  'Playlist',
  'Cards',
]) {
  await step(`documents.create from a compendium (${type})`, async () => {
    if (!canWrite) skip('read only');
    const found = await firstEntry(type);
    if (!found) skip(`no ${type} pack with entries in this world`);
    const r = await call('documents', 'create', {
      type,
      from: { packId: found.packId, itemId: found.itemId },
      folder: IMPORT_FOLDER,
    });
    importedTypes.push(type);
    expect(r?.success && r.created?.[0]?.id, 'nothing created');
    return r.created[0].name;
  });
}
await step('documents.create refuses a source of another type', async () => {
  if (!canWrite) skip('read only');
  const found = await firstEntry('Item');
  if (!found) skip('no Item pack');
  try {
    await call('documents', 'create', {
      type: 'Actor',
      from: { packId: found.packId, itemId: found.itemId },
    });
  } catch (error) {
    expect(/Item/.test(error.message), `unexpected error: ${error.message}`);
    return 'refused as expected';
  }
  throw new Error('an Item was copied as an Actor');
});

// --- clean up -------------------------------------------------------------------------------
for (const { type, id } of created.reverse()) {
  try {
    if (!canDelete) throw new Error('no delete access');
    await call('documents', 'delete', { type, id });
  } catch (error) {
    leftovers.push(`${type} ${id}: ${String(error.message).slice(0, 80)}`);
  }
}
for (const type of fixturePackTypes) {
  try {
    if (!canDelete) throw new Error('no delete access');
    await deleteFixturePack(type);
  } catch (error) {
    leftovers.push(`compendium world.${packNameOf(type)}: ${String(error.message).slice(0, 80)}`);
  }
}
for (const type of importedTypes) {
  try {
    if (!canDelete) throw new Error('no delete access');
    await deleteFolder(type, IMPORT_FOLDER);
  } catch (error) {
    leftovers.push(
      `folder "${IMPORT_FOLDER}" of ${type} with its contents: ${String(error.message).slice(0, 80)}`
    );
  }
}
// the folders made by the folder step
for (const folder of [`${PREFIX}-folder`, 'inner2']) {
  try {
    if (!canDelete) throw new Error('no delete access');
    await deleteFolder('Actor', folder);
  } catch (error) {
    if (!canDelete) leftovers.push(`Actor folder "${folder}": no delete access`);
  }
}

// --- report ---------------------------------------------------------------------------------
const width = Math.max(...results.map(r => r.name.length));
for (const r of results) {
  console.log(`${r.status.padEnd(5)} ${r.name.padEnd(width)}  ${r.detail}`);
}
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(
  `\n${results.filter(r => r.status === 'pass').length} passed, ${failed} failed, ` +
    `${results.filter(r => r.status === 'skip').length} skipped (${system}, ${caps.accessLevel.label})`
);
if (leftovers.length)
  console.log(`\nLeft in the world (delete by hand):\n- ${leftovers.join('\n- ')}`);
await client.close();
process.exit(failed ? 1 : 0);
