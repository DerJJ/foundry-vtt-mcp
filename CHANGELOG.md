## v1.0.0 (unreleased)

This is a fork of [adambdooley/foundry-vtt-mcp](https://github.com/adambdooley/foundry-vtt-mcp) v0.8.6, reworked and extended; see [docs/CREDITS.md](docs/CREDITS.md) for the original author, the contributors and the community forks whose work was ported.

**Upgrading from v0.8.6:** the 50 tools are replaced, with no aliases. The table in [docs/TOOLS.md](docs/TOOLS.md#migration-from-the-50-tools-of-v086) shows where every old tool went. Check the new world setting "Access level" (default: Read & write); the old "Allow Write Operations" is gone and is not carried over.

### Breaking

- **50 tools became 10 domain tools** (`world`, `scenes`, `playlists`, `effects`, `tokens`, `items`, `actors`, `compendium`, `journals`, `chat`) plus `image-generation`. Each takes `{ "action", "params" }`; `describe` returns the parameters of an action, or the actions of the world's game system. The tool descriptions and schemas a client loads shrink from about 75,000 to about 13,000 characters. System-specific actions (D&D 5e NPCs and features, WFRP4e, DSA5) are no longer listed; they appear in `describe` when the world uses that system. The old tool names are gone with no aliases: [docs/TOOLS.md](docs/TOOLS.md) maps every old tool to its new tool and action. See ADR-0004.
- **Access level replaces "Allow Write Operations".** One world setting, _Read only_, _Read & write_ (default) or _Full access_. Deleting needs Full access, which the old setting never asked for. Script and macro execution has its own checkbox, off by default. See ADR-0005. Change it under Module Settings, Foundry MCP Bridge.
- **Image generation (ComfyUI) is off by default.** Switch it on under Module Settings. The tool is always listed and refuses while the setting is off.
- **One chat post.** `chat` `post` and `post-rich` are now one action. `post` speaks as an actor or token (bubble, chat log or whisper, as before); without a speaker the message is from the GM. `html: true` keeps HTML in the text (off by default: HTML is escaped), and `style` (`ic`, `ooc`, `emote`) sets the kind of chat-log message. `post-rich`'s `speaker` is now `actorIdentifier`.
- **One compendium read.** `get-compendium-item` and `get-compendium-entry-full` both read one pack entry through the same bridge query; they are now `compendium` `get` (`packId`, `itemId`, `compact`). Full data is the default, as before for `get-compendium-item`; `entryId` is now `itemId` and the decorative summary line of the old entry tool is gone.
- `list` actions take `limit` (default 50) and `offset` and return `total` and `hasMore`.

### Added (ported from community forks, authors kept in the git history)

- **Running the table** (flownzu): `combat` (status, add, remove, roll and set initiative, begin, turns and rounds, defeated, end) and `apply-damage` for dnd5e and pf2e, `actors.party-status`, `actors.creature-card`, `chat.gm-roll`, `chat.list-tables`, `chat.roll-table`, and the rich message options of `chat.post`, `scenes.ping`, `pull-players`, `reset-fog`, `set-weather`, `list-weather`.
- **Scene building and time** (flownzu): `scenes.create`, `update`, `create-documents`, `update-documents`, `delete-documents`, `list-documents`; `time` for the Simple Calendar Reborn clock.
- **Chat, rolls and spells** (DerJJ, with flownzu): `chat.get-messages` reads the chat log with structured roll results; `items.use` and `chat.request-rolls` wait for the chat messages they create; PF2e modifiers and spells cast through their spellcasting entry; spell DC and attack on PF2e and dnd5e characters.
- **Folders, compendium management and uploads** (KillgoreAlpha): `folders.*` addressed by "Parent/Child" paths, `compendium.packs`, `create-pack`, `delete-pack`, `list-entries`, `create-entries`, `update-entries`, `delete-entries`, `copy-entry`, `media.upload-image`, `tokenImg` and folder paths in `actors.update`, and the optional `features` array of `actors.create-npc`.
- **Every kind of compendium entry** (DerJJ): `compendium.get` formats journals (the text of every page), roll tables (formula and results), scenes, macros, playlists, cards and adventures instead of returning an empty description, and `compendium.import` imports any entry into the world with all its data, optionally into a folder path. Adventures are refused; they import through Foundry. Checked live (`npm run test:live`) on a PF2e and a D&D 5e world.
- **Scripts and macros** (ErikGenibo for `execute-script`, DerJJ for the macro actions): `macros.*`. Every run is whispered to the GM as a chat card. They have the `execute` risk and need the "Allow script and macro execution" checkbox, which replaces the fork's `allowScriptExecution` setting (a world that had it on must switch it on again).
- **World permissions** (khelbenlaforge): `world.permissions`.
- **Several backends at once** (KillgoreAlpha): `FOUNDRY_MCP_CONTROL_PORT` gives a second backend its own control port and lock file. Queries take a per-call timeout, the server survives an abruptly closed control socket, and the bridge accepts server ports below 1024 (443 behind a TLS reverse proxy).

### Fixes

- **Playlists can be created** (`playlists` `create`). It failed on every system with `game.playlists.createDocuments is not a function` (#2).
- **PF2e effect creation** explains that PF2e models effects as items, instead of failing without a reason (#3).
- **Switching worlds** no longer leaves tools behaving as the previous game system; the server forgets the detected system when the bridge reconnects (#4).
- The server's WebRTC signalling port is closed when the connector stops, and can be set with `FOUNDRY_WEBRTC_SIGNALING_PORT` (default 31416).

### Internal

- **Restructure, no behaviour change.** The tool list (50 tools) and the bridge's query names are identical to v0.8.6; a golden snapshot of both is now tested. The server routes tool calls through a `ToolRegistry` instead of a `switch`, and `backend.ts` is split into focused modules under `src/backend/`. In the bridge, the 12,000-line `data-access.ts` becomes services by category, the 2,300-line `queries.ts` becomes query groups published by a `QueryRegistry`, and per-system helpers move under `systems/<id>/`. See `docs/ARCHITECTURE.md` and `docs/adr/`. The internal handle `window.foundryMCPBridge.dataAccess` now exposes the services as properties (`dataAccess.characters.getCharacterInfo(...)`); the old flat calls (`dataAccess.getCharacterInfo(...)`) still work, with a one-time deprecation warning in the console.
- New smoke test `npm run test:backend:smoke` starts the built backend and checks its control channel against the golden tool list.
- Tests: about 270 new unit tests, contract tests that every tool and query must satisfy, per-folder coverage floors (`npm run test:coverage`, run on pull requests by `.github/workflows/tests.yml`), and `scripts/export-fixtures.macro.js` to capture fixtures from a live world.

## v0.8.6 (2026-11-04)

### New Features

- **`create-chat-message`** (#114) — speak an in-character line as an actor, or as a specific token when several share one actor: a speech bubble over the token (the default), a chat-log message, or a whisper to named players. Supports Polyglot languages when that module is active. The line is always plain text, every whisper target must match exactly one user, and it needs Allow Write Operations.

- **DSA5 character import from JSON** (#92) — `import-dsa5-actor-from-json` creates a DSA5 actor from a Dark Aid export, an Optolith-style or custom DSA5 JSON, or a raw Foundry actor export, passed inline or as a `.json` / `.tdc` file (10 MB limit). Re-importing with `updateExisting` updates the existing actor, its items and effects instead of creating a duplicate. Item matching against compendiums currently works in German-language worlds only. DSA5 worlds only.

### Fixes

- **`toggle-token-condition` and `get-available-conditions` in PF2e and dnd5e** (#88, fixed in #130) — PF2e replaces Foundry's status effect list with an object, so both tools threw in PF2e worlds; and even past that, adding a PF2e condition did nothing because PF2e conditions are Items. On dnd5e, removing a condition deleted any effect that merely included it, so removing Incapacitated also deleted a Paralyzed effect. Conditions are now added and removed through Foundry's own `toggleStatusEffect`, which each system implements correctly. DSA5 behaves as before.

- **Enhanced Creature Index skipped packs with non-Latin1 labels** (#127) — the pack checksum used `btoa()`, which throws on characters such as Cyrillic or CJK, so any Actor pack with a localized label (e.g. `# Чудовища том 1`) was silently left out of the index and the persisted index was never considered valid. The label is now UTF-8 encoded before hashing.

- **dnd5e `size` filter in `list-creatures-by-criteria` never matched** (#127) — the index stores dnd5e's short size keys (`sm`, `med`, `lg`, `grg`) while the tool accepts full words; both sides are now normalized before comparing. Results from the index also report the creature's real size instead of always `medium`.

- **Windows installer didn't configure Claude Desktop in third-party mode** (#124, fixed in #129) — Claude Desktop set up to use Claude through AWS Bedrock or Google Vertex AI reads its config from `%APPDATA%\Claude-3p\`, which the installer never wrote. It now also configures that folder when it exists; standard installs are unaffected.

## v0.8.5 (2026-10-17)

### New Features

- **`manage-world-items` gains `get`** (#116, fixed in #119) — read one world-level Item in full (description, system data, rules) by id or exact name. World items could previously be created, listed and updated but never read back. An ambiguous name is refused with the candidate ids rather than guessed.

- **`get-character` can read an unlinked token's own state** (#111, #113) — pass a token ID or token UUID to get that token's effective stats and effects, such as a summon or one copy of a shared NPC, rather than the base actor's

- **PF2e languages in `get-character`** (#112) — `stats.languages` lists the actor's language slugs plus the sheet's free-text note; omitted when the actor has none

### Fixes

- **Security: bridge queries are only accepted from GM users** (#121) — the GM check on the module's query handlers now applies to the user who sent the request, not only to the client running it. Updating is recommended.

- **PF2e rule elements and ActiveEffect changes were missing their `key`** (#119) — the data sanitizer stripped every field named `key`, so rule element types (such as `FlatModifier`) and effect change paths were absent from `get-character`, `get-character-entity` and `get-compendium-entry-full`

- **dnd5e Activity save configuration and Advancement data were dropped** from detailed item and compendium reads (#110)

### Docs

- **Manual install config instructions corrected** (#120) — add the `foundry-mcp` entry inside an existing `mcpServers` object rather than pasting a second top-level block, and `FOUNDRY_HOST` / `FOUNDRY_PORT` are no longer shown, since the host is unused and the port must match the bridge's

## v0.8.4 (2026-09-12)

### New Features

- **Scene music tools** (Closes #93)
  - `get-current-scene` and `list-scenes` now include each scene's music binding (`playlist` / `playlistSound` with ids + names)
  - `update-scene-music`: set or clear the binding by id or unique name; writes through `scene.update()` with the core `playlist` / `playlistSound` fields so it syncs to connected clients without a reload. Validates both ids exist before writing; a sound cannot be bound without its parent playlist.

- **Playlist management + playback tools**
  - `manage-playlists` (`create` | `update` | `delete` | `describe`): playlist CRUD on any system; `create` accepts sounds inline (`path` required, plus `name`, `volume`, `repeat`, `fade`); `update` patches playlist fields and/or individual sounds matched by exact id or unique path/name within the playlist; `delete` matches by exact id or name only, never partial; `describe` with no identifier lists all playlists compactly, with an identifier returns the full document including every sound
  - `control-playlist`: `play` (playAll), `stop` (stopAll), `cycle-mode` (sequential -> shuffle -> soundboard), plus per-sound `play-sound` / `stop-sound` - all through the client Playlist API so the server and every connected client stay in sync
  - Both are GM-only (same silent GM validation as every other bridge tool) and system-agnostic

- **ActiveEffect management** (#102)
  - `manage-effects` (`create` | `update` | `delete`): works on effects owned by an actor or by one of its items, with the parent scoped so an effect cannot be mutated through the wrong one
  - `search-character-items` with `type: "effect"` now covers item-owned effects as well as actor-owned ones, each tagged with `scope`, `parentItemId` and `parentItemName`
  - `get-character-entity` resolves items, actor-owned effects and item-owned effects, returning the complete document
  - Items are serialised from `item.toObject()`, so dnd5e Activity data is preserved rather than dropped

- **DSA5 system support** (#81)
  - DSA5 adapter with `normalizePayload` / `describeActorSchema`, plus system detection
  - New `replace-journal-page` tool

- **`manage-actors` gains `place`** (#85) — place existing world actors onto the current scene, rather than only newly created ones

- **Information notifications setting** (#99) — Foundry-side notifications can now be turned off; on by default

### Fixes

- **`use-item` failed outright on Foundry V13/V14** (#105) — it called `game.user.updateTokenTargets`, which is not a supported public API on those versions, so passing `targets` (including `"self"`) aborted the whole operation. Targeting now goes through `Token#setTarget()`, resolves token ids, token names and actor names, and no longer aborts item use when a target cannot be applied — the result reports what succeeded.

- **Windows installer could destroy an existing ComfyUI install on upgrade** (#103) — upgrades now detect a prior installation via `InstallLocation`, a legacy `UninstallString`, or the historical default path; reuse that directory; skip the directory page; and leave an existing ComfyUI directory untouched. `DisplayVersion` is derived from the build rather than hardcoded, and `UninstallString` is written quoted.

- **Large responses timed out over WebRTC** (#89, fixed in #101) — the data channel was created with `maxRetransmits`, making it only partially reliable, so a dropped chunk left the receiver waiting forever for something that would never arrive. The channel is now fully reliable, chunks are paced against the send buffer instead of being dumped into SCTP at once, and a failed reassembly now rejects the waiting query instead of surfacing as a generic timeout.

- **Five defects in `dnd5e-add-feature`** (#91) — stale skill and ability defaults among them

- **Journal page rename** (#95, fixed in #100)

- **`list-dsa5-archetypes` returned nothing** (#77, fixed in #83) — the tool called a `getPackIndex` query that was never registered on the module, and each failure was swallowed, so it reported success with an empty list

- **Scene background lost after `generate-map`** (#79)

- **Map job deduplication ignored the scene name** (#80, fixed in #84) — two jobs differing only by scene name collapsed into one

- **WebSocket loopback regression** (#74, fixed in #82) — `ws://` is used for loopback hosts even on HTTPS pages

- **Module settings CSS leaked** (#97) — `.form-footer` rules are now scoped to the module's own settings forms

### Internal

- Version consistency is now checked in CI across all five manifests (#72), guarding against the drift behind #69
- Release-notes tool count and system list corrected (#71)

## v0.8.3 (2026-08-09)

### New Features

- **Mongoose Traveller 2e (mgt2e) System Support**
  - `list-creatures-by-criteria` now works on mgt2e worlds: filters by hit points, psionics, creature type, and actor type; indexed metadata includes characteristic DMs (STR/DEX/etc.)
  - `search-compendium` extracts mgt2e-relevant stats (hits, behaviour, species, tonnage) from search results
  - `manage-world-items` gains a new `describe` action that returns a live enum reference for mgt2e item fields (weapon traits, scales, armour forms, hardware system discriminators, software classes, etc.) — call it before creating items to get valid keys

- **`manage-actors` — generic actor CRUD tool** (works on any game system)
  - `create`: create one or more actors of any type with arbitrary `system` data; mgt2e convenience: accepts skill shorthands (`{ pilot: 2 }`), lowercase characteristic keys, and `system.details` remapped to `system.sophont`
  - `update`: patch existing actors by ID; mgt2e skill shorthands normalised server-side (avoids Electron module-cache issue that prevented browser-side normalisation)
  - `delete`: delete actors by ID
  - `update-items`: update embedded items on an actor by item ID
  - `delete-items`: delete embedded items from an actor by item ID

### Fixes

- `getIndex()` now uses the return value rather than `pack.indexed` state, fixing compendium indexing on Foundry v13 where `pack.indexed` behaviour changed

---

## v0.8.2 (2026-06-07)

### New Features

- **D&D 5e NPC Creation Suite** (PR #41 by @LManfre)
  - `dnd5e-create-npc` — build a full NPC stat block from scratch (abilities, saves, skills, senses, AC/HP, CR)
  - `dnd5e-add-feature` — one tool with modes: `passive`, `save`, `attack`, `attack-with-save`, `aura`, `spellcasting`, `spells`
  - `dnd5e-add-features-from-compendium` — bulk-import features/spells from compendium packs
  - Targets the dnd5e activities data model (4.x/5.x)

- **WFRP4e (Warhammer Fantasy Roleplay 4e) System Support** (PR #53 by @nyoung)
  - Character extraction: 10 characteristics, wounds, fate/fortune, resilience/resolve, corruption, career/species/class, skills, and arcane/divine spellcasting
  - `get-character` / `list-characters` / `search-character-items` now work on WFRP4e worlds

### Fixes

- **macOS installer** (PR #54): the Claude Desktop config is now merged rather than overwritten, preserving any other configured MCP servers; more robust logged-in-user detection; postinstall scripts no longer abort on a non-critical failure; additional Foundry data-dir locations probed
- **Node 26 install failure** (Issue #51, reported by @frankyh75): removed the unused `better-sqlite3` dependency, which failed to build against Node 26's V8 ABI

---

## v0.6.2 (2025-12-03)

### New Features

- **Spellcasting Data Extraction** (Issue #14)
  - `get-character` now returns full spellcasting entries with spell lists
  - PF2e: Spellcasting entries with traditions, DC, attack, slots, prepared/expended status
  - D&D 5e: Class-based spellcasting with spell slots and prepared spells
  - DSA5: Zauber (spells), Liturgien, Zeremonien, Rituale with AsP/KaP tracking
  - **Spell Targeting Info**: Each spell now includes `range`, `target`, and `area` fields
    - D&D 5e: Range (Self/Touch/60 ft), target type (1 creature/self/area), area template
    - PF2e: Range, descriptive target, area type (emanation/cone/burst)
    - DSA5: Reichweite, Zielkategorie, Wirkungsbereich

- **Use Item Tool** (`use-item`)
  - Cast spells, use abilities, activate features, consume items
  - Works across systems: D&D 5e, PF2e, DSA5
  - Supports spell upcasting (D&D 5e)
  - Proper resource consumption (spell slots, charges, consumables)
  - GM-only with character targeting
  - **Target Selection**: Specify targets by name or use `["self"]` to target caster
    - Example: "Have Clark cast Magic Missile on the Goblin"
    - Example: "Have Vitch use a healing potion on himself"
    - Targets set via Foundry's targeting system before item use

- **Search Character Items Tool** (`search-character-items`)
  - Token-efficient item search within a character's inventory
  - Filter by type (weapon, spell, feat, equipment, etc.)
  - Filter by category (items, spells, features, all)
  - Text search across item names and descriptions
  - Returns compact results without full descriptions

---

## v0.6.1 (2025-12-03)

### New Features

- **DSA5 System Support** (PR #12 by @frankyh75)
  - Full SystemAdapter implementation for Das Schwarze Auge 5
  - Supports all 8 Eigenschaften (MU/KL/IN/CH/FF/GE/KO/KK)
  - LeP, AsP, KaP resource tracking
  - DSA5-specific filters: level, species, culture, size, hasSpells
  - DSA5IndexBuilder for creature compendium indexing
  - DSA5 character creation from archetypes

- **Token Manipulation Tools** (PR #13)
  - `move-token` - Move tokens with optional animation
  - `update-token` - Update visibility, disposition, size, rotation, elevation
  - `delete-tokens` - Bulk token deletion
  - `get-token-details` - Detailed token info with linked actor data
  - `toggle-token-condition` - Apply/remove status effects (prone, poisoned, etc.)
  - `get-available-conditions` - List system-specific status effects

- **Character API Optimization** (PR #9)
  - Lazy-loading: `get-character` now returns minimal item metadata (no descriptions)
  - New `get-character-entity` tool for on-demand full entity details
  - Removed 20-item limit - now returns ALL items
  - ~37% token reduction per character
  - PF2e: traits, rarity, level, actionType
  - D&D 5e: attunement status

### Improvements

- **Documentation** (PR #8)
  - Clarified search-compendium limitations (name-only search, heuristic filters)
  - Directed users to list-creatures-by-criteria for accurate filtering

---

## v0.4.17 (2025-09-09)

- Wrapper/backend architecture: convert MCP entry to a thin stdio wrapper that proxies to a singleton backend over `127.0.0.1:31414`.
- Backend singleton + lock: backend binds Foundry connector on `31415` and creates `%TEMP%\foundry-mcp-backend.lock`.
- Startup race fix: resolves Claude Desktop duplicate-start race by keeping wrappers alive and ensuring only one backend owns ports.
- Runtime stability: backend now bundled (`dist/backend.bundle.cjs`) and preferred by wrapper for reliable startup in installer environments.
- Shared package now emits JS + d.ts, ensuring runtime availability for both dev and installer.
- Logging: wrapper writes to `%TEMP%\foundry-mcp-server\wrapper.log`; backend logs to `%TEMP%\foundry-mcp-server\mcp-server.log`.
- Installer: enhanced staging to include full server `dist`, bundled wrapper `index.cjs`, bundled backend, and `node_modules/@foundry-mcp/shared`.
- Build scripts: added root convenience scripts (`build:release`, `bundle:server`, `installer:stage`); NSIS script accepts `--skip-download` and `--skip-nsis` for staging-only runs.

Notes

- No changes needed for CI; existing workflows continue to build bundles and the installer.
- Foundry MCP Bridge port remains `31415`. Control channel is `31414` (internal wrapper↔backend only).
