import { describe, expect, it, vi } from 'vitest';
import { ErrorHandler, type MCPError } from './error-handler.js';

function createHandler() {
  const logger: any = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => logger),
  };
  return { handler: new ErrorHandler(logger), logger };
}

describe('ErrorHandler.mapFoundryError', () => {
  const { handler } = createHandler();

  it.each([
    ['Access denied for user', 'permission', true],
    ['missing permission to edit', 'permission', true],
    ['WebSocket closed', 'connection', true],
    ['request timeout', 'connection', true],
    ['Connection refused', 'connection', true],
    ['Actor creation failed', 'system', true],
    ['could not create actor', 'system', true],
    ['no active scene', 'system', true],
    ['token not placed', 'system', true],
    ['transaction aborted', 'system', true],
    ['rollback complete', 'system', true],
    ['disk on fire', 'system', false],
  ])('classifies "%s" as %s (recoverable: %s)', (message, type, recoverable) => {
    const mapped = handler.mapFoundryError(new Error(message), 'tool');
    expect(mapped.type).toBe(type);
    expect(mapped.recoverable).toBe(recoverable);
    expect(mapped.details).toBe(message);
  });

  it('accepts non-Error values', () => {
    expect(handler.mapFoundryError('Access denied', 'x').type).toBe('permission');
  });

  it('uses a creature specific message for missing creatures', () => {
    const mapped = handler.mapFoundryError(new Error('not found'), 'search compendium');
    expect(mapped.message).toBe('Creature not found in compendiums');
    expect(handler.mapFoundryError(new Error('not found'), 'creature lookup').type).toBe(
      'validation'
    );
  });

  it('uses a generic message for other invalid requests', () => {
    expect(handler.mapFoundryError(new Error('invalid id'), 'other').message).toBe(
      'Invalid request or missing data'
    );
  });
});

describe('ErrorHandler.formatErrorMessage', () => {
  const { handler } = createHandler();
  const base: MCPError = {
    type: 'validation',
    message: 'Bad input',
    suggestions: ['Try again', 'Read the docs'],
    recoverable: true,
  };

  it('shows the message, the recovery state and the suggestions', () => {
    const text = handler.formatErrorMessage(base, 'other-tool');
    expect(text).toContain('❌ **Bad input**');
    expect(text).toContain('🔄 **This can be fixed**');
    expect(text).toContain('• Try again\n• Read the docs');
    expect(text).not.toContain('search-compendium');
  });

  it('adds a tip for failed compendium creation', () => {
    expect(handler.formatErrorMessage(base, 'create-actor-from-compendium')).toContain(
      '`search-compendium`'
    );
  });

  it('marks non-recoverable errors and omits an empty suggestion list', () => {
    const text = handler.formatErrorMessage(
      { type: 'system', message: 'Broken', recoverable: false },
      't'
    );
    expect(text).toContain('⚙️ **Broken**');
    expect(text).toContain('⚠️ **System error**');
    expect(text).not.toContain('Suggestions');
  });

  it.each([
    ['user', '👤'],
    ['permission', '🔒'],
    ['connection', '🔌'],
    ['mystery', '❓'],
  ])('uses an icon for %s errors', (type, icon) => {
    expect(
      handler.formatErrorMessage({ type: type as never, message: 'm', recoverable: true }, 't')
    ).toContain(icon);
  });
});

describe('ErrorHandler.logError', () => {
  it.each([['user'], ['validation'], ['permission']])('warns for %s errors', type => {
    const { handler, logger } = createHandler();
    handler.logError({ type: type as never, message: 'm', recoverable: true }, 't');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs connection errors as errors', () => {
    const { handler, logger } = createHandler();
    handler.logError({ type: 'connection', message: 'm', recoverable: true }, 't');
    expect(logger.error).toHaveBeenCalledWith(
      'Connection error',
      expect.objectContaining({ toolName: 't' })
    );
  });

  it('logs the original error for system errors', () => {
    const { handler, logger } = createHandler();
    const original = new Error('root cause');
    handler.logError({ type: 'system', message: 'm', recoverable: false }, 't', original);
    expect(logger.error).toHaveBeenCalledWith('System error', expect.anything());
    expect(logger.error).toHaveBeenCalledWith('Original error details', original);
  });

  it('logs system errors without an original error', () => {
    const { handler, logger } = createHandler();
    handler.logError({ type: 'system', message: 'm', recoverable: false }, 't');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorHandler.handleToolError', () => {
  it('logs and throws the formatted message', () => {
    const { handler, logger } = createHandler();
    expect(() => handler.handleToolError(new Error('Access denied'), 'update-actors')).toThrow(
      /Permission denied for this operation/
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('passes the context on to the classification', () => {
    const { handler } = createHandler();
    expect(() => handler.handleToolError(new Error('not found'), 'search', 'creature')).toThrow(
      /Creature not found/
    );
  });
});

describe('ErrorHandler error builders', () => {
  const { handler } = createHandler();

  it('creates a validation error that points to the docs', () => {
    const error = handler.createValidationError('name is required', ['Pass a name']);
    expect(error).toMatchObject({
      type: 'validation',
      message: 'name is required',
      recoverable: true,
    });
    expect(error.suggestions).toEqual([
      'Pass a name',
      'Check the tool documentation for required parameters',
    ]);
  });

  it('creates a permission error, naming the setting when known', () => {
    expect(handler.createPermissionError('Deleting actors').message).toBe(
      'Deleting actors is not allowed'
    );
    expect(handler.createPermissionError('Deleting actors').suggestions).toHaveLength(2);
    expect(handler.createPermissionError('Deleting actors', 'Allow deletes').suggestions?.[0]).toBe(
      'Enable the "Allow deletes" setting in the MCP Bridge module'
    );
  });
});
