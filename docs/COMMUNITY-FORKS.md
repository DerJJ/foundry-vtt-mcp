# Community fork integration

This fork combines the upstream project ([adambdooley/foundry-vtt-mcp](https://github.com/adambdooley/foundry-vtt-mcp), MIT, Copyright (c) 2025 Adam Dooley) with work from other forks of it. All code stays under the MIT license. Git history is preserved: whole forks were merged where possible, and everything else was ported by hand with the original author set as the commit author and the source commit linked in the message.

Scanned on 2026-11-01: 101 forks, 34 of them ahead of upstream. Rescanned on 2026-11-07 (104 forks), see [Rescan 2026-11-07](#rescan-2026-11-07). Upstream v0.8.6 was merged on 2026-11-07; the only conflict was the import list in `backend.ts`.

The fork is being restructured into its own 1.0; see [redesign/PLAN.md](redesign/PLAN.md) and [redesign/HANDOFF.md](redesign/HANDOFF.md). The backlog below still applies, and most items land in a phase of that plan.

## What was taken

| Source                                                              | How                               | What                                                                                                                                                                         |
| ------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [flownzu](https://github.com/flownzu/foundry-vtt-mcp)               | merged (full history)             | `combat`, `apply-damage`, `party-status`, `gm-roll`, `roll-table`, `post-chat`, `scene-view`, `creature-card`, plus calendar-clock and scene-builder tools                   |
| [KillgoreAlpha](https://github.com/KillgoreAlpha/foundry-vtt-mcp)   | merged (full history)             | `manage-compendiums`, `manage-compendium-entries`, `manage-folders`, `upload-image`, `tokenImg` and folder paths in `manage-actors`, optional features in `dnd5e-create-npc` |
| [ErikGenibo](https://github.com/ErikGenibo/foundry-vtt-mcp)         | ported (commits 091a025, 7dc7f14) | `execute-script`; PF2e strikes and item use run on the token's actor                                                                                                         |
| [khelbenlaforge](https://github.com/khelbenlaforge/foundry-vtt-mcp) | ported (commit 29a7472)           | `get-permissions`                                                                                                                                                            |

Added on top by this fork, building on the above:

- `manage-macros` (list / get / create / update / delete / execute).
- Guard rails for everything that runs code: the world setting **Allow script and macro execution** (off by default) gates `execute-script` and `manage-macros execute`. Runs have a timeout, return captured console output, notifications and errors, and are whispered to the GM as a chat card. See `packages/foundry-module/src/script-runner.ts`.

## What was looked at and not taken

| Source                | Why not (yet)                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meltyas               | Mostly Daggerheart; the generic parts (world items) already exist upstream. `reload-foundry` and the hot-reload `dev-server.mjs` are developer conveniences only. |
| LudoBermejoES         | Refactored `data-access.ts` into many modules, so its commits no longer apply here. See the backlog for the three features worth porting by hand.                 |
| khelbenlaforge (rest) | Re-ported many upstream tools independently, so merging collides on 14 files. It also commits `dist/` bundles. See the backlog.                                   |
| ErikGenibo (rest)     | Old base, contains personal campaign data. Its tile tools and large "tool upgrades" commit overlap with other forks.                                              |
| All others            | Other game systems (DSA, WoD, Nimble, Daggerheart, PF1, ABF), D&D Beyond import, or modules this world does not use.                                              |

## Backlog

Things still worth a look or improvement for a PF2e + D&D 5e world. Roughly in priority order.

### Port by hand

1. **LudoBermejoES `a93a103`: compressed JSON wire format and no per-document ceiling.** Likely fixes large-actor transfers.
2. **LudoBermejoES `233ab3b`: `callModuleApi` and Combat lifecycle.** Chat reads are done: `get-chat-messages` was rewritten here.
3. **LudoBermejoES `7658e3c`: callers can put flags on items they create.** Needed for PF2e Merchant flags.
4. **khelbenlaforge `656756f`, `76a803d`: `get-character` and `get-character-entity` timeout fixes for large actors.** Upstream may already have fixed this since; test with a big PF2e actor first.
5. **khelbenlaforge `6a082d2`: `set-token` / `refresh-from-source` for `manage-actors`.**
6. **khelbenlaforge `6e0a8e7`, `429ca98`: `manage-compendiums` with set-lock, delete-entries, export.** Overlaps KillgoreAlpha's tool of the same name; compare and merge the features rather than replace.
7. **ErikGenibo `3f7fae4`: tile tools** (the handoff needs Tiles with module flags). `manage-scene` from flownzu/upstream may cover part of it; check `list-documents` for Tiles first.

### Connection and setup (from the handoff, section 2)

- **tonancheta**: opt-in HTTP MCP transport with token auth. Fits a Claude-on-server, browser-on-notebook setup much better than a port forward.
- **bdbarrey, Marvetastic**: backend start-up races, reconnects, keep-alive. Review before relying on long sessions.
- Release ZIP does not contain `backend.bundle.cjs`; WebRTC chosen on HTTPS; no CSP hint; no `bridge-status` tool.

### Needs review before trusting

- **Dialogs**: the handoff's PF2e pitfalls (special-ammo and ChoiceSet pickers block the GM client, PF2e Merchant `createItem` merging, kits expanding) are not handled by any fork. `execute-script` only reports a timeout.
- **Dry-run** support for destructive tools is still missing.
- **Docs**: README lists upstream's 50 tools, not the fork's ~70. `INSTALLATION.md` needs the script-execution setting explained. The redesign plan generates the tool list from the registry instead.
- **Version**: all packages say 0.8.6 (upstream's). The redesign plan starts this fork's own versioning at 1.0.0.

### Not tested in a live Foundry

Builds, type checks, 290 server tests and 121 module tests pass (2026-11-07, after the upstream v0.8.6 merge), and the MCP schema smoke test passes. None of the merged or ported tools were run against a real Foundry instance. Before relying on them, try each in a throwaway world, starting with the script guard (setting off must refuse; setting on must run and whisper a card).

### Removed as duplicate

- KillgoreAlpha's `manage-scenes` was removed: `manage-scene` already creates and updates scenes and also handles embedded documents (walls, lights, tiles, notes, tokens). Lost with it: deleting a whole scene and the friendlier wall/background validation. Activating a scene is still `switch-scene`.

- flownzu's `run-macro` was removed: `manage-macros` (list / execute) does the same and returns args, logs and errors as well.

### Open after the chat rewrite

- `use-item` and `request-player-rolls` were fixed for PF2e (see the changelog) but only against fake actors. Check on a live world: casting a prepared and a spontaneous spell (slot spent, card posted), and a requested Stealth check with a DC.
- `use-item` still opens D&D 5e's item dialog every time, although the server defaults `skipDialog` to true; the module ignores it. `waitMs` only helps once the GM confirms.
- `request-player-rolls` with rollType `attack` rolls a flat d20 on both systems; initiative on PF2e uses the initiative statistic or perception.
- `request-player-rolls` puts the agent-supplied flavor and labels into chat HTML without escaping.
- Not verified: PF2e `SpellcastingEntry#cast` options (`rank`, `slotId`, `consume`, `message`), and whether `createMessage: false` is honoured by `Statistic#roll` for `gm-roll` with visibility none.

### Duplicates left after the upstream v0.8.6 merge

- `post-chat` (flownzu) and `create-chat-message` (upstream) both post chat as an actor. `create-chat-message` adds bubbles, a `tokenId`, Polyglot and strict whisper targets; `post-chat` adds rich HTML, `ooc`/`emote` style and whispers by character name. The redesign merges them into `chat.post`.
- `get-compendium-item` and `get-compendium-entry-full` both read one compendium entry in full.
- `list-creatures-by-criteria` is a creature-filtered `search-compendium`.
- `assign-actor-ownership`, `list-actor-ownership`, `remove-actor-ownership` (and `get-permissions`) could be one tool.

## Rescan 2026-11-07

Method: GitHub's compare API (`adambdooley:master...<owner>:master`) for every fork pushed since August 2026 that was not reviewed on 2026-11-01. About 70 of the 104 forks have no commits of their own. The unauthenticated API allows 60 requests per hour, so tanis90 and RasmusBMN-Git were judged from their first 12 commit titles only. Nothing below was read as code except webmaster94.

### Worth porting or reading (PF2e and D&D 5e relevant)

| Fork                                                              | What                                                                                                                                                                                                                                                        | Where it fits                                                                                                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [webmaster94](https://github.com/webmaster94/foundry-vtt-mcp)     | Operation read/write classification, document registry with risk levels, undo (`transaction-manager.ts`), capability handshake, audit log in world settings, batch operations, dry-run, persistent backend daemon (fewer idle disconnects), console capture | Redesign phases 1 and 4; read as reference, port as concepts. Not a merge base: same upstream core, 113 commits behind, adds an Electron desktop app. Remote `webmaster94` is set up. |
| [RasmusBMN-Git](https://github.com/RasmusBMN-Git/foundry-vtt-mcp) | `wait_for_turn` long-poll on a combat-turn hook; NPC combat verbs (enroll, initiative, apply damage, advance turn, move, conditions)                                                                                                                        | After 1.0: `combat.wait-for-turn`. Check whether the NPC verbs are tied to one system.                                                                                                |
| [tanis90](https://github.com/tanis90/foundry-vtt-mcp)             | Token-first combat tools, targeted item use, combat control and chat QA tools, damage application reporting                                                                                                                                                 | Compare with `combat` and `use-item` when porting the combat category                                                                                                                 |
| [iCaptainNemo](https://github.com/iCaptainNemo/foundry-vtt-mcp)   | Scene screenshot and background tools, combatant management, native rolls, player-character creation, music index with `suggest-music`                                                                                                                      | After 1.0: `scene.screenshot`                                                                                                                                                         |
| [garr71](https://github.com/garr71/foundry-vtt-mcp)               | PF2e-focused port plan to Foundry v14; documents a PF2e roll-modifier defect; re-ported `get-combat-tracker`                                                                                                                                                | Read its docs in phase 0 (the live world runs Foundry v14)                                                                                                                            |

### Small and cheap

| Fork                                                                                      | What                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [JamCOCA](https://github.com/JamCOCA/foundry-vtt-mcp) `a78c698`                           | `dnd5e-add-feature` schema accepted by Gemini function calling (no empty-string or numeric enums)                                                                           |
| [frankyh75](https://github.com/frankyh75/foundry-vtt-mcp) `27ff144`, `0cf3368`, `9668fa7` | Scene delete (lost when `manage-scenes` was removed); registers an `addActorItems` handler that upstream defined but never registered (check whether ours has the same bug) |
| [dgroo](https://github.com/dgroo/foundry-vtt-mcp) `fcce24a`                               | `create-journal-entry`, verbatim JournalEntry writes                                                                                                                        |
| [edwinmillan](https://github.com/edwinmillan/foundry-vtt-mcp) `ebf42de`                   | Calendaria calendar-module integration (only if that module is used)                                                                                                        |
| [edoren](https://github.com/edoren/foundry-vtt-mcp)                                       | Docker image and HTTP transport via supergateway (compare with tonancheta's HTTP transport)                                                                                 |

### Skipped

Other systems (edwinmillan's Fate and Anima, hermes90201's Black Flag, scardrail's Hakaï Kōsen, frankyh75's DSA5, AlbertF0, folken88's PF1), derekb110 (tools for one custom module), StuartJAtkinson (D&D Beyond import), maeinomatic (typing and CI refactors on an old base; ideas only), arhohenschuh (coordinate-aware placement written by a bot; revisit if token placement becomes a problem), craanix and CaesarIV (single large commits overlapping existing tools).
