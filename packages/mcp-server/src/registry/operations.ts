import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import type { SystemRegistry } from '../systems/index.js';
import { CharacterTools } from '../tools/character.js';
import { CompendiumTools } from '../tools/compendium.js';
import { SceneTools } from '../tools/scene.js';
import { PlaylistTools } from '../tools/playlist.js';
import { QuestCreationTools } from '../tools/quest-creation.js';
import { DiceRollTools } from '../tools/dice-roll.js';
import { CampaignManagementTools } from '../tools/campaign-management.js';
import { OwnershipTools } from '../tools/ownership.js';
import { TokenManipulationTools } from '../tools/token-manipulation.js';
import { MapGenerationTools } from '../tools/map-generation.js';
import { ChatTools } from '../tools/chat.js';
import { ScriptExecutionTools } from '../tools/script-execution.js';
import { TableTools } from '../tools/table-tools.js';
import { PermissionsTools } from '../tools/permissions.js';
import { CompendiumManagementTools } from '../tools/compendium-management.js';
import { ImageUploadTools } from '../tools/image-upload.js';
import { ActorPlacementTools } from '../tools/actor-placement.js';
import { DocumentsTools } from '../tools/documents.js';
import { ModulesTools } from '../tools/modules.js';
import { SettingsTools } from '../tools/settings.js';
import { CalendarClockTools } from '../tools/calendar-clock.js';
import { DSA5JsonActorImporter } from '../systems/dsa5/json-actor-importer.js';
import { bindMethods, ToolRegistry, type ToolDefinition } from './tool-registry.js';
import type { OperationCatalog } from './domain-tool.js';

export interface ToolRegistryDeps {
  foundryClient: FoundryClient;
  logger: Logger;
  systemRegistry: SystemRegistry;
  /** Handlers for the ComfyUI messages that the map generation tools talk to. */
  backendComfyUIHandlers: any;
}

/**
 * Creates every operation (the tool classes) and registers it. The operations are not what
 * clients see: the domain tools in `create-tool-registry.ts` wrap them as actions (ADR-0004).
 */
function createOperationRegistry(deps: ToolRegistryDeps): ToolRegistry {
  const { foundryClient, logger, systemRegistry, backendComfyUIHandlers } = deps;
  const base = { foundryClient, logger };
  const registry = new ToolRegistry();

  const characterTools = new CharacterTools({ ...base, systemRegistry });
  registry.registerModule({
    definitions: characterTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(characterTools, {
      'get-character': 'handleGetCharacter',
      'use-item': 'handleUseItem',
    }),
  });

  const compendiumTools = new CompendiumTools({ ...base, systemRegistry });
  registry.registerModule({
    definitions: compendiumTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(compendiumTools, {
      'search-compendium': 'handleSearchCompendium',
      'get-compendium-item': 'handleGetCompendiumItem',
      'list-creatures-by-criteria': 'handleListCreaturesByCriteria',
    }),
  });

  const sceneTools = new SceneTools(base);
  registry.registerModule({
    definitions: sceneTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(sceneTools, {
      'get-current-scene': 'handleGetCurrentScene',
      'get-world-info': 'handleGetWorldInfo',
    }),
  });

  const actorPlacementTools = new ActorPlacementTools(base);
  registry.registerModule({
    definitions: actorPlacementTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(actorPlacementTools, { 'place-actors': 'handlePlaceActors' }),
  });

  const dsa5JsonActorImporter = new DSA5JsonActorImporter(base);
  registry.registerModule({
    definitions: dsa5JsonActorImporter.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(dsa5JsonActorImporter, {
      'import-dsa5-actor-from-json': 'handleImportActorFromJson',
    }),
  });

  const questCreationTools = new QuestCreationTools(base);
  registry.registerModule({
    definitions: questCreationTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(questCreationTools, {
      'create-quest-journal': 'handleCreateQuestJournal',
      'link-quest-to-npc': 'handleLinkQuestToNPC',
      'update-quest-journal': 'handleUpdateQuestJournal',
      'list-journals': 'handleListJournals',
      'search-journals': 'handleSearchJournals',
    }),
  });

  const chatTools = new ChatTools(base);
  registry.registerModule({
    definitions: chatTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(chatTools, { 'create-chat-message': 'handleCreateChatMessage' }),
  });

  const diceRollTools = new DiceRollTools(base);
  registry.registerModule({
    definitions: diceRollTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(diceRollTools, {
      'request-player-rolls': 'handleRequestPlayerRolls',
      'get-chat-messages': 'handleGetChatMessages',
    }),
  });

  const campaignManagementTools = new CampaignManagementTools(foundryClient, logger);
  registry.registerModule({
    definitions: campaignManagementTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(campaignManagementTools, {
      'create-campaign-dashboard': 'handleCreateCampaignDashboard',
    }),
  });

  const ownershipTools = new OwnershipTools(base);
  registry.registerModule({
    definitions: ownershipTools.getToolDefinitions() as ToolDefinition[],
    handlers: {
      'assign-actor-ownership': args =>
        ownershipTools.handleToolCall('assign-actor-ownership', args),
      'remove-actor-ownership': args =>
        ownershipTools.handleToolCall('remove-actor-ownership', args),
      'list-actor-ownership': args => ownershipTools.handleToolCall('list-actor-ownership', args),
    },
  });

  const tokenManipulationTools = new TokenManipulationTools(base);
  registry.registerModule({
    definitions: tokenManipulationTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(tokenManipulationTools, {
      'move-token': 'handleMoveToken',
      'get-token-details': 'handleGetTokenDetails',
      'toggle-token-condition': 'handleToggleTokenCondition',
      'get-available-conditions': 'handleGetAvailableConditions',
    }),
  });

  const mapGenerationTools = new MapGenerationTools({ ...base, backendComfyUIHandlers });
  registry.registerModule({
    definitions: mapGenerationTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(mapGenerationTools, {
      'generate-map': 'generateMap',
      'check-map-status': 'checkMapStatus',
      'cancel-map-job': 'cancelMapJob',
      'list-scenes': 'listScenes',
      'switch-scene': 'switchScene',
    }),
  });

  const playlistTools = new PlaylistTools(base);
  registry.registerModule({
    definitions: playlistTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(playlistTools, {
      'control-playlist': 'handleControlPlaylist',
    }),
  });

  const scriptExecutionTools = new ScriptExecutionTools(base);
  registry.registerModule({
    definitions: scriptExecutionTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(scriptExecutionTools, {
      'execute-script': 'handleExecuteScript',
      'manage-macros': 'handleManageMacros',
    }),
  });

  const tableTools = new TableTools(base);
  registry.registerModule({
    definitions: tableTools.getToolDefinitions() as ToolDefinition[],
    handlers: Object.fromEntries(
      TableTools.toolNames.map(name => [name, (args: unknown) => tableTools.handle(name, args)])
    ),
  });

  const calendarClockTools = new CalendarClockTools(base);
  registry.registerModule({
    definitions: calendarClockTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(calendarClockTools, { 'calendar-clock': 'handleCalendarClock' }),
  });

  const permissionsTools = new PermissionsTools(base);
  registry.registerModule({
    definitions: permissionsTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(permissionsTools, { 'get-permissions': 'handleGetPermissions' }),
  });

  const compendiumManagementTools = new CompendiumManagementTools(base);
  registry.registerModule({
    definitions: compendiumManagementTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(compendiumManagementTools, {
      'manage-compendiums': 'handleManageCompendiums',
    }),
  });

  const imageUploadTools = new ImageUploadTools(base);
  registry.registerModule({
    definitions: imageUploadTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(imageUploadTools, { 'upload-image': 'handleUploadImage' }),
  });

  const documentsTools = new DocumentsTools(base);
  registry.registerModule({
    definitions: documentsTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(documentsTools, { documents: 'handleDocuments' }),
  });

  const modulesTools = new ModulesTools(base);
  registry.registerModule({
    definitions: modulesTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(modulesTools, { modules: 'handleModules' }),
  });

  const settingsTools = new SettingsTools(base);
  registry.registerModule({
    definitions: settingsTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(settingsTools, {
      settings: 'handleSettings',
      'reload-browser': 'handleReloadBrowser',
    }),
  });

  return registry;
}

/** Every operation by name: its definition (schema) and its handler. */
export function createOperationCatalog(deps: ToolRegistryDeps): OperationCatalog {
  const registry = createOperationRegistry(deps);
  return new Map(
    registry
      .list()
      .map(definition => [
        definition.name,
        { definition, handler: (args: unknown) => registry.call(definition.name, args) },
      ])
  );
}
