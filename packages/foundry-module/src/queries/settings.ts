import { SettingsService, type SettingsRequest } from '../services/settings.js';
import { validateFoundryState } from '../services/support.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

/** How long the answer has to get out before the page goes away. */
const RELOAD_DELAY_MS = 1500;

/** The `settings` query (list, get, set) and reloading the GM's own browser. */
export class SettingsQueries implements QueryGroup {
  constructor(private readonly settings: SettingsService = new SettingsService()) {}

  routes(): Record<string, QueryHandler> {
    return {
      settings: this.handleSettings.bind(this),
      reloadClient: this.handleReloadClient.bind(this),
    };
  }

  async handleSettings(data: SettingsRequest): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    try {
      return await this.settings.run(data);
    } catch (error) {
      throw new Error(
        `settings ${data?.action ?? ''}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Reloads this GM browser, which is what makes Foundry apply a module switch. The page goes
   * away a moment after the answer, and the bridge connects again by itself. Other browsers
   * (players) are not reloaded.
   */
  async handleReloadClient(): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    const reload = (): void => {
      const debounced = (globalThis as any).foundry?.utils?.debouncedReload;
      if (typeof debounced === 'function') debounced();
      else (globalThis as any).location?.reload?.();
    };
    setTimeout(reload, RELOAD_DELAY_MS);
    return {
      success: true,
      reloading: true,
      message:
        'This GM browser reloads in a moment and the bridge connects again by itself. Players are not reloaded: they need to press F5 themselves.',
    };
  }
}
