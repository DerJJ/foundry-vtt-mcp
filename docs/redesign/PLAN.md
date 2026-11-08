# Redesign plan: foundry-vtt-mcp 1.0

Status: draft for review. Nothing in here is built yet.

> **Revised 2026-11-07.** The redesign now runs as three stacked branches (see section 6), starting from upstream v0.8.6 and not from this branch. Where sections 2 to 5 describe a base, a tool count or a phase order, section 6 and section 7 win. Sections 3 to 5 remain the design target for the second iteration (tool unification). The ADRs live on the restructure branch `refactor/architecture`, in the worktree `../foundry-vtt-mcp-restructure`.

## 1. Goal

Turn the combined fork into a maintained product of our own, with:

- **One tool style.** Every tool is defined, named, validated, guarded and answered the same way.
- **Only what applies.** Tools for systems other than the one the world runs are not loaded.
- **Guard rails by default.** Tool categories are off until a GM switches them on. Destructive and code-running operations need their own extra switch.
- **Engineering, not accumulation.** Small modules, types at the boundaries, tests against realistic PF2e and D&D 5e data, and documented decisions.

Supported systems: **PF2e and D&D 5e**. Everything else is dropped from 1.0. The adapter interface stays open so a system can come back later as a self-contained package.

Target environment, from the live setup described in [FIELD-NOTES.md](FIELD-NOTES.md):

- **Foundry v14** (the live world runs v14.369 in Docker behind a reverse proxy, HTTPS only). Upstream targets v13. Which versions 1.0 supports is decision 6.
- **PF2e 8.6.1** with PF2e Merchant and the Abomination Vaults module. The D&D 5e world's versions still need recording.
- **Split machines.** The agent (Claude Code) runs on the server. The bridge runs in the GM's browser on a notebook and reaches the server through a VS Code port forward of 31415. This makes connection diagnostics and an HTTP transport matter more than upstream assumes.

## 2. Base: our branch, not webmaster94

We build on `integrate/community-forks` and port webmaster94's good ideas into it.

|                      | ours (`integrate/community-forks`)                                                                                          | webmaster94                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream             | v0.8.6, current                                                                                                             | 113 commits behind                                                                                                                                          |
| PF2e and D&D 5e work | spell DC/attack, casting, typed damage, chat log, roll requests                                                             | none of it                                                                                                                                                  |
| Tests                | ~410                                                                                                                        | thin on the module side (5 test files)                                                                                                                      |
| Architecture         | upstream's core (monolith `data-access.ts`, hand-registered `queries.ts`, switch dispatch); our additions in separate files | upstream's core as well; its newer features in separate service files (document, combat, audit, event, transaction, registry); plus an Electron desktop app |
| Licence              | MIT (Adam Dooley)                                                                                                           | MIT (Adam Dooley)                                                                                                                                           |

webmaster94 split its own new features into service files, which is the right direction, but the core it inherited from upstream is still the monolith and the switch, the same as ours. Neither branch has the target structure of section 3, so neither saves that work, and ours carries the newer upstream and the PF2e and D&D 5e code. webmaster94's service files serve as reference implementations for the following ideas, which we port as concepts and rewrite to fit the new structure:

- **Explicit operation classification.** Every handler is marked read or write, and unknown handlers are never assumed read-only (`shared/src/operation-safety.ts`). We make this part of each tool definition instead of a separate list.
- **Document registry.** Lists which document types may be changed, at what risk, and which embedded types each one has (`document-registry.ts`). This becomes the backing for the generic document tools.
- **Undo.** Changes are recorded per operation and can be rolled back (`transaction-manager.ts`). It is in-memory only there, and we keep it that way for 1.0.
- **Capability handshake** (`getCapabilities`). The server asks the module what it can do.
- **Audit log in world settings**, not world flags.
- **Batch operations** and **dry-run**.
- Later candidates: multi-server profiles, browser console capture for diagnostics.

We do not take the Electron desktop app, its installer stack, or its versions of tools we already have.

Credits: `docs/COMMUNITY-FORKS.md` keeps listing every source, and ported ideas name their origin in the commit message.

## 3. Target architecture

### 3.1 Layout

```text
shared/
  src/tool-contract.ts      tool definition types, result envelope, error codes
  src/categories.ts         category ids, risk levels, setting keys (single source)
packages/mcp-server/
  src/registry/             tool registry, dispatch, schema generation
  src/tools/<category>/     one folder per category: definition + handler + tests
  src/systems/{pf2e,dnd5e}/ server-side adapters (formatting, system-specific tools)
  src/connector/            WebSocket/WebRTC transport (moved, not rewritten)
packages/foundry-module/
  src/queries/registry.ts   query registry: name -> handler + risk metadata
  src/services/<category>/  replaces data-access.ts, split by category
  src/systems/{pf2e,dnd5e}/ module-side adapters (rolls, casting, damage, chat flags)
  src/guard.ts              the one place that decides whether a call is allowed
  test/fixtures/{pf2e,dnd5e}/ real actor/item/chat JSON exported from test worlds
```

### 3.2 One tool definition

Every tool is a single object. The JSON schema the client sees is generated from the zod schema, so the two cannot drift apart.

```ts
export const chatTool = defineTool({
  name: 'chat',
  category: 'chat',
  description: '...',
  systems: 'all', // or ['pf2e'] / ['dnd5e']
  actions: {
    read: { risk: 'read', input: ChatReadInput, timeoutMs: 10_000 },
    post: { risk: 'write', input: ChatPostInput, timeoutMs: 10_000 },
  },
  query: 'chat', // module query that serves it
});
```

- **Risk is per action**: `read`, `write`, `destructive` or `code`.
- **The timeout is per action** and is passed through to the connector. The 10-second bug from November cannot recur.
- **Dispatch is generic.** The registry validates the input, checks the guard, calls the module query with the action timeout, and wraps the result. There is no hand-written switch.

### 3.3 Tool style

Each tool is one **resource with an `action`** (for example `actor`, `scene`, `chat`, `roll`). Each action has its own flat input schema.

- **Identifiers.** Any reference to a document is a single `ref` string. It is resolved in this order: uuid, then id, then exact name. An ambiguous name is an error that lists the candidates, never a guess.
- **Results** always use the same envelope:

  ```json
  { "ok": true, "data": {...}, "warnings": [], "chatMessages": [], "undoId": "..." }
  { "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "hint": "..." } }
  ```

  `chatMessages` uses the structured chat-log format for every action that posts to chat, not only `use-item`.

- **Text.** All descriptions and messages are in English and follow one template: what the tool does, what each action does, and what it needs enabled.

This takes the catalogue from ~70 tools down to about 18 (see section 4). It also matches the `manage-*` tools that already work well.

### 3.4 Guard levels

These are world settings in the Foundry module, editable by a GM only. **The module is the authority**: it refuses a call whatever the server sends. The server reads the same settings during the handshake so that it does not offer tools that would be refused.

| Switch                               | Default                                  | Effect                                                                             |
| ------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Category on/off (one per category)   | read categories on, write categories off | an off category is not listed at all                                               |
| Allow write operations, per category | off                                      | `write` actions of that category                                                   |
| Allow destructive operations         | off                                      | every `destructive` action (delete, bulk replace, fog reset) in enabled categories |
| Allow script and macro execution     | off (exists today)                       | `code` actions: `script.run`, `macro.execute`                                      |
| Dry-run by default                   | off                                      | write actions report what they would change unless `confirm: true` is passed       |

When an action is not allowed, the server removes it from the tool's `action` enum. A tool with no allowed action disappears from the list entirely.

### 3.5 Loading only what applies

1. The server connects, then calls `capabilities`. The module returns the system id, system version, Foundry version, module version, guard settings, and which optional modules are active (Polyglot, Calendaria and so on).
2. The registry filters tools by system and guard, then sends `notifications/tools/list_changed`.
3. Setting changes in Foundry push a fresh `capabilities` message, and the tool list updates without a restart.

Before Foundry has connected, only `bridge-status` is listed. **This needs verifying:** that Claude Desktop and Claude Code both honour `tools/list_changed`. If one does not, the fallback is to list everything and refuse at call time with a clear error.

### 3.6 System adapters

All system-specific code lives in `systems/pf2e` and `systems/dnd5e`, behind one interface:

```text
character summary · statistic lookup (skill/save/perception) · roll request · gm roll
use item / cast spell · apply damage (typed) · party status · chat card parsing
```

A tool asks the adapter. It never checks `game.system.id` itself. The PF2e and D&D 5e code we wrote in the last weeks moves there almost unchanged. It is the most tested code we have.

## 4. Tool catalogue (draft)

The default listed here is the category on/off default. Write and destructive actions inside a category are always off by default.

| New tool         | Actions                                                                             | Replaces                                                                                                                                                            | Default            |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `bridge`         | status, capabilities, audit-log                                                     | get-world-info (part), get-permissions                                                                                                                              | on                 |
| `world`          | info, users, players                                                                | get-world-info, list-characters (part)                                                                                                                              | on                 |
| `actor`          | get, list, search-items, get-entity, party, create, update, delete, from-compendium | get-character, get-character-entity, search-character-items, list-characters, party-status, creature-card, manage-actors, create-actor-from-compendium              | on                 |
| `ownership`      | get, set, remove                                                                    | assign/list/remove-actor-ownership                                                                                                                                  | off                |
| `item`           | use, list-world, create, update, delete                                             | use-item, manage-world-items                                                                                                                                        | on                 |
| `effect`         | list-conditions, toggle-condition, create, update, delete                           | toggle-token-condition, get-available-conditions, manage-effects                                                                                                    | off                |
| `compendium`     | search, get, list-packs, find-creatures, create-pack, delete-pack, entries          | search-compendium, get-compendium-item, get-compendium-entry-full, list-compendium-packs, list-creatures-by-criteria, manage-compendiums, manage-compendium-entries | on                 |
| `scene`          | list, current, activate, view, ping, pull-players, reset-fog, build, update, delete | list-scenes, get-current-scene, switch-scene, scene-view, manage-scene                                                                                              | on                 |
| `token`          | get, move, update, delete                                                           | get-token-details, move-token, update-token, delete-tokens                                                                                                          | off                |
| `combat`         | get, start, next-turn, initiative, apply-damage, end                                | combat, apply-damage                                                                                                                                                | off                |
| `roll`           | gm, request-players, table                                                          | gm-roll, request-player-rolls, roll-table                                                                                                                           | off                |
| `chat`           | read, post                                                                          | get-chat-messages, create-chat-message, post-chat                                                                                                                   | on (read only)     |
| `journal`        | list, search, get, create, update-page, quest-create, quest-update, quest-link      | list-journals, search-journals, replace-journal-page, create/update-quest-journal, link-quest-to-npc, create-campaign-dashboard                                     | on                 |
| `audio`          | list, play, stop, scene-music                                                       | manage-playlists, control-playlist, update-scene-music                                                                                                              | off                |
| `time`           | get, advance                                                                        | calendar-clock                                                                                                                                                      | off                |
| `folder`         | list, create, update, delete                                                        | manage-folders                                                                                                                                                      | off                |
| `media`          | upload-image, generate-map, map-status, cancel-map                                  | upload-image, generate-map, check/cancel-map-status                                                                                                                 | off                |
| `script`         | run, macro-list, macro-get, macro-save, macro-delete, macro-execute                 | execute-script, manage-macros                                                                                                                                       | off                |
| `dnd5e` (system) | add-feature, features-from-compendium, create-npc                                   | dnd5e-\* tools                                                                                                                                                      | D&D 5e worlds only |

**Dropped:** wfrp4e-\*, dsa5, cosmere, mgt2e, iron-gods-monsters, the Mac setup tools (they move into the installer), and `post-chat` (its HTML and emote style become options of `chat.post`).

## 5. Engineering practices

- **Types.** Strict TypeScript, `noImplicitAny`, no new `any` at module boundaries. Foundry globals are typed through `fvtt-types` where they are reliable, and through narrow local interfaces where they are not.
- **Validation.** zod at every boundary, on both sides: the server validates tool input, and the module validates query payloads.
- **Tests.**
  - Unit tests for every action, run against a fake Foundry fed by **real exported fixtures**. A script exports a sample of actors, items and chat messages from a PF2e test world and a D&D 5e test world.
  - Contract tests: every registered tool has a generated schema, a guard check and a handler, and every module query has risk metadata.
  - Guard tests: each risk level is refused when its switch is off.
  - A scripted live smoke test against a running Foundry, run by hand before each release, with a checklist in `docs/redesign/LIVE-CHECKS.md`.
- **CI.** Typecheck, lint, tests, schema smoke test, version check and a bundle build on every push.
- **Decisions** are recorded as short ADRs in `docs/adr/`.
- **Releases.** Semantic versioning starting at 1.0.0, the changelog kept per release, and conventional commits.

## 6. Iterations

Three stacked branches. Each one is cut from the one before and ends with green CI and an installable build. Our fork's feature code reaches the final structure exactly once.

| Iteration        | Branch                  | Base                       | Scope                                                                                                                                                                                                                                                                                              | Done when                                                                                                                                  |
| ---------------- | ----------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Restructure   | `refactor/architecture` | `upstream/master` (v0.8.6) | Same 49 tools and module queries in a proper architecture: server tool registry, bridge query registry, `data-access.ts` split by category, system code under `systems/`, `docs/ARCHITECTURE.md`, ADRs. No tool added, dropped, renamed or reshaped. Tracked by one umbrella issue, not per slice. | The golden snapshot (ADR-0002) is reproduced byte-identically, tests and typecheck pass, and a PF2e live check on v14 matches the baseline |
| 2. Unification   | to be named             | iteration 1                | Section 3 to 5 of this plan, applied to upstream's tools only: action per resource, result envelope, guard levels, capability handshake. No code from our fork.                                                                                                                                    | Registry-driven tools, snapshot regenerated on purpose                                                                                     |
| 3. Fork re-ports | to be named             | iteration 2                | PF2e and D&D 5e work, chat log, roll requests, script runner and the other community-fork features, ported into the final structure, original authors kept.                                                                                                                                        | Everything on `integrate/community-forks` is ported or consciously dropped                                                                 |

**Status 2026-11-07, iteration 1:** the restructure is committed locally on `refactor/architecture` (golden snapshot, server `ToolRegistry`, `backend.ts` split, bridge `data-access.ts` split into services, `QueryRegistry` with query groups, per-system helpers under `systems/`, `docs/ARCHITECTURE.md`). Typecheck, 89 module tests, 224 server tests, schema and backend smoke tests pass. The tool count is 50, not 49. **Still open:** live baseline and live check on the PF2e v14 server, fixtures from both worlds, lint baseline for new code, pushing the branch and the merge request.

**Status 2026-11-09, iterations 2 and 3 are implemented locally, not pushed, no pull request.**

- Iteration 1, `refactor/architecture` (18 commits on upstream v0.8.6, 4 not yet pushed): done and verified live on PF2e and D&D 5e. Synthetic fixtures replaced real captures; captures stay in a git-ignored `local/` folder.
- Iteration 2, `refactor/tool-unification` (11 commits on iteration 1): 50 tools became domain tools with an `action` and `params` (ADR-0004), three access levels and a risk on every action and query (ADR-0005), systems as packs with a verification status (ADR-0006), `world.capabilities`, paged lists, the creature index built in the background and reused per pack, the three live bugs fixed (#2, #3, #4), `docs/TOOLS.md` generated from the specs with a migration table, and `npm run test:live`, which walks every action against a connected world. The listing went from about 75,000 to about 13,000 characters.
- Iteration 3, `refactor/fork-features` (8 commits on iteration 2): everything on `integrate/community-forks` ported into the new structure, one commit per source with its original author (flownzu, KillgoreAlpha, ErikGenibo, khelbenlaforge, DerJJ). 16 domain tools, about 22,000 characters.
- Consciously not ported: the fork's `module.json` URLs (they name the fork, not the repository), and KillgoreAlpha's data-access scene methods (their tool was already removed as a duplicate of `manage-scene`).
- Not yet done: a live run of `npm run test:live` against PF2e and D&D 5e worlds with the new bridge deployed, the other game systems' packs verified (needs a world each), the fork backlog (tile tools, compressed wire format, HTTP transport and so on), and the merged duplicates (`chat.post` and `chat.post-rich`, `compendium.get-item` and `get-entry`).

Work order inside iteration 1 (tracked by the umbrella issue): worktree and green baseline, golden snapshot and its test, live baseline on the PF2e server, fixtures, lint baseline for new code, `ARCHITECTURE.md`, then the slices: server registry, bridge query registry, one `data-access.ts` category at a time, `systems/`.

After 1.0: `combat.wait-for-turn` (RasmusBMN), `scene.screenshot` (iCaptainNemo), HTTP transport (edoren/tonancheta), multi-server profiles (webmaster94), unless pulled forward by decision 7.

## 7. Decisions

Answers recorded 2026-11-07. ADR numbers refer to `docs/adr/` on `refactor/architecture`. Decisions about the fork and the branch order concern this fork only and are recorded here, not in an ADR.

| #                           | Decision                                                 | Answer                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base                        | Which code the redesign starts from (replaces section 2) | **Upstream v0.8.6, fresh.** No production-code change from this branch is carried over; only tests, tooling, fixtures and a new architecture description are.                                                                                                                                                                                |
| Restructure only            | Whether iteration 1 may change tools                     | **No.** Same tools and queries. ADR-0001                                                                                                                                                                                                                                                                                                     |
| Order                       | How the work is staged                                   | **Restructure, then unification, then fork re-ports**, three stacked branches.                                                                                                                                                                                                                                                               |
| Safety                      | How "no behaviour change" is checked                     | **Golden snapshot** of `tools/list` and module query names. ADR-0002                                                                                                                                                                                                                                                                         |
| 4. Repository               | Fork or detach                                           | **Keep the fork** (an upstream PR needs it).                                                                                                                                                                                                                                                                                                 |
| 5. Module id                | Keep or rename                                           | **Keep `foundry-mcp-bridge`.** ADR-0003                                                                                                                                                                                                                                                                                                      |
| Architecture of iteration 1 | Shape of the restructure                                 | **Delegated to the agent.** Draft in `docs/ARCHITECTURE.md` on the restructure branch, reviewed there. Starting point: server tool registry instead of the `switch` in `backend.ts`, bridge query registry instead of hand-registered `CONFIG.queries`, `data-access.ts` split into `services/` by category, hand-written schemas unchanged. |
| Live baseline               | Where v0.8.6 is checked on v14                           | **On the PF2e dev server directly.** It is the test and development server; the integrated branch stays in git for switching back.                                                                                                                                                                                                           |
| Issue tracking              | Whether iteration 1 is tracked                           | **One umbrella issue (DerJJ/foundry-vtt-mcp#1)** describing the whole restructure, no per-slice issues.                                                                                                                                                                                                                                      |

Still open, to be decided at the start of iteration 2:

1. **Tool style** (old decision 1): action per resource, recounted against upstream's real 49 tools.
2. **Dropping other systems** (old decision 2): dsa5, wfrp4e, cosmere, mgt2e, iron-gods.
3. **Map generation** (old decision 3): ComfyUI as optional `media` category, or drop.
4. **Foundry versions** (old decision 6): v14 only, or v13 and v14, after the live baseline.
5. **HTTP transport timing** (old decision 7).
6. **`tools/list_changed`** support in Claude Desktop and Claude Code (section 3.5, section 8).

## 8. Risks

- **Clients may ignore `tools/list_changed`.** The fallback is in 3.5. This gets verified in phase 1, before anything depends on it.
- **Behaviour of the live Foundry API.** Our PF2e and D&D 5e code has not been tested against a live world yet. Phase 0's fixtures and phase 1's live checks surface this early.
- **Scope creep.** The phases port behaviour that already exists. New features wait until after 1.0, except where a phase names them.
- **Foundry v14.** The live world runs v14, while upstream's code and our tests were written against v13. garr71's notes on porting to v14 get read in phase 0, and the phase 0 fixtures come from the v14 world, so the new structure does not bake in calls that only work on v13.
