import { vi } from 'vitest';
import { FoundryDataAccess } from '../data-access.js';

/**
 * Creates the data access for a test. Its creature index registers Foundry hooks when it is
 * built, so a stand-in for the `Hooks` global must exist first.
 */
export function createDataAccess(): FoundryDataAccess {
  vi.stubGlobal('Hooks', { on: vi.fn(() => 1), once: vi.fn(() => 1), off: vi.fn() });
  return new FoundryDataAccess();
}
