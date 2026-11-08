import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

const CHAT_KINDS = [
  'spell-cast',
  'item-use',
  'attack',
  'damage',
  'damage-applied',
  'saving-throw',
  'skill-check',
  'perception-check',
  'ability-check',
  'initiative',
  'flat-check',
  'death-save',
  'roll',
  'chat',
  'other',
] as const;

interface DiceRollToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class DiceRollTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: DiceRollToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger;
  }

  getToolDefinitions() {
    return [
      {
        name: 'request-player-rolls',
        description:
          'Request dice rolls from players with interactive buttons. Creates roll buttons in Foundry chat that players can click. VISIBILITY WORKFLOW: Before calling this function, ensure the user has specified whether they want a public or private roll. If they have already specified "public" or "private" in their request (e.g., "public performance check", "private stealth roll"), you can proceed directly. If the visibility is ambiguous or unspecified, ask: "Do you want this to be a PUBLIC roll (visible to all players) or PRIVATE roll (visible to player and GM only)?" and wait for their answer. Supports character-to-player resolution and GM fallback.',
        inputSchema: {
          type: 'object',
          properties: {
            rollType: {
              type: 'string',
              description:
                'Type of roll to request (ability, skill, save, attack, initiative, custom)',
              enum: ['ability', 'skill', 'save', 'attack', 'initiative', 'custom'],
            },
            rollTarget: {
              type: 'string',
              description:
                'Target for the roll. dnd5e: ability (str, dex, con, int, wis, cha) or skill (perception, insight, stealth, ...). pf2e: skill (acrobatics, stealth, ... or perception), save (fortitude, reflex, will) or initiative; pf2e has no ability checks. custom: a roll formula.',
            },
            targetPlayer: {
              type: 'string',
              description: 'Player name or character name to request the roll from',
            },
            isPublic: {
              type: 'boolean',
              description:
                'Whether the roll should be public (true = visible to all players) or private (false = visible only to target player and GM).',
            },
            userConfirmedVisibility: {
              type: 'boolean',
              const: true,
              description:
                'REQUIRED: Must be set to true to confirm the roll visibility has been determined. This can happen in two ways: 1) User explicitly specified "public" or "private" in their original request (e.g., "public stealth check"), or 2) You asked the clarifying question and received their answer. Only set this to true when you are confident about the visibility preference, either from their original request or from a direct answer to your question.',
            },
            dc: {
              type: 'number',
              description:
                'Optional DC for the check. Used on pf2e, where the roll then reports its degree of success in the chat; ignored on dnd5e.',
            },
            rollModifier: {
              type: 'string',
              description: 'Optional modifier to add to the roll (e.g., "+2", "-1", "+1d4")',
              default: '',
            },
            flavor: {
              type: 'string',
              description: 'Optional flavor text to describe the roll context',
              default: '',
            },
            // Local patch: preselect advantage/disadvantage in the player's dnd5e roll dialog
            advantageMode: {
              type: 'string',
              enum: ['normal', 'advantage', 'disadvantage'],
              description:
                'Advantage mode for skill, save and ability rolls: preselected in the dnd5e roll dialog the player gets (the player can still change it). Default normal.',
              default: 'normal',
            },
          },
          required: [
            'rollType',
            'rollTarget',
            'targetPlayer',
            'isPublic',
            'userConfirmedVisibility',
          ],
        },
      },
      {
        name: 'get-chat-messages',
        description:
          'Read the Foundry chat log as structured events (GM view, includes whispers), oldest first, so you can tell what happened and who did it. ' +
          'Every event has a kind (spell-cast, item-use, attack, damage, damage-applied, saving-throw, skill-check, perception-check, ability-check, initiative, flat-check, death-save, roll, chat, other), ' +
          'a one-line summary, who (user, actor), the item or spell involved (name, type, level), targets, DC, outcome (success/failure/critical) and the dice. ' +
          'Works for dnd5e and pf2e. Filter by actor, kinds or since; page backwards with beforeId (use oldestId from the previous result). ' +
          'Text is included for plain chat and applied damage; set includeText=all to add the description of item and spell cards.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of most recent matching events (1-100, default 20)',
              minimum: 1,
              maximum: 100,
            },
            since: { type: 'string', description: 'Only events after this ISO timestamp' },
            beforeId: {
              type: 'string',
              description: 'Only events older than this message id (paging)',
            },
            actor: { type: 'string', description: 'Actor name (substring) or id of the speaker' },
            kinds: {
              type: 'array',
              items: { type: 'string', enum: CHAT_KINDS },
              description: 'Only these kinds of event',
            },
            rollsOnly: { type: 'boolean', description: 'Only messages that contain dice rolls' },
            includeText: {
              type: 'string',
              enum: ['auto', 'all', 'none'],
              description: 'auto (default), all, none',
            },
            textLength: {
              type: 'number',
              description: 'Max characters of text per event (default 300)',
            },
          },
        },
      },
    ];
  }

  async handleRequestPlayerRolls(args: any) {
    const schema = z.object({
      rollType: z.enum(['ability', 'skill', 'save', 'attack', 'initiative', 'custom']),
      rollTarget: z.string(),
      targetPlayer: z.string(),
      isPublic: z.boolean(),
      userConfirmedVisibility: z.literal(true),
      rollModifier: z.string().default(''),
      flavor: z.string().default(''),
      advantageMode: z.enum(['normal', 'advantage', 'disadvantage']).default('normal'),
      dc: z.number().optional(),
    });

    try {
      const params = schema.parse(args);

      // Validation should be handled by schema, but add extra safety checks
      if (typeof params.isPublic !== 'boolean') {
        return 'Please specify whether you want this to be a PUBLIC roll (visible to all players) or PRIVATE roll (visible only to the target player and GM). You must provide either "true" for public or "false" for private.';
      }

      if (params.userConfirmedVisibility !== true) {
        return 'You must determine the roll visibility before calling this function. Either: 1) The user already specified "public" or "private" in their request, or 2) You need to ask: "Do you want this to be a PUBLIC roll or PRIVATE roll?" Set userConfirmedVisibility to true only when you are confident about the visibility preference.';
      }

      const response = await this.foundryClient.query(
        'foundry-mcp-bridge.request-player-rolls',
        params
      );

      if (response.success) {
        return `Roll request sent successfully! ${response.message}`;
      } else {
        throw new Error(response.error || 'Failed to request player rolls');
      }
    } catch (error) {
      this.logger.error('Error requesting player rolls', error);
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => {
          if (e.path.includes('isPublic')) {
            return 'You must specify whether the roll should be PUBLIC (visible to all players) or PRIVATE (visible only to target player and GM). Check if the user already specified this in their request, or ask them to clarify.';
          }
          return e.message;
        });
        return `Parameter error: ${messages.join(', ')}`;
      }
      throw error;
    }
  }

  async handleGetChatMessages(args: any) {
    const schema = z.object({
      limit: z.number().min(1).max(100).optional(),
      since: z.string().optional(),
      beforeId: z.string().optional(),
      actor: z.string().optional(),
      kinds: z.array(z.enum(CHAT_KINDS)).optional(),
      rollsOnly: z.boolean().optional(),
      includeText: z.enum(['auto', 'all', 'none']).optional(),
      textLength: z.number().min(0).max(5000).optional(),
    });
    const params = schema.parse(args ?? {});
    const response = await this.foundryClient.query('foundry-mcp-bridge.getChatMessages', params);
    if (response?.success === false) {
      throw new Error(response.error || 'Failed to get chat messages');
    }
    return response;
  }
}
