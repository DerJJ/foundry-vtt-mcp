/**
 * The domain tools and their actions (ADR-0004). Each action names the operation that answers
 * it, its risk (ADR-0005) and, where one operation serves several actions, the parameters that
 * belong to the action. `docs/TOOLS.md` is generated from this file.
 */

import type { DomainToolSpec } from './domain-tool.js';

/**
 * Operations of v0.8.6 that are no longer separate: their action is another action's behaviour.
 * The migration table in docs/TOOLS.md and the surface test read this.
 */
export const MERGED_OPERATIONS: Readonly<Record<string, { into: string; note: string }>> = {
  'post-chat': {
    into: 'chat `post`',
    note: 'pass `html: true` to keep HTML (off by default); `speaker` is now `actorIdentifier`; without a speaker the message is from the GM',
  },
  'get-compendium-entry-full': {
    into: 'compendium `get`',
    note: 'full data is the default; `entryId` is now `itemId`',
  },
  'get-character-entity': {
    into: 'documents `get`',
    note: 'type `Item` or `ActiveEffect` with the actor as `parent`',
  },
  'list-characters': {
    into: 'documents `list`',
    note: 'type `Actor`; `subtype` for the actor type',
  },
  'search-character-items': {
    into: 'documents `list`',
    note: 'type `Item` with the actor as `parent`; `query`, `kind` or `filter` to search',
  },
  'manage-world-items': {
    into: 'documents',
    note: 'list, get, create, update on type `Item`; add and remove on an actor with the actor as `parent`; `schema` replaces `describe`',
  },
  'manage-actors': {
    into: 'documents, and actors `place`',
    note: 'create, update and delete on type `Actor`; items on an actor with `parent`; `place` stays an action of `actors`',
  },
  'manage-effects': {
    into: 'documents',
    note: 'type `ActiveEffect` with an actor or an item as `parent`',
  },
  'create-actor-from-compendium': {
    into: 'documents `create`',
    note: 'type `Actor` with `from: {packId, itemId}` and `data: {name}`; `actors` `place` puts them on the scene',
  },
  'update-scene-music': {
    into: 'documents `update`',
    note: 'type `Scene`, `data: {playlist, playlistSound}` with ids',
  },
  'manage-playlists': {
    into: 'documents, and audio `control`',
    note: 'types `Playlist` and `PlaylistSound`',
  },
  'update-token': { into: 'documents `update`', note: 'type `Token` with the scene as `parent`' },
  'delete-tokens': { into: 'documents `delete`', note: 'type `Token` with the scene as `parent`' },
  'replace-journal-page': {
    into: 'documents `update`',
    note: 'type `JournalEntryPage` with the journal as `parent`',
  },
  'dnd5e-create-npc': {
    into: 'documents `create`',
    note: 'type `Actor`, `subtype: npc`, with the fields that `schema` shows (no stat block builder)',
  },
  'dnd5e-add-feature': {
    into: 'documents `create`',
    note: 'type `Item`, `kind: features`, the actor as `parent`; or copy one with `from`',
  },
  'dnd5e-add-features-from-compendium': {
    into: 'documents `create`',
    note: 'type `Item` with `from: {packId, itemId}` and the actor as `parent`; `compendium` `search` finds them',
  },
  'wfrp4e-update-actor': {
    into: 'documents `update`',
    note: 'type `Actor`; the fields are the ones `schema` shows',
  },
  'wfrp4e-add-items': {
    into: 'documents `create`',
    note: 'type `Item` with the actor as `parent`',
  },
  'create-dsa5-character-from-archetype': {
    into: 'documents `create`',
    note: 'type `Actor` with `from` set to the archetype entry',
  },
  'list-dsa5-archetypes': {
    into: 'documents `list`',
    note: 'with `pack` set to the archetype pack',
  },
  'list-compendium-packs': {
    into: 'compendium `packs`',
    note: 'also shows lock and write state; `type` filters',
  },
};

export const DOMAIN_TOOLS: readonly DomainToolSpec[] = [
  {
    name: 'world',
    purpose: 'Information about the connected Foundry world and what the MCP may do in it.',
    actions: {
      info: { operation: 'get-world-info', risk: 'read' },
      permissions: { operation: 'get-permissions', risk: 'read' },
      reload: {
        operation: 'reload-browser',
        risk: 'write',
        summary:
          'Reload this GM browser, which applies a module switch. The bridge reconnects by itself; players are not reloaded.',
      },
      capabilities: {
        risk: 'read',
        summary:
          'The game system, the access level, and which gated features are on. Call it first.',
        run: async (_params, context) => {
          const [capabilities, system] = await Promise.all([
            context.capabilities(),
            context.system(),
          ]);
          return {
            ...capabilities,
            gameSystem: system,
            verification: context.verification(system),
          };
        },
      },
    },
  },

  {
    name: 'documents',
    purpose:
      'Any Foundry document, in the world or in a compendium pack: an actor, an item or effect on an actor, a scene and its walls, lights and tiles, a journal and its pages, a playlist, a macro, a folder. Call schema first for the fields of a type in this world; kinds (inventory, spells, features) group the item types of an actor.',
    actions: {
      schema: {
        operation: 'documents',
        risk: 'read',
        fixed: { action: 'schema' },
        params: { type: false, subtype: false },
        summary:
          'The types of this world, or the fields, subtypes and an example of one type; also the kinds of item.',
      },
      list: {
        operation: 'documents',
        risk: 'read',
        fixed: { action: 'list' },
        params: {
          type: true,
          subtype: false,
          kind: false,
          parent: false,
          pack: false,
          query: false,
          filter: false,
          fields: false,
          limit: false,
          offset: false,
        },
        summary: 'List documents of a type, in the world, inside a parent, or in a pack; paged.',
      },
      get: {
        operation: 'documents',
        risk: 'read',
        fixed: { action: 'get' },
        params: {
          type: true,
          id: false,
          name: false,
          parent: false,
          pack: false,
          fields: false,
          maxChars: false,
        },
        summary: 'Read one document, or only some of its fields. A very large one is summarised.',
      },
      create: {
        operation: 'documents',
        risk: 'write',
        fixed: { action: 'create' },
        params: {
          type: true,
          subtype: false,
          kind: false,
          parent: false,
          pack: false,
          folder: false,
          from: false,
          data: false,
        },
        summary:
          'Create documents from data, or copy a compendium entry with from; inside a parent for embedded ones.',
      },
      update: {
        operation: 'documents',
        risk: 'write',
        fixed: { action: 'update' },
        params: {
          type: true,
          subtype: false,
          id: false,
          name: false,
          parent: false,
          pack: false,
          folder: false,
          data: true,
        },
        summary: 'Change documents: one by id or name, or a list of changes that each carry an id.',
      },
      delete: {
        operation: 'documents',
        risk: 'delete',
        fixed: { action: 'delete' },
        params: {
          type: true,
          subtype: false,
          id: false,
          name: false,
          parent: false,
          pack: false,
          folder: false,
          confirm: false,
          deleteContents: false,
        },
        summary:
          'Delete one document, or several with confirm; a folder, with or without its contents.',
      },
    },
  },

  {
    name: 'actors',
    purpose:
      'What is more than a data change on an actor: a compact view, using an item or casting a spell, placing it on the scene, who owns it, the party and creature cards. Creating, changing and deleting actors and the items and effects on them is `documents`.',
    actions: {
      get: { operation: 'get-character', risk: 'read' },
      use: {
        operation: 'use-item',
        risk: 'write',
        summary:
          "Use an item, cast a spell or use a feature of an actor with the system's own rules.",
      },
      place: {
        operation: 'place-actors',
        risk: 'write',
        summary: 'Drop existing actors on the current scene as tokens.',
      },
      'set-ownership': { operation: 'assign-actor-ownership', risk: 'write' },
      'remove-ownership': { operation: 'remove-actor-ownership', risk: 'write' },
      'list-ownership': { operation: 'list-actor-ownership', risk: 'read' },
      'party-status': { operation: 'party-status', risk: 'read' },
      'creature-card': { operation: 'creature-card', risk: 'read' },
      // Exists for one game system only: described, not listed.
      import: {
        operation: 'import-dsa5-actor-from-json',
        risk: 'write',
        systems: ['dsa5'],
        summary: 'Create an actor from an outside format (DSA5: Optolith, custom JSON).',
      },
    },
  },

  {
    name: 'compendium',
    purpose:
      'Compendium packs: search, read an entry of any type, list packs, find creatures by criteria, and make or delete world packs. Entries of a pack are `documents` with `pack`; copying one into the world is `documents` `create` with `from`.',
    actions: {
      search: { operation: 'search-compendium', risk: 'read' },
      get: {
        operation: 'get-compendium-item',
        risk: 'read',
        summary:
          'Read one pack entry of any type (item, actor, journal, roll table, scene, macro, playlist, cards, adventure); compact: true shortens it.',
      },
      'find-creatures': { operation: 'list-creatures-by-criteria', risk: 'read' },
      packs: {
        operation: 'manage-compendiums',
        risk: 'read',
        fixed: { action: 'list' },
        params: { type: false },
        summary: 'List compendium packs with their type, lock and write state.',
      },
      'create-pack': {
        operation: 'manage-compendiums',
        risk: 'write',
        fixed: { action: 'create' },
        params: { label: true, type: true, name: false },
        summary: 'Create a world compendium pack.',
      },
      'delete-pack': {
        operation: 'manage-compendiums',
        risk: 'delete',
        fixed: { action: 'delete' },
        params: { identifier: true, confirmDelete: true },
        summary: 'Delete a world compendium pack (system and module packs are refused).',
      },
    },
  },

  {
    name: 'scenes',
    purpose:
      'Scenes as the table sees them: look at the current one, list them, switch, ping, pull the players, weather and fog. Making or changing a scene, its background and music, and its walls, lights and tiles is `documents`.',
    actions: {
      current: { operation: 'get-current-scene', risk: 'read' },
      list: { operation: 'list-scenes', risk: 'read' },
      activate: { operation: 'switch-scene', risk: 'write' },
      ping: {
        operation: 'scene-view',
        risk: 'write',
        fixed: { action: 'ping' },
        params: { sceneIdentifier: false, target: false, x: false, y: false },
        summary: 'Ping a token or a point on the scene the GM browser is showing.',
      },
      'pull-players': {
        operation: 'scene-view',
        risk: 'write',
        fixed: { action: 'pull-players' },
        params: { sceneIdentifier: false, target: false, x: false, y: false },
        summary: 'Ping and pull every player view to a token or point.',
      },
      'reset-fog': {
        operation: 'scene-view',
        risk: 'delete',
        fixed: { action: 'reset-fog' },
        params: { sceneIdentifier: false },
        summary: 'Reset the fog of war of a scene.',
      },
      'set-weather': {
        operation: 'scene-view',
        risk: 'write',
        fixed: { action: 'weather' },
        params: { sceneIdentifier: false, weather: true },
        summary: 'Set the weather effect of a scene (an empty string clears it).',
      },
      'list-weather': {
        operation: 'scene-view',
        risk: 'read',
        fixed: { action: 'list-weather' },
        params: {},
        summary: 'List the available weather effects.',
      },
    },
  },

  {
    name: 'tokens',
    purpose:
      'Tokens on the current scene: look at one, move it, and set its conditions. Changing or deleting a token is `documents` (type `Token`, the scene as `parent`).',
    actions: {
      get: { operation: 'get-token-details', risk: 'read' },
      move: { operation: 'move-token', risk: 'write' },
      'toggle-condition': { operation: 'toggle-token-condition', risk: 'write' },
      'list-conditions': { operation: 'get-available-conditions', risk: 'read' },
    },
  },

  {
    name: 'combat',
    purpose: 'The combat tracker of a scene: read it, run it, and apply damage or healing.',
    actions: {
      status: {
        operation: 'combat',
        risk: 'read',
        fixed: { action: 'status' },
        params: { sceneIdentifier: false },
        summary: 'Round, turn and combatants with initiative, HP, AC and state.',
      },
      add: {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'add' },
        params: { targets: false, include: false, sceneIdentifier: false },
        summary: 'Put tokens into the combat; creates the combat if there is none.',
      },
      remove: {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'remove' },
        params: { targets: true, sceneIdentifier: false },
        summary: 'Take tokens out of the combat.',
      },
      initiative: {
        operation: 'combat',
        risk: 'write',
        choice: {
          param: 'mode',
          into: 'action',
          values: { roll: 'roll-initiative', set: 'set-initiative' },
          description:
            'roll: roll initiative as a GM roll (who, targets). set: set it (targets and initiative needed).',
        },
        params: { who: false, targets: false, initiative: false, sceneIdentifier: false },
        summary: 'Roll or set the initiative of tokens.',
      },
      advance: {
        operation: 'combat',
        risk: 'write',
        choice: {
          param: 'to',
          into: 'action',
          values: {
            begin: 'begin',
            'next-turn': 'next-turn',
            'previous-turn': 'previous-turn',
            'next-round': 'next-round',
            'previous-round': 'previous-round',
          },
          description: 'Where to go: begin starts round 1.',
        },
        params: { sceneIdentifier: false },
        summary: 'Start the combat or move to another turn or round.',
      },
      defeated: {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'defeated' },
        params: { targets: true, defeated: false, sceneIdentifier: false },
        summary: 'Mark tokens defeated (defeated=false undoes it).',
      },
      'apply-damage': { operation: 'apply-damage', risk: 'write' },
      end: {
        operation: 'combat',
        risk: 'delete',
        fixed: { action: 'end' },
        params: { sceneIdentifier: false },
        summary: 'End the combat by deleting it.',
      },
    },
  },

  {
    name: 'chat',
    purpose:
      'Speak as an actor or the GM, ask players to roll, read the chat log, roll for the GM.',
    actions: {
      post: { operation: 'create-chat-message', risk: 'write' },
      'request-rolls': { operation: 'request-player-rolls', risk: 'write' },
      'get-messages': { operation: 'get-chat-messages', risk: 'read' },
      'gm-roll': { operation: 'gm-roll', risk: 'write' },
      'roll-table': {
        operation: 'roll-table',
        risk: 'write',
        fixed: { action: 'roll' },
        params: { table: true, visibility: false },
        summary: 'Draw from a roll table. Listing the tables is `documents` (type `RollTable`).',
      },
    },
  },

  {
    name: 'journals',
    purpose:
      'Journals and quests: read and search them, and build quest journals and campaign dashboards. Changing a page is `documents` (type `JournalEntryPage`).',
    actions: {
      list: {
        operation: 'list-journals',
        risk: 'read',
        summary: 'List journals and their pages, or read one journal or page.',
      },
      search: { operation: 'search-journals', risk: 'read' },
      'create-quest': { operation: 'create-quest-journal', risk: 'write' },
      'update-quest': { operation: 'update-quest-journal', risk: 'write' },
      'link-quest': { operation: 'link-quest-to-npc', risk: 'write' },
      'create-dashboard': { operation: 'create-campaign-dashboard', risk: 'write' },
    },
  },

  {
    name: 'settings',
    purpose:
      'Foundry settings of the core, the game system and the modules: find, read and change them. The settings of the bridge module itself, the module list (use modules), the player role permissions and anything that looks like a secret cannot be changed from here.',
    actions: {
      list: {
        operation: 'settings',
        risk: 'read',
        fixed: { action: 'list' },
        params: { query: false, namespace: false, scope: false, all: false },
        paged: 'settings',
        summary:
          'Settings with their value and default; the ones Foundry shows in its settings window unless all is set.',
      },
      get: {
        operation: 'settings',
        risk: 'read',
        fixed: { action: 'get' },
        params: { key: true },
        summary:
          'One setting: value, default, hint, choices and whether it can be changed from here.',
      },
      set: {
        operation: 'settings',
        risk: 'write',
        fixed: { action: 'set' },
        params: { key: true, value: true },
        summary:
          'Change a setting. Says when it needs a reload. A client setting is stored in this GM browser only.',
      },
    },
  },

  {
    name: 'time',
    purpose:
      'The real-time clock of Simple Calendar Reborn, run in the primary GM browser. Needs that module.',
    actions: {
      status: {
        operation: 'calendar-clock',
        risk: 'read',
        fixed: { action: 'status' },
        params: {},
        summary: 'Whether the clock is started, paused or stopped.',
      },
      control: {
        operation: 'calendar-clock',
        risk: 'write',
        choice: {
          param: 'command',
          into: 'action',
          values: { start: 'start', pause: 'pause', stop: 'stop' },
          description: 'start stays paused while the game is paused or a combat runs.',
        },
        params: {},
        summary: 'Start, pause or stop the clock.',
      },
    },
  },

  {
    name: 'audio',
    purpose:
      'Playback of playlists and their sounds. Making and changing playlists and sounds is `documents`.',
    actions: {
      control: { operation: 'control-playlist', risk: 'write' },
    },
  },

  {
    name: 'modules',
    purpose:
      'The Foundry modules of this world: what is installed and what runs, and switching them on or off. Foundry applies a switch only when the world loads again, so every browser has to reload (F5) afterwards; the bridge reconnects by itself.',
    actions: {
      list: {
        operation: 'modules',
        risk: 'read',
        fixed: { action: 'list' },
        params: { active: false, query: false },
        paged: 'modules',
        summary:
          'Installed modules with version, whether they run, and pendingReload for a switch that is not applied yet.',
      },
      get: {
        operation: 'modules',
        risk: 'read',
        fixed: { action: 'get' },
        params: { id: true },
        summary:
          'One module: description, authors, compatibility, what it requires and who requires it.',
      },
      'set-active': {
        operation: 'modules',
        risk: 'write',
        fixed: { action: 'set-active' },
        params: {
          id: false,
          ids: false,
          active: true,
          withDependencies: false,
          withDependents: false,
        },
        summary:
          'Switch modules on or off. Applied only after a reload of every browser. The bridge module itself cannot be switched off.',
      },
    },
  },

  {
    name: 'macros',
    purpose:
      'Run Foundry macros and scripts. Running code is off unless a GM switches on "Allow script and macro execution" in the module settings; every run is whispered to the GM as a chat card. Making and changing macros is `documents` (type `Macro`).',
    actions: {
      execute: {
        operation: 'manage-macros',
        risk: 'execute',
        fixed: { action: 'execute' },
        params: { macro: true, args: false, timeoutMs: false },
        summary: 'Run a macro in the GM browser; returns its result, logs and errors.',
      },
      'run-script': { operation: 'execute-script', risk: 'execute' },
    },
  },

  {
    name: 'images',
    purpose:
      'Images: bring a local file into the world, and generate maps with ComfyUI. Generating is off unless a GM switches it on in the module settings.',
    actions: {
      upload: { operation: 'upload-image', risk: 'write' },
      generate: { operation: 'generate-map', risk: 'write', feature: 'imageGeneration' },
      status: { operation: 'check-map-status', risk: 'read', feature: 'imageGeneration' },
      cancel: { operation: 'cancel-map-job', risk: 'write', feature: 'imageGeneration' },
    },
  },
];
