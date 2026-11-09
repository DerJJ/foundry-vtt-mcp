# Foundry VTT MCP Bridge

> **Credits.** This is a fork of [foundry-vtt-mcp](https://github.com/adambdooley/foundry-vtt-mcp) by **Adam Dooley** and its contributors (MIT licence). The module, the server, the bridge between them and most of the tools are their work; this fork restructured the code and added to it. Features from community forks by **flownzu**, **Jeffrey Winters (KillgoreAlpha)**, **Erik Gieszelmann (ErikGenibo)** and **Khelben La'Forge** were ported with the original authors kept in the git history. Who did what: [docs/CREDITS.md](docs/CREDITS.md). If you want the original, it is [here](https://github.com/adambdooley/foundry-vtt-mcp).

Connect Foundry VTT to Claude Desktop for AI-powered campaign management through the Model Context Protocol (MCP). It currently supports Dungeons and Dragons Fifth Edition, Pathfinder Second Edition, Das Schwarze Augen Fifth Edition, Cosmere RPG System, Warhammer Fantasy Roleplay 4th Edition, & Mongoose Traveller 2nd Edition. The majority of MCP tools are system agnostic or have features that are aware of the system it is working with, excluding some DSA 5 specific tools.

## Overview

The Foundry MCP Bridge enables natural AI conversations with your Foundry VTT game data:

- **Quest Creation**: [Create quests from prompts that incorporate what exists in your world and journals](https://www.youtube.com/watch?v=NqyB_z2AKME)
- **Character Management**: Query character stats, abilities, and information
- **Compendium Search**: Find items, spells, and creatures using natural language
- **Content Creation**: Generate actors, NPCs, and quest journals from simple prompts
- **Scene Information**: Access current scene data and world details
- **Dice Coordination**: Interactive roll requests with player targeting
- **Campaign Management**: Multi-part quest and campaign tracking
- **Map Generation**: Create maps from prompts and automatically upload them into scenes in Foundry VTT using the optional ComfyUI component

## Installation

### Prerequisites

- **Foundry VTT v13 or v14**
- **Claude Desktop** with MCP support
- **Windows** (for automated installer) or **Node.js 18+** for manual installation

### Option 1: Windows Installer

[Video guide for Windows Installer](https://youtu.be/Se04A21wrbE)

1. Download the latest `FoundryMCPServer-Setup-vx.x.x.exe` from [Releases](https://github.com/DerJJ/foundry-vtt-mcp/releases)
2. Run the installer - it will:
   - Install the MCP server with bundled Node.js runtime
   - Configure the Claude Desktop MCP server settings
   - Optionally install the Foundry module and ComfyUI Map Generation to your VTT installation
   - Choose Cuda version for your GPU type during install
3. Restart Claude Desktop
4. Enable "Foundry MCP Bridge" in your Foundry Module Management

### Option 2: Mac Installer

1.  Download the latest `FoundryMCPServer-vx.x.x.dmg` from [Releases](https://github.com/DerJJ/foundry-vtt-mcp/releases)
2.  Run the package installer inside the dmg - it will:
    - Open DMG and double-click the PKG installer
    - Configure the Claude Desktop MCP server settings
    - Optionally install the Foundry module and ComfyUI Map Generation to your Foundry VTT installation
3.  Restart Claude Desktop
4.  Enable "Foundry MCP Bridge" in your Foundry Module Management

### Option 3: Manual Installation

#### Install the Foundry Module

1. Open Foundry VTT (v13 or v14)
2. Select install module in the Foundry Add-ons menu
3. At the bottom of the window, add the Manifest URL as: https://github.com/DerJJ/foundry-vtt-mcp/releases/latest/download/module.json and click install
4. Enable "Foundry MCP Bridge" in Module Management
   - **Do not change the module ID or folder name.** The MCP backend and the Claude integration both expect the module to live in a directory called `foundry-mcp-bridge`. Renaming the ID in `module.json` breaks socket routing and stops Claude from seeing the backend.

#### Install the MCP Server

```bash
# Clone repository
git clone https://github.com/DerJJ/foundry-vtt-mcp.git
cd foundry-vtt-mcp

# Install dependencies and build
npm install
npm run build

```

#### Configure Claude Desktop

Add a `foundry-mcp` entry to the `mcpServers` section of your Claude Desktop configuration file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "foundry-mcp": {
      "command": "node",
      "args": ["path/to/foundry-vtt-mcp/packages/mcp-server/dist/index.js"]
    }
  }
}
```

If the file already has content, add the `foundry-mcp` entry inside the existing `mcpServers` object (create `mcpServers` if it isn't there) rather than pasting the whole block above. A second top-level `{ }` makes the file invalid JSON, and Claude Desktop will fail to load it with a "non-whitespace character" error.

No environment variables are needed for a standard setup. `FOUNDRY_PORT` sets the port the MCP server listens on for the Foundry module, and defaults to `31415`. It is not Foundry's own port (such as `30000`), and the module always connects on `31415`, so leave it unset.

Starting Claude Desktop will start the MCP Server.

> **Windows Store / MSIX installs:** If you installed Claude Desktop from the Microsoft Store, it reads its config from a virtualised path, not `%APPDATA%\Claude\`. Edit `claude_desktop_config.json` here instead:
> `%LOCALAPPDATA%\Packages\<...Claude...>\LocalCache\Roaming\Claude\claude_desktop_config.json`
> The automated Windows installer (v0.8.1+) writes to both locations for you. Note that a major Claude Desktop update can reset this container — if your tools disappear after an update, re-run the installer or re-add the `mcpServers` block at that path.

### Getting Started

1. Start Foundry VTT and load your world
2. Open Claude Desktop
3. Chat with Claude about your currently loaded Foundry World

## Example Usage

Once connected, ask Claude Desktop:

- _"Show me my character Clark's stats"_
- _"Find all CR 12 humanoid creatures for an encounter"_
- _"Create a quest about investigating missing villagers"_
- _"Roll a stealth check for Tulkas"_
- _"What's in the current Foundry scene?"_
- _"Create me a small map of a Riverside Cottage in Foundry"_

## Features

- **15 domain tools** that let Claude read and change a Foundry world, each with several actions (see [docs/TOOLS.md](docs/TOOLS.md))
- **One `documents` tool for plain changes**: list, read, create, change and delete any Foundry document at any depth: actors and the items, spells and effects on them, scenes and their walls, journals and their pages, playlists, macros, roll tables, folders, and the entries of compendium packs. `schema` shows the fields of a type for the world's game system.
- **Game systems**: Pathfinder 2e and D&D 5e are verified; DSA5, WFRP4e, Cosmere RPG and Mongoose Traveller 2e are included and unverified. No action carries a system in its name: system differences are in `schema`.
- **Character Management**: stats, abilities, inventory, spells and features of any actor
- **Token Manipulation**: move tokens and manage status conditions
- **Combat**: run the combat tracker, roll initiative, apply damage
- **Enhanced Compendium Search**: instant filtering by CR, type, abilities, and more
- **Content Creation**: quest journals and campaign dashboards, and any document through `documents`
- **Modules and settings**: see which Foundry modules are installed and running and switch them on or off, reload the GM browser to apply it, and read or change Foundry settings (never the bridge's own)
- **Interactive Dice System**: send different dice roll requests to players from Claude
- **Actor Ownership**: manage player permissions for characters and tokens
- **GM-Only**: MCP Bridge only connects to Game Master users
- **Map Generation**: A portable ComfyUI backend that generates battlemaps from prompts
- **Remote Connections**: WebRTC connections initiated through browser (Tested with Google Chrome) to MCP server and ComfyUI
- **Windows and Mac Installers** Automated installation of Foundry MCP Server for Claude Dekstop, Foundry MCP Bridge Foundry VTT Module, and ComfyUI backend with dependencies

## MCP Tools

Fifteen tools, each taking `{ "action": "...", "params": { ... } }`. Ask a tool to `describe` itself to see its actions and, for one action, its parameters. Every action, and where each tool of v0.8.6 went, is in [docs/TOOLS.md](docs/TOOLS.md).

| Tool         | For                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `world`      | world information and `capabilities` (game system, access level, what is switched on)                                                                                           |
| `documents`  | list, read, create, change and delete any document: actors and their items, scenes and their walls, journals, playlists, macros, folders, pack entries; `schema` for the fields |
| `actors`     | a compact actor view, using items and casting spells, placing on the scene, ownership, party and creature cards                                                                 |
| `compendium` | search packs, read an entry of any type, find creatures by criteria, make and delete world packs                                                                                |
| `scenes`     | the current scene, switching, ping and pull players, weather and fog                                                                                                            |
| `tokens`     | read and move tokens, status conditions                                                                                                                                         |
| `combat`     | the combat tracker and applying damage                                                                                                                                          |
| `chat`       | speak as an actor or the GM, read the chat log, GM rolls, roll tables, ask players to roll                                                                                      |
| `journals`   | quests, campaign dashboards, searching journals                                                                                                                                 |
| `modules`    | the installed and running Foundry modules, switching them on or off (applied after a reload)                                                                                    |
| `time`       | the Simple Calendar Reborn clock                                                                                                                                                |
| `audio`      | playing playlists and sounds                                                                                                                                                    |
| `macros`     | run macros and scripts (off unless "Allow script and macro execution" is on)                                                                                                    |
| `images`     | upload local images; generate maps with ComfyUI (generation off unless switched on)                                                                                             |

## Settings

<img width="964" height="803" alt="image" src="https://github.com/user-attachments/assets/bfd435d5-2df4-40a6-a79b-87e98121db3f" />

- **Enhanced Creature Index** Configure Enhanced Index button leads to Enhanced Creature Index sub-menu (Details below)
- **Map Generation Service Configuration** Configure Map Generation button leads to Map Generation Service sub-menu (Details below)
- **Enable MCP Bridge** This should be checked by default and the status should show as connected. It can be used to turn off the MCP Bridge connection within the game without the need to disable the add-on itself.
- **Connection Type** Can be set to Auto for automatic detection of connection type. Can also be set to force either WebRTC for Internet connections or Websocket for Local connections.
- **Websocket Server Host** IP Address of Claude Desktop MCP Server location. Only used for local network websocket connections. Remote Servers use WebRT. Defaults to localhost.
- **Access level** What Claude may do in this world. _Read only_: look but never change. _Read & write_ (default): create and change content. _Full access_: also delete.
- **Allow script and macro execution** Off by default; _Full access_ does not turn it on, because scripts run as code in your browser.
- **Enable image generation (ComfyUI)** Off by default. Map generation in the `images` tool refuses while this is off.
- **Max Actors Per Request** This is a failsafe to stop a massive amount of actors being created from one single request. It does not limit the amount of characters being created by multiple requests
- **Show Connection Messages** This can turn off the banner messages for connections for Foundry MCP Bridge
- **Auto-Reconnect on Disconnect** Will automatically attempt to reconnect if the connection is lost
- **Connection Check Frequency** How often it will check connection status

### Enhanced Creature Index Sub-menu

<img width="497" height="604" alt="image" src="https://github.com/user-attachments/assets/bf1a6fdb-9bd5-4256-b922-d28cf65b1e7d" />

- **Rebuild Creature Index** This button will rebuild the creature index if there is an issue or it is out of sync with changes in your compendiums
- **Enable Enhanced Creature Index** This should be left on as Claude builds additional metadata in the world files to give it better searches
- **Auto-Rebuild Index on Pack Changes** Experimental feature that hasn't been fully tested yet

### Map Generation Service Sub-menu

<img width="489" height="779" alt="image" src="https://github.com/user-attachments/assets/a43d3a3d-266f-41c9-b40a-236d14cfcba9" />

- **Service Status** There are three buttons for Check Status, Start Service, and Stop Service. These buttons help monitor and control the connection from the Foundry MCP Bridge to the ComfyUI backend which is started by the Claude Desktop application.
- **Auto-start Map Generation Service** Controls whether ComfyUI service connection is automatically connected at startup of the Foundry world.
- **Generation Quality** Controls the quality of the maps generated by the SDXL checkpoints wiht ComfyUI. Low uses 8 steps of generation, Medium uses 20 steps of generation, and High uses 35 steps. The D&D Battlemaps SDXL Upscale v1.0 Checkpoint used in this image generation recommends using 35 steps but on low end GPUs or GPUs with out CUDA, this generation will take several minutes. These options can give you a trade off to have maps generated faster at the expense of quality.

## Architecture

```
Claude Desktop ↔ MCP Protocol ↔ MCP Server ↔ WebSocket ↔ Foundry Module ↔ Foundry VTT
                                     ↓
                              ComfyUI Service
                              (AI Map Generation)
```

- **Foundry Module**: Provides secure data access within Foundry VTT
- **MCP Server**: External Node.js server handling Claude Desktop communication
- **Map Generation Service**: A headless ComfyUI backend that is spawned by Claude Desktop
- **No API Keys Required**: Uses your existing Claude Desktop subscription

## Security & Permissions

- **GM-Only Access**: All functionality restricted to Game Master users
- **Configurable Permissions**: Control what data Claude can access and modify
- **Session-Based Authentication**: Uses Foundry's built-in authentication system

## System Requirements

- **Foundry VTT**: Version 13
- **Claude Desktop**: Latest version with MCP support
- **Claude Pro/Max Plan**: Required to connect to MCP servers
- **Operating System**: Windows 10/11 (installer), or other OSes/manual Windows install with Node.js 18+ (manual)
- **GPU Requirements**: A GPU with at least 8GB of VRAM

## Schema Smoke Test

The MCP schema smoke test verifies that tool schemas load correctly and do not enforce overly strict `additionalProperties` defaults.

```bash
npm -w @foundry-mcp/server run build
npm run test:mcp:schema
```

## Support & Development

- **Issues**: Report bugs on [GitHub Issues](https://github.com/DerJJ/foundry-vtt-mcp/issues)
- **YouTube Channel**: [Subscribe for updates and tutorials](https://www.youtube.com/channel/UCVrSC-FzuAk5AgvfboJj0WA)
- **Documentation**: Built with TypeScript, comprehensive documentation included
- **License**: MIT License (Additional Third Party licenses are included for bundled components for the installers)
