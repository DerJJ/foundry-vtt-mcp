import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModulesService } from './modules.js';

function fakeModule(
  id: string,
  options: { active?: boolean; requires?: string[]; title?: string } = {}
) {
  return {
    id,
    title: options.title ?? id.toUpperCase(),
    version: '1.0.0',
    active: options.active ?? false,
    library: false,
    description: `The ${id} module`,
    authors: [{ name: 'Someone' }],
    url: `https://example.org/${id}`,
    compatibility: { minimum: '13' },
    relationships: {
      requires: new Set((options.requires ?? []).map(dep => ({ id: dep, type: 'module' }))),
      recommends: new Set(),
      conflicts: new Set(),
    },
  };
}

function setup(configuration: Record<string, boolean>) {
  const modules = new Map(
    [
      fakeModule('foundry-mcp-bridge', { active: true }),
      fakeModule('lib-wrapper', { active: true }),
      fakeModule('polyglot', { active: true, requires: ['lib-wrapper'] }),
      fakeModule('tidy', { active: false, requires: ['lib-wrapper', 'missing-dep'] }),
      fakeModule('dice', { active: false, requires: ['lib-wrapper'] }),
      fakeModule('colors', { active: false }),
    ].map(m => [m.id, m])
  );
  const set = vi.fn(async () => undefined);
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'w' },
    user: { id: 'gm' },
    modules,
    settings: { get: vi.fn(() => configuration), set },
  });
  return { service: new ModulesService(), set };
}

const CONFIG = { 'foundry-mcp-bridge': true, 'lib-wrapper': true, polyglot: true, colors: false };

describe('ModulesService', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('lists the installed modules with whether they run', async () => {
      const { service } = setup(CONFIG);
      const r = await service.run({ action: 'list' });
      expect(r.total).toBe(6);
      expect(r.activeCount).toBe(3);
      expect(r.modules.find((m: any) => m.id === 'polyglot')).toMatchObject({
        active: true,
        configured: true,
        pendingReload: false,
        requires: ['lib-wrapper'],
      });
    });

    it('filters by running state and by text', async () => {
      const { service } = setup(CONFIG);
      expect((await service.run({ action: 'list', active: false })).total).toBe(3);
      expect(
        (await service.run({ action: 'list', query: 'poly' })).modules.map((m: any) => m.id)
      ).toEqual(['polyglot']);
    });

    it('shows a switch that waits for a reload', async () => {
      const { service } = setup({ ...CONFIG, colors: true, polyglot: false });
      const r = await service.run({ action: 'list' });
      expect(r.pendingReload).toBe(2);
      expect(r.note).toContain('reload');
      expect(r.modules.find((m: any) => m.id === 'colors')).toMatchObject({
        active: false,
        configured: true,
        pendingReload: true,
      });
    });
  });

  describe('get', () => {
    it('reads one module with its requirements and who needs it', async () => {
      const { service } = setup(CONFIG);
      const r = await service.run({ action: 'get', id: 'lib-wrapper' });
      expect(r).toMatchObject({ id: 'lib-wrapper', description: 'The lib-wrapper module' });
      expect(r.dependents).toEqual(['polyglot']);
      const poly = await service.run({ action: 'get', id: 'polyglot' });
      expect(poly.relationships.requires).toEqual([{ id: 'lib-wrapper', type: 'module' }]);
    });

    it('says when a module is not installed', async () => {
      const { service } = setup(CONFIG);
      await expect(service.run({ action: 'get', id: 'nope' })).rejects.toThrow('not installed');
    });
  });

  describe('set-active', () => {
    it('stores the change and says that a reload is needed', async () => {
      const { service, set } = setup(CONFIG);
      const r = await service.run({ action: 'set-active', id: 'colors', active: true });
      expect(set).toHaveBeenCalledWith('core', 'moduleConfiguration', { ...CONFIG, colors: true });
      expect(r).toMatchObject({
        success: true,
        reloadRequired: true,
        changed: [{ id: 'colors', from: false, to: true }],
      });
      expect(r.message).toContain('reload');
    });

    it('does nothing when the module is already in that state', async () => {
      const { service, set } = setup(CONFIG);
      const r = await service.run({ action: 'set-active', id: 'polyglot', active: true });
      expect(set).not.toHaveBeenCalled();
      expect(r).toMatchObject({ reloadRequired: false, changed: [], unchanged: ['polyglot'] });
    });

    it('refuses to switch on a module whose requirement is off, unless asked to include it', async () => {
      const { service, set } = setup({ ...CONFIG, 'lib-wrapper': false });
      await expect(service.run({ action: 'set-active', id: 'dice', active: true })).rejects.toThrow(
        'withDependencies'
      );
      expect(set).not.toHaveBeenCalled();
      const r = await service.run({
        action: 'set-active',
        id: 'dice',
        active: true,
        withDependencies: true,
      });
      expect(r.changed.map((c: any) => c.id).sort()).toEqual(['dice', 'lib-wrapper']);
    });

    it('refuses a module that requires one which is not installed', async () => {
      const { service } = setup(CONFIG);
      await expect(
        service.run({ action: 'set-active', id: 'tidy', active: true, withDependencies: true })
      ).rejects.toThrow('missing-dep, which is not installed');
    });

    it('refuses to switch off a module that others need, unless asked to include them', async () => {
      const { service, set } = setup(CONFIG);
      await expect(
        service.run({ action: 'set-active', id: 'lib-wrapper', active: false })
      ).rejects.toThrow('polyglot requires lib-wrapper');
      expect(set).not.toHaveBeenCalled();
      const r = await service.run({
        action: 'set-active',
        id: 'lib-wrapper',
        active: false,
        withDependents: true,
      });
      expect(r.changed.map((c: any) => c.id).sort()).toEqual(['lib-wrapper', 'polyglot']);
    });

    it('never switches off the bridge itself, also not as a dependent', async () => {
      const { service, set } = setup(CONFIG);
      await expect(
        service.run({ action: 'set-active', id: 'foundry-mcp-bridge', active: false })
      ).rejects.toThrow('connection to this tool');
      expect(set).not.toHaveBeenCalled();
    });

    it('needs ids and an explicit active', async () => {
      const { service } = setup(CONFIG);
      await expect(service.run({ action: 'set-active', active: true })).rejects.toThrow('needs id');
      await expect(service.run({ action: 'set-active', id: 'colors' })).rejects.toThrow(
        'needs active'
      );
    });

    it('changes several modules in one stored configuration', async () => {
      const { service, set } = setup(CONFIG);
      await service.run({ action: 'set-active', ids: ['colors', 'dice'], active: true });
      expect(set).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith('core', 'moduleConfiguration', {
        ...CONFIG,
        colors: true,
        dice: true,
      });
    });
  });
});
