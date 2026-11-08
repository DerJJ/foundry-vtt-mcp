/**
 * Domain tools (ADR-0004): one MCP tool per area of the world, each with an `action` and a
 * `params` object. The tool list stays small because an action's full schema is returned on
 * request (`describe`) instead of being listed. Every action is implemented by an existing
 * operation (a "legacy" tool that is no longer listed), so the behaviour of an action is the
 * behaviour of the operation it wraps.
 */

import type { ToolDefinition, ToolHandler, ToolModule } from './tool-registry.js';
import { validateAgainstSchema } from './validate-params.js';
import type { AccessLevelInfo, Capabilities, Risk } from './access.js';
import { checkAccess } from './access.js';

/** An operation that implements an action: its definition (schema) and its handler. */
export interface Operation {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export type OperationCatalog = ReadonlyMap<string, Operation>;

export interface ActionSpec {
  /** Name of the operation that answers this action. Omit for an action with `run`. */
  operation?: string;
  risk: Risk;
  /** Arguments injected into the operation's call (for example `{ action: 'create' }`). */
  fixed?: Readonly<Record<string, unknown>>;
  /**
   * The operation's parameters that belong to this action, each with whether it is required.
   * Needed when one operation serves several actions. Without it, every parameter of the
   * operation belongs to the action and its own `required` list applies.
   */
  params?: Readonly<Record<string, boolean>>;
  /** One line for the action list. Defaults to the first sentence of the operation's description. */
  summary?: string;
  /** The action exists only for these game systems and is described only for them. */
  systems?: readonly string[];
  /** The action belongs to an optional feature that a GM switches on in the module settings. */
  feature?: 'imageGeneration';
  /** Names the array in the result that `limit` and `offset` page through. */
  paged?: string;
  /** An action with no operation behind it. */
  run?: (params: Record<string, unknown>, context: DomainContext) => Promise<unknown>;
}

export interface DomainToolSpec {
  name: string;
  /** What the tool is for, one or two sentences. */
  purpose: string;
  actions: Readonly<Record<string, ActionSpec>>;
}

/** What a domain tool needs to know about the world it is talking to. */
export interface DomainContext {
  /** The active game system id, or 'other' if it is not known. */
  system(): Promise<string>;
  /** What the bridge reports. Rejects if the bridge is not connected. */
  capabilities(): Promise<Capabilities>;
  /** Verification status of a game system's pack (ADR-0006). */
  verification(system: string): 'verified' | 'unverified';
}

const DEFAULT_LIMIT = 50;

function firstSentence(text: string | undefined, max = 110): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end > 0 ? flat.slice(0, end + 1) : flat;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

type Schema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

/** The schema of an action: the operation's schema without the arguments the action fixes. */
function actionSchema(spec: ActionSpec, catalog: OperationCatalog): Schema {
  const operation = spec.operation ? catalog.get(spec.operation) : undefined;
  const schema = (operation?.definition.inputSchema ?? {
    type: 'object',
    properties: {},
  }) as Schema;
  const fixed = new Set(Object.keys(spec.fixed ?? {}));
  const all = schema.properties ?? {};
  const selected = spec.params ? Object.keys(spec.params) : Object.keys(all);
  const properties = Object.fromEntries(
    selected.filter(key => !fixed.has(key) && key in all).map(key => [key, all[key]])
  );
  const required = spec.params
    ? Object.entries(spec.params)
        .filter(([key, isRequired]) => isRequired && !fixed.has(key))
        .map(([key]) => key)
    : (schema.required ?? []).filter(key => !fixed.has(key));
  if (spec.paged) {
    properties['limit'] = {
      type: 'integer',
      description: `Rows to return (default ${DEFAULT_LIMIT}).`,
    };
    properties['offset'] = { type: 'integer', description: 'Rows to skip (default 0).' };
  }
  const result: Schema = { ...schema, type: 'object', properties };
  if (required.length) result.required = required;
  else delete result.required;
  return result;
}

const MAX_SIGNATURE_PARAMS = 8;

/** `get(identifier*, detail?)`: required parameters are starred, optional ones have a question mark. */
function signature(name: string, schema: Schema): string {
  const required = new Set(schema.required ?? []);
  const keys = Object.keys(schema.properties ?? {});
  const shown = [...keys.filter(k => required.has(k)), ...keys.filter(k => !required.has(k))].slice(
    0,
    MAX_SIGNATURE_PARAMS
  );
  const parts = shown.map(k => (required.has(k) ? `${k}*` : `${k}?`));
  if (keys.length > shown.length) parts.push(`…+${keys.length - shown.length}`);
  return `${name}(${parts.join(', ')})`;
}

function actionSummary(spec: ActionSpec, catalog: OperationCatalog): string {
  if (spec.summary) return spec.summary;
  const operation = spec.operation ? catalog.get(spec.operation) : undefined;
  return firstSentence(operation?.definition.description);
}

/** Builds the MCP definition and the handler of one domain tool. */
export function buildDomainTool(
  spec: DomainToolSpec,
  catalog: OperationCatalog,
  context: DomainContext
): ToolModule {
  const entries = Object.entries(spec.actions);
  for (const [action, actionSpec] of entries) {
    if (actionSpec.operation && !catalog.has(actionSpec.operation)) {
      throw new Error(`${spec.name}.${action}: unknown operation ${actionSpec.operation}`);
    }
    if (!actionSpec.operation && !actionSpec.run) {
      throw new Error(`${spec.name}.${action}: needs an operation or a run function`);
    }
  }

  // The listed actions are the ones every system has; system actions are only described.
  const general = entries.filter(([, a]) => !a.systems);
  const lines = general.map(([name, a]) => {
    const risk = a.risk === 'delete' || a.risk === 'execute' ? ` (${a.risk})` : '';
    return `- ${signature(name, actionSchema(a, catalog))}${risk}: ${actionSummary(a, catalog)}`;
  });
  const hasSystemActions = entries.some(([, a]) => a.systems);
  const description =
    `${spec.purpose}\n\n` +
    `Call with {"action": "<name>", "params": {...}}. Parameters: * required, ? optional.\n` +
    `${lines.join('\n')}\n\n` +
    `{"action":"describe"} lists the actions of this world's game system${
      hasSystemActions ? ' (including system-specific ones)' : ''
    }; {"action":"describe","params":{"action":"<name>"}} returns the full parameter schema of one action.`;

  const definition: ToolDefinition = {
    name: spec.name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'The action to run, from the list in the description.',
        },
        params: {
          type: 'object',
          additionalProperties: true,
          description: 'Arguments of the action. Use describe for the full schema.',
        },
      },
      required: ['action'],
    },
  };

  async function available(): Promise<Array<[string, ActionSpec]>> {
    const system = await context.system();
    return entries.filter(([, a]) => !a.systems || a.systems.includes(system));
  }

  async function describe(params: Record<string, unknown>): Promise<unknown> {
    const system = await context.system();
    const list = await available();
    if (typeof params['action'] === 'string') {
      const found = list.find(([name]) => name === params['action']);
      if (!found) throw unknownAction(spec.name, String(params['action']), list, system);
      const [name, actionSpec] = found;
      return {
        tool: spec.name,
        action: name,
        risk: actionSpec.risk,
        summary: actionSummary(actionSpec, catalog),
        inputSchema: actionSchema(actionSpec, catalog),
        ...(actionSpec.paged ? { paging: { limit: DEFAULT_LIMIT, offset: 0 } } : {}),
      };
    }
    return {
      tool: spec.name,
      system,
      verification: context.verification(system),
      actions: list.map(([name, a]) => ({
        action: name,
        risk: a.risk,
        signature: signature(name, actionSchema(a, catalog)),
        summary: actionSummary(a, catalog),
        ...(a.systems ? { systems: a.systems } : {}),
      })),
    };
  }

  const handler: ToolHandler = async (args: unknown) => {
    const { action, params } = splitArguments(args);
    if (!action) {
      throw new Error(
        `${spec.name}: "action" is required. Call {"action":"describe"} to list them.`
      );
    }
    if (action === 'describe') return describe(params);

    const list = await available();
    const found = list.find(([name]) => name === action);
    if (!found) throw unknownAction(spec.name, action, list, await context.system());
    const [, actionSpec] = found;

    // If the bridge cannot be asked, the call below fails with the connection error itself.
    const capabilities = await context.capabilities().catch(() => undefined);
    if (capabilities) {
      if (actionSpec.feature === 'imageGeneration' && !capabilities.imageGenerationEnabled) {
        throw new Error(
          `${spec.name}.${action}: image generation is off. A GM can switch it on under Module Settings, Foundry MCP Bridge.`
        );
      }
      const refusal = checkAccess(capabilities, actionSpec.risk, `${spec.name}.${action}`);
      if (refusal) throw new Error(refusal);
    }

    if (actionSpec.run) return actionSpec.run(params, context);

    const schema = actionSchema(actionSpec, catalog);
    const errors = validateAgainstSchema(schema, params);
    if (errors.length) {
      throw new Error(
        `${spec.name}.${action}: invalid params: ${errors.join('; ')}. ` +
          `Call {"action":"describe","params":{"action":"${action}"}} for the schema.`
      );
    }

    const operation = catalog.get(actionSpec.operation!)!;
    const callParams = { ...params, ...(actionSpec.fixed ?? {}) };
    const paging = actionSpec.paged ? takePaging(callParams) : undefined;
    const result = await operation.handler(callParams);
    return paging && actionSpec.paged ? applyPaging(result, actionSpec.paged, paging) : result;
  };

  return { definitions: [definition], handlers: { [spec.name]: handler } };
}

function unknownAction(
  tool: string,
  action: string,
  list: Array<[string, ActionSpec]>,
  system: string
): Error {
  return new Error(
    `${tool}: unknown action "${action}" for game system ${system}. ` +
      `Actions: ${list.map(([name]) => name).join(', ')}, describe.`
  );
}

/** Accepts `{action, params}` and also arguments placed beside `action` instead of in `params`. */
function splitArguments(args: unknown): {
  action: string | undefined;
  params: Record<string, unknown>;
} {
  const input = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  const { action, params, ...rest } = input;
  const nested = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
  return {
    action: typeof action === 'string' ? action : undefined,
    params: { ...rest, ...nested },
  };
}

interface Paging {
  limit: number;
  offset: number;
}

function takePaging(params: Record<string, unknown>): Paging {
  const limit = Number(params['limit']);
  const offset = Number(params['offset']);
  delete params['limit'];
  delete params['offset'];
  return {
    limit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  };
}

function applyPaging(result: unknown, key: string, { limit, offset }: Paging): unknown {
  if (!result || typeof result !== 'object') return result;
  const record = result as Record<string, unknown>;
  const rows = record[key];
  if (!Array.isArray(rows)) return result;
  return {
    ...record,
    [key]: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
    hasMore: offset + limit < rows.length,
  };
}

export type { AccessLevelInfo };
