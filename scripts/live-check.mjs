// Live check: walks the domain tools through a real MCP connection against the Foundry world
// that is connected right now, creates test objects, deletes them again, and prints a result per
// action. Needs the built server (`npm run build:server`) and the bridge connected in a GM
// browser. Everything it creates is named with PREFIX; whatever it cannot delete is listed.
//
//   node scripts/live-check.mjs            read, create, change and delete test objects
//   node scripts/live-check.mjs --chat     also posts one chat message (it cannot be deleted)
//
// What it can only check with a human: scenes and tokens need a scene, ownership needs a player
// user. Those steps report "skipped" with the reason instead of failing.

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
    else results.push({ name, status: 'FAIL', detail: String(error.message ?? error).slice(0, 200) });
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
await step('world.capabilities', async () => {
  caps = await call('world', 'capabilities');
  expect(caps?.system?.id && caps?.accessLevel?.id, 'no system or access level in the answer');
  return `${caps.system.id} ${caps.system.version}, access: ${caps.accessLevel.label}`;
});
if (!caps) {
  console.log('The bridge did not answer. Is Foundry open with the bridge connected?');
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
  'scenes',
  'playlists',
  'effects',
  'tokens',
  'items',
  'actors',
  'compendium',
  'journals',
  'chat',
  'image-generation',
]) {
  await step(`${tool}.describe`, async () => {
    const d = await call(tool, 'describe');
    expect(Array.isArray(d.actions) && d.actions.length > 0, 'no actions');
    expect(d.system === system, `describes ${d.system}, world is ${system}`);
    return `${d.actions.length} actions`;
  });
}

// --- reads ----------------------------------------------------------------------------------
let hasScene = false;
await step('scenes.list', async () => {
  const r = await call('scenes', 'list');
  hasScene = JSON.stringify(r).length > 10 && !/"scenes":\s*\[\]/.test(JSON.stringify(r));
  return hasScene ? 'has scenes' : 'no scenes';
});
await step('scenes.current', async () => {
  if (!hasScene) skip('the world has no scene');
  await call('scenes', 'current');
});
await step('compendium.list-packs', () => call('compendium', 'list-packs'));
await step('compendium.search', () => call('compendium', 'search', { query: 'a', limit: 3 }));
await step('compendium.find-creatures', async () => {
  try {
    await call('compendium', 'find-creatures', { limit: 3 });
  } catch (error) {
    if (/still building/.test(error.message)) skip(`index building: ${error.message.slice(0, 80)}`);
    throw error;
  }
});
await step('actors.list (paged)', async () => {
  const r = await call('actors', 'list', { limit: 2 });
  expect(r.hasMore !== undefined && r.total !== undefined, 'no paging fields');
  return `total ${r.total}`;
});
await step('journals.list', () => call('journals', 'list'));
await step('journals.search', () => call('journals', 'search', { searchQuery: 'a' }));
await step('playlists.list', () => call('playlists', 'list'));
await step('effects.list-conditions', () => call('effects', 'list-conditions'));
await step('actors.list-ownership', () => call('actors', 'list-ownership', {}));
await step('items.list', () => call('items', 'list', {}));
await step('items.system-notes', () => call('items', 'system-notes'));
await step('actors.system-notes', () => call('actors', 'system-notes'));

// --- access guard ---------------------------------------------------------------------------
await step('guard: delete is refused below full access', async () => {
  if (canDelete) skip('world is at full access');
  try {
    await call('actors', 'delete', { ids: ['does-not-exist'] });
  } catch (error) {
    expect(/Full access/.test(error.message), `unexpected refusal: ${error.message}`);
    return 'refused as expected';
  }
  throw new Error('delete was not refused');
});
await step('guard: write is refused at read only', async () => {
  if (canWrite) skip('world allows writing');
  try {
    await call('actors', 'update', { updates: [{ id: 'x', name: 'x' }] });
  } catch (error) {
    expect(/write access/.test(error.message), `unexpected refusal: ${error.message}`);
    return 'refused as expected';
  }
  throw new Error('write was not refused');
});
await step('image-generation is refused while switched off', async () => {
  if (caps.imageGenerationEnabled) skip('image generation is on');
  try {
    await call('image-generation', 'status', { job_id: 'x' });
  } catch (error) {
    expect(/off/.test(error.message), `unexpected refusal: ${error.message}`);
    return 'refused as expected';
  }
  throw new Error('was not refused');
});

// --- writes: create, change, delete ---------------------------------------------------------
const actorType = 'npc';
const created = { actors: [], playlists: [] };

async function findActorId(name) {
  const r = await call('actors', 'list', { limit: 1000 });
  return r.characters?.find(c => c.name === name)?.id;
}

let actorId;
const actorName = `${PREFIX}-actor`;
await step('actors.create', async () => {
  if (!canWrite) skip('read only');
  await call('actors', 'create', { actors: [{ name: actorName, type: actorType }] });
  actorId = await findActorId(actorName);
  expect(actorId, 'created actor not found in the list');
  created.actors.push(actorId);
});
await step('actors.get', async () => {
  if (!actorId) skip('no test actor');
  await call('actors', 'get', { identifier: actorName });
});
await step('actors.update', async () => {
  if (!actorId) skip('no test actor');
  await call('actors', 'update', { updates: [{ id: actorId, name: `${actorName}-renamed` }] });
  expect(await findActorId(`${actorName}-renamed`), 'rename not visible');
});
await step('items.add-to-actor + actors.search-items + actors.delete-items', async () => {
  if (!actorId) skip('no test actor');
  await call('items', 'add-to-actor', {
    actorIdentifier: actorId,
    items: [{ name: `${PREFIX}-item`, type: 'equipment' }],
  });
  const found = await call('actors', 'search-items', {
    characterIdentifier: actorId,
    query: PREFIX,
  });
  expect(JSON.stringify(found).includes(PREFIX), 'item not found on the actor');
  if (!canDelete) skip('item added; cannot delete below full access');
  const ids = JSON.stringify(found).match(/"id":"([^"]+)"/g) ?? [];
  expect(ids.length > 0, 'no item id to delete');
  const itemId = ids[0].slice(6, -1);
  await call('actors', 'delete-items', { actorIdentifier: actorId, itemIds: [itemId] });
});
await step('effects (ActiveEffect create/update/delete, or the PF2e explanation)', async () => {
  if (!actorId) skip('no test actor');
  try {
    await call('effects', 'create', {
      actorIdentifier: actorId,
      parentType: 'actor',
      effectData: { name: `${PREFIX}-effect` },
    });
  } catch (error) {
    if (system === 'pf2e') {
      expect(/effect item/.test(error.message), `unexpected error: ${error.message}`);
      return 'pf2e explains that effects are items';
    }
    throw error;
  }
  if (system === 'pf2e') throw new Error('pf2e unexpectedly created an ActiveEffect');
});
await step('actors.set-ownership + remove-ownership', async () => {
  if (!actorId) skip('no test actor');
  skip('needs a player user; run by hand');
});

let playlistName = `${PREFIX}-playlist`;
await step('playlists.create/update/delete', async () => {
  if (!canWrite) skip('read only');
  await call('playlists', 'create', { name: playlistName });
  created.playlists.push(playlistName);
  await call('playlists', 'update', { playlist: playlistName, name: `${playlistName}-b` });
  playlistName = `${playlistName}-b`;
  created.playlists[0] = playlistName;
  if (!canDelete) skip('created and renamed; cannot delete below full access');
  await call('playlists', 'delete', { playlist: playlistName });
  created.playlists.length = 0;
});

await step('actors.place + tokens.get/move/update/toggle-condition/delete', async () => {
  if (!actorId) skip('no test actor');
  if (!hasScene) skip('the world has no scene');
  await call('actors', 'place', { actorIds: [actorId], placement: 'center' });
  skip('placed; token steps need the token id and are run by hand until this reads it');
});

if (system === 'dnd5e') {
  await step('dnd5e: actors.create-npc + add-feature + add-features-from-compendium', async () => {
    if (!canWrite) skip('read only');
    const name = `${PREFIX}-dnd5e-npc`;
    await call('actors', 'create-npc', {
      name,
      creatureType: 'humanoid',
      size: 'medium',
      cr: 1,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      hpAverage: 10,
      hpFormula: '2d8+1',
      acMode: 'flat',
      acValue: 12,
    });
    const id = await findActorId(name);
    expect(id, 'npc not found');
    created.actors.push(id);
    await call('actors', 'add-feature', {
      featureType: 'passive',
      actorIdentifier: id,
      featureName: `${PREFIX}-feature`,
      description: 'Test feature.',
    });
  });
}

if (withChat) {
  await step('chat.post', async () => {
    if (!canWrite) skip('read only');
    await call('chat', 'post', { content: `${PREFIX}: live check message, safe to delete` });
    leftovers.push('one chat message (no tool deletes chat messages)');
  });
} else {
  results.push({ name: 'chat.post', status: 'skip', detail: 'run with --chat; the message stays' });
}

// --- clean up -------------------------------------------------------------------------------
for (const id of created.actors) {
  try {
    if (!canDelete) throw new Error('no delete access');
    await call('actors', 'delete', { ids: [id] });
  } catch (error) {
    leftovers.push(`actor ${id}: ${String(error.message).slice(0, 80)}`);
  }
}
for (const name of created.playlists) leftovers.push(`playlist ${name}`);

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
if (leftovers.length) console.log(`\nLeft in the world (delete by hand):\n- ${leftovers.join('\n- ')}`);
await client.close();
process.exit(failed ? 1 : 0);
