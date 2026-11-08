/**
 * Access levels and risks (ADR-0005), as the server sees them. The bridge enforces the same
 * rules; the server checks first so that the model gets a clear refusal without a round trip.
 */

/** What an action does to the world. */
export type Risk = 'read' | 'write' | 'delete' | 'execute';

export interface AccessLevelInfo {
  id: 'readonly' | 'readwrite' | 'full';
  label: string;
  allows: Risk[];
}

/** What the bridge reports about the connected world (`getCapabilities`). */
export interface Capabilities {
  system: { id: string; version: string };
  foundryVersion: string;
  moduleVersion: string | null;
  accessLevel: AccessLevelInfo;
  executeAllowed: boolean;
  imageGenerationEnabled: boolean;
}

const LEVEL_FOR_RISK: Record<Exclude<Risk, 'execute'>, string> = {
  read: 'Read only',
  write: 'Read & write',
  delete: 'Full access',
};

/** A refusal message if the world's settings do not allow this risk, otherwise undefined. */
export function checkAccess(
  capabilities: Capabilities,
  risk: Risk,
  what: string
): string | undefined {
  if (risk === 'execute') {
    return capabilities.executeAllowed
      ? undefined
      : `${what} runs code and is refused: "Allow script and macro execution" is off in the Foundry MCP Bridge module settings.`;
  }
  if (capabilities.accessLevel.allows.includes(risk)) return undefined;
  return (
    `${what} needs ${risk} access, but the access level of this world is "${capabilities.accessLevel.label}". ` +
    `A GM can raise it to "${LEVEL_FOR_RISK[risk]}" under Module Settings, Foundry MCP Bridge, Access level.`
  );
}
