import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  ConfigFieldDef,
  ConfigFieldType,
  ConfigFieldValue,
  ConfigStoreSnapshot,
  ConfigTableRecord,
  ConfigTypeRecord,
  CreateConfigTableInput,
  CreateConfigTypeInput,
  DeleteConfigTableInput,
  DeleteConfigTypeInput,
  SaveConfigTableInput,
  SaveConfigTreeOrderInput,
  SaveConfigTypeSchemaInput
} from '../../shared/contracts';
import { getCurrentProjectPath } from './projectStore';

const yaml: {
  load: (input: string) => unknown;
  dump: (
    input: unknown,
    options?: {
      indent?: number;
      noRefs?: boolean;
      lineWidth?: number;
      noCompatMode?: boolean;
      sortKeys?: boolean;
    }
  ) => string;
} = require('js-yaml');

type StoredTypeDoc = {
  id: string;
  className: string;
  namespace: string;
  fields: ConfigFieldDef[];
  createdAt: string;
  updatedAt: string;
};

type StoredTableDoc = {
  id: string;
  typeId: string;
  values: Record<string, ConfigFieldValue>;
  createdAt: string;
  updatedAt: string;
};

type StoredMetaDoc = {
  id: string;
  name: string;
  order: number;
  updatedAt: string;
};

const STORE_ROOT_NAME = 'config-store';
const TYPES_DIR_NAME = 'types';
const DEFAULT_TYPE_NAME = '新配置类型';
const DEFAULT_TABLE_NAME = '新配置表';
let runtimeStoreRootDir: string | null = null;

const FIELD_TYPE_SET: ReadonlySet<ConfigFieldType> = new Set<ConfigFieldType>([
  'int',
  'float',
  'string',
  'bool',
  'nested',
  'int_array',
  'float_array',
  'string_array',
  'bool_array'
]);

async function refreshStoreRootDir(): Promise<void> {
  const projectPath = await getCurrentProjectPath();
  runtimeStoreRootDir = projectPath ? path.join(projectPath, STORE_ROOT_NAME) : null;
}

function requireStoreRootDir(): string {
  if (!runtimeStoreRootDir) {
    throw new Error('请先创建或打开项目。');
  }
  return runtimeStoreRootDir;
}

function getStoreRootDir(): string {
  return requireStoreRootDir();
}

function getTypesDir(): string {
  return path.join(getStoreRootDir(), TYPES_DIR_NAME);
}

function getTypeFilePath(typeId: string): string {
  return path.join(getTypesDir(), `${typeId}.yaml`);
}

function getTypeMetaFilePath(typeId: string): string {
  return path.join(getTypesDir(), `${typeId}.meta.yaml`);
}

function getTypeTablesDir(typeId: string): string {
  return path.join(getTypesDir(), typeId);
}

function getTableFilePath(typeId: string, tableId: string): string {
  return path.join(getTypeTablesDir(typeId), `${tableId}.yaml`);
}

function getTableMetaFilePath(typeId: string, tableId: string): string {
  return path.join(getTypeTablesDir(typeId), `${tableId}.meta.yaml`);
}

function serializeYaml(data: unknown): string {
  return yaml.dump(data, {
    indent: 2,
    noRefs: true,
    lineWidth: -1,
    noCompatMode: true,
    sortKeys: false
  });
}

function parseYaml<T>(raw: string, fallback: T): T {
  const text = raw.trim();
  if (!text) {
    return fallback;
  }

  const parsed = yaml.load(text);
  if (parsed === undefined || parsed === null) {
    return fallback;
  }
  return parsed as T;
}

async function ensureStoreReady(): Promise<void> {
  await refreshStoreRootDir();
  if (!runtimeStoreRootDir) {
    throw new Error('请先创建或打开项目。');
  }
  await fs.mkdir(getTypesDir(), { recursive: true });
}

async function readYamlFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseYaml(raw, fallback);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeYamlFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeYaml(data), 'utf8');
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function removeDirIfExists(targetDir: string): Promise<void> {
  try {
    await fs.rm(targetDir, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function normalizeText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  return value;
}

function normalizeTypeName(name: unknown): string {
  const trimmed = normalizeText(name).trim();
  return trimmed || DEFAULT_TYPE_NAME;
}

function normalizeTableName(name: unknown): string {
  const trimmed = normalizeText(name).trim();
  return trimmed || DEFAULT_TABLE_NAME;
}

function defaultClassNameForType(typeId: string): string {
  return `Class${typeId}`;
}

function normalizeClassName(value: unknown, typeId: string): string {
  const trimmed = normalizeText(value).trim();
  return trimmed || defaultClassNameForType(typeId);
}

function normalizeNamespace(value: unknown): string {
  return normalizeText(value).trim();
}

function normalizeFieldType(value: unknown): ConfigFieldType {
  if (typeof value === 'string' && FIELD_TYPE_SET.has(value as ConfigFieldType)) {
    return value as ConfigFieldType;
  }
  return 'string';
}

function defaultValueForType(type: ConfigFieldType): ConfigFieldValue {
  if (type === 'bool') {
    return false;
  }
  if (type === 'nested') {
    return {};
  }
  if (type === 'bool_array') {
    return [];
  }
  if (type.endsWith('_array')) {
    return [];
  }
  return '';
}

function isStringArrayType(type: ConfigFieldType): boolean {
  return type === 'int_array' || type === 'float_array' || type === 'string_array';
}

function normalizeFieldValue(type: ConfigFieldType, raw: unknown): ConfigFieldValue {
  if (type === 'nested') {
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, ConfigFieldValue>) : {};
  }

  if (type === 'bool') {
    return typeof raw === 'boolean' ? raw : false;
  }

  if (type === 'bool_array') {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((item) => Boolean(item));
  }

  if (isStringArrayType(type)) {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((item) => String(item ?? ''));
  }

  return typeof raw === 'string' ? raw : String(raw ?? '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFieldDefs(rawFields: unknown): ConfigFieldDef[] {
  if (!Array.isArray(rawFields)) {
    return [];
  }

  const result: ConfigFieldDef[] = [];
  const idSet = new Set<string>();

  for (let i = 0; i < rawFields.length; i++) {
    const raw = rawFields[i] as Partial<ConfigFieldDef>;
    const rawId = normalizeText(raw.id).trim();
    let id = rawId || randomUUID();

    while (idSet.has(id)) {
      id = randomUUID();
    }

    idSet.add(id);
    const type = normalizeFieldType(raw.type);
    const nestedTypeId = normalizeText(raw.nestedTypeId).trim();

    result.push({
      id,
      tag: normalizeText(raw.tag),
      fieldName: normalizeText(raw.fieldName),
      type,
      nestedTypeId: type === 'nested' ? nestedTypeId || undefined : undefined
    });
  }

  return result;
}

function normalizeValuesByFields(
  values: Record<string, unknown>,
  fields: ConfigFieldDef[],
  typeDocs: ReadonlyMap<string, StoredTypeDoc>,
  ownerTypeId: string,
  visitedTypeIds: ReadonlySet<string> = new Set<string>()
): Record<string, ConfigFieldValue> {
  const next: Record<string, ConfigFieldValue> = {};
  const nextVisited = new Set(visitedTypeIds);
  nextVisited.add(ownerTypeId);

  for (const field of fields) {
    if (field.type !== 'nested') {
      next[field.id] = normalizeFieldValue(field.type, values[field.id]);
      continue;
    }

    const nestedTypeId = normalizeText(field.nestedTypeId).trim();
    const nestedTypeDoc = nestedTypeId ? typeDocs.get(nestedTypeId) : undefined;
    if (!nestedTypeDoc || nextVisited.has(nestedTypeId)) {
      next[field.id] = {};
      continue;
    }

    const rawNested = isRecord(values[field.id]) ? (values[field.id] as Record<string, unknown>) : {};
    next[field.id] = normalizeValuesByFields(rawNested, nestedTypeDoc.fields, typeDocs, nestedTypeId, nextVisited);
  }

  return next;
}

async function readTypeMeta(typeId: string): Promise<StoredMetaDoc> {
  const fallback: StoredMetaDoc = {
    id: typeId,
    name: DEFAULT_TYPE_NAME,
    order: 0,
    updatedAt: new Date().toISOString()
  };

  const raw = await readYamlFile<Partial<StoredMetaDoc>>(getTypeMetaFilePath(typeId), fallback);
  return {
    id: typeId,
    name: normalizeTypeName(raw.name),
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : 0,
    updatedAt: normalizeText(raw.updatedAt, fallback.updatedAt)
  };
}

async function writeTypeMeta(typeId: string, name: string, order: number): Promise<void> {
  await writeYamlFile(getTypeMetaFilePath(typeId), {
    id: typeId,
    name: normalizeTypeName(name),
    order,
    updatedAt: new Date().toISOString()
  } satisfies StoredMetaDoc);
}

async function readTableMeta(typeId: string, tableId: string): Promise<StoredMetaDoc> {
  const fallback: StoredMetaDoc = {
    id: tableId,
    name: DEFAULT_TABLE_NAME,
    order: 0,
    updatedAt: new Date().toISOString()
  };

  const raw = await readYamlFile<Partial<StoredMetaDoc>>(getTableMetaFilePath(typeId, tableId), fallback);
  return {
    id: tableId,
    name: normalizeTableName(raw.name),
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : 0,
    updatedAt: normalizeText(raw.updatedAt, fallback.updatedAt)
  };
}

async function writeTableMeta(typeId: string, tableId: string, name: string, order: number): Promise<void> {
  await writeYamlFile(getTableMetaFilePath(typeId, tableId), {
    id: tableId,
    name: normalizeTableName(name),
    order,
    updatedAt: new Date().toISOString()
  } satisfies StoredMetaDoc);
}

async function readTypeDoc(typeId: string): Promise<StoredTypeDoc | null> {
  const filePath = getTypeFilePath(typeId);
  const fallback: Partial<StoredTypeDoc> = {
    id: typeId,
    className: defaultClassNameForType(typeId),
    namespace: '',
    fields: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const raw = await readYamlFile<Partial<StoredTypeDoc>>(filePath, fallback);

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  return {
    id: normalizeText(raw.id, typeId) || typeId,
    className: normalizeClassName(raw.className, typeId),
    namespace: normalizeNamespace(raw.namespace),
    fields: normalizeFieldDefs(raw.fields),
    createdAt: normalizeText(raw.createdAt, fallback.createdAt as string),
    updatedAt: normalizeText(raw.updatedAt, fallback.updatedAt as string)
  };
}

async function writeTypeDoc(typeId: string, className: string, namespace: string, fields: ConfigFieldDef[]): Promise<void> {
  const now = new Date().toISOString();
  const existing = await readTypeDoc(typeId);
  await writeYamlFile(getTypeFilePath(typeId), {
    id: typeId,
    className: normalizeClassName(className, typeId),
    namespace: normalizeNamespace(namespace),
    fields: normalizeFieldDefs(fields),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  } satisfies StoredTypeDoc);
}

async function readTableDoc(typeId: string, tableId: string): Promise<StoredTableDoc | null> {
  const filePath = getTableFilePath(typeId, tableId);
  const fallback: Partial<StoredTableDoc> = {
    id: tableId,
    typeId,
    values: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const raw = await readYamlFile<Partial<StoredTableDoc>>(filePath, fallback);

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  return {
    id: normalizeText(raw.id, tableId) || tableId,
    typeId: normalizeText(raw.typeId, typeId) || typeId,
    values: typeof raw.values === 'object' && raw.values ? (raw.values as Record<string, ConfigFieldValue>) : {},
    createdAt: normalizeText(raw.createdAt, fallback.createdAt as string),
    updatedAt: normalizeText(raw.updatedAt, fallback.updatedAt as string)
  };
}

async function writeTableDoc(
  typeId: string,
  tableId: string,
  typeDocs: ReadonlyMap<string, StoredTypeDoc>,
  fields: ConfigFieldDef[],
  values: Record<string, ConfigFieldValue>
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await readTableDoc(typeId, tableId);

  await writeYamlFile(getTableFilePath(typeId, tableId), {
    id: tableId,
    typeId,
    values: normalizeValuesByFields(values, fields, typeDocs, typeId),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  } satisfies StoredTableDoc);
}

async function getTypeIds(): Promise<string[]> {
  const dir = getTypesDir();
  const entries = await fs.readdir(dir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml') && !entry.name.endsWith('.meta.yaml'))
    .map((entry) => entry.name.slice(0, -'.yaml'.length));
}

async function loadTypeDocsMap(): Promise<Map<string, StoredTypeDoc>> {
  const typeIds = await getTypeIds();
  const map = new Map<string, StoredTypeDoc>();

  for (const typeId of typeIds) {
    const doc = await readTypeDoc(typeId);
    if (doc) {
      map.set(typeId, doc);
    }
  }

  return map;
}

async function getTableIds(typeId: string): Promise<string[]> {
  const tablesDir = getTypeTablesDir(typeId);
  try {
    const entries = await fs.readdir(tablesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml') && !entry.name.endsWith('.meta.yaml'))
      .map((entry) => entry.name.slice(0, -'.yaml'.length));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function loadTypeRecord(
  typeId: string,
  typeDocs: ReadonlyMap<string, StoredTypeDoc>
): Promise<{ type: ConfigTypeRecord; order: number } | null> {
  const typeDoc = typeDocs.get(typeId) ?? null;
  if (!typeDoc) {
    return null;
  }

  const typeMeta = await readTypeMeta(typeId);
  const tableIds = await getTableIds(typeId);

  const tablePairs: Array<{ table: ConfigTableRecord; order: number }> = [];

  for (const tableId of tableIds) {
    const tableDoc = await readTableDoc(typeId, tableId);
    if (!tableDoc) {
      continue;
    }

    const tableMeta = await readTableMeta(typeId, tableId);

    tablePairs.push({
      order: tableMeta.order,
      table: {
        id: tableId,
        name: tableMeta.name,
        typeId,
        values: normalizeValuesByFields(tableDoc.values as Record<string, unknown>, typeDoc.fields, typeDocs, typeId)
      }
    });
  }

  tablePairs.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.table.id.localeCompare(b.table.id);
  });

  return {
    order: typeMeta.order,
    type: {
      id: typeId,
      name: typeMeta.name,
      className: typeDoc.className,
      namespace: typeDoc.namespace,
      fields: typeDoc.fields,
      tables: tablePairs.map((item) => item.table)
    }
  };
}

async function loadSnapshot(): Promise<ConfigStoreSnapshot> {
  await refreshStoreRootDir();
  if (!runtimeStoreRootDir) {
    return {
      types: []
    };
  }
  await fs.mkdir(getTypesDir(), { recursive: true });

  const typeIds = await getTypeIds();
  const typeDocs = await loadTypeDocsMap();
  const pairs: Array<{ type: ConfigTypeRecord; order: number }> = [];

  for (const typeId of typeIds) {
    const pair = await loadTypeRecord(typeId, typeDocs);
    if (pair) {
      pairs.push(pair);
    }
  }

  pairs.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.type.id.localeCompare(b.type.id);
  });

  return {
    types: pairs.map((item) => item.type)
  };
}

async function nextTypeOrder(): Promise<number> {
  const ids = await getTypeIds();
  if (ids.length === 0) {
    return 0;
  }

  const orders = await Promise.all(ids.map(async (id) => (await readTypeMeta(id)).order));
  return Math.max(...orders) + 1;
}

async function nextTableOrder(typeId: string): Promise<number> {
  const ids = await getTableIds(typeId);
  if (ids.length === 0) {
    return 0;
  }

  const orders = await Promise.all(ids.map(async (id) => (await readTableMeta(typeId, id)).order));
  return Math.max(...orders) + 1;
}

async function assertTypeExists(typeId: string): Promise<StoredTypeDoc> {
  const typeDoc = await readTypeDoc(typeId);
  if (!typeDoc) {
    throw new Error('配置类型不存在。');
  }
  return typeDoc;
}

async function assertTableExists(typeId: string, tableId: string): Promise<StoredTableDoc> {
  const tableDoc = await readTableDoc(typeId, tableId);
  if (!tableDoc) {
    throw new Error('配置表不存在。');
  }
  return tableDoc;
}

async function getConfigStoreSnapshot(): Promise<ConfigStoreSnapshot> {
  return loadSnapshot();
}

async function createConfigType(input: CreateConfigTypeInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();

  const typeId = randomUUID();
  const now = new Date().toISOString();
  const order = await nextTypeOrder();
  const name = normalizeTypeName(input.name);
  const className = defaultClassNameForType(typeId);

  await writeYamlFile(getTypeFilePath(typeId), {
    id: typeId,
    className,
    namespace: '',
    fields: [],
    createdAt: now,
    updatedAt: now
  } satisfies StoredTypeDoc);

  await writeTypeMeta(typeId, name, order);
  await fs.mkdir(getTypeTablesDir(typeId), { recursive: true });

  return loadSnapshot();
}

async function deleteConfigType(input: DeleteConfigTypeInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();

  const typeId = input.typeId;
  const typeDocs = await loadTypeDocsMap();
  typeDocs.delete(typeId);

  for (const [ownerTypeId, ownerTypeDoc] of typeDocs.entries()) {
    const filteredFields = ownerTypeDoc.fields.filter((field) => !(field.type === 'nested' && field.nestedTypeId === typeId));
    if (filteredFields.length === ownerTypeDoc.fields.length) {
      continue;
    }

    await writeTypeDoc(ownerTypeId, ownerTypeDoc.className, ownerTypeDoc.namespace, filteredFields);
  }

  await unlinkIfExists(getTypeFilePath(typeId));
  await unlinkIfExists(getTypeMetaFilePath(typeId));
  await removeDirIfExists(getTypeTablesDir(typeId));

  const refreshedTypeDocs = await loadTypeDocsMap();
  for (const [ownerTypeId, ownerTypeDoc] of refreshedTypeDocs.entries()) {
    const tableIds = await getTableIds(ownerTypeId);
    for (const tableId of tableIds) {
      const tableDoc = await assertTableExists(ownerTypeId, tableId);
      await writeTableDoc(ownerTypeId, tableId, refreshedTypeDocs, ownerTypeDoc.fields, tableDoc.values);
    }
  }

  return loadSnapshot();
}

async function createConfigTable(input: CreateConfigTableInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();

  const typeDoc = await assertTypeExists(input.typeId);
  const typeDocs = await loadTypeDocsMap();
  const tableId = randomUUID();
  const now = new Date().toISOString();
  const order = await nextTableOrder(input.typeId);
  const name = normalizeTableName(input.name);

  await fs.mkdir(getTypeTablesDir(input.typeId), { recursive: true });

  await writeYamlFile(getTableFilePath(input.typeId, tableId), {
    id: tableId,
    typeId: input.typeId,
    values: normalizeValuesByFields({}, typeDoc.fields, typeDocs, input.typeId),
    createdAt: now,
    updatedAt: now
  } satisfies StoredTableDoc);

  await writeTableMeta(input.typeId, tableId, name, order);

  return loadSnapshot();
}

async function deleteConfigTable(input: DeleteConfigTableInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();

  await unlinkIfExists(getTableFilePath(input.typeId, input.tableId));
  await unlinkIfExists(getTableMetaFilePath(input.typeId, input.tableId));

  return loadSnapshot();
}

async function saveConfigTypeSchema(input: SaveConfigTypeSchemaInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();

  const typeId = input.typeId;
  const existingTypeDoc = await assertTypeExists(typeId);

  const fields = normalizeFieldDefs(input.fields);

  await writeTypeDoc(typeId, input.className, input.namespace, fields);

  const typeOrder = (await readTypeMeta(typeId)).order;
  await writeTypeMeta(typeId, normalizeTypeName(input.name), typeOrder);

  const typeDocs = await loadTypeDocsMap();
  if (!typeDocs.has(typeId)) {
    typeDocs.set(typeId, {
      ...existingTypeDoc,
      className: normalizeClassName(input.className, typeId),
      namespace: normalizeNamespace(input.namespace),
      fields
    });
  }

  for (const [ownerTypeId, ownerTypeDoc] of typeDocs.entries()) {
    const tableIds = await getTableIds(ownerTypeId);
    for (const tableId of tableIds) {
      const tableDoc = await assertTableExists(ownerTypeId, tableId);
      await writeTableDoc(ownerTypeId, tableId, typeDocs, ownerTypeDoc.fields, tableDoc.values);
    }
  }

  return loadSnapshot();
}

async function saveConfigTable(input: SaveConfigTableInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();

  const typeId = input.typeId;
  const tableId = input.tableId;

  const typeDoc = await assertTypeExists(typeId);
  const typeDocs = await loadTypeDocsMap();
  await assertTableExists(typeId, tableId);

  await writeTableDoc(typeId, tableId, typeDocs, typeDoc.fields, input.values);

  const tableOrder = (await readTableMeta(typeId, tableId)).order;
  await writeTableMeta(typeId, tableId, normalizeTableName(input.name), tableOrder);

  return loadSnapshot();
}

async function saveConfigTreeOrder(input: SaveConfigTreeOrderInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();

  const typeIds = await getTypeIds();
  const typeMetaById = new Map<string, StoredMetaDoc>();
  for (const typeId of typeIds) {
    typeMetaById.set(typeId, await readTypeMeta(typeId));
  }

  const orderedTypeIds: string[] = [];
  const seenTypeIds = new Set<string>();
  for (const typeId of input.typeOrderIds) {
    if (!typeMetaById.has(typeId) || seenTypeIds.has(typeId)) {
      continue;
    }
    orderedTypeIds.push(typeId);
    seenTypeIds.add(typeId);
  }
  for (const typeId of typeIds) {
    if (seenTypeIds.has(typeId)) {
      continue;
    }
    orderedTypeIds.push(typeId);
    seenTypeIds.add(typeId);
  }

  for (let index = 0; index < orderedTypeIds.length; index++) {
    const typeId = orderedTypeIds[index];
    const meta = typeMetaById.get(typeId);
    if (!meta) {
      continue;
    }
    await writeTypeMeta(typeId, meta.name, index);
  }

  for (const typeId of typeIds) {
    const tableIds = await getTableIds(typeId);
    const tableMetaById = new Map<string, StoredMetaDoc>();
    for (const tableId of tableIds) {
      tableMetaById.set(tableId, await readTableMeta(typeId, tableId));
    }

    const preferredTableIds = input.tableOrderByType[typeId] ?? [];
    const orderedTableIds: string[] = [];
    const seenTableIds = new Set<string>();
    for (const tableId of preferredTableIds) {
      if (!tableMetaById.has(tableId) || seenTableIds.has(tableId)) {
        continue;
      }
      orderedTableIds.push(tableId);
      seenTableIds.add(tableId);
    }
    for (const tableId of tableIds) {
      if (seenTableIds.has(tableId)) {
        continue;
      }
      orderedTableIds.push(tableId);
      seenTableIds.add(tableId);
    }

    for (let index = 0; index < orderedTableIds.length; index++) {
      const tableId = orderedTableIds[index];
      const meta = tableMetaById.get(tableId);
      if (!meta) {
        continue;
      }
      await writeTableMeta(typeId, tableId, meta.name, index);
    }
  }

  return loadSnapshot();
}

export {
  createConfigTable,
  createConfigType,
  deleteConfigTable,
  deleteConfigType,
  getConfigStoreSnapshot,
  saveConfigTreeOrder,
  saveConfigTable,
  saveConfigTypeSchema
};
