/**
 * The tool registry: the one place that knows which tools exist and how a call to each of
 * them is answered. It replaces a hand-written switch over tool names.
 */

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export type ToolHandler = (args: any) => Promise<unknown>;

/** A group of related tools: their definitions and one handler per tool name. */
export interface ToolModule {
  definitions: readonly ToolDefinition[];
  handlers: Readonly<Record<string, ToolHandler>>;
}

type MethodName<T> = {
  [K in keyof T]: T[K] extends (args: any) => Promise<unknown> ? K : never;
}[keyof T] &
  string;

/**
 * Builds the handler table of a tool class from a `tool name -> method name` map. The method
 * names are checked by the compiler.
 */
export function bindMethods<T extends object>(
  instance: T,
  methods: Readonly<Record<string, MethodName<T>>>
): Record<string, ToolHandler> {
  const handlers: Record<string, ToolHandler> = {};
  for (const [toolName, methodName] of Object.entries(methods)) {
    const method = instance[methodName] as unknown as ToolHandler;
    handlers[toolName] = args => method.call(instance, args);
  }
  return handlers;
}

export class ToolRegistry {
  private readonly definitions: ToolDefinition[] = [];
  private readonly handlers = new Map<string, ToolHandler>();

  /**
   * Registers every tool of a module. A tool without a handler, a handler without a tool and
   * a duplicate tool name are all errors.
   */
  registerModule(module: ToolModule): void {
    const defined = new Set(module.definitions.map(d => d.name));
    for (const name of Object.keys(module.handlers)) {
      if (!defined.has(name)) {
        throw new Error(`Handler registered for undefined tool: ${name}`);
      }
    }
    for (const definition of module.definitions) {
      const handler = module.handlers[definition.name];
      if (!handler) {
        throw new Error(`Tool has no handler: ${definition.name}`);
      }
      if (this.handlers.has(definition.name)) {
        throw new Error(`Duplicate tool name: ${definition.name}`);
      }
      this.definitions.push(definition);
      this.handlers.set(definition.name, handler);
    }
  }

  /** All tool definitions, in registration order. */
  list(): ToolDefinition[] {
    return [...this.definitions];
  }

  async call(name: string, args: unknown): Promise<unknown> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args);
  }
}
