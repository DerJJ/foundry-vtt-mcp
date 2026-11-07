import { MODULE_ID, ERROR_MESSAGES } from '../constants.js';
import { permissionManager } from '../permissions.js';
import { validateFoundryState } from './support.js';
import type { FoundryDataAccess } from '../data-access.js';

// The same five characters foundry.utils.escapeHTML replaces in v14, kept local because
// that helper isn't confirmed in v13, this module's minimum.
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

/** Escape text so it renders as written when Foundry inserts it as HTML. */
function escapeHTML(text: string): string {
  return text.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}
export class ChatService {
  constructor(private readonly access: FoundryDataAccess) {}

  /**
   * Resolve player names or user IDs to user IDs, failing if any target is not exactly one
   * user. Foundry keeps user names unique but compares them case-sensitively, so "Taco" and
   * "TaCo" can coexist: an exact-case name wins, and ignoring case is only a fallback when
   * it finds a single user.
   */
  private resolveWhisperTargets(targets: string[]): string[] {
    const users: any[] = Array.from((game.users as any) || []);
    const unmatched: string[] = [];
    const ambiguous: string[] = [];
    const ids: string[] = [];

    for (const target of targets) {
      const exact = users.find(u => u.id === target) ?? users.find(u => u.name === target);
      if (exact) {
        ids.push(exact.id);
        continue;
      }
      const caseless = users.filter(u => u.name?.toLowerCase() === target.toLowerCase());
      if (caseless.length === 1) {
        ids.push(caseless[0].id);
      } else if (caseless.length > 1) {
        ambiguous.push(`"${target}" (${caseless.map(u => u.name).join(', ')})`);
      } else {
        unmatched.push(target);
      }
    }

    const problems = [
      ...(unmatched.length ? [`No matching players for whisperTo: ${unmatched.join(', ')}`] : []),
      ...(ambiguous.length
        ? [`Ambiguous whisperTo names, use the exact name or user ID: ${ambiguous.join('; ')}`]
        : []),
    ];
    if (problems.length) {
      throw new Error(problems.join('. '));
    }
    return ids;
  }

  /**
   * Post an in-character line spoken by an actor or a specific token.
   *
   * Delivery is a floating chat bubble by default, a chat-log message when `chatLog` is
   * set, and always a chat-log message when whispering, since a bubble is visible to
   * everyone on the scene. With a language and Polyglot active, a chat-log message is
   * tagged via Polyglot's own flag so it scrambles for viewers who lack that language:
   * Polyglot only auto-assigns `flags.polyglot.language` when the flag isn't already
   * present (see its preCreateChatMessage hook), so setting it at creation is respected.
   * Bubbles carry the language in their broadcast options instead, which Polyglot's bubble
   * class reads per viewer. Without Polyglot the line plays as written.
   *
   * Content is plain text: bubbles and chat-log messages render as HTML on every client,
   * so any markup is escaped and shows as the characters sent.
   */
  async createChatMessage(data: {
    actorIdentifier?: string;
    tokenId?: string;
    content: string;
    language?: string;
    chatLog?: boolean;
    whisperTo?: string[];
  }): Promise<any> {
    validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('createChatMessage');
    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }
    permissionManager.auditPermissionCheck('createChatMessage', permissionCheck, data);

    if (!data.content || typeof data.content !== 'string') {
      throw new Error('content is required and must be a string');
    }
    const content = escapeHTML(data.content);

    // A token id is exact, so it wins over a name lookup - this is what lets several
    // tokens sharing one actor (guards, bandits) be addressed individually.
    let token: any = null;
    let actor: any = null;
    if (data.tokenId) {
      token = (canvas as any)?.scene?.tokens?.get(data.tokenId) ?? null;
      if (!token) {
        throw new Error(`Token not found on the current scene: ${data.tokenId}`);
      }
      actor = token.actor;
    } else if (data.actorIdentifier) {
      actor = this.access.characters.findActorByIdentifier(data.actorIdentifier);
      if (!actor) {
        throw new Error(`Actor not found: ${data.actorIdentifier}`);
      }
      [token] = (actor.getActiveTokens(false, false) as any[]) || [];
    } else {
      throw new Error('Either actorIdentifier or tokenId is required');
    }

    // Two shapes of the same token are needed below and they are not interchangeable:
    // bubbles.broadcast() wants the placeable, while ChatMessage.getSpeaker() must get the
    // TokenDocument - it reads `token.parent?.id` for the speaker's scene, and a placeable
    // has no `.parent`, so passing one yields scene: null and Foundry's sayBubble() then
    // silently skips the bubble because `speaker.scene === canvas.scene.id` never matches.
    const tokenDoc: any = token?.document ?? token;
    const tokenObject: any = token?.object ?? token;

    const polyglotActive = !!(game.modules as any)?.get?.('polyglot')?.active;
    const applyPolyglot = !!(data.language && polyglotActive);

    const whisperIds = data.whisperTo?.length ? this.resolveWhisperTargets(data.whisperTo) : [];
    // A whisper has to be a real message; a bubble would show the line to the whole table.
    const useChatLog = !!data.chatLog || whisperIds.length > 0;

    if (!useChatLog) {
      if (!token) {
        throw new Error(
          `"${actor?.name ?? data.actorIdentifier}" has no placed token on the current scene - ` +
            `bubble delivery needs a token to anchor to. Place one, or pass chatLog: true.`
        );
      }

      // broadcast() (not say()) so every client viewing the scene shows the bubble; say() is
      // local to this browser. pan:false keeps the GM's camera from jumping to each speaker,
      // and requireVisible:true means a player only sees bubbles over tokens they can see.
      // Deliberately not awaited: the returned promise waits on the previous bubble's
      // fade-out for this token, which never resolves in a throttled or hidden tab and would
      // hang the call. A failure here is logged rather than thrown.
      Promise.resolve(
        (canvas as any).hud.bubbles.broadcast(tokenObject, content, {
          pan: false,
          requireVisible: true,
          // Polyglot replaces CONFIG.Canvas.chatBubblesClass and reads options.language
          // directly, and broadcast() forwards options to every client over the socket,
          // so each viewer scrambles by their own known languages with no ChatMessage
          // involved. Without Polyglot this option is simply ignored.
          ...(applyPolyglot ? { language: data.language } : {}),
        })
      ).catch((err: unknown) =>
        console.warn(`[${MODULE_ID}] Chat bubble failed for ${actor?.name}:`, err)
      );

      return {
        success: true,
        id: null,
        speakerName: tokenDoc?.name || actor?.name,
        polyglotApplied: applyPolyglot,
        delivery: 'bubble',
      };
    }

    const messageData: Record<string, any> = {
      content,
      speaker: tokenDoc
        ? ChatMessage.getSpeaker({ token: tokenDoc, actor })
        : ChatMessage.getSpeaker({ actor }),
      style: (CONST as any).CHAT_MESSAGE_STYLES?.IC ?? (CONST as any).CHAT_MESSAGE_TYPES?.IC,
    };

    if (applyPolyglot) {
      messageData.flags = { polyglot: { language: data.language } };
    }
    if (whisperIds.length > 0) {
      messageData.whisper = whisperIds;
    }

    // Created the way the chat box creates a line typed as a token: core draws a bubble only
    // for the in-character mode, timed by its own word count, and Polyglot scrambles it from
    // the message's language flag. A whisper stays out of that mode, so it gets no bubble.
    const chatMessage = await ChatMessage.create(
      messageData,
      (whisperIds.length > 0 ? {} : { messageMode: 'ic' }) as any
    );

    return {
      success: true,
      id: chatMessage?.id,
      speakerName: messageData.speaker?.alias || actor?.name,
      polyglotApplied: applyPolyglot,
      delivery: whisperIds.length > 0 ? 'whisper' : 'chatLog',
      ...(whisperIds.length > 0 ? { whisperedTo: whisperIds.length } : {}),
    };
  }
}
