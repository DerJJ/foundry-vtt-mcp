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
  'getChatMessages',
  'findActor',
  'findPlayers',
  'get-available-conditions',
  'get-token-details',
  'getActiveScene',
  'getActorOwnership',
  'getAvailableConditions',
  'getAvailablePacks',
  'getCharacterEntity',
  'getCharacterInfo',
  'getCompendiumDocumentFull',
  'getConnectedPlayers',
  'getEnhancedCreatureIndex',
  'getFriendlyNPCs',
  'getJournalContent',
  'getJournalPageContent',
  'getPackIndex',
  'getPartyCharacters',
  'getSystemSchema',
  'getTokenDetails',
  'getWorldInfo',
  'getWorldItem',
  'list-scenes',
  'listActors',
  'listCreaturesByCriteria',
  'listJournals',
  'listWorldItems',
  'searchCharacterItems',
  'searchCompendium',
  'validateWritePermissions',
  'check-map-status',
];

const write: string[] = [
  'addActorItems',
  'addActorsToScene',
  'addAttackToActor',
  'addAttackWithSaveToActor',
  'addAuraToActor',
  'addFeaturesFromCompendium',
  'addPassiveFeatureToActor',
  'addSaveFeatureToActor',
  'addSpellsToActor',
  'addWfrp4eItems',
  'cancel-map-job',
  'control-playlist',
  'createActorFromCompendium',
  'createActorFromData',
  'createActors',
  'createChatMessage',
  'createJournalEntry',
  'createNpcActor',
  'createWorldItems',
  'generate-map',
  'move-token',
  'moveToken',
  'request-player-rolls',
  'setActorOwnership',
  'setActorSpellcasting',
  'switch-scene',
  'toggle-token-condition',
  'toggleTokenCondition',
  'update-scene-music',
  'update-token',
  'updateToken',
  'updateActorItems',
  'updateActors',
  'updateCampaignProgress',
  'updateJournalContent',
  'updateWfrp4eActor',
  'updateWorldItems',
  'upload-generated-map',
  'useItem',
];

const destructive: string[] = [
  'delete-tokens',
  'deleteTokens',
  'deleteActorItems',
  'deleteActors',
  'removeActorItems',
];

export const QUERY_RISK: Readonly<Record<string, RiskOf>> = {
  ...Object.fromEntries(read.map(name => [name, 'read' as Risk])),
  ...Object.fromEntries(write.map(name => [name, 'write' as Risk])),
  ...Object.fromEntries(destructive.map(name => [name, 'delete' as Risk])),
  manageEffects: (data: any): Risk => (data?.action === 'delete' ? 'delete' : 'write'),
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
  manageScene: (data: any): Risk =>
    data?.action === 'list-documents'
      ? 'read'
      : data?.action === 'delete-documents'
        ? 'delete'
        : 'write',
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
  'manage-playlists': (data: any): Risk =>
    data?.action === 'delete' ? 'delete' : data?.action === 'describe' ? 'read' : 'write',
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
