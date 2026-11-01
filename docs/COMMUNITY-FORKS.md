# Community fork integration

This fork combines the upstream project ([adambdooley/foundry-vtt-mcp](https://github.com/adambdooley/foundry-vtt-mcp), MIT, Copyright (c) 2025 Adam Dooley) with work from other forks of it. All code stays under the MIT license. Git history is preserved: whole forks were merged where possible, and everything else was ported by hand with the original author set as the commit author and the source commit linked in the message.

Scanned on 2026-11-01: 101 forks, 34 of them ahead of upstream.

## What was taken

| Source                                                              | How                               | What                                                                                                                                                                                          |
| ------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [flownzu](https://github.com/flownzu/foundry-vtt-mcp)               | merged (full history)             | `combat`, `apply-damage`, `party-status`, `gm-roll`, `roll-table`, `post-chat`, `scene-view`, `creature-card`, plus calendar-clock and scene-builder tools                                    |
| [KillgoreAlpha](https://github.com/KillgoreAlpha/foundry-vtt-mcp)   | merged (full history)             | `manage-scenes`, `manage-compendiums`, `manage-compendium-entries`, `manage-folders`, `upload-image`, `tokenImg` and folder paths in `manage-actors`, optional features in `dnd5e-create-npc` |
| [ErikGenibo](https://github.com/ErikGenibo/foundry-vtt-mcp)         | ported (commits 091a025, 7dc7f14) | `execute-script`; PF2e strikes and item use run on the token's actor                                                                                                                          |
| [khelbenlaforge](https://github.com/khelbenlaforge/foundry-vtt-mcp) | ported (commit 29a7472)           | `get-permissions`                                                                                                                                                                             |

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
2. **LudoBermejoES `233ab3b`: `callModuleApi`, chat-message reads, Combat lifecycle.** Chat reads are in the handoff's gap list. flownzu already has a chat read for `post-chat`; compare before porting.
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

- **Language**: flownzu's table tools use German error messages and comments. Fine for you, but translate or localise before sharing.
- **Overlap**: KillgoreAlpha's `manage-scenes` and the existing `manage-scene` are two tools doing similar things; consider merging or cross-referencing in the tool descriptions so the agent picks the right one.
- **Dialogs**: the handoff's PF2e pitfalls (special-ammo and ChoiceSet pickers block the GM client, PF2e Merchant `createItem` merging, kits expanding) are not handled by any fork. `execute-script` only reports a timeout.
- **Dry-run** support for destructive tools is still missing.
- **Docs**: README still says 49 tools and does not list the new tools. `INSTALLATION.md` needs the script-execution setting explained.
- **Version**: all packages still say 0.8.5. Decide on a version scheme for this fork (KillgoreAlpha used `-ig.N`).
- Untracked: `HANDOFF-macro-support.md` is not committed.

### Not tested in a live Foundry

Builds, type checks, 293 server tests and 52 module tests pass, and the MCP schema smoke test passes. None of the merged or ported tools were run against a real Foundry instance. Before relying on them, try each in a throwaway world, starting with the script guard (setting off must refuse; setting on must run and whisper a card).

### Removed as duplicate

- flownzu's `run-macro` was removed: `manage-macros` (list / execute) does the same and returns args, logs and errors as well.
