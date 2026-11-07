import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from '../logger.js';
import { FoundryClient } from '../foundry-client.js';
import { checkComfyUIStatus, startComfyUIService, stopComfyUIService } from './comfyui-service.js';
import {
  handleCancelMapJobRequest,
  handleCheckMapStatusRequest,
  handleGenerateMapRequest,
} from './map-generation.js';

/** What the message handlers need from the backend. */
export interface ComfyUIMessageContext {
  logger: Logger;
  foundryClient: FoundryClient;
  mapGenerationJobQueue: any;
  mapGenerationComfyUIClient: any;
}

type ComfyUIMessageHandler = (message: any, context: ComfyUIMessageContext) => Promise<any>;

const DEBUG_LOG = path.join(os.tmpdir(), 'backend-handler-debug.log');

async function writeDebugLine(line: string): Promise<void> {
  await fs.promises.appendFile(DEBUG_LOG, `[${new Date().toISOString()}] ${line}\n`);
}

/** The ComfyUI messages that Foundry can send, by message type. */
const messageHandlers: Readonly<Record<string, ComfyUIMessageHandler>> = {
  'start-comfyui-service': (_message, { logger }) => startComfyUIService(logger),

  'stop-comfyui-service': (_message, { logger }) => stopComfyUIService(logger),

  'check-comfyui-status': () => checkComfyUIStatus(),

  'generate-map-request': async (message, context) => {
    await writeDebugLine('Matched generate-map-request case, calling handler...');
    const result = await handleGenerateMapRequest(
      message,
      context.mapGenerationJobQueue,
      context.mapGenerationComfyUIClient,
      context.logger,
      context.foundryClient
    );
    await writeDebugLine(`Handler returned: ${JSON.stringify(result)}`);
    return result;
  },

  'check-map-status-request': (message, context) =>
    handleCheckMapStatusRequest(message.data, context.mapGenerationJobQueue, context.logger),

  'cancel-map-job-request': (message, context) =>
    handleCancelMapJobRequest(
      message.data,
      context.mapGenerationJobQueue,
      context.mapGenerationComfyUIClient,
      context.logger
    ),
};

/**
 * Creates the handler for the ComfyUI messages that arrive from Foundry. The result is also
 * sent back to Foundry as `<type>-response` when the message carries a request id.
 */
export function createComfyUIMessageHandler(context: ComfyUIMessageContext) {
  const { logger, foundryClient } = context;

  return {
    handleMessage: async (message: any) => {
      await writeDebugLine(
        `handleMessage called - type: ${message?.type}, requestId: ${message?.requestId}`
      );

      logger.info('Handling ComfyUI message', {
        requestId: message.requestId,
        type: message.type,
        hasData: !!message.data,
      });

      try {
        await writeDebugLine(`About to switch on message.type: "${message.type}"`);

        let result: any;
        const handler = Object.prototype.hasOwnProperty.call(messageHandlers, message.type)
          ? messageHandlers[message.type]
          : undefined;
        if (handler) {
          result = await handler(message, context);
        } else {
          logger.warn('Unknown ComfyUI message type', { type: message.type });
          result = { status: 'error', message: `Unknown message type: ${message.type}` };
        }

        // Send response back through foundryClient if requestId is provided
        if (message.requestId && foundryClient) {
          const response = {
            type: `${message.type}-response`,
            requestId: message.requestId,
            ...result,
          };

          try {
            foundryClient.sendMessage(response);
          } catch (error) {
            logger.error('Failed to send ComfyUI response to Foundry', { error, response });
          }
        }

        return result;
      } catch (error: any) {
        logger.error('ComfyUI message handling failed', {
          requestId: message.requestId,
          type: message.type,
          error: error.message,
        });

        const errorResult = {
          status: 'error',
          message: error.message,
        };

        // Send error response if requestId provided
        if (message.requestId && foundryClient) {
          try {
            foundryClient.sendMessage({
              type: `${message.type}-response`,
              requestId: message.requestId,
              ...errorResult,
            });
          } catch (sendError) {
            logger.error('Failed to send ComfyUI error response', { sendError });
          }
        }

        return errorResult;
      }
    },
  };
}
