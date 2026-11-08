import { validateFoundryState } from '../services/support.js';
import type { FoundryDataAccess } from '../data-access.js';
import { getChatLog } from '../services/chat-log.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

export class ChatQueries implements QueryGroup {
  constructor(private readonly dataAccess: FoundryDataAccess) {}

  routes(): Record<string, QueryHandler> {
    return {
      createChatMessage: this.handleCreateChatMessage.bind(this),
      getChatMessages: getChatLog,
    };
  }

  async handleCreateChatMessage(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      validateFoundryState();

      return await this.dataAccess.chat.createChatMessage(data);
    } catch (error) {
      throw new Error(
        `Failed to create chat message: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
