/**
 * The domain tools and their actions (ADR-0004). Each action names the operation that answers
 * it, its risk (ADR-0005) and, where one operation serves several actions, the parameters that
 * belong to the action. `docs/TOOLS.md` is generated from this file.
 */

import type { DomainToolSpec } from './domain-tool.js';

export const DOMAIN_TOOLS: readonly DomainToolSpec[] = [
  {
    name: 'world',
    purpose: 'Information about the connected Foundry world and what the MCP may do in it.',
    actions: {
      info: { operation: 'get-world-info', risk: 'read' },
      permissions: { operation: 'get-permissions', risk: 'read' },
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
    name: 'scenes',
    purpose: 'Scenes: look at the current one, list them, switch, and set scene music.',
    actions: {
      current: { operation: 'get-current-scene', risk: 'read' },
      list: { operation: 'list-scenes', risk: 'read' },
      activate: { operation: 'switch-scene', risk: 'write' },
      'set-music': { operation: 'update-scene-music', risk: 'write' },
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
      create: {
        operation: 'manage-scene',
        risk: 'write',
        fixed: { action: 'create-scene' },
        params: { sceneData: true },
        summary: 'Create a scene from scene data.',
      },
      update: {
        operation: 'manage-scene',
        risk: 'write',
        fixed: { action: 'update-scene' },
        params: { sceneIdentifier: true, sceneData: true },
        summary: 'Change a scene.',
      },
      'create-documents': {
        operation: 'manage-scene',
        risk: 'write',
        fixed: { action: 'create-documents' },
        params: { sceneIdentifier: true, documentType: true, documents: true },
        summary:
          'Create walls, lights, sounds, regions, tiles, tokens, notes or drawings on a scene.',
      },
      'update-documents': {
        operation: 'manage-scene',
        risk: 'write',
        fixed: { action: 'update-documents' },
        params: { sceneIdentifier: true, documentType: true, documents: true },
        summary: 'Change embedded documents of a scene (each entry needs its _id).',
      },
      'delete-documents': {
        operation: 'manage-scene',
        risk: 'delete',
        fixed: { action: 'delete-documents' },
        params: { sceneIdentifier: true, documentType: true, ids: true },
        summary: 'Delete embedded documents of a scene.',
      },
      'list-documents': {
        operation: 'manage-scene',
        risk: 'read',
        fixed: { action: 'list-documents' },
        params: { sceneIdentifier: true, documentType: true },
        summary: 'List the embedded documents of a scene.',
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
    name: 'playlists',
    purpose: 'Playlists and their sounds: list, create, change, delete and control playback.',
    actions: {
      list: {
        operation: 'manage-playlists',
        risk: 'read',
        fixed: { action: 'describe' },
        params: { playlist: false },
        summary: 'List playlists, or describe one playlist with its sounds.',
      },
      create: {
        operation: 'manage-playlists',
        risk: 'write',
        fixed: { action: 'create' },
        params: {
          name: true,
          mode: false,
          fade: false,
          description: false,
          sorting: false,
          folder: false,
          color: false,
          sounds: false,
        },
        summary: 'Create a playlist, optionally with sounds.',
      },
      update: {
        operation: 'manage-playlists',
        risk: 'write',
        fixed: { action: 'update' },
        params: {
          playlist: true,
          name: false,
          mode: false,
          fade: false,
          description: false,
          sorting: false,
          folder: false,
          color: false,
          sounds: false,
          updates: false,
        },
        summary: 'Change a playlist or its sounds.',
      },
      delete: {
        operation: 'manage-playlists',
        risk: 'delete',
        fixed: { action: 'delete' },
        params: { playlist: true },
        summary: 'Delete a playlist.',
      },
      control: { operation: 'control-playlist', risk: 'write' },
    },
  },

  {
    name: 'effects',
    purpose: 'Active effects on actors and items, and the conditions a token can have.',
    actions: {
      create: {
        operation: 'manage-effects',
        risk: 'write',
        fixed: { action: 'create' },
        params: {
          actorIdentifier: true,
          parentType: true,
          parentItemIdentifier: false,
          effectData: true,
        },
        summary: 'Create an ActiveEffect on an actor or on one of its items.',
      },
      update: {
        operation: 'manage-effects',
        risk: 'write',
        fixed: { action: 'update' },
        params: {
          actorIdentifier: true,
          parentType: true,
          parentItemIdentifier: false,
          effectId: true,
          effectData: true,
        },
        summary: 'Change an ActiveEffect.',
      },
      delete: {
        operation: 'manage-effects',
        risk: 'delete',
        fixed: { action: 'delete' },
        params: {
          actorIdentifier: true,
          parentType: true,
          parentItemIdentifier: false,
          effectId: true,
        },
        summary: 'Delete an ActiveEffect.',
      },
      'list-conditions': { operation: 'get-available-conditions', risk: 'read' },
      'toggle-condition': { operation: 'toggle-token-condition', risk: 'write' },
    },
  },

  {
    name: 'tokens',
    purpose: 'Tokens on the current scene: read, move, change and remove them.',
    actions: {
      get: { operation: 'get-token-details', risk: 'read' },
      move: { operation: 'move-token', risk: 'write' },
      update: { operation: 'update-token', risk: 'write' },
      delete: { operation: 'delete-tokens', risk: 'delete' },
    },
  },

  {
    name: 'items',
    purpose: 'Items: world items, items on actors, and using an item.',
    actions: {
      list: {
        operation: 'manage-world-items',
        risk: 'read',
        fixed: { action: 'list' },
        params: { type: false, folder: false, nameFilter: false },
        summary: 'List world items by type, folder or name.',
      },
      get: {
        operation: 'manage-world-items',
        risk: 'read',
        fixed: { action: 'get' },
        params: { itemIdentifier: true },
        summary: 'Read one world item in full.',
      },
      create: {
        operation: 'manage-world-items',
        risk: 'write',
        fixed: { action: 'create' },
        params: { items: true, folder: false },
        summary: 'Create world items.',
      },
      update: {
        operation: 'manage-world-items',
        risk: 'write',
        fixed: { action: 'update' },
        params: { updates: true },
        summary: 'Change world items by id.',
      },
      'add-to-actor': {
        operation: 'manage-world-items',
        risk: 'write',
        fixed: { action: 'add-to-actor' },
        params: { actorIdentifier: true, items: true },
        summary: 'Create items directly on an actor.',
      },
      'remove-from-actor': {
        operation: 'manage-world-items',
        risk: 'delete',
        fixed: { action: 'remove-from-actor' },
        params: { actorIdentifier: true, itemIds: false, itemNames: false, type: false },
        summary: 'Delete items from an actor.',
      },
      'system-notes': {
        operation: 'manage-world-items',
        risk: 'read',
        fixed: { action: 'describe' },
        params: {},
        summary: 'Item types and field values of the active game system.',
      },
      use: { operation: 'use-item', risk: 'write' },
      'add-wfrp4e': {
        operation: 'wfrp4e-add-items',
        risk: 'write',
        systems: ['wfrp4e'],
      },
    },
  },

  {
    name: 'actors',
    purpose:
      'Actors (characters, NPCs, monsters): read, search, create, change, delete, place on the scene, and set who owns them.',
    actions: {
      list: {
        operation: 'list-characters',
        risk: 'read',
        paged: 'characters',
        summary: 'List actors, optionally of one type.',
      },
      get: { operation: 'get-character', risk: 'read' },
      'get-entity': { operation: 'get-character-entity', risk: 'read' },
      'search-items': { operation: 'search-character-items', risk: 'read' },
      create: {
        operation: 'manage-actors',
        risk: 'write',
        fixed: { action: 'create' },
        params: { actors: true, folder: false },
        summary: 'Create actors of any type with system data.',
      },
      update: {
        operation: 'manage-actors',
        risk: 'write',
        fixed: { action: 'update' },
        params: { updates: true },
        summary: 'Change actors by id.',
      },
      delete: {
        operation: 'manage-actors',
        risk: 'delete',
        fixed: { action: 'delete' },
        params: { ids: true },
        summary: 'Delete actors by id.',
      },
      place: {
        operation: 'manage-actors',
        risk: 'write',
        fixed: { action: 'place' },
        params: { actorIds: true, placement: false, hidden: false },
        summary: 'Drop existing actors on the current scene as tokens.',
      },
      'update-items': {
        operation: 'manage-actors',
        risk: 'write',
        fixed: { action: 'update-items' },
        params: { actorIdentifier: true, itemUpdates: true },
        summary: 'Change items that are on an actor.',
      },
      'delete-items': {
        operation: 'manage-actors',
        risk: 'delete',
        fixed: { action: 'delete-items' },
        params: { actorIdentifier: true, itemIds: true },
        summary: 'Delete items that are on an actor.',
      },
      'system-notes': {
        operation: 'manage-actors',
        risk: 'read',
        fixed: { action: 'describe' },
        params: {},
        summary: 'Actor types and field paths of the active game system.',
      },
      'create-from-compendium': { operation: 'create-actor-from-compendium', risk: 'write' },
      'set-ownership': { operation: 'assign-actor-ownership', risk: 'write' },
      'remove-ownership': { operation: 'remove-actor-ownership', risk: 'write' },
      'list-ownership': { operation: 'list-actor-ownership', risk: 'read' },
      'party-status': { operation: 'party-status', risk: 'read' },
      'creature-card': { operation: 'creature-card', risk: 'read' },

      // Actions that exist for one game system only. They are described, not listed.
      'create-npc': { operation: 'dnd5e-create-npc', risk: 'write', systems: ['dnd5e'] },
      'add-feature': { operation: 'dnd5e-add-feature', risk: 'write', systems: ['dnd5e'] },
      'add-features-from-compendium': {
        operation: 'dnd5e-add-features-from-compendium',
        risk: 'write',
        systems: ['dnd5e'],
      },
      'wfrp4e-update': { operation: 'wfrp4e-update-actor', risk: 'write', systems: ['wfrp4e'] },
      'list-archetypes': { operation: 'list-dsa5-archetypes', risk: 'read', systems: ['dsa5'] },
      'create-from-archetype': {
        operation: 'create-dsa5-character-from-archetype',
        risk: 'write',
        systems: ['dsa5'],
      },
      'import-json': {
        operation: 'import-dsa5-actor-from-json',
        risk: 'write',
        systems: ['dsa5'],
      },
    },
  },

  {
    name: 'compendium',
    purpose: 'Compendium packs: search, read entries, list packs, and find creatures by criteria.',
    actions: {
      search: { operation: 'search-compendium', risk: 'read' },
      'get-item': { operation: 'get-compendium-item', risk: 'read' },
      'get-entry': { operation: 'get-compendium-entry-full', risk: 'read' },
      'list-packs': { operation: 'list-compendium-packs', risk: 'read' },
      'find-creatures': { operation: 'list-creatures-by-criteria', risk: 'read' },
    },
  },

  {
    name: 'journals',
    purpose: 'Journals and quests: read, search, write pages, and build quest journals.',
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
      'replace-page': { operation: 'replace-journal-page', risk: 'write' },
      'create-dashboard': { operation: 'create-campaign-dashboard', risk: 'write' },
    },
  },

  {
    name: 'chat',
    purpose: 'Speak as an actor and ask players to roll.',
    actions: {
      post: { operation: 'create-chat-message', risk: 'write' },
      'request-rolls': { operation: 'request-player-rolls', risk: 'write' },
      'get-messages': { operation: 'get-chat-messages', risk: 'read' },
      'post-rich': { operation: 'post-chat', risk: 'write' },
      'gm-roll': { operation: 'gm-roll', risk: 'write' },
      'list-tables': {
        operation: 'roll-table',
        risk: 'read',
        fixed: { action: 'list' },
        params: { search: false },
        summary: 'List the roll tables of the world and of compendiums.',
      },
      'roll-table': {
        operation: 'roll-table',
        risk: 'write',
        fixed: { action: 'roll' },
        params: { table: true, visibility: false },
        summary: 'Draw from a roll table.',
      },
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
      'roll-initiative': {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'roll-initiative' },
        params: { who: false, targets: false, sceneIdentifier: false },
        summary: 'Roll initiative as a GM roll.',
      },
      'set-initiative': {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'set-initiative' },
        params: { targets: true, initiative: true, sceneIdentifier: false },
        summary: 'Set the initiative of tokens.',
      },
      begin: {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'begin' },
        params: { sceneIdentifier: false },
        summary: 'Start round 1.',
      },
      'next-turn': {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'next-turn' },
        params: { sceneIdentifier: false },
        summary: 'Advance to the next turn.',
      },
      'previous-turn': {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'previous-turn' },
        params: { sceneIdentifier: false },
        summary: 'Go back one turn.',
      },
      'next-round': {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'next-round' },
        params: { sceneIdentifier: false },
        summary: 'Advance to the next round.',
      },
      'previous-round': {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'previous-round' },
        params: { sceneIdentifier: false },
        summary: 'Go back one round.',
      },
      defeated: {
        operation: 'combat',
        risk: 'write',
        fixed: { action: 'defeated' },
        params: { targets: true, defeated: false, sceneIdentifier: false },
        summary: 'Mark tokens defeated (defeated=false undoes it).',
      },
      end: {
        operation: 'combat',
        risk: 'delete',
        fixed: { action: 'end' },
        params: { sceneIdentifier: false },
        summary: 'End the combat by deleting it.',
      },
      'apply-damage': { operation: 'apply-damage', risk: 'write' },
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
      start: {
        operation: 'calendar-clock',
        risk: 'write',
        fixed: { action: 'start' },
        params: {},
        summary: 'Start the clock; it stays paused while the game is paused or a combat runs.',
      },
      pause: {
        operation: 'calendar-clock',
        risk: 'write',
        fixed: { action: 'pause' },
        params: {},
        summary: 'Pause the clock.',
      },
      stop: {
        operation: 'calendar-clock',
        risk: 'write',
        fixed: { action: 'stop' },
        params: {},
        summary: 'Stop the clock.',
      },
    },
  },

  {
    name: 'macros',
    purpose:
      'Foundry macros and scripts. Running code is off unless a GM switches on "Allow script and macro execution" in the module settings; every run is whispered to the GM as a chat card.',
    actions: {
      list: {
        operation: 'manage-macros',
        risk: 'read',
        fixed: { action: 'list' },
        params: { search: false },
        summary: 'List macros, optionally filtered by name.',
      },
      get: {
        operation: 'manage-macros',
        risk: 'read',
        fixed: { action: 'get' },
        params: { macro: true },
        summary: 'Read one macro with its source.',
      },
      create: {
        operation: 'manage-macros',
        risk: 'write',
        fixed: { action: 'create' },
        params: { name: true, command: false, type: false, img: false, folder: false },
        summary: 'Create a macro.',
      },
      update: {
        operation: 'manage-macros',
        risk: 'write',
        fixed: { action: 'update' },
        params: { macro: true, name: false, command: false, img: false, folder: false },
        summary: 'Change a macro.',
      },
      delete: {
        operation: 'manage-macros',
        risk: 'delete',
        fixed: { action: 'delete' },
        params: { macro: true },
        summary: 'Delete a macro.',
      },
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
    name: 'image-generation',
    purpose:
      'Generate images such as maps with ComfyUI. Off unless a GM switches it on in the module settings.',
    actions: {
      generate: { operation: 'generate-map', risk: 'write', feature: 'imageGeneration' },
      status: { operation: 'check-map-status', risk: 'read', feature: 'imageGeneration' },
      cancel: { operation: 'cancel-map-job', risk: 'write', feature: 'imageGeneration' },
    },
  },
];
