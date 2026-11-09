import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface ChatToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class ChatTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: ChatToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ChatTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'create-chat-message',
        description:
          'Say something in the chat. As an actor or a specific token: a floating speech ' +
          'bubble over the token (the default), a real chat-log message, or a whisper to ' +
          'named players; pass a language to have Polyglot scramble a chat-log message for ' +
          "viewers who don't know it. Without actorIdentifier or tokenId the message comes " +
          'from the GM (narration, out-of-character notes). html: true keeps HTML in the text, ' +
          'and style (ic, ooc, emote) sets the kind of message; both post a chat-log message. ' +
          'One call posts one line.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description:
                'Name or ID of the actor speaking (resolves world actors and scene tokens). ' +
                'Give this or tokenId.',
            },
            tokenId: {
              type: 'string',
              description:
                'ID of a specific token on the current scene. Prefer this over actorIdentifier ' +
                'when several tokens share one actor (guards, bandits), since a name lookup ' +
                'cannot tell them apart.',
            },
            content: {
              type: 'string',
              description:
                'The message text as plain text, in the language actually being spoken (not ' +
                'translated or bracketed). HTML is escaped and shows literally, unless html is true.',
            },
            language: {
              type: 'string',
              description:
                'Optional language key matching the game system\'s language list (e.g. "common", ' +
                '"necril"). With Polyglot active the line is tagged so it scrambles for viewers ' +
                "who don't know that language, on bubbles as well as chat-log messages. Without " +
                'Polyglot, Foundry has no notion of a spoken language, so the line plays as written ' +
                'and the result reports polyglotApplied: false.',
            },
            chatLog: {
              type: 'boolean',
              description:
                'Post a real chat-log message (which also shows its own bubble) instead of the ' +
                'default bubble-only delivery. Bubble-only requires the speaker to have a token ' +
                'on the current scene.',
            },
            whisperTo: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional player names or user IDs to whisper this line to. Each must be an exact ' +
                'user ID or exact name (case is ignored only when that finds a single user); if ' +
                'any one does not resolve, the call fails and nothing is sent. A whisper is always ' +
                'delivered as a chat-log message, since a bubble would be visible to everyone, so ' +
                'passing this implies chatLog: true.',
            },
            html: {
              type: 'boolean',
              description:
                'Let the text contain HTML (bold, lists, links). Default false: HTML is escaped. ' +
                'Posts a chat-log message, without a bubble.',
            },
            style: {
              type: 'string',
              enum: ['ic', 'ooc', 'emote'],
              description:
                'Kind of chat-log message: ic (in character, the default with a speaker), ooc ' +
                '(out of character, the default without one) or emote. Not combined with a bubble.',
            },
          },
          required: ['content'],
        },
      },
    ];
  }

  async handleCreateChatMessage(args: any): Promise<any> {
    const schema = z.object({
      actorIdentifier: z.string().optional(),
      tokenId: z.string().optional(),
      content: z.string().min(1),
      language: z.string().optional(),
      chatLog: z.boolean().optional(),
      whisperTo: z.array(z.string()).optional(),
      html: z.boolean().optional(),
      style: z.enum(['ic', 'ooc', 'emote']).optional(),
    });

    const parsed = schema.parse(args);

    // A message from the GM, with HTML, or with a style is a plain chat-log message; a bubble,
    // a language and a token id belong to the in-character path below.
    const asChatLogMessage =
      parsed.html === true ||
      parsed.style !== undefined ||
      (!parsed.actorIdentifier && !parsed.tokenId);
    if (asChatLogMessage) {
      if (parsed.tokenId) {
        throw new Error('tokenId cannot be combined with html or style: use actorIdentifier.');
      }
      if (parsed.language) {
        throw new Error('language only works for a line spoken as an actor without html or style.');
      }
      this.logger.info('Posting chat message', {
        speaker: parsed.actorIdentifier ?? 'GM',
        whispered: !!parsed.whisperTo?.length,
      });
      return this.foundryClient.query('foundry-mcp-bridge.postChat', {
        content: parsed.html === true ? parsed.content : escapeHtml(parsed.content),
        ...(parsed.actorIdentifier ? { speaker: parsed.actorIdentifier } : {}),
        ...(parsed.whisperTo?.length ? { whisperTo: parsed.whisperTo } : {}),
        ...(parsed.style ? { style: parsed.style } : {}),
      });
    }

    this.logger.info('Creating chat message', {
      speaker: parsed.tokenId ?? parsed.actorIdentifier,
      whispered: !!parsed.whisperTo?.length,
    });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.createChatMessage', parsed);
      this.logger.debug('Chat message created', { result });
      return result;
    } catch (error) {
      this.logger.error('Failed to create chat message', { error });
      throw new Error(
        `Failed to create chat message for "${parsed.tokenId ?? parsed.actorIdentifier}": ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
