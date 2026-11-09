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
| `capabilities` | read | all | (none) | The game system, the access level, and which gated features are on. Call it first. |

## `scenes`

Scenes: look at the current one, list them, switch, and set scene music.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `current` | read | all | includeTokens, includeHidden | Get information about the currently active scene, including tokens, layout, and the music binding (playlist + playlistSound) |
| `list` | read | all | filter, include_active_only | List all available Foundry VTT scenes with their details, including the music binding (playlist + playlistSound) for each scene |
| `activate` | write | all | **scene_identifier**, optimize_view, mode | Switch to a different Foundry VTT scene by name or ID |
| `set-music` | write | all | **scene_identifier**, playlist, playlist_sound | Set or clear the music binding of a scene. |
| `ping` | write | all | sceneIdentifier, target, x, y | Ping a token or a point on the scene the GM browser is showing. |
| `pull-players` | write | all | sceneIdentifier, target, x, y | Ping and pull every player view to a token or point. |
| `reset-fog` | delete | all | sceneIdentifier | Reset the fog of war of a scene. |
| `set-weather` | write | all | sceneIdentifier, **weather** | Set the weather effect of a scene (an empty string clears it). |
| `create` | write | all | **sceneData** | Create a scene from scene data. |
| `update` | write | all | **sceneIdentifier**, **sceneData** | Change a scene. |
| `create-documents` | write | all | **sceneIdentifier**, **documentType**, **documents** | Create walls, lights, sounds, regions, tiles, tokens, notes or drawings on a scene. |
| `update-documents` | write | all | **sceneIdentifier**, **documentType**, **documents** | Change embedded documents of a scene (each entry needs its _id). |
| `delete-documents` | delete | all | **sceneIdentifier**, **documentType**, **ids** | Delete embedded documents of a scene. |
| `list-documents` | read | all | **sceneIdentifier**, **documentType** | List the embedded documents of a scene. |
| `list-weather` | read | all | (none) | List the available weather effects. |

## `playlists`

Playlists and their sounds: list, create, change, delete and control playback.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `list` | read | all | playlist | List playlists, or describe one playlist with its sounds. |
| `create` | write | all | **name**, mode, fade, description, sorting, folder, color, sounds | Create a playlist, optionally with sounds. |
| `update` | write | all | **playlist**, name, mode, fade, description, sorting, folder, color, sounds, updates | Change a playlist or its sounds. |
| `delete` | delete | all | **playlist** | Delete a playlist. |
| `control` | write | all | **playlist**, **command**, sound | Playback control for playlists and their sounds: play (playAll), stop (stopAll), cycle-mode (sequential -> shuffle -> soundboard), play-sound, stop-sound. |

## `effects`

Active effects on actors and items, and the conditions a token can have.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `create` | write | all | **actorIdentifier**, **parentType**, parentItemIdentifier, **effectData** | Create an ActiveEffect on an actor or on one of its items. |
| `update` | write | all | **actorIdentifier**, **parentType**, parentItemIdentifier, **effectId**, **effectData** | Change an ActiveEffect. |
| `delete` | delete | all | **actorIdentifier**, **parentType**, parentItemIdentifier, **effectId** | Delete an ActiveEffect. |
| `list-conditions` | read | all | (none) | Get a list of all available status effects/conditions that can be applied to tokens in the current game system |
| `toggle-condition` | write | all | **tokenId**, **conditionId**, active | Toggle a status effect/condition on or off for a token. |

## `tokens`

Tokens on the current scene: read, move, change and remove them.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `get` | read | all | **tokenId** | Get detailed information about a specific token including all properties and linked actor data |
| `move` | write | all | **tokenId**, **x**, **y**, animate | Move a token to a new position on the current scene. |
| `update` | write | all | **tokenId**, **updates** | Update various properties of a token such as visibility, disposition, size, rotation, elevation, or name |
| `delete` | delete | all | **tokenIds** | Delete one or more tokens from the current scene |

## `items`

Items: world items, items on actors, and using an item.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `list` | read | all | type, folder, nameFilter | List world items by type, folder or name. |
| `get` | read | all | **itemIdentifier** | Read one world item in full. |
| `create` | write | all | **items**, folder | Create world items. |
| `update` | write | all | **updates** | Change world items by id. |
| `add-to-actor` | write | all | **actorIdentifier**, **items** | Create items directly on an actor. |
| `remove-from-actor` | delete | all | **actorIdentifier**, itemIds, itemNames, type | Delete items from an actor. |
| `system-notes` | read | all | (none) | Item types and field values of the active game system. |
| `use` | write | all | **actorIdentifier**, **itemIdentifier**, targets, consume, spellLevel, waitMs | Use an item on a character (cast spell, use ability, activate feature, consume item). |
| `add-wfrp4e` | write | wfrp4e | **actor**, **items** | [WFRP4e only] Add skills, talents, traits, trappings, careers, weapons, spells and other items to an existing actor. |

## `actors`

Actors (characters, NPCs, monsters): read, search, create, change, delete, place on the scene, and set who owns them.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `list` | read | all | type, limit, offset | List actors, optionally of one type. |
| `get` | read | all | **identifier** | Retrieve character information optimized for minimal token usage. |
| `get-entity` | read | all | **characterIdentifier**, **entityIdentifier** | Retrieve full details for a specific entity from a character. |
| `search-items` | read | all | **characterIdentifier**, query, type, category, limit | Search within a character's items, spells, actions, and effects. |
| `create` | write | all | **actors**, folder | Create actors of any type with system data. |
| `update` | write | all | **updates** | Change actors by id. |
| `delete` | delete | all | **ids** | Delete actors by id. |
| `place` | write | all | **actorIds**, placement, hidden | Drop existing actors on the current scene as tokens. |
| `update-items` | write | all | **actorIdentifier**, **itemUpdates** | Change items that are on an actor. |
| `delete-items` | delete | all | **actorIdentifier**, **itemIds** | Delete items that are on an actor. |
| `system-notes` | read | all | (none) | Actor types and field paths of the active game system. |
| `create-from-compendium` | write | all | **packId**, **itemId**, **names**, quantity, addToScene, placement | Create one or more actors from a specific compendium entry with custom names. |
| `set-ownership` | write | all | **actorIdentifier**, **playerIdentifier**, **permissionLevel**, confirmBulkOperation | Assign ownership permissions for actors to players. |
| `remove-ownership` | write | all | **actorIdentifier**, **playerIdentifier**, confirmRemoval | Remove ownership permissions (set to NONE) for specific actors and players. |
| `list-ownership` | read | all | actorIdentifier, playerIdentifier | List current ownership permissions for actors, showing which players have what access levels. |
| `party-status` | read | all | includeFeatures | Compact live status of all player characters in one call (dnd5e or pf2e). |
| `creature-card` | read | all | target, actor, sceneIdentifier | Compact stat block with derived values for a token on the scene (target) or a world actor (actor: name, id or uuid): CR, HP, AC, initiative, speed, abilities, proficient saves and skills, senses, resistances/immunities, legendary actions, and actions with activation, to-hit, save DC, damage, uses or recharge. |
| `create-npc` | write | dnd5e | **name**, **creatureType**, creatureSubtype, **size**, alignment, **cr**, **hpAverage**, **hpFormula**, **acMode**, acValue, **abilities**, savingThrows, walkSpeed, flySpeed, swimSpeed, climbSpeed, burrowSpeed, hover, darkvision, blindsight, tremorsense, truesight, specialSenses, skills, damageImmunities, damageResistances, damageVulnerabilities, conditionImmunities, languages, languagesCustom, biography, sourceBook, sourcePage, sourceRules, features | [D&D 5e only] Create a new NPC actor from scratch with a full Level-2 stat block: identity (name, type, size, alignment, CR), ability scores, saving throw proficiencies, HP (average + formula), AC (default or flat), movement speeds, senses, skill proficiencies, damage immunities/resistances/vulnerabilities, condition immunities, languages, and biography. |
| `add-feature` | write | dnd5e | **featureType**, **actorIdentifier**, featureName, description, activationType, uses, damageParts, saveAbility, saveDC, halfOnSave, saveDamageParts, saveOnSave, areaType, areaSize, areaUnits, affectsType, attackType, weaponClass, abilityModifier, attackBonus, proficient, equipped, reachFt, rangeFt, longRangeFt, properties, spellcastingClass, spellcastingLevel, spellcastingAbility, spellNames, compendiumPacks, sourceRules, sourceBook, sourcePage | [D&D 5e only] Add a feature, attack, spellcasting setup, or spells to an existing actor. |
| `add-features-from-compendium` | write | dnd5e | **actorIdentifier**, **featureNames**, compendiumPacks | [D&D 5e only] Import class features and monster features from an official compendium pack onto an actor (NPC or PC). |
| `wfrp4e-update` | write | wfrp4e | **actor**, characteristics, wounds, skills, career, movement, biography | [WFRP4e only] Update an existing actor's stat block: characteristic initial/advances/modifier, wounds (current value and max), the advances on skills the actor already has, which career is current, base movement, and/or the biography text. |
| `list-archetypes` | read | dsa5 | packId, filterBySpecies, filterByProfession | List available DSA5 character archetypes from compendium packs. |
| `create-from-archetype` | write | dsa5 | **archetypePackId**, **archetypeId**, **characterName**, customization, addToWorld | Create a DSA5 character from an archetype (e.g., Allacaya, Wulfgrimm). |
| `import-json` | write | dsa5 | jsonPayload, filePath, strategy, resolveItems, addToScene, updateExisting, existingActorIdentifier, strict | Import a custom DSA5 actor JSON using multiple strategies (auto/custom_dsa5/optolith_like/raw_foundry). |

## `compendium`

Compendium packs: search, read entries, list packs, and find creatures by criteria.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `search` | read | all | **query**, packType, filters, limit | Search through compendium packs by name. |
| `get` | read | all | **packId**, **itemId**, compact | Read one pack entry: full data, or compact stats with compact: true. |
| `list-packs` | read | all | type | List all available compendium packs |
| `find-creatures` | read | all | challengeRating, creatureType, size, hasSpells, hasLegendaryActions, level, traits, rarity, tier, role, hasInvestiture, hitPoints, defensesMin, deflectMin, limit, fallbackToNameSearch | MULTI-SYSTEM CREATURE DISCOVERY: Get a comprehensive list of creatures matching specific criteria. |
| `packs` | read | all | label, type, name, identifier, confirmDelete | List compendium packs with their lock and write state. |
| `create-pack` | write | all | label, type, name, identifier, confirmDelete | Create a world compendium pack. |
| `delete-pack` | delete | all | label, type, name, identifier, confirmDelete | Delete a world compendium pack (system and module packs are refused). |
| `list-entries` | read | all | pack, nameFilter, type, entries, updates, identifiers, confirmDelete, source, newName, folder | List the entries of a compendium pack. |
| `create-entries` | write | all | pack, nameFilter, type, entries, updates, identifiers, confirmDelete, source, newName, folder | Add entries to an unlocked world pack. |
| `update-entries` | write | all | pack, nameFilter, type, entries, updates, identifiers, confirmDelete, source, newName, folder | Change entries of an unlocked world pack. |
| `delete-entries` | delete | all | pack, nameFilter, type, entries, updates, identifiers, confirmDelete, source, newName, folder | Delete entries from an unlocked world pack. |
| `copy-entry` | write | all | pack, nameFilter, type, entries, updates, identifiers, confirmDelete, source, newName, folder | Copy a document into a pack by UUID. |

## `journals`

Journals and quests: read, search, write pages, and build quest journals.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `list` | read | all | filterQuests, includeContent, journalId, pageId | List journals and their pages, or read one journal or page. |
| `search` | read | all | **searchQuery**, searchType | Search through all pages of all journal entries for specific content or keywords. |
| `create-quest` | write | all | **questTitle**, **questDescription**, questType, difficulty, location, questGiver, npcName, rewards, additionalPages, folderName | Create a new quest journal entry with AI-generated content based on natural language description |
| `update-quest` | write | all | **journalId**, **newContent**, **updateType**, pageId, newPageName | Update an existing quest journal with new progress information. |
| `link-quest` | write | all | **journalId**, **npcName**, **relationship** | Link an existing quest journal to an NPC in the world |
| `replace-page` | write | all | **journalId**, **pageId**, **newContent**, newPageName | Replace the ENTIRE content of a specific journal page. |
| `create-dashboard` | write | all | **campaignTitle**, **campaignDescription**, **template**, customParts, defaultQuestGiver, defaultLocation | Create a comprehensive campaign dashboard journal with navigation, progress tracking, and part management |

## `chat`

Speak as an actor and ask players to roll.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `post` | write | all | actorIdentifier, tokenId, **content**, language, chatLog, whisperTo | Speak an in-character line as an actor or a specific token: a floating speech bubble over the token (the default), a real chat-log message, or a whisper to named players. |
| `request-rolls` | write | all | **rollType**, **rollTarget**, **targetPlayer**, **isPublic**, **userConfirmedVisibility**, dc, rollModifier, flavor, advantageMode | Request dice rolls from players with interactive buttons. |
| `get-messages` | read | all | limit, since, beforeId, actor, kinds, rollsOnly, includeText, textLength | Read the Foundry chat log as structured events (GM view, includes whispers), oldest first, so you can tell what happened and who did it. |
| `post-rich` | write | all | **content**, speaker, whisperTo, style | Post a chat message as the GM. |
| `gm-roll` | write | all | formula, sceneIdentifier, targets, rollType, key, advantageMode, visibility, flavor | Roll hidden from the players. |
| `list-tables` | read | all | search | List the roll tables of the world and of compendiums. |
| `roll-table` | write | all | **table**, visibility | Draw from a roll table. |

## `combat`

The combat tracker of a scene: read it, run it, and apply damage or healing.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `status` | read | all | sceneIdentifier | Round, turn and combatants with initiative, HP, AC and state. |
| `add` | write | all | targets, include, sceneIdentifier | Put tokens into the combat; creates the combat if there is none. |
| `remove` | write | all | **targets**, sceneIdentifier | Take tokens out of the combat. |
| `roll-initiative` | write | all | who, targets, sceneIdentifier | Roll initiative as a GM roll. |
| `set-initiative` | write | all | **targets**, **initiative**, sceneIdentifier | Set the initiative of tokens. |
| `begin` | write | all | sceneIdentifier | Start round 1. |
| `next-turn` | write | all | sceneIdentifier | Advance to the next turn. |
| `previous-turn` | write | all | sceneIdentifier | Go back one turn. |
| `next-round` | write | all | sceneIdentifier | Advance to the next round. |
| `previous-round` | write | all | sceneIdentifier | Go back one round. |
| `defeated` | write | all | **targets**, defeated, sceneIdentifier | Mark tokens defeated (defeated=false undoes it). |
| `end` | delete | all | sceneIdentifier | End the combat by deleting it. |
| `apply-damage` | write | all | sceneIdentifier, **targets**, **amount**, type, multiplier, allMatches | Apply damage or healing to tokens (dnd5e or pf2e). |

## `time`

The real-time clock of Simple Calendar Reborn, run in the primary GM browser. Needs that module.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `status` | read | all | (none) | Whether the clock is started, paused or stopped. |
| `start` | write | all | (none) | Start the clock; it stays paused while the game is paused or a combat runs. |
| `pause` | write | all | (none) | Pause the clock. |
| `stop` | write | all | (none) | Stop the clock. |

## `folders`

Folders in the world sidebar or inside a compendium pack, addressed by "Parent/Child" paths.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `list` | read | all | path, documentType, pack, newName, newParentPath, deleteContents, confirmDelete | List the folder tree of a document type, or of a pack. |
| `create` | write | all | path, documentType, pack, newName, newParentPath, deleteContents, confirmDelete | Create a folder at a path; missing parents are created. |
| `rename` | write | all | path, documentType, pack, newName, newParentPath, deleteContents, confirmDelete | Rename a folder in place. |
| `move` | write | all | path, documentType, pack, newName, newParentPath, deleteContents, confirmDelete | Move a folder under another parent (null for the root). |
| `delete` | delete | all | path, documentType, pack, newName, newParentPath, deleteContents, confirmDelete | Delete a folder; its contents move up unless told otherwise. |

## `media`

Bring local files into the world.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `upload-image` | write | all | **path**, subfolder, filename | Upload a local image file (on the machine running this MCP server) into the active Foundry world, returning the Foundry-relative path to use as an actor portrait (manage-actors img), a prototype-token image (manage-actors tokenImg), or a placed token's image (update-token img). |

## `macros`

Foundry macros and scripts. Running code is off unless a GM switches on "Allow script and macro execution" in the module settings; every run is whispered to the GM as a chat card.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
| `list` | read | all | search | List macros, optionally filtered by name. |
| `get` | read | all | **macro** | Read one macro with its source. |
| `create` | write | all | **name**, command, type, img, folder | Create a macro. |
| `update` | write | all | **macro**, name, command, img, folder | Change a macro. |
| `delete` | delete | all | **macro** | Delete a macro. |
| `execute` | execute | all | **macro**, args, timeoutMs | Run a macro in the GM browser; returns its result, logs and errors. |
| `run-script` | execute | all | **code**, args, timeoutMs | Execute JavaScript (an async function body) in the GM browser with the Foundry API (game, canvas, CONFIG, foundry, ui) and an `args` object in scope. |

## `image-generation`

Generate images such as maps with ComfyUI. Off unless a GM switches it on in the module settings.

| Action | Risk | Game system | Parameters | Does |
| --- | --- | --- | --- | --- |
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
| `get-character-entity` | actors `get-entity` | - |
| `list-characters` | actors `list` | - |
| `use-item` | items `use` | - |
| `manage-world-items` | items `list` | action: list |
| `manage-world-items` | items `get` | action: get |
| `manage-world-items` | items `create` | action: create |
| `manage-world-items` | items `update` | action: update |
| `manage-world-items` | items `add-to-actor` | action: add-to-actor |
| `manage-world-items` | items `remove-from-actor` | action: remove-from-actor |
| `manage-world-items` | items `system-notes` | action: describe |
| `search-character-items` | actors `search-items` | - |
| `search-compendium` | compendium `search` | - |
| `get-compendium-item` | compendium `get` | - |
| `list-creatures-by-criteria` | compendium `find-creatures` | - |
| `list-compendium-packs` | compendium `list-packs` | - |
| `get-current-scene` | scenes `current` | - |
| `get-world-info` | world `info` | - |
| `update-scene-music` | scenes `set-music` | - |
| `create-actor-from-compendium` | actors `create-from-compendium` | - |
| `get-compendium-entry-full` | compendium `get` | full data is the default; `entryId` is now `itemId` |
| `manage-actors` | actors `create` | action: create |
| `manage-actors` | actors `update` | action: update |
| `manage-actors` | actors `delete` | action: delete |
| `manage-actors` | actors `place` | action: place |
| `manage-actors` | actors `update-items` | action: update-items |
| `manage-actors` | actors `delete-items` | action: delete-items |
| `manage-actors` | actors `system-notes` | action: describe |
| `manage-effects` | effects `create` | action: create |
| `manage-effects` | effects `update` | action: update |
| `manage-effects` | effects `delete` | action: delete |
| `create-dsa5-character-from-archetype` | actors `create-from-archetype` | - |
| `list-dsa5-archetypes` | actors `list-archetypes` | - |
| `import-dsa5-actor-from-json` | actors `import-json` | - |
| `dnd5e-add-feature` | actors `add-feature` | - |
| `dnd5e-create-npc` | actors `create-npc` | - |
| `dnd5e-add-features-from-compendium` | actors `add-features-from-compendium` | - |
| `create-quest-journal` | journals `create-quest` | - |
| `link-quest-to-npc` | journals `link-quest` | - |
| `update-quest-journal` | journals `update-quest` | - |
| `replace-journal-page` | journals `replace-page` | - |
| `list-journals` | journals `list` | - |
| `search-journals` | journals `search` | - |
| `create-chat-message` | chat `post` | - |
| `request-player-rolls` | chat `request-rolls` | - |
| `create-campaign-dashboard` | journals `create-dashboard` | - |
| `assign-actor-ownership` | actors `set-ownership` | - |
| `remove-actor-ownership` | actors `remove-ownership` | - |
| `list-actor-ownership` | actors `list-ownership` | - |
| `wfrp4e-update-actor` | actors `wfrp4e-update` | - |
| `wfrp4e-add-items` | items `add-wfrp4e` | - |
| `move-token` | tokens `move` | - |
| `update-token` | tokens `update` | - |
| `delete-tokens` | tokens `delete` | - |
| `get-token-details` | tokens `get` | - |
| `toggle-token-condition` | effects `toggle-condition` | - |
| `get-available-conditions` | effects `list-conditions` | - |
| `generate-map` | image-generation `generate` | - |
| `check-map-status` | image-generation `status` | - |
| `cancel-map-job` | image-generation `cancel` | - |
| `list-scenes` | scenes `list` | - |
| `switch-scene` | scenes `activate` | - |
| `manage-playlists` | playlists `list` | action: describe |
| `manage-playlists` | playlists `create` | action: create |
| `manage-playlists` | playlists `update` | action: update |
| `manage-playlists` | playlists `delete` | action: delete |
| `control-playlist` | playlists `control` | - |
