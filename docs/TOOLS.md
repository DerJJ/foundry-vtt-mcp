# Tools

Generated from `packages/mcp-server/src/registry/domain-tools.ts`; do not edit by hand. Regenerate with `UPDATE_GOLDEN=1 npm -w @foundry-mcp/server test`.

Every tool takes `{ "action": "...", "params": { ... } }`. `{ "action": "describe" }` lists the actions of the connected world's game system, and `{ "action": "describe", "params": { "action": "..." } }` returns the full parameter schema of one action. Required parameters are in **bold**.

Every action has a **risk**. The world setting *Access level* decides which are allowed: *Read only* allows `read`; *Read & write* (the default) also allows `write`; *Full access* also allows `delete`. `execute` needs its own checkbox. See [ADR-0005](adr/0005-access-levels-and-action-risk.md).

## `world`

Information about the connected Foundry world and what the MCP may do in it.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `info` | read | all | (none) | Get basic information about the Foundry world and system |
| `permissions` | read | all | identifier, documentType | Show Foundry world permissions by user role. |
| `reload` | write | all | (none) | Reload this GM browser, which applies a module switch. The bridge reconnects by itself; players are not reloaded. |
| `capabilities` | read | all | (none) | The game system, the access level, and which gated features are on. Call it first. |

## `documents`

Any Foundry document, in the world or in a compendium pack: an actor, an item or effect on an actor, a scene and its walls, lights and tiles, a journal and its pages, a playlist, a macro, a folder. Call schema first for the fields of a type in this world; kinds (inventory, spells, features) group the item types of an actor.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `schema` | read | all | type, subtype | The types of this world, or the fields, subtypes and an example of one type; also the kinds of item. |
| `list` | read | all | **type**, subtype, kind, parent, pack, query, filter, fields, limit, offset | List documents of a type, in the world, inside a parent, or in a pack; paged. |
| `get` | read | all | **type**, id, name, parent, pack, fields, maxChars | Read one document, or only some of its fields. A very large one is summarised. |
| `create` | write | all | **type**, subtype, kind, parent, pack, folder, from, data | Create documents from data, or copy a compendium entry with from; inside a parent for embedded ones. |
| `update` | write | all | **type**, subtype, id, name, parent, pack, folder, **data** | Change documents: one by id or name, or a list of changes that each carry an id. |
| `delete` | delete | all | **type**, subtype, id, name, parent, pack, folder, confirm, deleteContents | Delete one document, or several with confirm; a folder, with or without its contents. |

## `actors`

What is more than a data change on an actor: a compact view, using an item or casting a spell, placing it on the scene, who owns it, the party and creature cards. Creating, changing and deleting actors and the items and effects on them is `documents`.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `get` | read | all | **identifier** | Retrieve character information optimized for minimal token usage. |
| `use` | write | all | **actorIdentifier**, **itemIdentifier**, targets, consume, spellLevel, waitMs | Use an item, cast a spell or use a feature of an actor with the system's own rules. |
| `place` | write | all | **actorIds**, placement, hidden | Drop existing actors on the current scene as tokens. |
| `set-ownership` | write | all | **actorIdentifier**, **playerIdentifier**, **permissionLevel**, confirmBulkOperation | Assign ownership permissions for actors to players. |
| `remove-ownership` | write | all | **actorIdentifier**, **playerIdentifier**, confirmRemoval | Remove ownership permissions (set to NONE) for specific actors and players. |
| `list-ownership` | read | all | actorIdentifier, playerIdentifier | List current ownership permissions for actors, showing which players have what access levels. |
| `party-status` | read | all | includeFeatures | Compact live status of all player characters in one call (dnd5e or pf2e). |
| `creature-card` | read | all | target, actor, sceneIdentifier | Compact stat block with derived values for a token on the scene (target) or a world actor (actor: name, id or uuid): CR, HP, AC, initiative, speed, abilities, proficient saves and skills, senses, resistances/immunities, legendary actions, and actions with activation, to-hit, save DC, damage, uses or recharge. |
| `import` | write | dsa5 | jsonPayload, filePath, strategy, resolveItems, addToScene, updateExisting, existingActorIdentifier, strict | Create an actor from an outside format (DSA5: Optolith, custom JSON). |

## `compendium`

Compendium packs: search, read an entry of any type, list packs, find creatures by criteria, and make or delete world packs. Entries of a pack are `documents` with `pack`; copying one into the world is `documents` `create` with `from`.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `search` | read | all | **query**, packType, filters, limit | Search through compendium packs by name. |
| `get` | read | all | **packId**, **itemId**, compact | Read one pack entry of any type (item, actor, journal, roll table, scene, macro, playlist, cards, adventure); compact: true shortens it. |
| `find-creatures` | read | all | challengeRating, creatureType, size, hasSpells, hasLegendaryActions, level, traits, rarity, tier, role, hasInvestiture, hitPoints, defensesMin, deflectMin, limit, fallbackToNameSearch | MULTI-SYSTEM CREATURE DISCOVERY: Get a comprehensive list of creatures matching specific criteria. |
| `packs` | read | all | type | List compendium packs with their type, lock and write state. |
| `create-pack` | write | all | **label**, **type**, name | Create a world compendium pack. |
| `delete-pack` | delete | all | **identifier**, **confirmDelete** | Delete a world compendium pack (system and module packs are refused). |

## `scenes`

Scenes as the table sees them: look at the current one, list them, switch, ping, pull the players, weather and fog. Making or changing a scene, its background and music, and its walls, lights and tiles is `documents`.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `current` | read | all | includeTokens, includeHidden | Get information about the currently active scene, including tokens, layout, and the music binding (playlist + playlistSound) |
| `list` | read | all | filter, include_active_only | List all available Foundry VTT scenes with their details, including the music binding (playlist + playlistSound) for each scene |
| `activate` | write | all | **scene_identifier**, optimize_view, mode | Switch to a different Foundry VTT scene by name or ID |
| `ping` | write | all | sceneIdentifier, target, x, y | Ping a token or a point on the scene the GM browser is showing. |
| `pull-players` | write | all | sceneIdentifier, target, x, y | Ping and pull every player view to a token or point. |
| `reset-fog` | delete | all | sceneIdentifier | Reset the fog of war of a scene. |
| `set-weather` | write | all | sceneIdentifier, **weather** | Set the weather effect of a scene (an empty string clears it). |
| `list-weather` | read | all | (none) | List the available weather effects. |

## `tokens`

Tokens on the current scene: look at one, move it, and set its conditions. Changing or deleting a token is `documents` (type `Token`, the scene as `parent`).

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `get` | read | all | **tokenId** | Get detailed information about a specific token including all properties and linked actor data |
| `move` | write | all | **tokenId**, **x**, **y**, animate | Move a token to a new position on the current scene. |
| `toggle-condition` | write | all | **tokenId**, **conditionId**, active | Toggle a status effect/condition on or off for a token. |
| `list-conditions` | read | all | (none) | Get a list of all available status effects/conditions that can be applied to tokens in the current game system |

## `combat`

The combat tracker of a scene: read it, run it, and apply damage or healing.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `status` | read | all | sceneIdentifier | Round, turn and combatants with initiative, HP, AC and state. |
| `add` | write | all | targets, include, sceneIdentifier | Put tokens into the combat; creates the combat if there is none. |
| `remove` | write | all | **targets**, sceneIdentifier | Take tokens out of the combat. |
| `initiative` | write | all | who, targets, initiative, sceneIdentifier | Roll or set the initiative of tokens. |
| `advance` | write | all | sceneIdentifier | Start the combat or move to another turn or round. |
| `defeated` | write | all | **targets**, defeated, sceneIdentifier | Mark tokens defeated (defeated=false undoes it). |
| `apply-damage` | write | all | sceneIdentifier, **targets**, **amount**, type, multiplier, allMatches | Apply damage or healing to tokens (dnd5e or pf2e). |
| `end` | delete | all | sceneIdentifier | End the combat by deleting it. |

## `chat`

Speak as an actor or the GM, ask players to roll, read the chat log, roll for the GM.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `post` | write | all | actorIdentifier, tokenId, **content**, language, chatLog, whisperTo, html, style | Say something in the chat. |
| `request-rolls` | write | all | **rollType**, **rollTarget**, **targetPlayer**, **isPublic**, **userConfirmedVisibility**, dc, rollModifier, flavor, advantageMode | Request dice rolls from players with interactive buttons. |
| `get-messages` | read | all | limit, since, beforeId, actor, kinds, rollsOnly, includeText, textLength | Read the Foundry chat log as structured events (GM view, includes whispers), oldest first, so you can tell what happened and who did it. |
| `gm-roll` | write | all | formula, sceneIdentifier, targets, rollType, key, advantageMode, visibility, flavor | Roll hidden from the players. |
| `roll-table` | write | all | **table**, visibility | Draw from a roll table. Listing the tables is `documents` (type `RollTable`). |

## `journals`

Journals and quests: read and search them, and build quest journals and campaign dashboards. Changing a page is `documents` (type `JournalEntryPage`).

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `list` | read | all | filterQuests, includeContent, journalId, pageId | List journals and their pages, or read one journal or page. |
| `search` | read | all | **searchQuery**, searchType | Search through all pages of all journal entries for specific content or keywords. |
| `create-quest` | write | all | **questTitle**, **questDescription**, questType, difficulty, location, questGiver, npcName, rewards, additionalPages, folderName | Create a new quest journal entry with AI-generated content based on natural language description |
| `update-quest` | write | all | **journalId**, **newContent**, **updateType**, pageId, newPageName | Update an existing quest journal with new progress information. |
| `link-quest` | write | all | **journalId**, **npcName**, **relationship** | Link an existing quest journal to an NPC in the world |
| `create-dashboard` | write | all | **campaignTitle**, **campaignDescription**, **template**, customParts, defaultQuestGiver, defaultLocation | Create a comprehensive campaign dashboard journal with navigation, progress tracking, and part management |

## `settings`

Foundry settings of the core, the game system and the modules: find, read and change them. The settings of the bridge module itself, the module list (use modules), the player role permissions and anything that looks like a secret cannot be changed from here.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `list` | read | all | query, namespace, scope, all, limit, offset | Settings with their value and default; the ones Foundry shows in its settings window unless all is set. |
| `get` | read | all | **key** | One setting: value, default, hint, choices and whether it can be changed from here. |
| `set` | write | all | **key**, **value** | Change a setting. Says when it needs a reload. A client setting is stored in this GM browser only. |

## `time`

The real-time clock of Simple Calendar Reborn, run in the primary GM browser. Needs that module.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `status` | read | all | (none) | Whether the clock is started, paused or stopped. |
| `control` | write | all | (none) | Start, pause or stop the clock. |

## `audio`

Playback of playlists and their sounds. Making and changing playlists and sounds is `documents`.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `control` | write | all | **playlist**, **command**, sound | Playback control for playlists and their sounds: play (playAll), stop (stopAll), cycle-mode (sequential -> shuffle -> soundboard), play-sound, stop-sound. |

## `modules`

The Foundry modules of this world: what is installed and what runs, and switching them on or off. Foundry applies a switch only when the world loads again, so every browser has to reload (F5) afterwards; the bridge reconnects by itself.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `list` | read | all | active, query, limit, offset | Installed modules with version, whether they run, and pendingReload for a switch that is not applied yet. |
| `get` | read | all | **id** | One module: description, authors, compatibility, what it requires and who requires it. |
| `set-active` | write | all | id, ids, **active**, withDependencies, withDependents | Switch modules on or off. Applied only after a reload of every browser. The bridge module itself cannot be switched off. |

## `macros`

Run Foundry macros and scripts. Running code is off unless a GM switches on "Allow script and macro execution" in the module settings; every run is whispered to the GM as a chat card. Making and changing macros is `documents` (type `Macro`).

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `execute` | execute | all | **macro**, args, timeoutMs | Run a macro in the GM browser; returns its result, logs and errors. |
| `run-script` | execute | all | **code**, args, timeoutMs | Execute JavaScript (an async function body) in the GM browser with the Foundry API (game, canvas, CONFIG, foundry, ui) and an `args` object in scope. |

## `images`

Images: bring a local file into the world, and generate maps with ComfyUI. Generating is off unless a GM switches it on in the module settings.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `upload` | write | all | **path**, subfolder, filename | Upload a local image file (on the machine running this MCP server) into the active Foundry world, returning the Foundry-relative path to use as an actor portrait (manage-actors img), a prototype-token image (manage-actors tokenImg), or a placed token's image (update-token img). |
| `generate` | write | all | **prompt**, **scene_name**, size, grid_size | Start AI map generation using D&D Battlemaps SDXL (async) |
| `status` | read | all | **job_id** | Check status of map generation job. |
| `cancel` | write | all | **job_id** | Cancel a running map generation job |

## Game systems

Code for one game system lives in a pack ([ADR-0006](adr/0006-game-systems-as-packs.md)). *Verified* means a live world of that system has been walked through every action.

| System | Status | Checked against |
| --- | --- | --- |
| pf2e | verified | pf2e 8.7.0 on Foundry 14 |
| dnd5e | verified | dnd5e 6.0.6 on Foundry 14 |
| dsa5 | unverified | - |
| wfrp4e | unverified | - |
| cosmere-rpg | unverified | - |
| mgt2e | unverified | - |

## Migration from the 50 tools of v0.8.6

The old tool names are gone (no aliases). Each one is now an action of a domain tool.

| Old tool | Now | Fixed argument |
| --- | --- | --- |
| `get-character` | actors `get` | - |
| `get-character-entity` | documents `get` | type `Item` or `ActiveEffect` with the actor as `parent` |
| `list-characters` | documents `list` | type `Actor`; `subtype` for the actor type |
| `use-item` | actors `use` | - |
| `manage-world-items` | documents | list, get, create, update on type `Item`; add and remove on an actor with the actor as `parent`; `schema` replaces `describe` |
| `search-character-items` | documents `list` | type `Item` with the actor as `parent`; `query`, `kind` or `filter` to search |
| `search-compendium` | compendium `search` | - |
| `get-compendium-item` | compendium `get` | - |
| `list-creatures-by-criteria` | compendium `find-creatures` | - |
| `list-compendium-packs` | compendium `packs` | also shows lock and write state; `type` filters |
| `get-current-scene` | scenes `current` | - |
| `get-world-info` | world `info` | - |
| `update-scene-music` | documents `update` | type `Scene`, `data: {playlist, playlistSound}` with ids |
| `create-actor-from-compendium` | documents `create` | type `Actor` with `from: {packId, itemId}` and `data: {name}`; `actors` `place` puts them on the scene |
| `get-compendium-entry-full` | compendium `get` | full data is the default; `entryId` is now `itemId` |
| `manage-actors` | documents, and actors `place` | create, update and delete on type `Actor`; items on an actor with `parent`; `place` stays an action of `actors` |
| `manage-effects` | documents | type `ActiveEffect` with an actor or an item as `parent` |
| `create-dsa5-character-from-archetype` | documents `create` | type `Actor` with `from` set to the archetype entry |
| `list-dsa5-archetypes` | documents `list` | with `pack` set to the archetype pack |
| `import-dsa5-actor-from-json` | actors `import` | - |
| `dnd5e-add-feature` | documents `create` | type `Item`, `kind: features`, the actor as `parent`; or copy one with `from` |
| `dnd5e-create-npc` | documents `create` | type `Actor`, `subtype: npc`, with the fields that `schema` shows (no stat block builder) |
| `dnd5e-add-features-from-compendium` | documents `create` | type `Item` with `from: {packId, itemId}` and the actor as `parent`; `compendium` `search` finds them |
| `create-quest-journal` | journals `create-quest` | - |
| `link-quest-to-npc` | journals `link-quest` | - |
| `update-quest-journal` | journals `update-quest` | - |
| `replace-journal-page` | documents `update` | type `JournalEntryPage` with the journal as `parent` |
| `list-journals` | journals `list` | - |
| `search-journals` | journals `search` | - |
| `create-chat-message` | chat `post` | - |
| `request-player-rolls` | chat `request-rolls` | - |
| `create-campaign-dashboard` | journals `create-dashboard` | - |
| `assign-actor-ownership` | actors `set-ownership` | - |
| `remove-actor-ownership` | actors `remove-ownership` | - |
| `list-actor-ownership` | actors `list-ownership` | - |
| `wfrp4e-update-actor` | documents `update` | type `Actor`; the fields are the ones `schema` shows |
| `wfrp4e-add-items` | documents `create` | type `Item` with the actor as `parent` |
| `move-token` | tokens `move` | - |
| `update-token` | documents `update` | type `Token` with the scene as `parent` |
| `delete-tokens` | documents `delete` | type `Token` with the scene as `parent` |
| `get-token-details` | tokens `get` | - |
| `toggle-token-condition` | tokens `toggle-condition` | - |
| `get-available-conditions` | tokens `list-conditions` | - |
| `generate-map` | images `generate` | - |
| `check-map-status` | images `status` | - |
| `cancel-map-job` | images `cancel` | - |
| `list-scenes` | scenes `list` | - |
| `switch-scene` | scenes `activate` | - |
| `manage-playlists` | documents, and audio `control` | types `Playlist` and `PlaylistSound` |
| `control-playlist` | audio `control` | - |
