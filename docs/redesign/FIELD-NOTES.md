# Field notes: Foundry MCP bridge in a live PF2e world

> **Status (2026-11-07).** This was the original handoff that started the fork. It is kept as background
> for the [redesign plan](PLAN.md): section 1 describes the live environment, and sections 2 and 4 list
> problems the redesign must still solve.
>
> Done since: `manage-macros` and `execute-script` with the opt-in setting, timeout, captured output and
> GM audit card (5.1, 5.2); a structured chat reader (`get-chat-messages`, 3.2); scene embedded documents
> including Tiles and Notes through `manage-scene` (3.2). Still open: `bridge-status` (2.5), CSP hint
> (2.4), WebRTC on HTTPS (2.3), release ZIP without the backend bundle (2.1), generic document
> read/update by UUID, compendium index queries and compendium-to-actor copy (3.2), the dialog and
> third-party hook pitfalls (4), dry-run (5.3).

Written by Claude (Claude Code) after several sessions of using foundry-mcp v0.8.5 to build ten merchant
shops for a PF2e Abomination Vaults world. Goal of the next step: let the agent **save and execute
macros directly**, so the human no longer has to copy-paste scripts into Foundry.

## 1. Environment it was used in

| Part       | Detail                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundry    | v14.369 in Docker (`felddy/foundryvtt`), behind Traefik, HTTPS only (public hostname)                                                                 |
| System     | PF2e 8.6.1, plus PF2e Merchant (`pf2e-cinematic-merchant`) and the Abomination Vaults module                                                          |
| MCP server | v0.8.5 **built from source** in `~/dev/foundry-vtt-mcp`, registered in `~/.claude.json` as `foundry-mcp` (stdio, `FOUNDRY_CONNECTION_TYPE=websocket`) |
| Agent      | Claude Code in VS Code Remote-SSH, i.e. running on the **server**, not on the GM's machine                                                            |
| Bridge     | Runs in the GM's browser on a **notebook**; reaches the server via a VS Code port forward of 31415                                                    |

## 2. Setup problems hit (all solved, but worth fixing or documenting)

1. **The release ZIP `foundry-mcp-server-vX.zip` is unusable on its own.** It only contains the wrapper
   `index.js`; the wrapper spawns `backend.bundle.cjs`, which isn't in the ZIP, so nothing listens on 31415. Fix used: clone, `npm ci`, `build:shared`, `build:server`, `bundle:server`.
2. **The agent and the browser are on different machines.** With Claude Code on a remote server, the
   bridge's `localhost` is the notebook. VS Code's port forwarding solved it, but auto-forward did not
   kick in; the port had to be added manually in the Ports tab. Worth a README section.
3. **HTTPS + "Auto" connection type picks WebRTC**, whose signaling goes to `http://localhost:31416`.
   Forcing _WebSocket_ in the module settings was needed.
4. **Content-Security-Policy on the Foundry page blocks the bridge.** A reverse-proxy header
   `connect-src 'self' wss: https:` blocks both `ws://localhost:31415` and `http://localhost:31416`; the
   browser refuses before any network traffic. Fix: add `ws://localhost:31415` to `connect-src`.
   The module could detect a CSP violation (`securitypolicyviolation` event) and show a clear hint.
5. **No diagnosis tool.** When the bridge is down, every tool just says "Foundry VTT module not
   connected". A `bridge-status` tool (connection type, last error, server ports, Foundry/system
   version, GM user) would have saved several round trips.

## 3. Functional gaps, by impact

### 3.1 No way to run code in Foundry (the main blocker)

Most real work needed things the typed tools don't cover, so the agent wrote Foundry script macros
(10 shop builders, cleanup and fix-up snippets) and the human had to paste and run each one. When the
human was away from home, everything queued up in a `RUN-LATER.md` file.

What was needed, concretely:

- Copy hundreds of compendium items onto a Loot actor in one go (`pack.getDocuments` +
  `game.items.fromCompendium` + `createEmbeddedDocuments`).
- Build spell wands/scrolls exactly like PF2e's `createConsumableFromSpell` (not exposed by the system).
- Create and move **Tiles** with module flags (`flags.pf2e-cinematic-merchant.actorId`).
- Write module flags on actors (merchant services are an array flag).
- Delete filtered sets of embedded items.
- Fix map **Notes** (`entryId` pointing to missing journals).

### 3.2 Missing document types and generic access

| Need                         | Status in v0.8.5                                                         | Suggestion                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Macro documents              | none                                                                     | `manage-macros`: list / get / create / update / delete / execute                                                    |
| Tiles                        | none                                                                     | `manage-scene-embedded` for Tile, Note, Drawing, Wall, Light (create/update/delete/list with full data incl. flags) |
| Notes                        | `get-current-scene` returns only id, text, position                      | include `entryId`, `pageId`, icon, flags                                                                            |
| Arbitrary document read      | per-type tools only                                                      | `get-document` by UUID with a field allow-list (e.g. `system.publication`, `flags`)                                 |
| Arbitrary document update    | per-type tools only                                                      | `update-document` by UUID (flags, system paths); same GM guard                                                      |
| Chat                         | none                                                                     | `list-chat-messages` (last N, whisper-aware); the agent read the world's LevelDB instead                            |
| Compendium index with fields | `search-compendium` matches names only, filters only work on Actor packs | `query-compendium-index`: pack, `fields`, simple filters (type, level range, rarity, traits, publication)           |
| Compendium → actor copy      | `manage-world-items add-to-actor` takes raw `{name,type,system}`         | accept `uuid`s, use `fromCompendium`, keep `_stats.compendiumSource`, allow per-item overrides (quantity)           |

### 3.3 Workarounds the agent used (and why they're not great)

- **Reading the world's LevelDB directly** (copy `data/<world>/data/<collection>`, read with
  `classic-level`). Fine for reads, but it lags a few seconds behind, can't see client state, and writes
  are impossible while Foundry runs.
- **Reading the system's compendium LevelDBs** to replicate filters offline (a "gap check" across all ten
  shop macros). Worked well, but only because the logic was duplicated outside Foundry.

## 4. Pitfalls that any execution feature will run into

These cost real time; tools that create documents should handle or at least surface them.

1. **Blocking dialogs on item creation.** PF2e opens a picker for _special ammunition_ without
   `system.baseItem` (Elemental Ammunition etc.) and for ChoiceSet rules. Inside a script run by the
   bridge this blocks the GM's client until someone clicks. Workaround: set `system.baseItem` before
   creating. An execution tool needs a timeout and should report "waiting for UI".
2. **Third-party hooks change results silently.** PF2e Merchant has a `createItem` hook that merges any
   new item into an existing one with the same `_stats.compendiumSource`. All spell wands built from the
   same template stacked into one item (×36) with no error. Return values of a create call don't show
   this; a follow-up read does. Execution results should include a post-condition read when possible.
3. **Kits expand on creation** (PF2e `kit` items), so they can't be stocked as items.
4. **Display can look broken after bulk writes.** After a large cleanup the GM saw no map notes until a
   reload; the data was fine. Worth mentioning in tool output when scenes were touched.

## 5. Proposal: macro support

### 5.1 `manage-macros` (low risk, high value)

- `list` (folder, name filter), `get` (command included), `create` / `update` (name, type `script`,
  command, folder, img, ownership), `delete`.
- `execute`: run an existing macro by id/name with an optional `args` object (Foundry v13+:
  `macro.execute({ args })` / scope), return the macro's return value (JSON-serialisable), the
  notifications it raised and any thrown error with stack.

This alone removes the copy-paste step: the agent saves `wrins-wonders.js` as a macro, the human can
inspect it in Foundry, and the agent (or the human) runs it.

### 5.2 `execute-script` (powerful, needs guard rails)

Run an async function body in the GM client and return its result. Suggested shape:

```json
{
  "script": "const a = game.actors.get(args.id); return a.items.size;",
  "args": { "id": "…" },
  "timeoutMs": 30000
}
```

Return: `{ result, logs: [console output during the run], notifications, error, durationMs }`.

**Guard rails (important):**

- A **world setting in the bridge module, default off**: "Allow the MCP server to run scripts". Without
  it, both `execute-script` and `manage-macros execute` refuse. Creating/updating macros can stay allowed.
- Keep the existing GM-only query guard (`guardQueryHandler`).
- **Prompt-injection risk.** The agent reads journal text, item descriptions and chat, all of which can
  contain instructions. Script execution turns that into arbitrary GM-level code. Keep the setting off by
  default, log every run (whispered chat card to the GM with the script and result), and rely on the MCP
  client's per-call approval. Never auto-run a macro whose body the agent didn't write or show.
- Timeout, plus a clear "a dialog is open in the GM client" signal (see 4.1).
- Result size cap (the server already has `TOOL_RESPONSE_MAX_CHARS`).

### 5.3 Nice to have

- `bridge-status` (see 2.5).
- Dry-run support for destructive tools (the agent wrote `DRY_RUN` switches into its own macros;
  first a "would delete N: …" report, then the real run).

## 6. Corrections to earlier assumptions

- **`get-character` works for Loot actors.** It doesn't filter by type. The agent's first call failed only
  because that actor had been deleted in the meantime; it then wrongly concluded Loot actors were
  unsupported and fell back to LevelDB reads.
- **Items can already be added to actors** via `manage-world-items` → `add-to-actor`, but only as raw data,
  which is impractical for hundreds of compendium items (see 3.2).

## 7. Test material

`~/docker/foundrypf2/macros/` contains ten real-world shop builders, a cleanup macro with a dry-run
switch, and `RUN-LATER.md` with expected results per step. They make good end-to-end tests: save each as
a macro via the new tool, execute it, and compare with the expected item and service counts.
