# Foundry MCP

An MCP server that lets an AI client read and change a running Foundry VTT world through a bridge module inside Foundry.

## Language

**Server**:
The MCP server process. It speaks MCP to the client and talks to the bridge.
_Avoid_: backend (the name of one file, not the concept), MCP

**Bridge**:
The Foundry module (`foundry-mcp-bridge`) that runs in the GM's browser and does the actual work in the world.
_Avoid_: module (ambiguous with Foundry modules in general), plugin

**Domain tool**:
A tool for one area of the world (`actors`, `scenes`, ...). It takes an action and its parameters.
_Avoid_: resource tool, manager

**Action**:
One operation of a domain tool, with its own parameters and one risk.
_Avoid_: command, operation, sub-tool

**Risk**:
The class of an action: read, write, delete or execute. The access level decides which risks are allowed.
_Avoid_: permission, category

**Access level**:
The world setting that decides which risks the bridge allows: read only, read and write, or full access.
_Avoid_: permission level (Foundry's name for document ownership)

**Query**:
A named operation the bridge exposes to the server. An action is answered by one or more queries.
_Avoid_: handler, endpoint, message

**Capabilities**:
What the connected world offers: its game system, the access level and which gated features are on.
_Avoid_: features, config

**System pack**:
All code specific to one game system, on both sides, registered in one place, with a verification status.
_Avoid_: system plugin, system support, adapter

**Verification status**:
Whether a system pack has been exercised against a live world (`verified`) or only by tests (`unverified`).
_Avoid_: support level, compatibility
