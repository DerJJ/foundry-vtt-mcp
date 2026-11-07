import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionManager } from './transaction-manager.js';

describe('TransactionManager', () => {
  let manager: TransactionManager;
  let nextId: number;
  let actors: Map<string, { delete: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }>;
  let tokens: Map<string, { delete: ReturnType<typeof vi.fn> }>;
  let actorCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nextId = 0;
    actors = new Map();
    tokens = new Map();
    actorCreate = vi.fn();
    vi.stubGlobal('foundry', { utils: { randomID: () => `tx${++nextId}` } });
    vi.stubGlobal('game', { actors, scenes: { current: { tokens } } });
    vi.stubGlobal('Actor', { create: actorCreate });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    manager = new TransactionManager();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function addActor(id: string) {
    const actor = { delete: vi.fn(), update: vi.fn() };
    actors.set(id, actor);
    return actor;
  }

  describe('life cycle', () => {
    it('starts a transaction that is active and not completed', () => {
      const id = manager.startTransaction('spawn goblins');
      expect(id).toBe('tx1');
      const [transaction] = manager.getActiveTransactions();
      expect(transaction).toMatchObject({
        id,
        description: 'spawn goblins',
        actions: [],
        completed: false,
        rolledBack: false,
      });
    });

    it('collects actions and moves a committed transaction into the history', () => {
      const id = manager.startTransaction('spawn');
      manager.addAction(id, manager.createActorCreationAction('a1'));
      manager.commitTransaction(id);

      expect(manager.getActiveTransactions()).toEqual([]);
      const history = manager.getTransactionHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.completed).toBe(true);
      expect(history[0]?.actions).toEqual([
        { type: 'create', entityType: 'Actor', entityId: 'a1' },
      ]);
    });

    it('refuses actions and commits for an unknown transaction', () => {
      expect(() => manager.addAction('nope', manager.createActorCreationAction('a'))).toThrow(
        'Transaction nope not found or already completed'
      );
      expect(() => manager.commitTransaction('nope')).toThrow('Transaction nope not found');
    });

    it('keeps only the last 50 transactions in the history', () => {
      for (let i = 0; i < 52; i++) manager.commitTransaction(manager.startTransaction(`t${i}`));
      const history = manager.getTransactionHistory();
      expect(history).toHaveLength(50);
      expect(history[0]?.description).toBe('t2');
    });

    it('returns a copy of the history and can clear it', () => {
      manager.commitTransaction(manager.startTransaction('t'));
      manager.getTransactionHistory().pop();
      expect(manager.getTransactionHistory()).toHaveLength(1);
      manager.clearHistory();
      expect(manager.getTransactionHistory()).toEqual([]);
    });

    it('cancels an active transaction without rolling back, and ignores unknown ones', () => {
      const id = manager.startTransaction('t');
      manager.cancelTransaction(id);
      manager.cancelTransaction('unknown');
      expect(manager.getActiveTransactions()).toEqual([]);
    });

    it('describes token creation actions', () => {
      expect(manager.createTokenCreationAction('t1')).toEqual({
        type: 'create',
        entityType: 'Token',
        entityId: 't1',
      });
    });
  });

  describe('rollback', () => {
    it('deletes created actors and tokens, newest first', async () => {
      const actor = addActor('a1');
      const token = { delete: vi.fn() };
      tokens.set('t1', token);
      const order: string[] = [];
      actor.delete.mockImplementation(async () => void order.push('actor'));
      token.delete.mockImplementation(async () => void order.push('token'));

      const id = manager.startTransaction('spawn');
      manager.addAction(id, manager.createActorCreationAction('a1'));
      manager.addAction(id, manager.createTokenCreationAction('t1'));

      expect(await manager.rollbackTransaction(id)).toEqual({ success: true, errors: [] });
      expect(order).toEqual(['token', 'actor']);
      expect(manager.getActiveTransactions()).toEqual([]);
    });

    it('skips entities that no longer exist', async () => {
      const id = manager.startTransaction('spawn');
      manager.addAction(id, manager.createActorCreationAction('gone'));
      manager.addAction(id, manager.createTokenCreationAction('gone'));
      expect((await manager.rollbackTransaction(id)).success).toBe(true);
    });

    it('skips tokens when there is no current scene', async () => {
      vi.stubGlobal('game', { actors, scenes: { current: undefined } });
      const id = manager.startTransaction('spawn');
      manager.addAction(id, manager.createTokenCreationAction('t1'));
      expect((await manager.rollbackTransaction(id)).success).toBe(true);
    });

    it('restores the original data of an updated actor', async () => {
      const actor = addActor('a1');
      const id = manager.startTransaction('edit');
      manager.addAction(id, {
        type: 'update',
        entityType: 'Actor',
        entityId: 'a1',
        originalData: { name: 'Old' },
      });
      await manager.rollbackTransaction(id);
      expect(actor.update).toHaveBeenCalledWith({ name: 'Old' });
    });

    it('recreates a deleted actor', async () => {
      const id = manager.startTransaction('delete');
      manager.addAction(id, {
        type: 'delete',
        entityType: 'Actor',
        originalData: { name: 'Back' },
      });
      await manager.rollbackTransaction(id);
      expect(actorCreate).toHaveBeenCalledWith({ name: 'Back' });
    });

    it('can roll back a committed transaction from the history, once', async () => {
      const actor = addActor('a1');
      const id = manager.startTransaction('spawn');
      manager.addAction(id, manager.createActorCreationAction('a1'));
      manager.commitTransaction(id);

      await manager.rollbackTransaction(id);
      expect(actor.delete).toHaveBeenCalledTimes(1);
      await expect(manager.rollbackTransaction(id)).rejects.toThrow('has already been rolled back');
    });

    it('rejects an unknown transaction', async () => {
      await expect(manager.rollbackTransaction('nope')).rejects.toThrow(
        'Transaction nope not found'
      );
    });

    it('collects errors, keeps going and reports failure', async () => {
      const actor = addActor('a1');
      const id = manager.startTransaction('mixed');
      manager.addAction(id, manager.createActorCreationAction('a1'));
      manager.addAction(id, { type: 'create', entityType: 'Scene', entityId: 's1' });
      manager.addAction(id, { type: 'create', entityType: 'Actor' });
      manager.addAction(id, { type: 'update', entityType: 'Actor', entityId: 'a1' });
      manager.addAction(id, {
        type: 'update',
        entityType: 'Token',
        entityId: 't',
        originalData: {},
      });
      manager.addAction(id, { type: 'delete', entityType: 'Actor' });
      manager.addAction(id, { type: 'delete', entityType: 'Item', originalData: {} });
      manager.addAction(id, { type: 'explode' as never, entityType: 'Actor' });

      const result = await manager.rollbackTransaction(id);
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(7);
      expect(result.errors.join('\n')).toContain('Rollback not implemented for entity type: Scene');
      expect(result.errors.join('\n')).toContain('missing entityId');
      expect(result.errors.join('\n')).toContain('missing entityId or originalData');
      expect(result.errors.join('\n')).toContain('missing originalData');
      expect(result.errors.join('\n')).toContain('Unknown action type: explode');
      expect(actor.delete).toHaveBeenCalled();
    });

    it('reports an unknown error type', async () => {
      const actor = addActor('a1');
      actor.delete.mockRejectedValue('boom');
      const id = manager.startTransaction('t');
      manager.addAction(id, manager.createActorCreationAction('a1'));
      expect((await manager.rollbackTransaction(id)).errors).toEqual([
        'Failed to rollback action 0: Unknown error',
      ]);
    });
  });
});
