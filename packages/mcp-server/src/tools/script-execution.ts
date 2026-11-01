import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface ScriptExecutionToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const executeScriptSchema = z.object({
  code: z.string().min(1, 'Code must not be empty'),
  args: z.record(z.unknown()).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
});

const manageMacrosSchema = z
  .object({
    action: z.enum(['list', 'get', 'create', 'update', 'delete', 'execute']),
    macro: z.string().min(1).optional(),
    search: z.string().optional(),
    name: z.string().min(1).optional(),
    command: z.string().optional(),
    type: z.enum(['script', 'chat']).optional(),
    img: z.string().optional(),
    folder: z.string().nullable().optional(),
    args: z.record(z.unknown()).optional(),
    timeoutMs: z.number().int().min(1000).max(300000).optional(),
  })
  .strict();

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
          'Execute JavaScript (an async function body) in the GM browser with the Foundry API (game, canvas, CONFIG, foundry, ui) and an `args` object in scope. Use `return` to send a value back. Returns { result, logs, notifications, error, durationMs }. DISABLED unless a GM turns on "Allow script and macro execution" in the module settings. Every run is whispered to the GM as a chat card. Prefer typed tools when one exists; show the script to the user before running anything you did not write yourself. GM-only.',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description:
                'Function body to run. Example: "const a = game.actors.get(args.id); return a.items.size;". Must use `return` to send back results.',
            },
            args: {
              type: 'object',
              description: 'Values made available to the script as `args`.',
            },
            timeoutMs: {
              type: 'number',
              description:
                'Timeout in milliseconds (default 30000, max 300000). A timeout does not stop the script, it only stops waiting; a dialog open in the GM client is a common cause.',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'manage-macros',
        description:
          'Manage Foundry macros. list/get/create/update/delete work whenever write operations are allowed. execute runs a macro in the GM browser (macro.execute({ args }); the macro sees them as scope.args) and returns { result, logs, notifications, error, durationMs}; it is DISABLED unless a GM turns on "Allow script and macro execution" in the module settings. Every execution is whispered to the GM as a chat card.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'get', 'create', 'update', 'delete', 'execute'],
            },
            macro: {
              type: 'string',
              description: 'Macro id or exact name (get/update/delete/execute).',
            },
            search: { type: 'string', description: 'Name filter for list.' },
            name: { type: 'string', description: 'Macro name (create, or new name for update).' },
            command: { type: 'string', description: 'Macro source (create/update).' },
            type: {
              type: 'string',
              enum: ['script', 'chat'],
              description: 'Macro type for create (default script).',
            },
            img: { type: 'string' },
            folder: {
              type: ['string', 'null'],
              description:
                'Name of an existing Macro folder; null moves the macro to the root (update).',
            },
            args: { type: 'object', description: 'Arguments for execute.' },
            timeoutMs: { type: 'number', description: 'Timeout for execute (default 30000).' },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleExecuteScript(args: unknown): Promise<any> {
    const parsed = executeScriptSchema.parse(args);
    this.logger.info('Executing script', { codeLength: parsed.code.length });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.executeScript', parsed);
    } catch (error) {
      this.logger.error('Failed to execute script', error);
      throw new Error(
        `Failed to execute script: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleManageMacros(args: unknown): Promise<any> {
    const parsed = manageMacrosSchema.parse(args);
    this.logger.info('manage-macros', { action: parsed.action });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.manageMacros', parsed);
    } catch (error) {
      this.logger.error('manage-macros failed', error);
      throw new Error(
        `manage-macros failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
