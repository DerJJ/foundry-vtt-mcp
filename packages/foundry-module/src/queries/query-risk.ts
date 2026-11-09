import type { Risk } from '../access-level.js';

/**
 * The risk of every bridge query, by name without the module prefix. A query that is not in
 * this table is refused: nothing is assumed to be read-only.
 *
 * A query that serves several actions (its payload has an `action`) names a function of the
 * payload instead of a fixed risk.
 */
type RiskOf = Risk | ((data: any) => Risk);

const read: string[] = [
  'ping',
  'getCapabilities',
  'listPacks',
  'getPermissions',
  'getChatMessages',
  'findActor',
  'findPlayers',
  'get-available-conditions',
  'get-token-details',
  'getActiveScene',
  'getActorOwnership',
  'getAvailablePacks',
  'getCharacterInfo',
  'getCompendiumDocumentFull',
  'getConnectedPlayers',
  'getFriendlyNPCs',
  'getJournalContent',
  'getJournalPageContent',
  'getPartyCharacters',
  'getSystemSchema',
  'getWorldInfo',
  'getWorldItem',
  'list-scenes',
  'listCreaturesByCriteria',
  'listJournals',
  'listWorldItems',
  'searchCompendium',
  'check-map-status',
];

const write: string[] = [
  'addActorItems',
  'addActorsToScene',
  'cancel-map-job',
  'control-playlist',
  'createActorFromData',
  'createChatMessage',
  'createJournalEntry',
  'createWorldItems',
  'generate-map',
  'move-token',
  'request-player-rolls',
  'setActorOwnership',
  'switch-scene',
  'toggle-token-condition',
  'updateJournalContent',
  'updateWorldItems',
  'upload-generated-map',
  'upload-image',
  'createPack',
  'useItem',
];

const destructive: string[] = ['removeActorItems', 'deletePack'];

export const QUERY_RISK: Readonly<Record<string, RiskOf>> = {
  ...Object.fromEntries(read.map(name => [name, 'read' as Risk])),
  ...Object.fromEntries(write.map(name => [name, 'write' as Risk])),
  ...Object.fromEntries(destructive.map(name => [name, 'delete' as Risk])),
  settings: (data: any): Risk => (data?.action === 'set' ? 'write' : 'read'),
  reloadClient: 'write' as Risk,
  modules: (data: any): Risk => (data?.action === 'set-active' ? 'write' : 'read'),
  documents: (data: any): Risk =>
    data?.action === 'delete'
      ? 'delete'
      : data?.action === 'create' || data?.action === 'update'
        ? 'write'
        : 'read',
  combatControl: (data: any): Risk =>
    data?.action === 'status' ? 'read' : data?.action === 'end' ? 'delete' : 'write',
  applyDamage: 'write' as Risk,
  partyStatus: 'read' as Risk,
  gmRoll: 'write' as Risk,
  rollTable: (data: any): Risk => (data?.action === 'list' ? 'read' : 'write'),
  postChat: 'write' as Risk,
  sceneView: (data: any): Risk =>
    data?.action === 'list-weather' ? 'read' : data?.action === 'reset-fog' ? 'delete' : 'write',
  creatureCard: 'read' as Risk,
  calendarClock: (data: any): Risk => (data?.action === 'status' ? 'read' : 'write'),
  executeScript: 'execute' as Risk,
  manageMacros: (data: any): Risk =>
    data?.action === 'execute'
      ? 'execute'
      : data?.action === 'delete'
        ? 'delete'
        : data?.action === 'list' || data?.action === 'get'
          ? 'read'
          : 'write',
};

/** The risk of a call to this query, or undefined if the query has no entry. */
export function riskOfQuery(name: string, data: unknown): Risk | undefined {
  const entry = QUERY_RISK[name];
  return typeof entry === 'function' ? entry(data) : entry;
}

/**
 * Queries that belong to an optional feature a GM switches on in the module settings. A call
 * while the setting is off is refused, whatever its risk.
 */
export const QUERY_FEATURE: Readonly<Record<string, { setting: string; label: string }>> = {
  'generate-map': { setting: 'imageGenerationEnabled', label: 'Image generation' },
  'check-map-status': { setting: 'imageGenerationEnabled', label: 'Image generation' },
  'cancel-map-job': { setting: 'imageGenerationEnabled', label: 'Image generation' },
  'upload-generated-map': { setting: 'imageGenerationEnabled', label: 'Image generation' },
};
