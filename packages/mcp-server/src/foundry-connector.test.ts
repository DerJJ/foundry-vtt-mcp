import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { config } from './config.js';
import { FoundryConnector } from './foundry-connector.js';
import { Logger } from './logger.js';

const PORT = 47315;
const logger = new Logger({ level: 'error', enableConsole: false, enableFile: false });

async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise(r => setTimeout(r, 20));
  expect(condition()).toBe(true);
}

describe('connection changes', () => {
  let connector: FoundryConnector | undefined;
  afterEach(async () => {
    await connector?.stop();
    connector = undefined;
  });

  it('are announced when the bridge connects and disconnects', async () => {
    connector = new FoundryConnector({
      config: {
        ...config.foundry,
        port: PORT,
        connectionType: 'websocket',
        webrtcSignalingPort: PORT + 1,
      },
      logger,
    });
    let changes = 0;
    connector.onConnectionChange(() => changes++);
    await connector.start();

    const bridge = new WebSocket(`ws://localhost:${PORT}${config.foundry.namespace}`);
    await until(() => changes === 1);
    expect(connector.isConnected()).toBe(true);

    bridge.close();
    await until(() => changes === 2);
    expect(connector.isConnected()).toBe(false);
  });

  it('stops announcing after the listener is removed', async () => {
    connector = new FoundryConnector({
      config: {
        ...config.foundry,
        port: PORT,
        connectionType: 'websocket',
        webrtcSignalingPort: PORT + 1,
      },
      logger,
    });
    let changes = 0;
    const stop = connector.onConnectionChange(() => changes++);
    await connector.start();
    stop();
    const bridge = new WebSocket(`ws://localhost:${PORT}${config.foundry.namespace}`);
    await until(() => connector!.isConnected());
    bridge.close();
    expect(changes).toBe(0);
  });
});
