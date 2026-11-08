# Domain tools with actions, and schema discovery

Status: accepted (2026-11-08). Replaces the "same tools" rule of ADR-0001 for the unification; ADR-0001 still describes the restructure that came before it.

The server used to list 50 tools, one per operation. Their descriptions and input schemas were about 75,000 characters (roughly 20,000 tokens) in every session, and the two largest, `dnd5e-add-feature` and `dnd5e-create-npc`, had 34 properties each.

The server now lists about eleven **domain tools** (`world`, `scenes`, `playlists`, `effects`, `tokens`, `items`, `actors`, `compendium`, `journals`, `chat` and the optional `image-generation`). Each takes an `action` and a `params` object.

- **The listing stays small.** A tool's description names its actions with a one-line signature each, generated from the real schemas (`get(identifier*)`). The full schema of one action is returned on request by the `describe` action.
- **No system-specific tools.** Actions that exist only for one game system are not in the list at all. `describe` returns the actions of the active system, and nothing else, when asked. A world has exactly one system for as long as the bridge is connected, so what the server describes cannot go stale.
- **Gated tools are always listed.** A tool whose availability depends on a Foundry setting (`image-generation`) is listed with a one-line description, because the server answers `tools/list` before the bridge has connected. A call while the setting is off is refused with a message that names the setting. `world` `capabilities` reports what is on.
- **Names are not aliased.** The old tool names are gone. The changelog carries a table from every old tool to its tool and action.

Rejected: one tool per operation with shorter descriptions (the schema size does not go away); `tools/list_changed` with a per-system list (clients differ, and the list is asked for before the world is known); a single `call(tool, args)` meta-tool (a permission rule can then only allow or deny everything).

Consequence: the schema a client sees for `params` is open, so validation happens in the server, against the schema of the action, before anything is sent to the bridge.
