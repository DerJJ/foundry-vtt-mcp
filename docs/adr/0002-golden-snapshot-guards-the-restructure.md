# A golden snapshot guards the tool and query surface

Status: accepted (2026-11-07)

"No behaviour change" is enforced, not claimed. A snapshot of the v0.8.6 surface is stored in the repository: the full MCP `tools/list` output (names, descriptions, input schemas) and the set of module query names. A test compares the current code against it, and every commit of the restructure must pass unchanged. A later change to the surface regenerates the snapshot on purpose, in the same commit that changes the surface.
