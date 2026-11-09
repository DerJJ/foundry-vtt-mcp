import { auditLog, validateFoundryState } from './support.js';

export type FolderableType =
  | 'Actor'
  | 'Cards'
  | 'Item'
  | 'JournalEntry'
  | 'Macro'
  | 'Playlist'
  | 'RollTable'
  | 'Scene';

/**
 * Folders (world sidebar and inside compendium packs, addressed by "Parent/Child" paths) and the
 * compendium packs and entries themselves. Only world packs are writable.
 */
export class LibraryService {
  /**
   * Imports one compendium document into the world, the way Foundry's own Import button does:
   * all of its data is kept and the result is a new world document. Adventures import through
   * Foundry's own dialog and are refused.
   */
  async importCompendiumDocument(params: {
    packId: string;
    documentId: string;
    folderSegments?: string[];
  }): Promise<any> {
    validateFoundryState();

    const pack: any = game.packs.get(params.packId);
    if (!pack) throw new Error(`Compendium pack ${params.packId} not found`);
    const documentName: string = pack.documentName ?? pack.metadata?.type;
    if (documentName === 'Adventure') {
      throw new Error(
        'Adventures cannot be imported here: they bundle many documents and are imported through the compendium in Foundry.'
      );
    }

    const document = await pack.getDocument(params.documentId);
    if (!document)
      throw new Error(`Document ${params.documentId} not found in pack ${params.packId}`);

    const collection: any = (game as any).collections?.get(documentName);
    if (!collection?.fromCompendium) {
      throw new Error(`Documents of type ${documentName} cannot be imported into the world.`);
    }
    const data = collection.fromCompendium(document);
    if (params.folderSegments?.length) {
      const folder = await this.createFolderByPath(
        params.folderSegments,
        documentName as FolderableType
      );
      data.folder = folder.id;
    }

    const DocumentClass: any = (globalThis as any).getDocumentClass?.(documentName);
    if (!DocumentClass?.create) {
      throw new Error(`Documents of type ${documentName} cannot be created in this world.`);
    }
    const created = await DocumentClass.create(data);
    auditLog(
      'importCompendiumDocument',
      { pack: params.packId, document: params.documentId },
      'success'
    );

    return {
      success: true,
      imported: {
        id: created.id,
        name: created.name,
        documentName,
        type: created.type ?? null,
        folder: created.folder?.name ?? null,
        fromPack: params.packId,
      },
    };
  }

  /**
   * The folder collection to walk: the world sidebar, or one compendium pack's
   * own folders. Folders inside a pack are homogeneous, so the caller need not
   * filter them by type.
   */
  private folderCollectionFor(packId?: string): any[] {
    if (!packId) return (game as any).folders?.contents ?? [];
    const pack = (game as any).packs?.get(packId);
    if (!pack) throw new Error(`Compendium pack not found: "${packId}"`);
    return Array.from(pack.folders ?? []);
  }

  /** Find a folder by path segments. Returns null if any segment is missing. */
  private findFolderByPath(segments: string[], type: FolderableType, packId?: string): any {
    const collection = this.folderCollectionFor(packId);
    let parentId: string | null = null;
    let found: any = null;

    for (const segment of segments) {
      found = collection.find(
        (f: any) =>
          f.name === segment &&
          (packId ? true : f.type === type) &&
          (f.folder?.id ?? null) === parentId
      );
      if (!found) return null;
      parentId = found.id;
    }

    return found;
  }

  /** Find a folder by path, creating any missing folders along the way. */
  async createFolderByPath(
    segments: string[],
    type: FolderableType,
    packId?: string
  ): Promise<any> {
    const createOpts = packId ? { pack: packId } : {};
    let parentId: string | null = null;
    let current: any = null;

    for (const segment of segments) {
      const collection = this.folderCollectionFor(packId);
      let folder = collection.find(
        (f: any) =>
          f.name === segment &&
          (packId ? true : f.type === type) &&
          (f.folder?.id ?? null) === parentId
      );

      if (!folder) {
        folder = await (globalThis as any).Folder.create(
          {
            name: segment,
            type,
            folder: parentId,
          },
          createOpts
        );
        if (!folder) {
          throw new Error(`Failed to create folder "${segment}" (${type})`);
        }
      }

      current = folder;
      parentId = folder.id;
    }

    return current;
  }

  /**
   * Resolve a compendium pack by id ("world.my-monsters") or by its label.
   * Throws if there is no such pack.
   */
  resolvePack(identifier: string): any {
    const direct = (game as any).packs?.get(identifier);
    if (direct) return direct;

    const byLabel = ((game as any).packs?.contents ?? []).find(
      (p: any) => p.metadata?.label === identifier || p.title === identifier
    );
    if (byLabel) return byLabel;

    throw new Error(`Compendium pack not found: "${identifier}"`);
  }

  /** Resolve a pack and assert it is a writable (unlocked, world-level) pack. */
  requireWritablePack(identifier: string): any {
    const pack = this.resolvePack(identifier);
    const packageType = pack.metadata?.packageType ?? pack.metadata?.package;
    if (packageType !== 'world') {
      throw new Error(
        `Compendium "${pack.metadata?.id ?? identifier}" belongs to a system or module and cannot be written.`
      );
    }
    if (pack.locked) {
      throw new Error(
        `Compendium "${pack.metadata?.id ?? identifier}" is locked. Unlock it in Foundry before editing its contents.`
      );
    }
    return pack;
  }

  /** Full "A/B/C" path for a folder, used so listings are unambiguous. */
  folderPathOf(folder: any): string {
    const names: string[] = [];
    let cursor: any = folder;

    // Bounded by the server's MAX_FOLDER_DEPTH; the guard is against cyclic data.
    for (let i = 0; cursor && i < 32; i++) {
      names.unshift(cursor.name);
      cursor = cursor.folder;
    }

    return names.join('/');
  }

  private requireFolder(segments: string[], type: FolderableType, packId?: string): any {
    const folder = this.findFolderByPath(segments, type, packId);
    if (!folder) {
      const where = packId ? `compendium "${packId}"` : `${type} sidebar`;
      throw new Error(`No folder found at path "${segments.join('/')}" in the ${where}`);
    }
    return folder;
  }

  /**
   * Normalise the folder-op scope: a `pack` argument (id or label) resolves to a
   * canonical pack id plus the document type the pack holds; without it, the
   * caller's documentType stands and there is no pack id.
   */
  private folderOpScope(
    documentType: FolderableType,
    pack?: string
  ): { type: FolderableType; packId?: string } {
    if (!pack) return { type: documentType };
    const resolved = this.resolvePack(pack);
    return { type: resolved.metadata?.type as FolderableType, packId: resolved.metadata?.id };
  }

  /**
   * Count every descendant folder and every document contained in the folder or
   * any of its descendants. `folder.contents` / `folder.children` are direct
   * children only, but Foundry's delete with deleteContents is recursive, so the
   * shallow counts under-report what a destructive delete actually removed.
   * Handles both `children` shapes: v11+ FolderChildNode ({folder, ...}) and
   * older builds that expose Folder documents directly.
   */
  private countFolderSubtree(folder: any): { folders: number; contents: number } {
    let folders = 0;
    let contents = folder.contents?.length ?? 0;

    for (const child of folder.children ?? []) {
      const childFolder = child?.folder ?? child;
      if (!childFolder) continue;
      folders += 1;
      const sub = this.countFolderSubtree(childFolder);
      folders += sub.folders;
      contents += sub.contents;
    }

    return { folders, contents };
  }

  async listFolders(params: { documentType: FolderableType; pack?: string }): Promise<any> {
    validateFoundryState();
    const { type, packId } = this.folderOpScope(params.documentType, params.pack);

    const source = packId
      ? Array.from((game as any).packs?.get(packId)?.folders ?? [])
      : ((game as any).folders?.contents ?? []).filter((f: any) => f.type === type);

    const folders = source
      .map((f: any) => ({
        id: f.id,
        name: f.name,
        path: this.folderPathOf(f),
        parentId: f.folder?.id ?? null,
        contentCount: f.contents?.length ?? 0,
        subfolderCount: f.children?.length ?? 0,
      }))
      .sort((a: any, b: any) => a.path.localeCompare(b.path));

    return { documentType: type, pack: packId, total: folders.length, folders };
  }

  async createFolderPath(params: {
    segments: string[];
    documentType: FolderableType;
    pack?: string;
  }): Promise<any> {
    validateFoundryState();
    const { type, packId } = this.folderOpScope(params.documentType, params.pack);

    const existing = this.findFolderByPath(params.segments, type, packId);
    const folder = await this.createFolderByPath(params.segments, type, packId);

    auditLog('createFolderPath', params, 'success');

    return {
      success: true,
      created: !existing,
      id: folder.id,
      path: this.folderPathOf(folder),
      documentType: type,
      pack: packId,
    };
  }

  async renameFolderPath(params: {
    segments: string[];
    documentType: FolderableType;
    newName: string;
    pack?: string;
  }): Promise<any> {
    validateFoundryState();
    const { type, packId } = this.folderOpScope(params.documentType, params.pack);

    const folder = this.requireFolder(params.segments, type, packId);
    await folder.update({ name: params.newName });

    auditLog('renameFolderPath', params, 'success');

    return { success: true, id: folder.id, path: this.folderPathOf(folder) };
  }

  async moveFolderPath(params: {
    segments: string[];
    documentType: FolderableType;
    newParentSegments: string[] | null;
    pack?: string;
  }): Promise<any> {
    validateFoundryState();
    const { type, packId } = this.folderOpScope(params.documentType, params.pack);

    const folder = this.requireFolder(params.segments, type, packId);

    let newParentId: string | null = null;
    if (params.newParentSegments) {
      const parent = await this.createFolderByPath(params.newParentSegments, type, packId);

      // Foundry silently accepts a cycle here and the sidebar then cannot render it.
      let cursor: any = parent;
      while (cursor) {
        if (cursor.id === folder.id) {
          throw new Error(
            `Cannot move "${this.folderPathOf(folder)}" into its own descendant ` +
              `"${this.folderPathOf(parent)}"`
          );
        }
        cursor = cursor.folder;
      }

      newParentId = parent.id;
    }

    await folder.update({ folder: newParentId });

    auditLog('moveFolderPath', params, 'success');

    return { success: true, id: folder.id, path: this.folderPathOf(folder) };
  }

  async deleteFolderPath(params: {
    segments: string[];
    documentType: FolderableType;
    deleteContents: boolean;
    pack?: string;
  }): Promise<any> {
    validateFoundryState();
    const { type, packId } = this.folderOpScope(params.documentType, params.pack);

    const folder = this.requireFolder(params.segments, type, packId);
    const path = this.folderPathOf(folder);
    // Direct children are re-parented to this folder's parent when contents are
    // kept; the whole subtree is destroyed when they are not.
    const directContentCount = folder.contents?.length ?? 0;
    const subtree = this.countFolderSubtree(folder);

    await folder.delete({
      deleteSubfolders: params.deleteContents,
      deleteContents: params.deleteContents,
    });

    auditLog('deleteFolderPath', params, 'success');

    return {
      success: true,
      path,
      documentType: type,
      pack: packId,
      contentsDeleted: params.deleteContents ? subtree.contents : 0,
      subfoldersDeleted: params.deleteContents ? subtree.folders : 0,
      contentsKept: params.deleteContents ? 0 : directContentCount,
    };
  }

  /** All packs the world can see, flagged for writability. */
  async listPacks(): Promise<any> {
    validateFoundryState();

    const packs = ((game as any).packs?.contents ?? []).map((p: any) => {
      const packageType = p.metadata?.packageType ?? p.metadata?.package;
      return {
        id: p.metadata?.id ?? p.collection,
        label: p.metadata?.label ?? p.title,
        type: p.metadata?.type,
        packageType,
        locked: !!p.locked,
        writable: packageType === 'world' && !p.locked,
        entryCount: p.index?.size ?? 0,
      };
    });

    return { total: packs.length, packs };
  }

  /** Create a world compendium pack. */
  async createPack(params: { label: string; type: string; name: string }): Promise<any> {
    validateFoundryState();

    const id = `world.${params.name}`;
    if ((game as any).packs?.get(id)) {
      throw new Error(`A compendium "${id}" already exists.`);
    }

    const pack = await (globalThis as any).CompendiumCollection.createCompendium({
      type: params.type,
      label: params.label,
      name: params.name,
      packageType: 'world',
    });

    auditLog('createPack', params, 'success');

    return {
      success: true,
      id: pack?.metadata?.id ?? id,
      label: params.label,
      type: params.type,
    };
  }

  /** Permanently delete a world compendium pack and everything in it. */
  async deletePack(params: { identifier: string }): Promise<any> {
    validateFoundryState();

    const pack = this.requireWritablePack(params.identifier);
    const id = pack.metadata?.id ?? params.identifier;
    const entryCount = pack.index?.size ?? 0;

    await pack.deleteCompendium();

    auditLog('deletePack', params, 'success');

    return { success: true, id, entriesDeleted: entryCount };
  }

  /** Find one document inside a pack by id or by name (case-insensitive). */
  private async findPackDocument(pack: any, identifier: string): Promise<any> {
    const byId = await pack.getDocument(identifier).catch(() => null);
    if (byId) return byId;

    const entry = pack.index.find((e: any) => e.name?.toLowerCase() === identifier.toLowerCase());
    if (!entry) {
      throw new Error(`No entry "${identifier}" in compendium "${pack.metadata?.id}"`);
    }
    return pack.getDocument(entry._id);
  }

  /** Resolve an entry's folderSegments to a folder id within the pack, creating it. */
  private async packFolderId(pack: any, folderSegments?: string[]): Promise<string | undefined> {
    if (!folderSegments || folderSegments.length === 0) return undefined;
    const folder = await this.createFolderByPath(
      folderSegments,
      pack.metadata?.type as FolderableType,
      pack.metadata?.id
    );
    return folder?.id;
  }

  async listPackEntries(params: {
    pack: string;
    nameFilter?: string;
    type?: string;
  }): Promise<any> {
    validateFoundryState();
    const pack = this.resolvePack(params.pack);
    await pack.getIndex();

    const folderPathById = new Map<string, string>();
    for (const f of Array.from<any>(pack.folders ?? [])) {
      folderPathById.set(f.id, this.folderPathOf(f));
    }

    let entries = Array.from<any>(pack.index ?? []);
    if (params.nameFilter) {
      const needle = params.nameFilter.toLowerCase();
      entries = entries.filter(e => e.name?.toLowerCase().includes(needle));
    }
    if (params.type) {
      entries = entries.filter(e => e.type === params.type);
    }

    return {
      pack: pack.metadata?.id,
      type: pack.metadata?.type,
      total: entries.length,
      entries: entries.map(e => ({
        id: e._id,
        name: e.name,
        type: e.type ?? null,
        folder: e.folder ? (folderPathById.get(e.folder) ?? null) : null,
      })),
    };
  }

  async createPackEntries(params: { pack: string; entries: any[] }): Promise<any> {
    validateFoundryState();
    const pack = this.requireWritablePack(params.pack);
    const documentClass = (globalThis as any).getDocumentClass(pack.metadata?.type);

    const created: any[] = [];
    const failed: any[] = [];

    for (const entry of params.entries) {
      try {
        const folderId = await this.packFolderId(pack, entry.folderSegments);
        const data: any = { name: entry.name };
        if (entry.type !== undefined) data.type = entry.type;
        if (entry.img !== undefined) data.img = entry.img;
        if (entry.system !== undefined) data.system = entry.system;
        if (folderId !== undefined) data.folder = folderId;

        const doc = await documentClass.create(data, { pack: pack.metadata?.id });
        created.push({ id: doc?.id, name: doc?.name });
      } catch (error) {
        failed.push({
          name: entry.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    auditLog(
      'createPackEntries',
      { pack: pack.metadata?.id, count: params.entries.length },
      'success'
    );

    return {
      success: failed.length === 0,
      pack: pack.metadata?.id,
      created,
      failed,
      partialFailure: failed.length > 0 && created.length > 0,
    };
  }

  async updatePackEntries(params: { pack: string; updates: any[] }): Promise<any> {
    validateFoundryState();
    const pack = this.requireWritablePack(params.pack);
    await pack.getIndex();

    const updated: any[] = [];
    const failed: any[] = [];

    for (const patch of params.updates) {
      try {
        const doc = await this.findPackDocument(pack, patch.identifier);
        const changes: any = {};
        if (patch.name !== undefined) changes.name = patch.name;
        if (patch.img !== undefined) changes.img = patch.img;
        if (patch.system !== undefined) changes.system = patch.system;
        if (patch.folderSegments !== undefined) {
          changes.folder = (await this.packFolderId(pack, patch.folderSegments)) ?? null;
        }

        await doc.update(changes);
        updated.push({ id: doc.id, name: doc.name, changed: Object.keys(changes) });
      } catch (error) {
        failed.push({
          identifier: patch.identifier,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    auditLog(
      'updatePackEntries',
      { pack: pack.metadata?.id, count: params.updates.length },
      'success'
    );

    return {
      success: failed.length === 0,
      pack: pack.metadata?.id,
      updated,
      failed,
      partialFailure: failed.length > 0 && updated.length > 0,
    };
  }

  async deletePackEntries(params: { pack: string; identifiers: string[] }): Promise<any> {
    validateFoundryState();
    const pack = this.requireWritablePack(params.pack);
    await pack.getIndex();

    const deleted: any[] = [];
    const failed: any[] = [];

    for (const identifier of params.identifiers) {
      try {
        const doc = await this.findPackDocument(pack, identifier);
        const name = doc.name;
        await doc.delete();
        deleted.push({ id: doc.id, name });
      } catch (error) {
        failed.push({
          identifier,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    auditLog(
      'deletePackEntries',
      { pack: pack.metadata?.id, count: params.identifiers.length },
      'success'
    );

    return {
      success: failed.length === 0,
      pack: pack.metadata?.id,
      deleted,
      failed,
    };
  }

  async copyPackEntry(params: {
    pack: string;
    source: string;
    folderSegments?: string[];
    newName?: string;
  }): Promise<any> {
    validateFoundryState();
    const pack = this.requireWritablePack(params.pack);

    const source = await (globalThis as any).fromUuid(params.source);
    if (!source) {
      throw new Error(`Source document not found: "${params.source}"`);
    }
    if (source.documentName !== pack.metadata?.type) {
      throw new Error(
        `Cannot copy a ${source.documentName} into a ${pack.metadata?.type} compendium.`
      );
    }

    const data = source.toObject();
    delete data._id;
    if (params.newName !== undefined) data.name = params.newName;
    const folderId = await this.packFolderId(pack, params.folderSegments);
    data.folder = folderId ?? null;

    const documentClass = (globalThis as any).getDocumentClass(pack.metadata?.type);
    const doc = await documentClass.create(data, { pack: pack.metadata?.id });

    auditLog('copyPackEntry', { pack: pack.metadata?.id, source: params.source }, 'success');

    return {
      success: true,
      pack: pack.metadata?.id,
      id: doc?.id,
      name: doc?.name,
      copiedFrom: params.source,
    };
  }
}
