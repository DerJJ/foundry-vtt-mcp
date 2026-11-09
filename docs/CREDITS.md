# Credits

This project is a **fork of [foundry-vtt-mcp](https://github.com/adambdooley/foundry-vtt-mcp) by Adam Dooley** (MIT licence, Copyright (c) 2025 Adam Dooley). The Foundry module, the MCP server, the bridge between them and most of the tools are his work and the work of the people who contributed to his repository. This fork restructured that code and added features, it did not start from nothing. If you only need what Adam's project does, use [his project](https://github.com/adambdooley/foundry-vtt-mcp).

The licence is kept as it is, with this fork's changes added under the same MIT terms (see [LICENSE](../LICENSE)). Git history is kept: this repository is built on upstream's history, and everything ported from another fork was committed with the original author as the commit author and a link to the source commit in the message. `git log --author="<name>"` shows each person's work.

## The original project

**Adam Dooley** ([adambdooley](https://github.com/adambdooley)): the idea, the architecture this fork started from, the MCP server, the Foundry module, the Windows and Mac installers, the ComfyUI map generation, the game system support (D&D 5e, Pathfinder 2e and the others, several of them with help from contributors, see below) and the maintenance of all of it.

## Contributors to the original project

Their work is part of every release of this fork. Names as they appear in the git history, most commits first: Adam Dooley (also committing as Adam and adambdooley), frankyh75, Sachin Pande, LordSkull, Neil Young, Frank Hermann, Luca, Naensma, Apostol Apostolov, tacostorm (the original `create-chat-message`), Matt McFarland, LManfre, Jonathan Singh, jcapinc, Surge, Jesse Herrick, Grumpy-Grey-Dad, Dmitry Rogatin. The full list with links is on the [contributors page of the original repository](https://github.com/adambdooley/foundry-vtt-mcp/graphs/contributors).

## Community forks whose code was ported

Each of these was ported by hand into the new structure. The commits carry the original author.

| Person                              | Fork                                                                                | What this fork took                                                                                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **flownzu**                         | [flownzu/foundry-vtt-mcp](https://github.com/flownzu/foundry-vtt-mcp)               | Running the table: `combat`, `apply-damage`, party status, creature cards, GM rolls, roll tables, scene view (ping, pull players, fog reset, weather), scene building, the Simple Calendar clock (`time`), and the rich chat message options now in `chat.post` |
| **Jeffrey Winters** (KillgoreAlpha) | [KillgoreAlpha/foundry-vtt-mcp](https://github.com/KillgoreAlpha/foundry-vtt-mcp)   | Folders addressed by path, compendium and pack management, image upload, `tokenImg` and folder paths when changing actors, the optional features of the D&D 5e NPC creator, several backends at once (control port and lock per instance), a per-query timeout  |
| **Erik Gieszelmann** (ErikGenibo)   | [ErikGenibo/foundry-vtt-mcp](https://github.com/ErikGenibo/foundry-vtt-mcp)         | `execute-script`, now the script part of the `macros` tool; PF2e strikes and item use on the token's actor                                                                                                                                                      |
| **Khelben La'Forge**                | [khelbenlaforge/foundry-vtt-mcp](https://github.com/khelbenlaforge/foundry-vtt-mcp) | World permissions by role and a document's ownership (`world.permissions`)                                                                                                                                                                                      |

## Work on this fork

**DerJJ**: the restructure into a tool registry and query registry, the domain tools with `describe`, the access levels and risk tags, the game system packs, the chat log reader, PF2e and D&D 5e spell, roll and damage work, type-aware compendium reading and import, the migration table, the live verification script and this documentation. A large part of this was written with Claude Code, as the commit trailers show.

## Looked at, nothing copied

These forks were read for ideas. No code of theirs is in this repository unless it is listed above: webmaster94, LudoBermejoES, Meltyas, RasmusBMN-Git, tanis90, iCaptainNemo, garr71, JamCOCA, dgroo, edwinmillan, edoren, tonancheta and others. Their ideas shaped what we did and what is still on the list. Thank you.

## Third-party components

See [installer/nsis/THIRD_PARTY_NOTICES.txt](../installer/nsis/THIRD_PARTY_NOTICES.txt) for the map generation model and its licence.

## If something is missing

If you contributed to this project or one of its forks and are not named here, or named wrongly, please [open an issue](https://github.com/DerJJ/foundry-vtt-mcp/issues). It will be fixed.
