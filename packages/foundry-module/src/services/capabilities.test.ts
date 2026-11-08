import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldService } from './world.js';

function stubWorld(settings: Record<string, unknown>) {
  vi.stubGlobal('game', {
    system: { id: 'pf2e', version: '8.7.0' },
    version: '14.370',
    modules: { get: () => ({ version: '1.2.3' }) },
    settings: { get: (_m: string, key: string) => settings[key] },
  });
}

describe('capabilities', () => {
  afterEach(() => vi.unstubAllGlobals());
  const service = () => new WorldService({} as any);

  it('reports the system, the access level and the gated features', () => {
    stubWorld({ accessLevel: 'full', allowExecute: true, imageGenerationEnabled: true });
    expect(service().getCapabilities()).toEqual({
      system: { id: 'pf2e', version: '8.7.0' },
      foundryVersion: '14.370',
      moduleVersion: '1.2.3',
      accessLevel: { id: 'full', label: 'Full access', allows: ['read', 'write', 'delete'] },
      executeAllowed: true,
      imageGenerationEnabled: true,
    });
  });

  it('defaults to read & write with execute and image generation off', () => {
    stubWorld({});
    const caps = service().getCapabilities();
    expect(caps.accessLevel.id).toBe('readwrite');
    expect(caps.accessLevel.allows).toEqual(['read', 'write']);
    expect(caps.executeAllowed).toBe(false);
    expect(caps.imageGenerationEnabled).toBe(false);
  });
});
