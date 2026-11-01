import { MODULE_ID } from './constants.js';

/**
 * Script and macro execution for the bridge.
 *
 * Running code in the GM client turns anything the agent has read (journal text, item
 * descriptions, chat) into possible GM-level code, so everything here is opt-in:
 * the world setting `allowScriptExecution` is off by default and gates both
 * `execute-script` and macro execution. Creating/editing macros is a normal write and
 * is not gated. Every run is logged to the GM as a whispered chat card.
 */

const g = (): any => (globalThis as any).game;

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 300000;
const MAX_LOG_ENTRIES = 200;
const MAX_RESULT_CHARS = 100000;

export function assertScriptingAllowed(): void {
  if (!g().user?.isGM) throw new Error('Access denied');
  let allowed = false;
  try {
    allowed = g().settings.get(MODULE_ID, 'allowScriptExecution') === true;
  } catch {
    allowed = false;
  }
  if (!allowed) {
    throw new Error(
      'Script execution is disabled. A GM must enable "Allow script and macro execution" in the Foundry MCP Bridge module settings.'
    );
  }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toSafe(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    const json = JSON.stringify(value);
    if (json && json.length > MAX_RESULT_CHARS) {
      return `[result truncated: ${json.length} characters, showing first ${MAX_RESULT_CHARS}] ${json.slice(0, MAX_RESULT_CHARS)}`;
    }
    return json === undefined ? null : JSON.parse(json);
  } catch {
    return String(value);
  }
}

/** Log a run to the GM as a whispered chat card. Never throws. */
async function auditRun(kind: string, label: string, source: string, outcome: string) {
  try {
    const ChatMessageCls = (globalThis as any).ChatMessage;
    const excerpt =
      source.length > 4000 ? `${source.slice(0, 4000)}\n… (${source.length} chars)` : source;
    await ChatMessageCls.create({
      content:
        `<p><strong>MCP ${escapeHtml(kind)}</strong>: ${escapeHtml(label)}</p>` +
        `<pre style="white-space:pre-wrap;max-height:12em;overflow:auto">${escapeHtml(excerpt)}</pre>` +
        `<p>${escapeHtml(outcome)}</p>`,
      whisper: [g().user.id],
    });
  } catch (error) {
    console.warn(`[${MODULE_ID}] Could not write script audit card`, error);
  }
}

interface Capture {
  logs: string[];
  notifications: Array<{ type: string; message: string }>;
  restore: () => void;
}

/** Collect console output and ui.notifications raised while a script runs. */
function startCapture(): Capture {
  const logs: string[] = [];
  const notifications: Array<{ type: string; message: string }> = [];
  const originals: Array<() => void> = [];

  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = (console as any)[level];
    (console as any)[level] = (...parts: unknown[]) => {
      if (logs.length < MAX_LOG_ENTRIES) {
        logs.push(
          `[${level}] ${parts.map(p => (typeof p === 'string' ? p : safeStringify(p))).join(' ')}`
        );
      }
      original.apply(console, parts);
    };
    originals.push(() => {
      (console as any)[level] = original;
    });
  }

  const ui = (globalThis as any).ui;
  for (const type of ['info', 'warn', 'error'] as const) {
    const original = ui?.notifications?.[type];
    if (typeof original !== 'function') continue;
    ui.notifications[type] = function (message: unknown, ...rest: unknown[]) {
      if (notifications.length < MAX_LOG_ENTRIES) {
        notifications.push({ type, message: String(message) });
      }
      return original.call(ui.notifications, message, ...rest);
    };
    originals.push(() => {
      ui.notifications[type] = original;
    });
  }

  return { logs, notifications, restore: () => originals.forEach(restore => restore()) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timed out after ${timeoutMs} ms. The script may still be running, or a dialog may be open in the GM client waiting for input.`
          )
        ),
      timeoutMs
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function clampTimeout(timeoutMs: unknown): number {
  const n =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(n, 1000), MAX_TIMEOUT_MS);
}

interface RunOutcome {
  success: boolean;
  result: unknown;
  logs: string[];
  notifications: Array<{ type: string; message: string }>;
  error?: { message: string; stack?: string };
  durationMs: number;
}

async function runCaptured(
  kind: string,
  label: string,
  source: string,
  timeoutMs: number,
  run: () => Promise<unknown>
): Promise<RunOutcome> {
  const capture = startCapture();
  const started = Date.now();
  let outcome: RunOutcome;
  try {
    const result = await withTimeout(run(), timeoutMs);
    outcome = {
      success: true,
      result: toSafe(result),
      logs: capture.logs,
      notifications: capture.notifications,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    outcome = {
      success: false,
      result: null,
      logs: capture.logs,
      notifications: capture.notifications,
      error: { message: err.message, ...(err.stack ? { stack: err.stack } : {}) },
      durationMs: Date.now() - started,
    };
  } finally {
    capture.restore();
  }
  await auditRun(
    kind,
    label,
    source,
    outcome.success ? `OK in ${outcome.durationMs} ms` : `FAILED: ${outcome.error?.message}`
  );
  return outcome;
}

/** `execute-script`: run an async function body with `args` in scope. */
export async function executeScript(data: any): Promise<any> {
  assertScriptingAllowed();
  if (!data?.code || typeof data.code !== 'string') {
    throw new Error('code is required and must be a string');
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction('game', 'canvas', 'CONFIG', 'foundry', 'ui', 'args', data.code);
  const g0 = globalThis as any;
  return runCaptured('execute-script', 'script', data.code, clampTimeout(data.timeoutMs), () =>
    fn(g0.game, g0.canvas, g0.CONFIG, g0.foundry, g0.ui, data.args ?? {})
  );
}

function findMacro(ident: unknown): any {
  const macros = g().macros;
  const key = String(ident ?? '');
  const matches = macros.filter(
    (m: any) => m.id === key || String(m.name).toLowerCase() === key.toLowerCase()
  );
  if (!matches.length) throw new Error(`Macro not found: ${key}`);
  if (matches.length > 1) {
    throw new Error(`Several macros are named ${key}: ${matches.map((m: any) => m.id).join(', ')}`);
  }
  return matches[0];
}

const describeMacro = (m: any, withCommand: boolean) => ({
  id: m.id,
  name: m.name,
  type: m.type,
  img: m.img,
  folder: m.folder?.name ?? null,
  ...(withCommand ? { command: m.command } : {}),
});

function resolveFolder(name: unknown): string | null | undefined {
  if (name === null) return null;
  if (name === undefined || name === '') return undefined;
  const folder = g().folders.find(
    (f: any) => f.type === 'Macro' && String(f.name).toLowerCase() === String(name).toLowerCase()
  );
  if (!folder) throw new Error(`Macro folder not found: ${name}`);
  return folder.id;
}

/** `manage-macros`: list / get / create / update / delete / execute. */
export async function manageMacros(data: any): Promise<any> {
  if (!g().user?.isGM) throw new Error('Access denied');
  const MacroCls = (globalThis as any).Macro;

  switch (data?.action) {
    case 'list': {
      const s = typeof data.search === 'string' ? data.search.toLowerCase() : '';
      return {
        success: true,
        macros: g()
          .macros.filter((m: any) => !s || String(m.name).toLowerCase().includes(s))
          .map((m: any) => describeMacro(m, false)),
      };
    }
    case 'get':
      return { success: true, macro: describeMacro(findMacro(data.macro), true) };
    case 'create': {
      if (!data.name || typeof data.command !== 'string') {
        throw new Error('create requires name and command');
      }
      const folder = resolveFolder(data.folder);
      const macro = await MacroCls.create({
        name: data.name,
        type: data.type === 'chat' ? 'chat' : 'script',
        command: data.command,
        ...(data.img ? { img: data.img } : {}),
        ...(folder ? { folder } : {}),
      });
      return { success: true, macro: describeMacro(macro, false) };
    }
    case 'update': {
      const macro = findMacro(data.macro);
      const folder = resolveFolder(data.folder);
      const changes: Record<string, unknown> = {};
      if (data.name !== undefined) changes.name = data.name;
      if (data.command !== undefined) changes.command = data.command;
      if (data.img !== undefined) changes.img = data.img;
      if (folder !== undefined) changes.folder = folder;
      await macro.update(changes);
      return { success: true, macro: describeMacro(macro, false) };
    }
    case 'delete': {
      const macro = findMacro(data.macro);
      const described = describeMacro(macro, false);
      await macro.delete();
      return { success: true, deleted: described };
    }
    case 'execute': {
      assertScriptingAllowed();
      const macro = findMacro(data.macro);
      const outcome = await runCaptured(
        'macro',
        macro.name,
        String(macro.command ?? ''),
        clampTimeout(data.timeoutMs),
        () => macro.execute({ args: data.args ?? {} })
      );
      return { macro: describeMacro(macro, false), ...outcome };
    }
    default:
      throw new Error(`Unknown action: ${data?.action}`);
  }
}
