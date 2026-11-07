# Handoff: foundry-vtt-mcp redesign

For whoever picks this up next, human or agent. State as of 2026-11-07.

## Read first, in this order

1. [PLAN.md](PLAN.md): what we are building and in which phases. Section 7 lists the open decisions.
2. [FIELD-NOTES.md](FIELD-NOTES.md): the live environment and the problems that started the fork.
3. [../COMMUNITY-FORKS.md](../COMMUNITY-FORKS.md): what came from which fork, the backlog, the remaining duplicates, things that have never been tested live, and the 2026-11-07 fork rescan.
4. [../../CHANGELOG.md](../../CHANGELOG.md), section "Unreleased": everything this fork changed on top of upstream.

## Where things stand

- **Repository:** `DerJJ/foundry-vtt-mcp`, a GitHub fork of `adambdooley/foundry-vtt-mcp` (MIT).
- **Branch:** `integrate/community-forks`. It contains all fork work, upstream v0.8.6 (merged 2026-11-07) and these handoff documents.
- **⚠ Not pushed.** Nothing on this branch has reached GitHub. Pushing failed because no credential helper is configured. The owner runs, once:

  ```bash
  git config --global credential.helper manager
  git push -u origin integrate/community-forks
  ```

- **Redesign:** planned, not started. The decisions in PLAN.md section 7 are all open. Phase 1 must not start until they are recorded there.
- **Checks:** typecheck, the schema smoke test and the version check pass, and the 121 module tests and 290 server tests pass. Lint does not pass: it reports 251 errors and 14,266 warnings, mostly inherited `any` warnings. Phase 0 sets the lint baseline.
- **Live testing:** none of the fork's own work has run against a real Foundry. COMMUNITY-FORKS.md lists what to verify first.

### Remotes

`origin` is our fork and `upstream` is adambdooley. There is also one remote per reviewed fork: `ErikGenibo`, `KillgoreAlpha`, `LudoBermejoES`, `Meltyas`, `flownzu`, `khelbenlaforge` and `webmaster94`. The fork remotes have `tagOpt --no-tags`, because ErikGenibo's fork has a tag called `master`. Fetching its tags makes `master` ambiguous. Always refer to fork branches as `refs/remotes/<fork>/master`.

## Commands

| What                                               | Command                   |
| -------------------------------------------------- | ------------------------- |
| Install                                            | `npm ci`                  |
| Full build (shared, server, server bundle, module) | `npm run build:release`   |
| Tests (all workspaces)                             | `npm test`                |
| Types                                              | `npm run typecheck`       |
| MCP schema check                                   | `npm run test:mcp:schema` |
| Versions agree across the five manifests           | `npm run version:check`   |
| Lint                                               | `npm run lint`            |

If the build complains about missing files in `dist/` (for example `dist/config.js`), delete that package's `dist/` and `tsconfig.tsbuildinfo` and build again. A stale build info file makes `tsc` skip emitting.

### Deploying to the live PF2e server

- **MCP server.** The release ZIP doesn't include `backend.bundle.cjs`, so build from source on the server: `npm ci && npm run build:release`. The MCP client config points at `packages/mcp-server/dist/index.js`, registered as `foundry-mcp` in `~/.claude.json`, stdio, with `FOUNDRY_CONNECTION_TYPE=websocket`. Restart the MCP client after rebuilding.
- **Foundry module.** Copy `module.json`, `dist/`, `lang/`, `scripts/`, `styles/` and `templates/` from `packages/foundry-module/` into the Foundry Data folder as `modules/foundry-mcp-bridge/`, or install from the manifest URL once a release exists. `dist/` is plain `tsc` output, so `npm run build:foundry` must run first. Then reload the world.
- **Settings in Foundry (GM, Module Settings → Foundry MCP Bridge):** set the connection type to **WebSocket**, because Auto picks WebRTC on HTTPS and that fails. Turn on **Allow script and macro execution** only if scripts are wanted.
- **Connection.** The bridge runs in the GM's browser on the notebook and must reach port 31415 on the server. Add the port by hand in the VS Code Ports tab, because auto-forward doesn't pick it up. If the reverse proxy sends a CSP, `connect-src` needs `ws://localhost:31415`.

## First actions

1. The owner pushes the branch (see above).
2. The owner answers the seven decisions in PLAN.md section 7.
3. Phase 0:
   - Record the D&D 5e world's Foundry and system versions in PLAN.md section 1.
   - Write the fixture export script, a macro or `execute-script` body that dumps sample actors (PC, NPC, loot, with prepared and spontaneous casters), items, and chat messages of each event kind. Run it in the PF2e world and the D&D 5e world and commit the JSON under `packages/foundry-module/test/fixtures/`.
   - Read garr71's notes on the Foundry v14 port, and webmaster94's `operation-safety.ts`, `document-registry.ts` and `transaction-manager.ts`.
   - Decide the lint baseline: stricter rules for new code under `registry/`, `services/` and `systems/`, with the old files exempt until they are ported.
   - Cut branch `v1` from `integrate/community-forks`.
4. Phase 1 begins with `shared/src/tool-contract.ts` and the registry, proven with `chat` and `roll`.

## Code worth preserving

This is the PF2e and D&D 5e knowledge to move into the system adapters. Most of it has tests.

| File                                                | What it knows                                                                                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/foundry-module/src/chat-log.ts`           | Turns chat messages into events (kind, who, item, targets, DC, outcome, dice) from PF2e and dnd5e flags; collects the messages an action creates                                                                           |
| `packages/foundry-module/src/pf2e-rolls.ts`         | PF2e statistic lookup with skill and save aliases, and modifiers                                                                                                                                                           |
| `packages/foundry-module/src/table-actions-pf2e.ts` | PF2e damage (typed `DamageRoll`, healing as negative damage), party status, GM rolls with degree of success                                                                                                                |
| `packages/foundry-module/src/table-actions.ts`      | The same three for dnd5e, plus flownzu's other table tools; dispatches by system                                                                                                                                           |
| `packages/foundry-module/src/script-runner.ts`      | Script and macro execution: guard, timeout, captured output, GM audit card                                                                                                                                                 |
| `packages/foundry-module/src/data-access.ts`        | `useItem` (PF2e casting through the spellcasting entry with the prepared slot, token-actor context), `requestPlayerRolls` (PF2e roll through the statistic, DC on the button), spellcasting DC and attack for both systems |
| `packages/mcp-server/src/foundry-connector.ts`      | Query timeout per call; tools that wait longer must pass one                                                                                                                                                               |

## Conventions

- **Language:** all code, comments, tool descriptions and messages are in English.
- **Credit:**
  - When porting code from another fork, commit with the original author (`--author`) and name the source commit in the message.
  - Ported _ideas_ name the fork in the commit message.
  - Every new source goes into COMMUNITY-FORKS.md.
  - Keep upstream's MIT copyright notice.
- **Commits:** a husky hook runs prettier on staged files, so commits may reformat code. Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`).
- **Tests:**
  - Vitest with stubbed Foundry globals (`vi.stubGlobal`).
  - Fakes must be shaped like Foundry: for example, the PF2e damage roll class must be named `DamageRoll`, and `Hooks` stubs need `on` to return an id and an `off` function.
  - Strict optional types (`exactOptionalPropertyTypes`) are on, so an optional field that may be set to `undefined` must be typed `T | undefined`.
- **Outward actions:** pushing, releases and anything posted to GitHub need the owner's go-ahead.

## Rescanning forks

`gh` is not installed on the owner's machine. Use GitHub's REST API instead:

- `GET /repos/adambdooley/foundry-vtt-mcp/forks?per_page=100&sort=newest` lists the forks.
- `GET /repos/adambdooley/foundry-vtt-mcp/compare/master...<owner>:master` gives `ahead_by` and the commit list for one fork.

Unauthenticated requests are limited to 60 per hour, so only compare forks pushed since the last scan date in COMMUNITY-FORKS.md.
