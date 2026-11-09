# Foundry VTT MCP Bridge - Installation Guide

> This is a fork of [foundry-vtt-mcp](https://github.com/adambdooley/foundry-vtt-mcp) by Adam Dooley and its contributors. See [docs/CREDITS.md](docs/CREDITS.md).

## Overview

The bridge has two parts:

1. **Foundry module** ("Foundry MCP Bridge"): installed through Foundry's module manager, runs in the GM's browser.
2. **MCP server**: a small program that your AI client starts. It connects to the module and offers the tools to the AI.

```text
AI client ──stdio──> MCP server ──:31415──> Foundry module (GM browser)
```

## Prerequisites

- **Foundry VTT** v13 or v14, with a GM logged in. Verified on Pathfinder 2e 8.7.0 and D&D 5e 6.0.6. Other systems are included but not verified, see [docs/adr/0006-game-systems-as-packs.md](docs/adr/0006-game-systems-as-packs.md).
- **An MCP client**: Claude Desktop or Claude Code (any client that starts MCP servers over stdio works).
- **Node.js 18+** for a manual installation. The Windows installer brings its own.

## Upgrading from v0.8.6

Version 1.0 replaces the 50 tools with 14 domain tools, **without aliases**. Old prompts and saved instructions that name a tool such as `search-compendium` need to be updated: [docs/TOOLS.md](docs/TOOLS.md#migration-from-the-50-tools-of-v086) lists where every old tool went.

Check the module settings after the update:

- **Access level** is new. It replaces "Allow Write Operations", which is not carried over. The default is _Read & write_. Choose _Read only_ if the AI should only look, or _Full access_ if it may also delete.
- **Allow script and macro execution** is off and stays off until you switch it on.
- **Image generation (ComfyUI)** is off by default.

## Option 1: Windows installer

1. Download the latest `FoundryMCPServer-Setup.exe` from [Releases](https://github.com/DerJJ/foundry-vtt-mcp/releases).
2. Run it. It installs the MCP server with its own Node.js runtime, configures Claude Desktop and optionally installs the Foundry module.
3. Restart Claude Desktop.
4. Enable "Foundry MCP Bridge" in your world's Module Management.

## Option 2: Manual installation

### The Foundry module

1. In Foundry, open **Add-on Modules** and choose **Install Module**.
2. Paste this manifest URL at the bottom and click **Install**:
   `https://github.com/DerJJ/foundry-vtt-mcp/releases/latest/download/module.json`
3. Enable "Foundry MCP Bridge" in your world's Module Management.

### The MCP server

```bash
git clone https://github.com/DerJJ/foundry-vtt-mcp.git
cd foundry-vtt-mcp
npm install
npm run build
```

### Connect your AI client

**Claude Desktop:** add a `foundry-mcp` entry to the `mcpServers` section of `claude_desktop_config.json`:

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

If the file already has content, add the entry inside the existing `mcpServers` object instead of pasting the whole block; a second top-level `{ }` makes the file invalid JSON.

**Claude Code:** `claude mcp add foundry-mcp -- node path/to/foundry-vtt-mcp/packages/mcp-server/dist/index.js`

No environment variables are needed for a standard setup. The module connects on port `31415` (`FOUNDRY_PORT`; leave it unset). The control channel between the two server processes uses `31414`, and WebRTC signalling `31416`. To run a second server beside the first, set `FOUNDRY_MCP_CONTROL_PORT`, `FOUNDRY_PORT` and `FOUNDRY_WEBRTC_SIGNALING_PORT` to free ports (and the same port in the module settings).

Starting the AI client starts the server. Only one server can use the ports at a time: close other MCP clients that run it, or the module cannot connect.

## Configuration

In Foundry: **Settings → Module Settings → Foundry MCP Bridge.**

| Setting                               | Default              | What it does                                                                                                                                                                                                                         |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enable MCP Bridge                     | on                   | Connects this GM browser to the server.                                                                                                                                                                                              |
| Server host and port                  | `localhost`, `31415` | Where the MCP server listens. The module keeps trying to connect until the server is up.                                                                                                                                             |
| **Access level**                      | Read & write         | _Read only_: the AI can look but not change anything. _Read & write_: it can also create and change. _Full access_: it can also delete. Every action carries a risk, see [ADR-0005](docs/adr/0005-access-levels-and-action-risk.md). |
| **Allow script and macro execution**  | off                  | A separate switch for running JavaScript and macros. Every run is whispered to the GM as a chat card.                                                                                                                                |
| **Enable image generation (ComfyUI)** | off                  | Map generation through ComfyUI. Needs ComfyUI installed; nothing starts or logs while this is off.                                                                                                                                   |
| Enhanced creature index               | on                   | Speeds up creature searches. It is built in the background after the world loads; a creature search waits for it.                                                                                                                    |

## Verify

1. **Port:** `netstat -an | findstr 31415` (Windows) or `netstat -an | grep 31415` (macOS and Linux) shows a listener once your AI client has started the server.
2. **Foundry console** (F12): look for `[foundry-mcp-bridge] GM connection established`. The settings page shows the connection status.
3. **In your AI client**, ask it to call the `world` tool with `capabilities`. It answers with the game system, the access level and which gated features are on. Then try "List all characters in my world" or "Search the compendium for dragons".

[docs/TOOLS.md](docs/TOOLS.md) lists every tool and action. The AI can ask any tool for the actions of the current game system with the `describe` action.

## Troubleshooting

- **The module does not connect.** Another process holds port 31415 (a second AI client with this server, or an old server). Find it with `netstat -ano | findstr 31415` and close it. After the server is up the module connects by itself within about 30 seconds; a page reload is not needed.
- **An action is refused with "needs write access" or "needs Full access".** The access level is too low for it. Raise it in the module settings.
- **`find-creatures` says the index is building.** The first build reads every actor pack and can take a few minutes; the search waits for it.
- **Console errors about ComfyUI.** None are expected while image generation is off. If you see them, report it.

## Support

- **Issues:** [GitHub Issues](https://github.com/DerJJ/foundry-vtt-mcp/issues). For problems in the original project's code, the [original repository](https://github.com/adambdooley/foundry-vtt-mcp/issues) may know more.
- **Credits:** [docs/CREDITS.md](docs/CREDITS.md).

## Uninstallation

### Windows

1. Disable the module in your Foundry world.
2. Run "Foundry MCP Bridge Uninstaller" in Add or Remove Programs.
3. Restart Claude Desktop.

### Manual

- **Foundry module:** uninstall it in Foundry's Add-on Modules.
- **MCP server:** delete the folder and remove the `foundry-mcp` entry from your AI client's configuration.
