import * as net from 'net';
import type { ToolRegistry } from '../registry/tool-registry.js';
import { resolveControlPort } from '../instance.js';

export const CONTROL_HOST = '127.0.0.1';

export const CONTROL_PORT = resolveControlPort(process.env);

/**
 * Creates the control channel: a TCP server speaking JSON lines, through which the MCP front
 * process lists and calls the backend's tools.
 */
export function createControlChannel(toolRegistry: ToolRegistry): net.Server {
  return net.createServer(socket => {
    socket.setEncoding('utf8');

    // A wrapper that disconnects abruptly (ECONNRESET) must not crash the backend.
    socket.on('error', () => undefined);

    let buffer = '';

    socket.on('data', async (chunk: string) => {
      buffer += chunk;

      let idx: number;

      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();

        buffer = buffer.slice(idx + 1);

        if (!line) continue;

        try {
          const msg = JSON.parse(line) as { id: string; method: string; params?: any };

          if (msg.method === 'ping') {
            socket.write(JSON.stringify({ id: msg.id, result: { ok: true } }) + '\n');

            continue;
          }

          if (msg.method === 'list_tools') {
            socket.write(
              JSON.stringify({ id: msg.id, result: { tools: toolRegistry.list() } }) + '\n'
            );

            continue;
          }

          if (msg.method === 'call_tool') {
            const { name, args } = (msg.params || {}) as { name: string; args?: any };

            try {
              const result = await toolRegistry.call(name, args);

              const payload = {
                content: [
                  {
                    type: 'text',
                    text: typeof result === 'string' ? result : JSON.stringify(result),
                  },
                ],
              };

              socket.write(JSON.stringify({ id: msg.id, result: payload }) + '\n');
            } catch (e: any) {
              const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';

              socket.write(
                JSON.stringify({
                  id: msg.id,
                  result: {
                    content: [{ type: 'text', text: `Error: ${errorMessage}` }],
                    isError: true,
                  },
                }) + '\n'
              );
            }

            continue;
          }

          // Unknown method

          socket.write(JSON.stringify({ id: msg.id, error: { message: 'Unknown method' } }) + '\n');
        } catch (e: any) {
          try {
            socket.write(
              JSON.stringify({ error: { message: e?.message || 'Bad request' } }) + '\n'
            );
          } catch {}
        }
      }
    });
  });
}
