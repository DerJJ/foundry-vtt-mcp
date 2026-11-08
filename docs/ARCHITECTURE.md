# Architecture

How the code is organised, where a change belongs, and what keeps a restructure honest. For the decisions behind it, see [docs/adr](adr/).

## Processes and packages

```text
MCP client ──stdio──> index.ts (front) ──TCP :31414──> backend.ts ──WebSocket/WebRTC :31415──> Foundry
                                                       (server)                                 bridge module
```

| Package                   | Runs in                      | Role                                                         |
| ------------------------- | ---------------------------- | ------------------------------------------------------------ |
| `shared`                  | both                         | types and zod schemas used on both sides                     |
| `packages/mcp-server`     | Node (client's machine)      | speaks MCP, owns the tools, talks to Foundry                 |
| `packages/foundry-module` | the GM's browser, in Foundry | the **bridge**: reads and changes the world, answers queries |

The front process (`index.ts`) is a thin MCP stdio server. It starts the backend when needed and forwards `tools/list` and `tools/call` over the control channel. The backend (`backend.ts`) owns the Foundry connection, the tools and ComfyUI.

## Server (`packages/mcp-server/src`)

```text
index.ts                   MCP front process
backend.ts                 wiring only: logger, systems, ComfyUI, tool registry, control channel
backend/
  process-lock.ts          one backend per machine
  control-channel.ts       TCP JSON-lines server for the front process
  comfyui-service.ts       start, stop and probe the local ComfyUI
  comfyui-messages.ts      handler table for ComfyUI messages that arrive from Foundry
  map-generation.ts        map generation job handling
registry/
  tool-registry.ts         ToolRegistry: definitions + handlers, list() and call()
  create-tool-registry.ts  builds the domain tools the client sees
  domain-tools.ts          the domain tools and their actions: operation, risk, parameters
  domain-tool.ts           builds one domain tool: action dispatch, describe, access check, paging
  domain-context.ts        the connected world as the domain tools see it: system, capabilities
  access.ts, validate-params.ts   risks and access levels; the check on an action's params
  operations.ts            creates every operation (the tool classes below) as a catalog
  tools-doc.ts             renders docs/TOOLS.md from the specs
tools/                     one class per group of operations: getToolDefinitions() + handle* methods
systems/<id>/              server-side game system adapters (formatting, filters, index building)
foundry-client.ts, foundry-connector.ts, webrtc-peer.ts   transport to Foundry
```

**A tool call** is `ToolRegistry.call(name, args)` on a _domain tool_ ([ADR-0004](adr/0004-domain-tools-with-actions-and-schema-discovery.md)): `{ action, params }`. The domain tool looks up the action, checks the game system and the access level ([ADR-0005](adr/0005-access-levels-and-action-risk.md)), validates `params` against the action's schema, and calls the _operation_ that implements the action. Operations are the tool classes in `tools/`; each registers with a `name -> method` table (`bindMethods`, checked by the compiler) in `registry/operations.ts`, and no client sees them directly. `describe` returns the actions of the connected world's game system, or the full schema of one action.

**Adding an action:** add the operation (definition in the tool class's `getToolDefinitions()`, a handler method and a line in `registry/operations.ts`), then one entry in `registry/domain-tools.ts` with its risk, and the bridge query it uses needs a risk in `foundry-module/src/queries/query-risk.ts`. Regenerate the snapshots and `docs/TOOLS.md` (see below) in the same commit. Contract tests fail if an operation has no action, an action names a parameter its operation lacks, or the listing grows past its size budget.

[docs/TOOLS.md](TOOLS.md) lists every action with its risk, parameters and the v0.8.6 tool it replaced.

## Bridge (`packages/foundry-module/src`)

```text
main.ts, settings.ts, socket-bridge.ts, webrtc-connection.ts   module life cycle and transport
queries.ts                 QueryHandlers: builds the query groups and the registry
queries/
  query-registry.ts        QueryRegistry: installs every query in CONFIG.queries, GM-guarded
  gm-access.ts             the GM check used by every handler
  <category>.ts            one query group per category (characters, compendium, world, ...)
data-access.ts             composition root: one service per category
services/
  <category>.ts            the operations themselves (characters, compendium, world, audio, journals,
                           actors, effects, items, rolls, ownership, chat, tokens)
  creature-index.ts        persistent creature index
  support.ts               sanitising, audit log and Foundry state checks
  types.ts, helpers.ts     shared types and helpers
systems/<id>/              system-specific code: dnd5e and wfrp4e actor services and query groups,
                           spellcasting and creature-criteria helpers for pf2e, dnd5e, dsa5, mgt2e, cosmere-rpg
```

**A query** has two halves. A _query group_ (`queries/<category>.ts`) validates the request and checks GM access; a _service_ (`services/<category>.ts`) does the work. `QueryRegistry` publishes each group's routes as `foundry-mcp-bridge.<name>` in `CONFIG.queries` and wraps every handler in `guardQueryHandler`, because Foundry's `User#query` makes `CONFIG.queries` reachable for every connected user. Inside that guard, `guardRisk` checks the query's risk (`queries/query-risk.ts`; a query without one is refused) against the world's access level (`access-level.ts`).

**Adding a query:** add the handler to the group, add its name to that group's `routes()`, put the work in the matching service, and update the golden snapshot.

## The golden snapshot

[ADR-0002](adr/0002-golden-snapshot-guards-the-restructure.md). Two files store what an MCP client and the Foundry side can see:

- `packages/mcp-server/src/__golden__/tools-list.json`: the full `tools/list` output. `upstream-tools.json` beside it records the 50 tools of v0.8.6 that the domain tools replaced.
- `packages/foundry-module/src/__golden__/query-names.json`: the registered query names.

`tool-surface.test.ts` and `query-surface.test.ts` compare the code against them, and `registry/tools-doc.test.ts` does the same for `docs/TOOLS.md`. A change to the surface regenerates them on purpose: `UPDATE_GOLDEN=1 npm test`.

## Checks

| Command                      | What it checks                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`          | all packages                                                                                                  |
| `npm test`                   | unit tests of module and server, including the golden snapshots                                               |
| `npm run test:coverage`      | the unit tests again, failing if a folder drops below its coverage floor (`vitest.config.ts` of each package) |
| `npm run test:mcp:schema`    | tool schemas load and are objects (needs a build)                                                             |
| `npm run test:backend:smoke` | starts the built backend and checks its control channel against the snapshot (needs `npm run build:release`)  |
| `npm run version:check`      | the five manifests agree on the version                                                                       |

## Tests

- **Core** (registries, the GM guard, sanitising, permissions, transactions, per-system helpers, error handling): held to 90% line coverage.
- **Everything else**: a floor at today's level per folder. Raise a floor in the commit that adds the tests; never lower one.
- **Contract tests** (`registry/tool-contract.test.ts`, `queries/query-contract.test.ts`) state what every tool and every query must satisfy without naming any of them.
- **Fixtures** from live worlds: capture them with `scripts/export-fixtures.macro.js` and see `packages/foundry-module/src/__fixtures__/README.md`. Tests using them are skipped when no capture exists.
- Installers, the ComfyUI client and the transport are covered by the smoke tests, not by unit tests.

## Conventions

- Tests stub Foundry globals with `vi.stubGlobal`. Code that builds the data access needs a `Hooks` stand-in first; `test-support/create-data-access.ts` does that.
- Service and query-group files were extracted from two very large classes without changing their bodies. Style findings in them predate the restructure; new code follows the lint rules: the pre-commit hook fails on lint errors in files that are being added (`scripts/lint-new-files.mjs`), and leaves existing files alone.
