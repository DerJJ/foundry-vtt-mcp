import { DocumentsService, type DocumentsRequest } from '../services/documents.js';
import { validateFoundryState } from '../services/support.js';
import { validateGMAccess } from './gm-access.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

/** The `documents` query: list, get, create, update, delete and schema for any document (ADR-0007). */
export class DocumentsQueries implements QueryGroup {
  constructor(private readonly documents: DocumentsService = new DocumentsService()) {}

  routes(): Record<string, QueryHandler> {
    return { documents: this.handleDocuments.bind(this) };
  }

  async handleDocuments(data: DocumentsRequest): Promise<any> {
    const gmCheck = validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    validateFoundryState();
    try {
      return await this.documents.run(data);
    } catch (error) {
      throw new Error(
        `documents ${data?.action ?? ''}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
