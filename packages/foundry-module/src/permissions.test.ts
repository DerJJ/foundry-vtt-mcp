import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionManager } from './permissions.js';

function stubGame(
  settings: Record<string, unknown>,
  user: unknown = { name: 'Gamemaster', isGM: true }
) {
  vi.stubGlobal('game', {
    settings: { get: vi.fn((_module: string, key: string) => settings[key]) },
    user,
  });
}

describe('PermissionManager', () => {
  let manager: PermissionManager;

  beforeEach(() => {
    manager = new PermissionManager();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('checkWritePermission', () => {
    it('refuses an unknown operation', () => {
      stubGame({ accessLevel: 'full' });
      expect(manager.checkWritePermission('formatDisk')).toEqual({
        allowed: false,
        reason: 'Unknown operation: formatDisk',
      });
    });

    it('refuses everything while the access level is read only', () => {
      stubGame({ accessLevel: 'readonly' });
      const result = manager.checkWritePermission('createActor');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Create Actor needs write access');
      expect(result.reason).toContain('Read only');
    });

    it('allows a low risk operation without confirmation', () => {
      stubGame({ accessLevel: 'full', maxActorsPerRequest: 10 });
      expect(manager.checkWritePermission('createActor')).toEqual({ allowed: true });
    });

    it('asks for confirmation for medium risk operations', () => {
      stubGame({ accessLevel: 'full' });
      const result = manager.checkWritePermission('modifyScene');
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.warnings?.[0]).toContain('medium risk');
    });

    it('asks for confirmation and warns for high risk operations', () => {
      stubGame({ accessLevel: 'full' });
      const result = manager.checkWritePermission('deleteData');
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.warnings?.[0]).toContain('HIGH RISK');
    });

    it('refuses a quantity above the configured maximum', () => {
      stubGame({ accessLevel: 'full', maxActorsPerRequest: 5 });
      const result = manager.checkWritePermission('createActor', { quantity: 6 });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Quantity 6 exceeds maximum allowed 5');
    });

    it('allows up to the maximum without confirmation for up to three actors', () => {
      stubGame({ accessLevel: 'full', maxActorsPerRequest: 5 });
      expect(manager.checkWritePermission('createActor', { quantity: 3 })).toEqual({
        allowed: true,
      });
    });

    it('asks for confirmation when creating more than three actors', () => {
      stubGame({ accessLevel: 'full', maxActorsPerRequest: 10 });
      const result = manager.checkWritePermission('createActor', { quantity: 4 });
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.warnings).toContain('This will create 4 actors');
    });
  });

  describe('validateOperationParameters', () => {
    it('requires a creature type to create an actor', () => {
      const result = manager.validateOperationParameters('createActor', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('creatureType is required and must be a string');
      expect(result.sanitized).toBeUndefined();
    });

    it('turns the quantity into a number', () => {
      const result = manager.validateOperationParameters('createActor', {
        creatureType: 'goblin',
        quantity: '3',
      });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual({ creatureType: 'goblin', quantity: 3 });
    });

    it.each(['0', '11', 'many'])('rejects the quantity %s', quantity => {
      const result = manager.validateOperationParameters('createActor', {
        creatureType: 'goblin',
        quantity,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('quantity must be a number between 1 and 10');
    });

    it('rejects custom names that are not a list', () => {
      const result = manager.validateOperationParameters('createActor', {
        creatureType: 'goblin',
        customNames: 'Grek',
      });
      expect(result.errors).toContain('customNames must be an array of strings');
    });

    it('requires actor ids and a known placement to modify a scene', () => {
      expect(manager.validateOperationParameters('modifyScene', {}).errors).toContain(
        'actorIds must be a non-empty array'
      );
      expect(manager.validateOperationParameters('modifyScene', { actorIds: [] }).valid).toBe(
        false
      );
      expect(
        manager.validateOperationParameters('modifyScene', { actorIds: ['a'], placement: 'spiral' })
          .errors
      ).toContain('placement must be one of: random, grid, center');
      expect(
        manager.validateOperationParameters('modifyScene', { actorIds: ['a'], placement: 'grid' })
          .valid
      ).toBe(true);
    });

    it('accepts any parameters for other operations', () => {
      expect(manager.validateOperationParameters('deleteData', { anything: 1 })).toEqual({
        valid: true,
        errors: [],
        sanitized: { anything: 1 },
      });
    });
  });

  describe('status reports', () => {
    it('lists every operation with its permission status', () => {
      stubGame({ accessLevel: 'readonly' });
      const status = manager.getOperationStatus();
      expect(Object.keys(status).sort()).toEqual([
        'bulkOperations',
        'createActor',
        'createChatMessage',
        'deleteData',
        'modifyScene',
        'modifyWorld',
      ]);
      expect(status.createActor?.allowed).toBe(false);
      expect(status.createActor?.reason).toContain('needs write access');
    });

    it('summarises the user, settings and operations', () => {
      stubGame({ accessLevel: 'full', maxActorsPerRequest: 10 });
      const summary = manager.getPermissionSummary();
      expect(summary.user).toEqual({ name: 'Gamemaster', isGM: true });
      expect(summary.settings).toEqual({ accessLevel: 'full', allowExecute: false });
      expect(summary.operations.deleteData).toBe(true);
    });

    it('falls back to an unknown user', () => {
      stubGame({ accessLevel: 'full' }, null);
      expect(manager.getPermissionSummary().user).toEqual({ name: 'Unknown', isGM: false });
    });

    it('accepts audit calls without side effects', () => {
      expect(() => manager.auditPermissionCheck('createActor', { allowed: true })).not.toThrow();
    });
  });
});

describe('access levels', () => {
  afterEach(() => vi.unstubAllGlobals());
  const manager = new PermissionManager();

  it('lets read & write create but not delete', () => {
    stubGame({ accessLevel: 'readwrite' });
    expect(manager.checkWritePermission('createActor').allowed).toBe(true);
    const refused = manager.checkWritePermission('deleteData');
    expect(refused.allowed).toBe(false);
    expect(refused.reason).toContain('Full access');
  });

  it('lets full access delete', () => {
    stubGame({ accessLevel: 'full' });
    expect(manager.checkWritePermission('deleteData').allowed).toBe(true);
  });

  it('treats a missing or unknown setting as read & write', () => {
    stubGame({});
    expect(manager.checkWritePermission('createActor').allowed).toBe(true);
    stubGame({ accessLevel: 'banana' });
    expect(manager.checkWritePermission('deleteData').allowed).toBe(false);
  });
});
