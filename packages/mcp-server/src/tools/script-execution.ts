import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface ScriptExecutionToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class ScriptExecutionTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: ScriptExecutionToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ScriptExecutionTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'execute-script',
        description:
          'Execute arbitrary JavaScript in the Foundry VTT client context. Has full access to the Foundry API (game, canvas, CONFIG, etc.). Use for operations not covered by other tools. The script should return a value (use `return` statement). GM-only.',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description:
                'JavaScript code to execute in Foundry. Has access to all Foundry globals (game, canvas, CONFIG, foundry, etc.). Must use `return` to send back results. Example: "const actor = game.actors.getName(\'Ringo\'); return actor.system;"',
            },
          },
          required: ['code'],
        },
      },
    ];
  }

  async handleExecuteScript(args: any): Promise<any> {
    const schema = z.object({
      code: z.string().min(1, 'Code must not be empty'),
    });

    const parsed = schema.parse(args);
    this.logger.info('Executing script', { codeLength: parsed.code.length });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.executeScript', {
        code: parsed.code,
      });

      return {
        success: true,
        result: result.result,
        message: result.message || 'Script executed successfully',
      };
    } catch (error) {
      this.logger.error('Failed to execute script', error);
      throw new Error(
        `Failed to execute script: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
