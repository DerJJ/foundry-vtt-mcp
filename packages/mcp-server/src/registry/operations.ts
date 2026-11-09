import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import type { SystemRegistry } from '../systems/index.js';
import { CharacterTools } from '../tools/character.js';
import { CompendiumTools } from '../tools/compendium.js';
import { SceneTools } from '../tools/scene.js';
import { PlaylistTools } from '../tools/playlist.js';
import { ActorCreationTools } from '../tools/actor-creation.js';
import { ActorManagementTools } from '../tools/actor-management.js';
import { EffectManagementTools } from '../tools/effect-management.js';
import { QuestCreationTools } from '../tools/quest-creation.js';
import { DiceRollTools } from '../tools/dice-roll.js';
import { CampaignManagementTools } from '../tools/campaign-management.js';
import { OwnershipTools } from '../tools/ownership.js';
import { TokenManipulationTools } from '../tools/token-manipulation.js';
import { MapGenerationTools } from '../tools/map-generation.js';
import { WFRP4eUpdateActorTools } from '../tools/wfrp4e/update-actor.js';
import { WFRP4eAddItemsTools } from '../tools/wfrp4e/add-items.js';
import { DnD5eAddFeatureTool } from '../tools/dnd5e/add-feature.js';
import { DnD5eNpcTools } from '../tools/dnd5e/npc.js';
import { DnD5eFeaturesFromCompendiumTools } from '../tools/dnd5e/features.js';
import { ChatTools } from '../tools/chat.js';
import { ScriptExecutionTools } from '../tools/script-execution.js';
import { TableTools } from '../tools/table-tools.js';
import { PermissionsTools } from '../tools/permissions.js';
import { FolderManagementTools } from '../tools/folder-management.js';
import { CompendiumManagementTools } from '../tools/compendium-management.js';
import { CompendiumEntryTools } from '../tools/compendium-entries.js';
import { ImageUploadTools } from '../tools/image-upload.js';
import { SceneBuilderTools } from '../tools/scene-builder.js';
import { CalendarClockTools } from '../tools/calendar-clock.js';
import { DSA5CharacterCreator } from '../systems/dsa5/character-creator.js';
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
      'list-characters': 'handleListCharacters',
      'get-character-entity': 'handleGetCharacterEntity',
      'use-item': 'handleUseItem',
      'search-character-items': 'handleSearchCharacterItems',
      'manage-world-items': 'handleManageWorldItems',
    }),
  });

  const compendiumTools = new CompendiumTools({ ...base, systemRegistry });
  registry.registerModule({
    definitions: compendiumTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(compendiumTools, {
      'search-compendium': 'handleSearchCompendium',
      'get-compendium-item': 'handleGetCompendiumItem',
      'list-creatures-by-criteria': 'handleListCreaturesByCriteria',
      'list-compendium-packs': 'handleListCompendiumPacks',
    }),
  });

  const sceneTools = new SceneTools(base);
  registry.registerModule({
    definitions: sceneTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(sceneTools, {
      'get-current-scene': 'handleGetCurrentScene',
      'get-world-info': 'handleGetWorldInfo',
      'update-scene-music': 'handleUpdateSceneMusic',
    }),
  });

  const actorCreationTools = new ActorCreationTools(base);
  registry.registerModule({
    definitions: actorCreationTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(actorCreationTools, {
      'create-actor-from-compendium': 'handleCreateActorFromCompendium',
    }),
  });

  const actorManagementTools = new ActorManagementTools({ ...base, systemRegistry });
  registry.registerModule({
    definitions: actorManagementTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(actorManagementTools, { 'manage-actors': 'handleManageActors' }),
  });

  const effectManagementTools = new EffectManagementTools(base);
  registry.registerModule({
    definitions: effectManagementTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(effectManagementTools, { 'manage-effects': 'handleManageEffects' }),
  });

  const dsa5CharacterCreator = new DSA5CharacterCreator(base);
  registry.registerModule({
    definitions: dsa5CharacterCreator.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(dsa5CharacterCreator, {
      'create-dsa5-character-from-archetype': 'handleCreateCharacterFromArchetype',
      'list-dsa5-archetypes': 'handleListArchetypes',
    }),
  });

  const dsa5JsonActorImporter = new DSA5JsonActorImporter(base);
  registry.registerModule({
    definitions: dsa5JsonActorImporter.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(dsa5JsonActorImporter, {
      'import-dsa5-actor-from-json': 'handleImportActorFromJson',
    }),
  });

  const dnd5eAddFeatureTool = new DnD5eAddFeatureTool(base);
  registry.registerModule({
    definitions: dnd5eAddFeatureTool.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(dnd5eAddFeatureTool, { 'dnd5e-add-feature': 'handleAddFeature' }),
  });

  const dnd5eNpcTools = new DnD5eNpcTools({ ...base, addFeatureTool: dnd5eAddFeatureTool });
  registry.registerModule({
    definitions: dnd5eNpcTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(dnd5eNpcTools, { 'dnd5e-create-npc': 'handleCreateNpc' }),
  });

  const dnd5eFeaturesFromCompendiumTools = new DnD5eFeaturesFromCompendiumTools(base);
  registry.registerModule({
    definitions: dnd5eFeaturesFromCompendiumTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(dnd5eFeaturesFromCompendiumTools, {
      'dnd5e-add-features-from-compendium': 'handleAddFeaturesFromCompendium',
    }),
  });

  const questCreationTools = new QuestCreationTools(base);
  registry.registerModule({
    definitions: questCreationTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(questCreationTools, {
      'create-quest-journal': 'handleCreateQuestJournal',
      'link-quest-to-npc': 'handleLinkQuestToNPC',
      'update-quest-journal': 'handleUpdateQuestJournal',
      'replace-journal-page': 'handleReplaceJournalPage',
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

  const wfrp4eUpdateActorTools = new WFRP4eUpdateActorTools(base);
  registry.registerModule({
    definitions: wfrp4eUpdateActorTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(wfrp4eUpdateActorTools, { 'wfrp4e-update-actor': 'handleUpdateActor' }),
  });

  const wfrp4eAddItemsTools = new WFRP4eAddItemsTools(base);
  registry.registerModule({
    definitions: wfrp4eAddItemsTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(wfrp4eAddItemsTools, { 'wfrp4e-add-items': 'handleAddItems' }),
  });

  const tokenManipulationTools = new TokenManipulationTools(base);
  registry.registerModule({
    definitions: tokenManipulationTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(tokenManipulationTools, {
      'move-token': 'handleMoveToken',
      'update-token': 'handleUpdateToken',
      'delete-tokens': 'handleDeleteTokens',
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
      'manage-playlists': 'handleManagePlaylists',
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

  const sceneBuilderTools = new SceneBuilderTools(base);
  registry.registerModule({
    definitions: sceneBuilderTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(sceneBuilderTools, { 'manage-scene': 'handleManageScene' }),
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

  const folderManagementTools = new FolderManagementTools(base);
  registry.registerModule({
    definitions: folderManagementTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(folderManagementTools, { 'manage-folders': 'handleManageFolders' }),
  });

  const compendiumManagementTools = new CompendiumManagementTools(base);
  registry.registerModule({
    definitions: compendiumManagementTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(compendiumManagementTools, {
      'manage-compendiums': 'handleManageCompendiums',
    }),
  });

  const compendiumEntryTools = new CompendiumEntryTools(base);
  registry.registerModule({
    definitions: compendiumEntryTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(compendiumEntryTools, {
      'manage-compendium-entries': 'handleManageCompendiumEntries',
    }),
  });

  const imageUploadTools = new ImageUploadTools(base);
  registry.registerModule({
    definitions: imageUploadTools.getToolDefinitions() as ToolDefinition[],
    handlers: bindMethods(imageUploadTools, { 'upload-image': 'handleUploadImage' }),
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
