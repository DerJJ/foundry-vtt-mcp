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
      stubGame({ allowWriteOperations: true });
      expect(manager.checkWritePermission('formatDisk')).toEqual({
        allowed: false,
        reason: 'Unknown operation: formatDisk',
      });
    });

    it('refuses everything while write operations are switched off', () => {
      stubGame({ allowWriteOperations: false });
      const result = manager.checkWritePermission('createActor');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Create Actor is disabled in module settings');
    });

    it('allows a low risk operation without confirmation', () => {
      stubGame({ allowWriteOperations: true, maxActorsPerRequest: 10 });
      expect(manager.checkWritePermission('createActor')).toEqual({ allowed: true });
    });

    it('asks for confirmation for medium risk operations', () => {
      stubGame({ allowWriteOperations: true });
      const result = manager.checkWritePermission('modifyScene');
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.warnings?.[0]).toContain('medium risk');
    });

    it('asks for confirmation and warns for high risk operations', () => {
      stubGame({ allowWriteOperations: true });
      const result = manager.checkWritePermission('deleteData');
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.warnings?.[0]).toContain('HIGH RISK');
    });

    it('refuses a quantity above the configured maximum', () => {
      stubGame({ allowWriteOperations: true, maxActorsPerRequest: 5 });
      const result = manager.checkWritePermission('createActor', { quantity: 6 });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Quantity 6 exceeds maximum allowed 5');
    });

    it('allows up to the maximum without confirmation for up to three actors', () => {
      stubGame({ allowWriteOperations: true, maxActorsPerRequest: 5 });
      expect(manager.checkWritePermission('createActor', { quantity: 3 })).toEqual({
        allowed: true,
      });
    });

    it('asks for confirmation when creating more than three actors', () => {
      stubGame({ allowWriteOperations: true, maxActorsPerRequest: 10 });
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
      stubGame({ allowWriteOperations: false });
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
      expect(status.createActor?.reason).toContain('disabled');
    });

    it('summarises the user, settings and operations', () => {
      stubGame({ allowWriteOperations: true, maxActorsPerRequest: 10 });
      const summary = manager.getPermissionSummary();
      expect(summary.user).toEqual({ name: 'Gamemaster', isGM: true });
      expect(summary.settings).toEqual({ allowWriteOperations: true });
      expect(summary.operations.deleteData).toBe(true);
    });

    it('falls back to an unknown user', () => {
      stubGame({ allowWriteOperations: true }, null);
      expect(manager.getPermissionSummary().user).toEqual({ name: 'Unknown', isGM: false });
    });

    it('accepts audit calls without side effects', () => {
      expect(() => manager.auditPermissionCheck('createActor', { allowed: true })).not.toThrow();
    });
  });
});
