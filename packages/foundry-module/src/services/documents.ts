/**
 * Plain changes to any Foundry document (ADR-0007): list, get, create, update and delete for a
 * type, at any depth (an item on an actor, an effect on that item, a wall in a scene), in the
 * world or in a compendium pack, plus `schema` to learn the fields of a type.
 */

import { MODULE_ID } from '../constants.js';
import { auditLog, sanitizeData, validateFoundryState } from './support.js';
import { LibraryService, type FolderableType } from './library.js';
import { hasKindTable, kindsFor, type Kinds } from './document-kinds.js';
import { applySceneBackground, splitBackground } from './scene-background.js';

export interface DocumentSelector {
  type: string;
  id?: string;
  name?: string;
  parent?: DocumentSelector;
}

export interface DocumentsRequest {
  action: 'list' | 'get' | 'create' | 'update' | 'delete' | 'schema';
  type?: string;
  subtype?: string;
  kind?: string;
  id?: string | string[];
  name?: string;
  parent?: DocumentSelector;
  pack?: string;
  folderSegments?: string[];
  from?: { packId?: string; itemId?: string; uuid?: string };
  data?: any;
  query?: string;
  filter?: Record<string, unknown>;
  fields?: string[];
  limit?: number;
  offset?: number;
  confirm?: boolean;
  deleteContents?: boolean;
  maxChars?: number;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_CHARS = 40_000;
const MAX_EXAMPLE_CHARS = 6_000;
const SCHEMA_CHARS = 14_000;
/** Fields every document has that are bookkeeping, not content: left out of `schema`. */
const BOOKKEEPING_FIELDS = [
  '_id',
  '_stats',
  'sort',
  'ownership',
  'flags',
  'effects',
  'items',
  'folder',
];

/** Document types that live in a world collection (or a pack). Embedded types need a parent. */
const WORLD_TYPES = [
  'Actor',
  'Item',
  'Scene',
  'JournalEntry',
  'RollTable',
  'Playlist',
  'Macro',
  'Cards',
  'Folder',
] as const;

// --- small pure helpers (exported for tests) -----------------------------------------------------

export function getPath(source: any, path: string): unknown {
  let current = source;
  for (const part of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function setPath(target: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof current[part] !== 'object' || current[part] === null) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/** Only the given dot paths of an object. */
export function project(source: any, fields: readonly string[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const field of fields) {
    const value = getPath(source, field);
    if (value !== undefined) setPath(result, field, value);
  }
  return result;
}

/** Every `path: expected` pair must match; an array on either side matches if it contains the other. */
export function matchesFilter(source: any, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([path, expected]) => {
    const actual = getPath(source, path);
    if (Array.isArray(expected)) {
      return Array.isArray(actual)
        ? expected.some(value => actual.includes(value))
        : expected.includes(actual);
    }
    return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  });
}

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `overrides` on top of `base`: objects merge, everything else (arrays included) is replaced. */
export function deepMerge(base: any, overrides: any): any {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides;
  const result: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    result[key] =
      isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return result;
}

/** What is in a document that is too large to return whole, so that the caller can ask for parts. */
export function summarizeKeys(data: Record<string, any>): Record<string, string> {
  const describe = (value: unknown): string => {
    const size = JSON.stringify(value)?.length ?? 0;
    return Array.isArray(value)
      ? `${value.length} entries, ${size} characters`
      : `${size} characters`;
  };
  const summary: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'system' && isPlainObject(value)) {
      for (const [inner, innerValue] of Object.entries(value)) {
        summary[`system.${inner}`] = describe(innerValue);
      }
    } else {
      summary[key] = describe(value);
    }
  }
  return summary;
}

// --- schema serialisation -------------------------------------------------------------------------

const FIELD_TYPES: Record<string, string> = {
  StringField: 'string',
  NumberField: 'number',
  BooleanField: 'boolean',
  ArrayField: 'array',
  SetField: 'array',
  SchemaField: 'object',
  ObjectField: 'object',
  HTMLField: 'html',
  FilePathField: 'path',
  ColorField: 'color',
  DocumentIdField: 'id',
  ForeignDocumentField: 'id',
  DocumentUUIDField: 'uuid',
  AngleField: 'number',
  AlphaField: 'number',
  JSONField: 'json',
  EmbeddedCollectionField: 'collection',
  EmbeddedDataField: 'object',
  TypedObjectField: 'object',
};

function describeField(field: any, depth: number): Record<string, unknown> {
  const className: string = field?.constructor?.name ?? 'Field';
  const info: Record<string, unknown> = {
    type: FIELD_TYPES[className] ?? className.replace(/Field$/, '').toLowerCase(),
  };
  if (field?.integer) info['integer'] = true;
  if (field?.required) info['required'] = true;
  if (field?.nullable) info['nullable'] = true;

  const initial = field?.initial;
  if (initial !== undefined && typeof initial !== 'function') {
    const json = JSON.stringify(initial);
    if (json !== undefined && json.length <= 80) info['initial'] = initial;
  }

  try {
    const choices = typeof field?.choices === 'function' ? field.choices() : field?.choices;
    if (Array.isArray(choices)) info['choices'] = choices.slice(0, 40);
    else if (isPlainObject(choices)) info['choices'] = Object.keys(choices).slice(0, 40);
  } catch {
    // choices that need a context are left out
  }

  if (depth > 0) {
    if (isPlainObject(field?.fields)) {
      info['fields'] = Object.fromEntries(
        Object.entries(field.fields).map(([key, inner]) => [key, describeField(inner, depth - 1)])
      );
    }
    if (field?.element) info['element'] = describeField(field.element, depth - 1);
  }
  return info;
}

function describeFields(fields: Record<string, any>, depth: number): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, describeField(field, depth)])
  );
}

// -------------------------------------------------------------------------------------------------

export class DocumentsService {
  constructor(
    private readonly library: LibraryService = new LibraryService(),
    /** Extra notes about the fields of the game system (valid keys for enums), if it has any. */
    private readonly systemNotes: () => Record<string, any> = () => ({})
  ) {}

  async run(request: DocumentsRequest): Promise<any> {
    validateFoundryState();
    switch (request.action) {
      case 'list':
        return this.list(request);
      case 'get':
        return this.get(request);
      case 'create':
        return this.create(request);
      case 'update':
        return this.update(request);
      case 'delete':
        return this.remove(request);
      case 'schema':
        return this.schema(request);
      default:
        throw new Error(`Unknown documents action: ${String((request as any).action)}`);
    }
  }

  // --- finding things --------------------------------------------------------------------------

  private requireType(request: DocumentsRequest): string {
    if (!request.type) throw new Error('type is required, for example "Actor" or "Scene".');
    return request.type;
  }

  private worldCollection(type: string): any {
    const collection = (game as any).collections?.get(type);
    if (!collection) {
      throw new Error(
        `"${type}" is not a document type of the world. Top-level types: ${WORLD_TYPES.join(', ')}; ` +
          'a type inside another document needs a parent.'
      );
    }
    return collection;
  }

  private documentClass(type: string): any {
    const documentClass = (globalThis as any).getDocumentClass?.(type);
    if (!documentClass) throw new Error(`Foundry has no document type "${type}".`);
    return documentClass;
  }

  private packOf(identifier: string, type?: string): any {
    const pack = this.library.resolvePack(identifier);
    const holds: string | undefined = pack.documentName ?? pack.metadata?.type;
    if (type && holds && holds !== type) {
      throw new Error(
        `Pack ${pack.metadata?.id ?? identifier} holds ${holds} documents, not ${type}.`
      );
    }
    return pack;
  }

  private writablePack(identifier: string, type?: string): any {
    const pack = this.library.requireWritablePack(identifier);
    const holds: string | undefined = pack.documentName ?? pack.metadata?.type;
    if (type && holds && holds !== type) {
      throw new Error(
        `Pack ${pack.metadata?.id ?? identifier} holds ${holds} documents, not ${type}.`
      );
    }
    return pack;
  }

  private pickOne(candidates: any[], selector: DocumentSelector): any {
    const label = selector.id ?? selector.name ?? '(none given)';
    if (selector.id) {
      const found = candidates.find(doc => (doc.id ?? doc._id) === selector.id);
      if (!found) throw new Error(`${selector.type} not found: ${label}`);
      return found;
    }
    if (!selector.name) throw new Error(`${selector.type}: give an id or a name.`);
    const wanted = selector.name.toLowerCase();
    const matches = candidates.filter(doc => String(doc.name ?? '').toLowerCase() === wanted);
    if (matches.length === 0) throw new Error(`${selector.type} not found: ${label}`);
    if (matches.length > 1) {
      throw new Error(
        `${matches.length} ${selector.type} documents are named "${selector.name}"; use an id: ${matches
          .map(doc => doc.id ?? doc._id)
          .join(', ')}`
      );
    }
    return matches[0];
  }

  private contentsOf(collection: any): any[] {
    return Array.from(collection?.contents ?? collection ?? []);
  }

  /** One document, found by id or name, at any depth, in the world or in a pack. */
  private async find(selector: DocumentSelector, pack?: string): Promise<any> {
    if (selector.parent) {
      const parent = await this.find(selector.parent, pack);
      return this.pickOne(this.contentsOf(this.embedded(parent, selector.type)), selector);
    }
    if (pack) {
      const source = this.packOf(pack, selector.type);
      if (selector.id) {
        const doc = await source.getDocument(selector.id);
        if (!doc) throw new Error(`${selector.type} not found in ${pack}: ${selector.id}`);
        return doc;
      }
      await source.getIndex();
      const entry = this.pickOne(Array.from(source.index ?? []), selector);
      return source.getDocument(entry._id ?? entry.id);
    }
    return this.pickOne(this.contentsOf(this.worldCollection(selector.type)), selector);
  }

  private embedded(parent: any, type: string): any {
    try {
      return parent.getEmbeddedCollection(type);
    } catch {
      const allowed = Object.keys(parent.constructor?.metadata?.embedded ?? {});
      const has = allowed.length ? ` It has: ${allowed.join(', ')}.` : '';
      throw new Error(`A ${parent.documentName} has no embedded ${type}.${has}`);
    }
  }

  private folderPath(doc: any): string | null {
    return doc.folder ? this.library.folderPathOf(doc.folder) : null;
  }

  private systemId(): string {
    return String((game as any).system?.id ?? 'unknown');
  }

  private itemKinds(): Kinds {
    const types: string[] = ((game as any).documentTypes?.Item ?? []).filter(
      (type: string) => type !== 'base'
    );
    return kindsFor(this.systemId(), types);
  }

  /** The item types a request limits itself to: a subtype, or the types of a kind. */
  private allowedSubtypes(request: DocumentsRequest): string[] | undefined {
    if (request.subtype) return [request.subtype];
    if (!request.kind) return undefined;
    const types = this.itemKinds()[request.kind];
    if (!types) {
      throw new Error(
        `This game system has no kind "${request.kind}". Kinds: ${Object.keys(this.itemKinds()).join(', ')}.`
      );
    }
    return types;
  }

  // --- list --------------------------------------------------------------------------------------

  private async list(request: DocumentsRequest): Promise<any> {
    const type = this.requireType(request);
    if (type === 'Folder') return this.listFolders(request);

    const limit = Math.max(1, Math.floor(request.limit ?? DEFAULT_LIMIT));
    const offset = Math.max(0, Math.floor(request.offset ?? 0));
    const subtypes = this.allowedSubtypes(request);

    let rows: any[];
    let parentInfo: Record<string, unknown> | undefined;
    if (request.parent) {
      const parent = await this.find(request.parent, request.pack);
      parentInfo = { type: parent.documentName, id: parent.id, name: parent.name };
      rows = this.contentsOf(this.embedded(parent, type));
    } else if (request.pack) {
      const pack = this.packOf(request.pack, type);
      await pack.getIndex();
      rows = Array.from(pack.index ?? []).map((entry: any) => ({ ...entry, id: entry._id }));
    } else {
      rows = this.contentsOf(this.worldCollection(type));
    }

    if (subtypes) rows = rows.filter(doc => subtypes.includes(doc.type));
    if (request.query) {
      const needle = request.query.toLowerCase();
      rows = rows.filter(doc =>
        String(doc.name ?? '')
          .toLowerCase()
          .includes(needle)
      );
    }
    if (request.filter) {
      const filter = request.filter;
      rows = rows.filter(doc => matchesFilter(doc, filter));
    }
    rows.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));

    const page = rows.slice(offset, offset + limit).map(doc => {
      const row: Record<string, unknown> = {
        id: doc.id ?? doc._id,
        name: doc.name,
        type: doc.type ?? null,
      };
      if (!request.pack || request.parent) row['folder'] = this.folderPath(doc);
      if (request.fields?.length) row['fields'] = sanitizeData(project(doc, request.fields));
      return row;
    });

    return {
      documentName: type,
      ...(parentInfo ? { parent: parentInfo } : {}),
      ...(request.pack ? { pack: request.pack } : {}),
      total: rows.length,
      limit,
      offset,
      hasMore: offset + limit < rows.length,
      documents: page,
    };
  }

  private async listFolders(request: DocumentsRequest): Promise<any> {
    const holds = request.subtype as FolderableType | undefined;
    if (!holds && !request.pack) {
      throw new Error('Folders hold a document type: give subtype, for example "Actor".');
    }
    return this.library.listFolders({
      documentType: holds as FolderableType,
      ...(request.pack ? { pack: request.pack } : {}),
    });
  }

  // --- get ---------------------------------------------------------------------------------------

  private async get(request: DocumentsRequest): Promise<any> {
    const type = this.requireType(request);
    if (Array.isArray(request.id)) throw new Error('get reads one document: give a single id.');
    const doc = await this.find(
      {
        type,
        ...(request.id ? { id: request.id } : {}),
        ...(request.name ? { name: request.name } : {}),
        ...(request.parent ? { parent: request.parent } : {}),
      },
      request.pack
    );

    const data = sanitizeData(typeof doc.toObject === 'function' ? doc.toObject() : { ...doc });
    const header = {
      documentName: type,
      id: doc.id,
      name: doc.name,
      type: doc.type ?? null,
      ...(request.pack ? { pack: request.pack } : {}),
    };

    if (request.fields?.length) return { ...header, data: project(data, request.fields) };

    const maxChars = Math.min(Math.max(request.maxChars ?? DEFAULT_MAX_CHARS, 1_000), 200_000);
    const size = JSON.stringify(data).length;
    if (size > maxChars) {
      return {
        ...header,
        truncated: true,
        size,
        keys: summarizeKeys(data),
        hint: `The document is ${size} characters, over the limit of ${maxChars}. Ask for parts with fields, for example ["name", "system.details"], or raise maxChars.`,
      };
    }
    return { ...header, data };
  }

  // --- create ------------------------------------------------------------------------------------

  /** The data of a compendium entry or any document by UUID, ready to be created again. */
  private async sourceData(
    from: NonNullable<DocumentsRequest['from']>,
    type: string
  ): Promise<Record<string, any>> {
    let source: any;
    if (from.uuid) {
      source = await (globalThis as any).fromUuid?.(from.uuid);
      if (!source) throw new Error(`Nothing found for UUID ${from.uuid}`);
    } else if (from.packId && from.itemId) {
      source = await this.packOf(from.packId).getDocument(from.itemId);
      if (!source) throw new Error(`${from.itemId} not found in ${from.packId}`);
    } else {
      throw new Error('from needs a uuid, or a packId and an itemId.');
    }
    if (source.documentName && source.documentName !== type) {
      throw new Error(`The source is a ${source.documentName}, not a ${type}.`);
    }
    const converted = (game as any).collections?.get(type)?.fromCompendium?.(source);
    if (converted) return converted;
    const raw = source.toObject();
    delete raw._id;
    return raw;
  }

  private async create(request: DocumentsRequest): Promise<any> {
    const type = this.requireType(request);
    if (type === 'Folder') return this.createFolder(request);

    const entries: any[] = Array.isArray(request.data)
      ? request.data
      : request.data !== undefined
        ? [request.data]
        : request.from
          ? [{}]
          : [];
    if (entries.length === 0) throw new Error('create needs data (an object or a list), or from.');

    const pack =
      request.pack && !request.parent ? this.writablePack(request.pack, type) : undefined;
    const base = request.from ? await this.sourceData(request.from, type) : undefined;
    const subtypes = this.allowedSubtypes(request);

    let folderId: string | undefined;
    if (request.folderSegments?.length && !request.parent) {
      const folder = await this.library.createFolderByPath(
        request.folderSegments,
        type as FolderableType,
        pack?.metadata?.id
      );
      folderId = folder.id;
    }

    // A scene's background image lives on its first level in Foundry v14: it is set after the create.
    const isWorldScene = type === 'Scene' && !pack && !request.parent;
    const backgrounds: Array<string | undefined> = [];
    const payload = entries.map(entry => {
      const merged = base ? deepMerge(base, entry) : { ...entry };
      if (merged.type === undefined && subtypes?.length === 1) merged.type = subtypes[0];
      if (subtypes && merged.type !== undefined && !subtypes.includes(merged.type)) {
        throw new Error(
          `Type "${merged.type}" is not in ${request.kind ?? request.subtype}: ${subtypes.join(', ')}.`
        );
      }
      if (folderId !== undefined && merged.folder === undefined) merged.folder = folderId;
      if (isWorldScene) {
        const { data, background } = splitBackground(merged);
        backgrounds.push(background);
        return data;
      }
      return merged;
    });

    // The world setting "Max Actors Per Request" limits how many actors one call may create.
    if (type === 'Actor' && !request.parent) {
      const max = Number((game as any).settings?.get?.(MODULE_ID, 'maxActorsPerRequest'));
      if (Number.isFinite(max) && max > 0 && payload.length > max) {
        throw new Error(
          `At most ${max} actors can be created in one request (the world setting "Max Actors Per Request"); ${payload.length} were asked for.`
        );
      }
    }

    let created: any[];
    if (request.parent) {
      const parent = await this.find(request.parent, request.pack);
      created = await parent.createEmbeddedDocuments(type, payload);
    } else if (pack) {
      created = await this.documentClass(type).createDocuments(payload, { pack: pack.metadata.id });
    } else {
      this.worldCollection(type);
      created = await this.documentClass(type).createDocuments(payload);
    }
    for (const [index, background] of backgrounds.entries()) {
      if (background && created[index]) await applySceneBackground(created[index], background);
    }

    auditLog('documents.create', { type, count: created.length, pack: request.pack }, 'success');
    return {
      success: true,
      documentName: type,
      created: created.map(doc => ({ id: doc.id, name: doc.name, type: doc.type ?? null })),
    };
  }

  private async createFolder(request: DocumentsRequest): Promise<any> {
    if (!request.folderSegments?.length) {
      throw new Error(
        'Creating a folder needs its path in folder, for example "Monsters/Goblins".'
      );
    }
    const holds = request.subtype as FolderableType | undefined;
    if (!holds && !request.pack) throw new Error('A folder holds a document type: give subtype.');
    return this.library.createFolderPath({
      segments: request.folderSegments,
      documentType: holds as FolderableType,
      ...(request.pack ? { pack: request.pack } : {}),
    });
  }

  // --- update ------------------------------------------------------------------------------------

  private async update(request: DocumentsRequest): Promise<any> {
    const type = this.requireType(request);
    if (type === 'Folder') return this.updateFolder(request);
    if (request.data === undefined || request.data === null) throw new Error('update needs data.');

    const updates: Array<Record<string, any>> = [];
    if (Array.isArray(request.data)) {
      request.data.forEach((entry: any, index: number) => {
        const id = entry?._id ?? entry?.id;
        if (!id) throw new Error(`data[${index}] needs an id or _id.`);
        const change = { ...entry, _id: id };
        delete change.id;
        updates.push(change);
      });
    } else {
      const ids = Array.isArray(request.id)
        ? request.id
        : [typeof request.id === 'string' ? request.id : undefined];
      for (const id of ids) {
        const target = await this.find(
          {
            type,
            ...(id ? { id } : {}),
            ...(request.name ? { name: request.name } : {}),
            ...(request.parent ? { parent: request.parent } : {}),
          },
          request.pack
        );
        updates.push({ ...request.data, _id: target.id });
      }
    }
    if (updates.length === 0) throw new Error('Nothing to update.');

    // A scene's background image lives on its first level in Foundry v14: it is set after the update.
    const backgrounds = new Map<string, string>();
    if (type === 'Scene' && !request.pack && !request.parent) {
      updates.forEach((update, index) => {
        const { data, background } = splitBackground(update);
        if (background) backgrounds.set(String(update['_id']), background);
        updates[index] = data;
      });
    }

    let updated: any[];
    if (request.parent) {
      const parent = await this.find(request.parent, request.pack);
      updated = await parent.updateEmbeddedDocuments(type, updates);
    } else if (request.pack) {
      const pack = this.writablePack(request.pack, type);
      updated = await this.documentClass(type).updateDocuments(updates, { pack: pack.metadata.id });
    } else {
      this.worldCollection(type);
      updated = await this.documentClass(type).updateDocuments(updates);
    }
    for (const [id, background] of backgrounds) {
      const scene = this.worldCollection('Scene').get(id);
      if (scene) await applySceneBackground(scene, background);
    }

    auditLog('documents.update', { type, count: updated.length, pack: request.pack }, 'success');
    return {
      success: true,
      documentName: type,
      updated: updated.map(doc => ({ id: doc.id, name: doc.name })),
    };
  }

  private async updateFolder(request: DocumentsRequest): Promise<any> {
    const holds = request.subtype as FolderableType | undefined;
    const segments = request.folderSegments;
    if (!segments?.length) throw new Error('Changing a folder needs its path in folder.');
    const data = (request.data ?? {}) as { name?: string; parent?: string[] | null };
    if (data.name !== undefined) {
      return this.library.renameFolderPath({
        segments,
        documentType: holds as FolderableType,
        newName: data.name,
        ...(request.pack ? { pack: request.pack } : {}),
      });
    }
    if ('parent' in data) {
      return this.library.moveFolderPath({
        segments,
        documentType: holds as FolderableType,
        newParentSegments: data.parent ?? null,
        ...(request.pack ? { pack: request.pack } : {}),
      });
    }
    throw new Error(
      'A folder can be renamed (data.name) or moved (data.parent, a list of names or null).'
    );
  }

  // --- delete ------------------------------------------------------------------------------------

  private async remove(request: DocumentsRequest): Promise<any> {
    const type = this.requireType(request);
    if (type === 'Folder') {
      if (!request.folderSegments?.length)
        throw new Error('Deleting a folder needs its path in folder.');
      if (request.deleteContents && !request.confirm) {
        throw new Error('Deleting a folder with its contents needs confirm: true.');
      }
      return this.library.deleteFolderPath({
        segments: request.folderSegments,
        documentType: request.subtype as FolderableType,
        deleteContents: !!request.deleteContents,
        ...(request.pack ? { pack: request.pack } : {}),
      });
    }

    const targets: any[] = [];
    const wanted = Array.isArray(request.id) ? request.id : request.id ? [request.id] : [undefined];
    for (const id of wanted) {
      targets.push(
        await this.find(
          {
            type,
            ...(id ? { id } : {}),
            ...(request.name ? { name: request.name } : {}),
            ...(request.parent ? { parent: request.parent } : {}),
          },
          request.pack
        )
      );
    }
    if (targets.length > 1 && !request.confirm) {
      throw new Error(`Deleting ${targets.length} documents needs confirm: true.`);
    }
    const ids = targets.map(doc => doc.id as string);
    const summary = targets.map(doc => ({ id: doc.id, name: doc.name }));

    if (request.parent) {
      const parent = await this.find(request.parent, request.pack);
      await parent.deleteEmbeddedDocuments(type, ids);
    } else if (request.pack) {
      const pack = this.writablePack(request.pack, type);
      await this.documentClass(type).deleteDocuments(ids, { pack: pack.metadata.id });
    } else {
      this.worldCollection(type);
      await this.documentClass(type).deleteDocuments(ids);
    }

    auditLog('documents.delete', { type, count: ids.length, pack: request.pack }, 'success');
    return { success: true, documentName: type, deleted: summary };
  }

  // --- schema ------------------------------------------------------------------------------------

  private subtypesOf(type: string): string[] {
    const documentTypes: string[] = (game as any).documentTypes?.[type] ?? [];
    return documentTypes.filter(subtype => subtype !== 'base');
  }

  private async schema(request: DocumentsRequest): Promise<any> {
    const system = this.systemId();
    if (!request.type) {
      const notes = this.systemNotes();
      const embeddedOf = (type: string): string[] => {
        try {
          return Object.keys(this.documentClass(type).metadata?.embedded ?? {});
        } catch {
          return [];
        }
      };
      return {
        system,
        types: Object.fromEntries(
          WORLD_TYPES.filter(type => type !== 'Folder').map(type => [
            type,
            { subtypes: this.subtypesOf(type), embedded: embeddedOf(type) },
          ])
        ),
        kinds: this.itemKinds(),
        kindsAreGuessed: !hasKindTable(system),
        ...(notes['items'] || notes['description'] ? { systemNotes: notes } : {}),
        note: 'Call schema with a type (and a subtype) for its fields. Folder: documents hold a folder path in `folder` and the type it holds in `subtype`.',
      };
    }

    const type = request.type;
    const documentClass = this.documentClass(type);
    const subtype = request.subtype;
    const subtypes = this.subtypesOf(type);
    if (subtype && !subtypes.includes(subtype)) {
      throw new Error(`${type} has no subtype "${subtype}". Subtypes: ${subtypes.join(', ')}.`);
    }

    const baseFields: Record<string, any> = { ...(documentClass.schema?.fields ?? {}) };
    const model = subtype ? (CONFIG as any)[type]?.dataModels?.[subtype] : undefined;
    const systemFields = model?.schema?.fields ?? baseFields['system']?.fields;
    delete baseFields['system'];

    for (const key of BOOKKEEPING_FIELDS) delete baseFields[key];
    // The base fields are listed by name and type only; the system fields, which hold the
    // content, go as deep as fits.
    const fields = describeFields(baseFields, 0);
    let systemDescription: Record<string, unknown> | undefined;
    for (let depth = 4; systemFields && depth >= 1; depth--) {
      systemDescription = describeFields(systemFields, depth);
      if (JSON.stringify({ fields, systemDescription }).length <= SCHEMA_CHARS) break;
    }

    const example = await this.exampleOf(type, subtype);
    const notes = this.systemNotes();
    return {
      documentName: type,
      ...(subtype ? { subtype } : {}),
      subtypes,
      embedded: Object.keys(documentClass.metadata?.embedded ?? {}),
      fields,
      ...(systemDescription
        ? { system: systemDescription }
        : { systemNote: 'No data model for system fields; use the example.' }),
      ...(type === 'Item' || type === 'Actor' ? { kinds: this.itemKinds() } : {}),
      example,
      ...(notes['items'] || notes['description'] ? { systemNotes: notes } : {}),
    };
  }

  private async exampleOf(type: string, subtype?: string): Promise<unknown> {
    let doc: any;
    const collection = (game as any).collections?.get(type);
    if (collection) doc = this.contentsOf(collection).find(d => !subtype || d.type === subtype);
    if (!doc && type === 'Item') {
      for (const actor of this.contentsOf((game as any).actors)) {
        doc = this.contentsOf(actor.items).find((d: any) => !subtype || d.type === subtype);
        if (doc) break;
      }
    }
    if (!doc) {
      return {
        available: false,
        note: 'No document of this type in the world. Read one from a compendium with compendium get.',
      };
    }
    const data = sanitizeData(doc.toObject());
    for (const key of ['_id', 'folder', 'sort', 'ownership', 'flags', '_stats']) delete data[key];
    const size = JSON.stringify(data).length;
    return size <= MAX_EXAMPLE_CHARS
      ? { from: { id: doc.id, name: doc.name }, data }
      : { from: { id: doc.id, name: doc.name }, tooLarge: size, keys: summarizeKeys(data) };
  }
}
