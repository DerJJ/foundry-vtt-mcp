# One `documents` tool for plain changes

Status: accepted (2026-11-09). Builds on [ADR-0004](0004-domain-tools-with-actions-and-schema-discovery.md).

ADR-0004 left about 120 actions in 16 domain tools. About 35 of them were a plain create, read, update or delete of a Foundry document, each with its own name and parameters (`playlists` `create`, `macros` `update`, `items` `add-to-actor`, `scenes` `create-documents`, and so on). Eight carried a game system in their name. Several did the same thing as another action.

A new tool, `documents`, does `list`, `get`, `create`, `update` and `delete` for any document type, at any depth, and `schema` for the fields of one type.

- **The model is Foundry's.** A call names a `type` (`Actor`, `Item`, `ActiveEffect`, `Scene`, `Wall`, `JournalEntryPage`, ...) and, for an embedded document, a `parent` (`{type, id or name}`, which can itself have a parent). `pack` works in a compendium pack instead of the world. `from` copies a compendium entry. `data` holds the fields exactly as Foundry stores them.
- **Domain tools stay for behaviour**: moving a token, running a combat, posting to the chat, rolling, using an item, generating an image. An action is a domain tool action when it does more than change data.
- **No game system in an action name.** A system pack adds to `documents` only through `schema`: which types and subtypes the system has, their fields (read from Foundry's own data models), and the **kinds** (`inventory`, `spells`, `features`, ...) that group an actor's item types. Asking `schema` for `{type: "Item", subtype: "spell"}` replaces a system's special action for adding a spell.
- **Raw data, for now.** The NPC stat block and the feature builder of the dnd5e pack are not carried over: the AI writes the data as Foundry stores it, using `schema` and an example. A builder can come back as a `spec` parameter if raw data proves too error-prone.
- **Risk follows the verb**: `list` and `get` are read, `create` and `update` write, `delete` delete. There is no extra rule for macros: creating or changing a macro is a write, like any other document. Running one still needs the execute checkbox.
- **Large documents.** `get` and `list` take `fields` (dot paths) to return only what is asked for, and a result over a size limit is cut with a note, so that one actor does not fill the context.

Rejected: one tool per document type (the surface we are leaving); a thin `foundry.call(method, args)` over the whole Foundry API (no risk per action, no validation); keeping the system builders (they are what made `dnd5e-create-npc` and `dnd5e-add-feature` 34 properties each).

Consequence: the AI needs to know Foundry's data model for a type it has not seen. `schema` and a returned example of a real document of that type exist for that. For the systems that are not verified, `schema` may be thinner; it says so.
