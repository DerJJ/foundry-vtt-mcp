# Game systems are packs

Status: accepted (2026-11-08)

Code that is specific to a game system lives in one pack per system, on both sides (`systems/<id>/`), and registers itself: its actions, its schema notes for `describe`, its bridge services and its creature index builder. Nothing outside a pack asks which system is running.

A pack has a **verification status**. `verified` means a runner has exercised its actions against a live world of that system. `unverified` means it has not, and the pack is covered by contract and fixture tests only. `describe` reports the status, and the documentation lists it per system, so a user knows what they get. The runner is a script that walks every action through the MCP against a connected world, creates test objects and deletes them again.

Consequence: adding a system is adding a folder and a registration. A system without a live world to test against is shipped, marked unverified, rather than dropped.
