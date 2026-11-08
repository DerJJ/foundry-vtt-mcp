import { MODULE_ID } from './constants.js';

/** What an action or query does to the world. */
export type Risk = 'read' | 'write' | 'delete' | 'execute';

/** The world setting that decides which risks are allowed. `execute` has its own checkbox. */
export type AccessLevel = 'readonly' | 'readwrite' | 'full';

export const ACCESS_LEVELS: Record<AccessLevel, { label: string; allows: readonly Risk[] }> = {
  readonly: { label: 'Read only', allows: ['read'] },
  readwrite: { label: 'Read & write', allows: ['read', 'write'] },
  full: { label: 'Full access', allows: ['read', 'write', 'delete'] },
};

export const DEFAULT_ACCESS_LEVEL: AccessLevel = 'readwrite';

const LEVEL_FOR_RISK: Record<Exclude<Risk, 'execute'>, AccessLevel> = {
  read: 'readonly',
  write: 'readwrite',
  delete: 'full',
};

function setting(key: string): unknown {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

export function readAccessLevel(): AccessLevel {
  const value = setting('accessLevel');
  return typeof value === 'string' && value in ACCESS_LEVELS
    ? (value as AccessLevel)
    : DEFAULT_ACCESS_LEVEL;
}

export function isExecuteAllowed(): boolean {
  return setting('allowExecute') === true;
}

export function isFeatureOn(settingKey: string): boolean {
  return setting(settingKey) === true;
}

export interface RiskCheck {
  allowed: boolean;
  /** Why the call is refused, written for the model and the GM. */
  reason?: string;
}

/** Whether the world's settings allow an action of this risk. */
export function checkRisk(risk: Risk, what: string): RiskCheck {
  if (risk === 'execute') {
    return isExecuteAllowed()
      ? { allowed: true }
      : {
          allowed: false,
          reason: `${what} runs code and is refused: "Allow script and macro execution" is off in the Foundry MCP Bridge module settings.`,
        };
  }
  const level = readAccessLevel();
  if (ACCESS_LEVELS[level].allows.includes(risk)) return { allowed: true };
  return {
    allowed: false,
    reason:
      `${what} needs ${risk} access, but the access level of this world is "${ACCESS_LEVELS[level].label}". ` +
      `A GM can raise it to "${ACCESS_LEVELS[LEVEL_FOR_RISK[risk]].label}" under Module Settings, Foundry MCP Bridge, Access level.`,
  };
}
