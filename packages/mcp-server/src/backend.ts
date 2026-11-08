import { clearSystemCacheOnReconnect } from './utils/system-detection.js';
import * as os from 'os';
import * as path from 'path';
import { config } from './config.js';
import { Logger } from './logger.js';
import { FoundryClient } from './foundry-client.js';
import { createToolRegistry } from './registry/create-tool-registry.js';
import { acquireLock, releaseLock } from './backend/process-lock.js';
import { startComfyUIService } from './backend/comfyui-service.js';
import { createComfyUIMessageHandler } from './backend/comfyui-messages.js';
import { CONTROL_HOST, CONTROL_PORT, createControlChannel } from './backend/control-channel.js';

/**
 * The backend process: owns the connection to Foundry, the tools and the control channel
 * that the MCP front process talks to.
 */
async function startBackend(): Promise<void> {
  // Logger: file output allowed; avoid stdout noise

  const logger = new Logger({
    level: config.logLevel,

    format: config.logFormat,

    enableConsole: false,

    enableFile: true,

    filePath: path.join(os.tmpdir(), 'foundry-mcp-server', 'mcp-server.log'),
  });

  logger.info('Starting Foundry MCP Backend', {
    version: config.server.version,

    foundryHost: config.foundry.host,

    foundryPort: config.foundry.port,
  });

  // Initialize Foundry client and tools

  const foundryClient = new FoundryClient(config.foundry, logger);
  // A world has one game system; a new connection may be a different world.
  clearSystemCacheOnReconnect(foundryClient);

  // Initialize system registry and register adapters
  const { getSystemRegistry } = await import('./systems/index.js');
  const { DnD5eAdapter } = await import('./systems/dnd5e/adapter.js');
  const { PF2eAdapter } = await import('./systems/pf2e/adapter.js');
  const { DSA5Adapter } = await import('./systems/dsa5/adapter.js');
  const { CosmereRpgAdapter } = await import('./systems/cosmere-rpg/adapter.js');
  const { WFRP4eAdapter } = await import('./systems/wfrp4e/adapter.js');
  const { MGT2eAdapter } = await import('./systems/mgt2e/adapter.js');

  const systemRegistry = getSystemRegistry(logger);
  systemRegistry.register(new DnD5eAdapter());
  systemRegistry.register(new PF2eAdapter());
  systemRegistry.register(new DSA5Adapter());
  systemRegistry.register(new CosmereRpgAdapter());
  systemRegistry.register(new WFRP4eAdapter());
  systemRegistry.register(new MGT2eAdapter());

  logger.info('System registry initialized', {
    supportedSystems: systemRegistry.getSupportedSystems(),
  });

  // Initialize mapgen-style backend components for map generation
  let mapGenerationJobQueue: any = null;
  let mapGenerationComfyUIClient: any = null;

  try {
    // Import and initialize job queue and ComfyUI client
    const { JobQueue } = await import('./job-queue.js');
    const { ComfyUIClient } = await import('./comfyui-client.js');

    mapGenerationJobQueue = new JobQueue({ logger });

    // Initialize ComfyUI client - always runs locally on same machine as MCP server
    mapGenerationComfyUIClient = new ComfyUIClient({
      logger,
      config: {
        port: config.comfyui?.port || 31411,
      },
    });

    logger.info('Map generation backend components initialized (ComfyUI on localhost:31411)');

    // Auto-start ComfyUI if installed and autoStart is enabled
    if (mapGenerationComfyUIClient && (mapGenerationComfyUIClient as any).config?.autoStart) {
      const isInstalled = await (mapGenerationComfyUIClient as any).checkInstallation();
      if (isInstalled) {
        logger.info('Auto-starting ComfyUI service...');
        try {
          await (mapGenerationComfyUIClient as any).startService();
          logger.info('ComfyUI service auto-started successfully');
        } catch (error) {
          logger.warn('Failed to auto-start ComfyUI service', { error });
        }
      } else {
        logger.info('ComfyUI not installed, skipping auto-start');
      }
    }
  } catch (error) {
    logger.warn('Failed to initialize map generation components', { error });
  }

  // Set up global ComfyUI message handlers for WebSocket messages from Foundry BEFORE creating map tools

  (globalThis as any).backendComfyUIHandlers = createComfyUIMessageHandler({
    logger,
    foundryClient,
    mapGenerationJobQueue,
    mapGenerationComfyUIClient,
  });

  // Create and register every tool, now that the ComfyUI handlers exist
  const toolRegistry = createToolRegistry({
    foundryClient,
    logger,
    systemRegistry,
    backendComfyUIHandlers: (globalThis as any).backendComfyUIHandlers,
  });

  // Start Foundry connector (owns app port 31415)

  foundryClient.connect().catch(e => {
    logger.error('Foundry connector failed to start', e);
  });

  const autoStartComfyUI = async () => {
    try {
      logger.info('Auto-starting ComfyUI service...');

      const result = await startComfyUIService(logger);

      logger.info('ComfyUI auto-start result', result);
    } catch (error: any) {
      logger.warn('ComfyUI auto-start failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't throw - backend should continue even if ComfyUI fails to start
    }
  };

  // Control channel (TCP JSON-lines)

  const server = createControlChannel(toolRegistry);

  await new Promise<void>((resolve, reject) => {
    server.listen(CONTROL_PORT, CONTROL_HOST, () => {
      logger.info(`Backend control channel listening on ${CONTROL_HOST}:${CONTROL_PORT}`);

      resolve();
    });

    server.on('error', reject);
  });

  void autoStartComfyUI();

  // Shutdown hooks

  process.on('SIGINT', () => {
    foundryClient.disconnect();
    releaseLock();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    foundryClient.disconnect();
    releaseLock();
    process.exit(0);
  });
}

// Check lock BEFORE any async operations
// If another instance is running, wait forever silently (don't exit)
// This prevents Claude Desktop from seeing a "server closed" error
const hasLock = acquireLock();

(async function main() {
  if (!hasLock) {
    // Another backend is running - wait forever without doing anything
    // This keeps the process alive so Claude doesn't see an error
    await new Promise(() => {}); // Never resolves
    return;
  }

  process.on('exit', releaseLock);

  try {
    await startBackend();
  } catch (e: any) {
    console.error('Failed to start backend:', e?.message || e);

    releaseLock();

    process.exit(1);
  }
})();
