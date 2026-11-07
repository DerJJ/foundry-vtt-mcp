# Foundry MCP

An MCP server that lets an AI client read and change a running Foundry VTT world through a bridge module inside Foundry.

## Language

**Server**:
The MCP server process. It speaks MCP to the client and talks to the bridge.
_Avoid_: backend (the name of one file, not the concept), MCP

**Bridge**:
The Foundry module (`foundry-mcp-bridge`) that runs in the GM's browser and does the actual work in the world.
_Avoid_: module (ambiguous with Foundry modules in general), plugin

**Tool**:
One entry in the MCP tool list, with a name, a description and an input schema.
_Avoid_: command, function

**Query**:
A named operation the bridge exposes to the server. A tool is answered by one or more queries.
_Avoid_: handler, endpoint, message

**System adapter**:
All code specific to one game system (PF2e, D&D 5e and so on), behind one shared interface, so that nothing else asks which system is running.
_Avoid_: system plugin, system support

## Process

**Baseline**:
Upstream `adambdooley/foundry-vtt-mcp` at v0.8.6, the starting point of the redesign.
_Avoid_: base, original

**Restructure**:
The first iteration: the same tools and queries as the baseline, in a proper architecture.
_Avoid_: refactor (too broad), rewrite

**Golden snapshot**:
The recorded `tools/list` output and query names of the baseline. A restructure is correct only while it reproduces the snapshot exactly.

**Unification**:
The second iteration: tools become one per resource with an action, on top of the restructure.

**Re-port**:
Bringing a feature from the integrated fork branch into the new structure, keeping its original author.
_Avoid_: cherry-pick, merge

## Introduced by the unification

These are named in the plan and take their final meaning when the unification is designed.

**Action**:
One operation of a unified tool, chosen by the tool's `action` input.

**Category**:
A group of related tools that a GM switches on or off as a unit.

**Risk level**:
How dangerous an action is: read, write, destructive or code.

**Guard**:
The single place in the bridge that decides whether a call is allowed, from the GM's settings and the action's risk level.

**Capability**:
A fact the bridge reports about itself to the server: system, versions, guard settings, active optional modules.

**Ref**:
A single string that names a Foundry document: a uuid, an id or an exact name, tried in that order.

**Result envelope**:
The one response shape every unified tool returns: success with data, warnings and chat messages, or failure with a code, message and hint.
