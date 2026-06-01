import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import type {
  ConfigFieldDef,
  ConfigFieldType,
  ConfigFieldValue,
  ConfigNodeKind,
  ConfigStoreSnapshot,
  ConfigTableRecord,
  ConfigTreeNodeRecord,
  ConfigTypeSchemaRecord,
  CreateConfigNodeInput,
  DeleteConfigNodeInput,
  MoveConfigNodeInput,
  RenameConfigNodeInput,
  SaveConfigTableInput,
  SaveConfigTypeSchemaInput
} from '../../shared/contracts';
import { getCurrentProjectPath } from './projectStore';

const loadCommonJsModule = createRequire(__filename);
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
} = loadCommonJsModule('js-yaml');

type NodeMetaDoc = {
  id: string;
  name: string;
  kind: ConfigNodeKind;
  order: number;
};

type SchemaDoc = {
  id: string;
  baseTypeNodeId?: string;
  className: string;
  namespace: string;
  exportAsTableList: boolean;
  exportTableListFileName: string;
  fields: ConfigFieldDef[];
  createdAt: string;
  updatedAt: string;
};

type TableDoc = {
  id: string;
  values: Record<string, ConfigFieldValue>;
  createdAt: string;
  updatedAt: string;
};

type DiskNode = {
  id: string;
  parentId: string | null;
  kind: ConfigNodeKind;
  name: string;
  order: number;
  dir: string;
};

type DiskSnapshot = {
  nodes: DiskNode[];
  schemasByNodeId: Map<string, SchemaDoc>;
  tablesByNodeId: Map<string, TableDoc>;
};

const STORE_ROOT_NAME = 'config-store';
const TREE_ROOT_NAME = 'tree';
const DEFAULT_NAMES: Record<ConfigNodeKind, string> = {
  empty: '\u65b0\u7a7a\u8282\u70b9',
  configType: '\u65b0\u914d\u7f6e\u8868\u7c7b\u578b',
  configTable: '\u65b0\u914d\u7f6e\u8868'
};

const FIELD_TYPE_SET: ReadonlySet<ConfigFieldType> = new Set<ConfigFieldType>([
  'int',
  'float',
  'string',
  'bool',
  'nested',
  'nested_array',
  'int_array',
  'float_array',
  'string_array',
  'bool_array'
]);

let runtimeStoreRootDir: string | null = null;

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNodeName(name: unknown, kind: ConfigNodeKind): string {
  const trimmed = normalizeText(name).trim();
  return trimmed || DEFAULT_NAMES[kind];
}

function normalizeExportListFileName(value: unknown): string {
  return normalizeText(value).trim();
}

function normalizeBaseTypeNodeId(value: unknown): string | undefined {
  const normalized = normalizeText(value).trim();
  return normalized || undefined;
}

function normalizeFieldType(value: unknown): ConfigFieldType {
  if (typeof value === 'string' && FIELD_TYPE_SET.has(value as ConfigFieldType)) {
    return value as ConfigFieldType;
  }
  return 'string';
}

function normalizeFieldDefs(rawFields: unknown): ConfigFieldDef[] {
  if (!Array.isArray(rawFields)) {
    return [];
  }

  const result: ConfigFieldDef[] = [];
  const usedIds = new Set<string>();
  for (const rawField of rawFields) {
    const raw = rawField as Partial<ConfigFieldDef>;
    let id = normalizeText(raw.id).trim() || randomUUID();
    while (usedIds.has(id)) {
      id = randomUUID();
    }
    usedIds.add(id);

    const type = normalizeFieldType(raw.type);
    const nestedTypeId = normalizeText(raw.nestedTypeId).trim();
    result.push({
      id,
      tag: normalizeText(raw.tag),
      fieldName: normalizeText(raw.fieldName),
      type,
      nestedTypeId: type === 'nested' || type === 'nested_array' ? nestedTypeId || undefined : undefined
    });
  }
  return result;
}

function parseYaml<T>(raw: string, fallback: T): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = yaml.load(trimmed);
  if (parsed === undefined || parsed === null) {
    return fallback;
  }
  return parsed as T;
}

function serializeYaml(value: unknown): string {
  return yaml.dump(value, {
    indent: 2,
    noRefs: true,
    lineWidth: -1,
    noCompatMode: true,
    sortKeys: false
  });
}

async function refreshStoreRootDir(): Promise<void> {
  const projectPath = await getCurrentProjectPath();
  runtimeStoreRootDir = projectPath ? path.join(projectPath, STORE_ROOT_NAME) : null;
}

function requireStoreRootDir(): string {
  if (!runtimeStoreRootDir) {
    throw new Error('Please create or open a project first.');
  }
  return runtimeStoreRootDir;
}

function getTreeRootDir(): string {
  return path.join(requireStoreRootDir(), TREE_ROOT_NAME);
}

async function ensureStoreReady(): Promise<void> {
  await refreshStoreRootDir();
  await fs.mkdir(getTreeRootDir(), { recursive: true });
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

async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeYaml(value), 'utf8');
}

function nodeMetaPath(parentDir: string, nodeId: string): string {
  return path.join(parentDir, `${nodeId}.meta.yaml`);
}

function nodeDataPath(dir: string, nodeId: string): string {
  return path.join(dir, `${nodeId}.yaml`);
}

async function readNodeMeta(parentDir: string, nodeId: string, fallbackOrder: number): Promise<NodeMetaDoc | null> {
  try {
    const raw = await fs.readFile(nodeMetaPath(parentDir, nodeId), 'utf8');
    const parsed = parseYaml<Partial<NodeMetaDoc>>(raw, { id: nodeId, kind: 'empty', name: DEFAULT_NAMES.empty });
    const kind = parsed.kind === 'empty' || parsed.kind === 'configType' || parsed.kind === 'configTable' ? parsed.kind : 'empty';
    return {
      id: nodeId,
      kind,
      name: normalizeNodeName(parsed.name, kind),
      order: typeof parsed.order === 'number' && Number.isFinite(parsed.order) ? parsed.order : fallbackOrder
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeNodeMeta(parentDir: string, nodeId: string, kind: ConfigNodeKind, name: string, order: number): Promise<void> {
  await writeYamlFile(nodeMetaPath(parentDir, nodeId), {
    id: nodeId,
    kind,
    name: normalizeNodeName(name, kind),
    order
  } satisfies NodeMetaDoc);
}

async function readSchemaDoc(dir: string, nodeId: string): Promise<SchemaDoc | null> {
  try {
    const raw = await fs.readFile(nodeDataPath(dir, nodeId), 'utf8');
    const now = new Date().toISOString();
    const parsed = parseYaml<Partial<SchemaDoc>>(raw, {
      id: nodeId,
      className: `Class${nodeId}`,
      namespace: '',
      exportAsTableList: false,
      exportTableListFileName: '',
      fields: [],
      createdAt: now,
      updatedAt: now
    });
    return {
      id: nodeId,
      baseTypeNodeId: normalizeBaseTypeNodeId(parsed.baseTypeNodeId),
      className: normalizeText(parsed.className, `Class${nodeId}`),
      namespace: normalizeText(parsed.namespace),
      exportAsTableList: Boolean(parsed.exportAsTableList),
      exportTableListFileName: normalizeExportListFileName(parsed.exportTableListFileName),
      fields: normalizeFieldDefs(parsed.fields),
      createdAt: normalizeText(parsed.createdAt, now),
      updatedAt: normalizeText(parsed.updatedAt, now)
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeSchemaDoc(dir: string, nodeId: string, schema: Omit<SchemaDoc, 'id'>): Promise<void> {
  await writeYamlFile(nodeDataPath(dir, nodeId), {
    id: nodeId,
    baseTypeNodeId: normalizeBaseTypeNodeId(schema.baseTypeNodeId),
    className: schema.className,
    namespace: schema.namespace,
    exportAsTableList: schema.exportAsTableList,
    exportTableListFileName: schema.exportTableListFileName,
    fields: schema.fields,
    createdAt: schema.createdAt,
    updatedAt: schema.updatedAt
  } satisfies SchemaDoc);
}

async function readTableDoc(dir: string, nodeId: string): Promise<TableDoc | null> {
  try {
    const raw = await fs.readFile(nodeDataPath(dir, nodeId), 'utf8');
    const now = new Date().toISOString();
    const parsed = parseYaml<Partial<TableDoc>>(raw, {
      id: nodeId,
      values: {},
      createdAt: now,
      updatedAt: now
    });
    return {
      id: nodeId,
      values: typeof parsed.values === 'object' && parsed.values ? (parsed.values as Record<string, ConfigFieldValue>) : {},
      createdAt: normalizeText(parsed.createdAt, now),
      updatedAt: normalizeText(parsed.updatedAt, now)
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeTableDoc(dir: string, nodeId: string, table: Omit<TableDoc, 'id'>): Promise<void> {
  await writeYamlFile(nodeDataPath(dir, nodeId), {
    id: nodeId,
    values: table.values,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt
  } satisfies TableDoc);
}

async function loadDiskSnapshot(): Promise<DiskSnapshot> {
  await refreshStoreRootDir();
  if (!runtimeStoreRootDir) {
    return {
      nodes: [],
      schemasByNodeId: new Map<string, SchemaDoc>(),
      tablesByNodeId: new Map<string, TableDoc>()
    };
  }

  const rootDir = getTreeRootDir();
  await fs.mkdir(rootDir, { recursive: true });

  const nodes: DiskNode[] = [];
  const schemasByNodeId = new Map<string, SchemaDoc>();
  const tablesByNodeId = new Map<string, TableDoc>();

  const walk = async (dir: string, parentId: string | null) => {
    let entries: Array<import('node:fs').Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const dirs = entries.filter((entry) => entry.isDirectory());
    for (let i = 0; i < dirs.length; i++) {
      const entry = dirs[i];
      const childDir = path.join(dir, entry.name);
      const meta = await readNodeMeta(dir, entry.name, i);
      if (!meta) {
        continue;
      }

      const node: DiskNode = {
        id: entry.name,
        parentId,
        kind: meta.kind,
        name: meta.name,
        order: meta.order,
        dir: childDir
      };
      nodes.push(node);

      if (node.kind === 'configType') {
        const schema = await readSchemaDoc(childDir, node.id);
        if (schema) {
          schemasByNodeId.set(node.id, schema);
        }
      } else if (node.kind === 'configTable') {
        const table = await readTableDoc(childDir, node.id);
        if (table) {
          tablesByNodeId.set(node.id, table);
        }
      }

      await walk(childDir, node.id);
    }
  };

  await walk(rootDir, null);
  nodes.sort((a, b) => a.order - b.order);

  return {
    nodes,
    schemasByNodeId,
    tablesByNodeId
  };
}

function toSnapshot(disk: DiskSnapshot): ConfigStoreSnapshot {
  return {
    nodes: disk.nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      kind: node.kind,
      name: node.name,
      order: node.order
    })),
    typeSchemas: disk.nodes
      .filter((node) => node.kind === 'configType')
      .map((node) => {
        const schema = disk.schemasByNodeId.get(node.id);
        if (!schema) {
          return null;
        }
        return {
          nodeId: node.id,
          ...(schema.baseTypeNodeId ? { baseTypeNodeId: schema.baseTypeNodeId } : {}),
          className: schema.className,
          namespace: schema.namespace,
          exportAsTableList: schema.exportAsTableList,
          exportTableListFileName: schema.exportTableListFileName,
          fields: schema.fields
        } satisfies ConfigTypeSchemaRecord;
      })
      .filter((item): item is ConfigTypeSchemaRecord => Boolean(item)),
    tables: disk.nodes
      .filter((node) => node.kind === 'configTable')
      .map((node) => {
        const table = disk.tablesByNodeId.get(node.id);
        if (!table) {
          return null;
        }
        return {
          nodeId: node.id,
          values: table.values
        } satisfies ConfigTableRecord;
      })
      .filter((item): item is ConfigTableRecord => Boolean(item))
  };
}

function findNode(nodes: DiskNode[], nodeId: string): DiskNode | null {
  return nodes.find((node) => node.id === nodeId) ?? null;
}

function hasTypeInheritanceCycle(typeNodeId: string, baseTypeNodeId: string, schemaByNodeId: ReadonlyMap<string, SchemaDoc>): boolean {
  let cursor: string | undefined = baseTypeNodeId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === typeNodeId) {
      return true;
    }
    if (visited.has(cursor)) {
      return true;
    }
    visited.add(cursor);
    const schema = schemaByNodeId.get(cursor);
    cursor = schema?.baseTypeNodeId;
  }
  return false;
}

function resolveSchemaFieldsWithInheritance(typeNodeId: string, schemaByNodeId: ReadonlyMap<string, SchemaDoc>): ConfigFieldDef[] {
  const chain: SchemaDoc[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = typeNodeId;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const schema = schemaByNodeId.get(cursor);
    if (!schema) {
      break;
    }
    chain.push(schema);
    cursor = schema.baseTypeNodeId;
  }

  chain.reverse();
  const merged: ConfigFieldDef[] = [];
  const indexById = new Map<string, number>();
  for (const schema of chain) {
    for (const field of schema.fields) {
      const existingIndex = indexById.get(field.id);
      if (typeof existingIndex === 'number') {
        merged[existingIndex] = field;
      } else {
        indexById.set(field.id, merged.length);
        merged.push(field);
      }
    }
  }
  return merged;
}

function getChildren(nodes: DiskNode[], parentId: string | null): DiskNode[] {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)));
}

function isDescendant(nodes: DiskNode[], ancestorId: string, targetId: string): boolean {
  let cursor: string | null = targetId;
  while (cursor) {
    if (cursor === ancestorId) {
      return true;
    }
    cursor = findNode(nodes, cursor)?.parentId ?? null;
  }
  return false;
}

function normalizeValuesBySchema(values: Record<string, unknown>, fields: ConfigFieldDef[]): Record<string, ConfigFieldValue> {
  const result: Record<string, ConfigFieldValue> = {};
  for (const field of fields) {
    const raw = values[field.id];
    if (field.type === 'bool') {
      result[field.id] = typeof raw === 'boolean' ? raw : false;
      continue;
    }
    if (field.type === 'bool_array') {
      result[field.id] = Array.isArray(raw) ? raw.map((item) => Boolean(item)) : [];
      continue;
    }
    if (field.type === 'int_array' || field.type === 'float_array' || field.type === 'string_array') {
      result[field.id] = Array.isArray(raw) ? raw.map((item) => String(item ?? '')) : [];
      continue;
    }
    if (field.type === 'nested') {
      result[field.id] = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, ConfigFieldValue>) : {};
      continue;
    }
    if (field.type === 'nested_array') {
      result[field.id] = Array.isArray(raw)
        ? raw
            .filter((item) => typeof item === 'object' && item !== null && !Array.isArray(item))
            .map((item) => item as Record<string, ConfigFieldValue>)
        : [];
      continue;
    }
    result[field.id] = typeof raw === 'string' ? raw : String(raw ?? '');
  }
  return result;
}

async function getConfigStoreSnapshot(): Promise<ConfigStoreSnapshot> {
  return toSnapshot(await loadDiskSnapshot());
}

async function createConfigNode(input: CreateConfigNodeInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();
  const disk = await loadDiskSnapshot();
  const nodeId = randomUUID();
  const parentDir = input.parentId ? findNode(disk.nodes, input.parentId)?.dir ?? null : getTreeRootDir();
  if (!parentDir) {
    throw new Error('Parent node does not exist.');
  }

  const dir = path.join(parentDir, nodeId);
  await fs.mkdir(dir, { recursive: true });
  const order = getChildren(disk.nodes, input.parentId).length;
  await writeNodeMeta(parentDir, nodeId, input.kind, input.name, order);

  if (input.kind === 'configType') {
    const now = new Date().toISOString();
    await writeSchemaDoc(dir, nodeId, {
      className: `Class${nodeId}`,
      namespace: '',
      exportAsTableList: false,
      exportTableListFileName: '',
      fields: [],
      createdAt: now,
      updatedAt: now
    });
  } else if (input.kind === 'configTable') {
    const now = new Date().toISOString();
    await writeTableDoc(dir, nodeId, {
      values: {},
      createdAt: now,
      updatedAt: now
    });
  }

  return getConfigStoreSnapshot();
}

async function deleteConfigNode(input: DeleteConfigNodeInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();
  const disk = await loadDiskSnapshot();
  const node = findNode(disk.nodes, input.nodeId);
  if (!node) {
    return getConfigStoreSnapshot();
  }
  const parentDir = node.parentId ? findNode(disk.nodes, node.parentId)?.dir ?? null : getTreeRootDir();
  if (parentDir) {
    await fs.rm(nodeMetaPath(parentDir, node.id), { force: true });
  }
  await fs.rm(node.dir, { recursive: true, force: true });
  const siblings = getChildren(disk.nodes, node.parentId);
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].id === node.id) {
      continue;
    }
    await writeNodeMeta(
      node.parentId ? findNode(disk.nodes, node.parentId)?.dir ?? getTreeRootDir() : getTreeRootDir(),
      siblings[i].id,
      siblings[i].kind,
      siblings[i].name,
      i
    );
  }
  return getConfigStoreSnapshot();
}

async function renameConfigNode(input: RenameConfigNodeInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();
  const disk = await loadDiskSnapshot();
  const node = findNode(disk.nodes, input.nodeId);
  if (!node) {
    throw new Error('Node does not exist.');
  }
  const parentDir = node.parentId ? findNode(disk.nodes, node.parentId)?.dir ?? null : getTreeRootDir();
  if (!parentDir) {
    throw new Error('Parent node does not exist.');
  }
  await writeNodeMeta(parentDir, node.id, node.kind, input.name, node.order);
  return getConfigStoreSnapshot();
}

async function moveConfigNode(input: MoveConfigNodeInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();
  const disk = await loadDiskSnapshot();
  const movingNodes = input.nodeIds.map((nodeId) => findNode(disk.nodes, nodeId)).filter((node): node is DiskNode => Boolean(node));
  if (movingNodes.length === 0) {
    return getConfigStoreSnapshot();
  }

  const first = movingNodes[0];
  if (input.parentId && (input.parentId === first.id || isDescendant(disk.nodes, first.id, input.parentId))) {
    throw new Error('Invalid drag target.');
  }

  const targetParentDir = input.parentId ? findNode(disk.nodes, input.parentId)?.dir ?? null : getTreeRootDir();
  if (!targetParentDir) {
    throw new Error('Target parent node does not exist.');
  }

  const sourceParentDir = first.parentId ? findNode(disk.nodes, first.parentId)?.dir ?? null : getTreeRootDir();
  const siblingIds = new Set(movingNodes.map((node) => node.id));
  const sourceSiblings = getChildren(disk.nodes, first.parentId).filter((node) => !siblingIds.has(node.id));
  const targetSiblings = getChildren(disk.nodes, input.parentId).filter((node) => !siblingIds.has(node.id));
  const safeIndex = Math.max(0, Math.min(input.index, targetSiblings.length));
  targetSiblings.splice(safeIndex, 0, ...movingNodes);

  for (const node of movingNodes) {
    const nodeSourceParentDir = node.parentId ? findNode(disk.nodes, node.parentId)?.dir ?? null : getTreeRootDir();
    if (!nodeSourceParentDir) {
      continue;
    }

    const sourceMetaPath = nodeMetaPath(nodeSourceParentDir, node.id);
    const destinationMetaPath = nodeMetaPath(targetParentDir, node.id);
    if (sourceMetaPath !== destinationMetaPath) {
      await fs.rename(sourceMetaPath, destinationMetaPath);
    }

    const destinationDir = path.join(targetParentDir, node.id);
    if (node.dir !== destinationDir) {
      await fs.rename(node.dir, destinationDir);
    }
  }

  if (sourceParentDir) {
    for (let i = 0; i < sourceSiblings.length; i++) {
      const sibling = sourceSiblings[i];
      await writeNodeMeta(sourceParentDir, sibling.id, sibling.kind, sibling.name, i);
    }
  }

  for (let i = 0; i < targetSiblings.length; i++) {
    const sibling = targetSiblings[i];
    await writeNodeMeta(targetParentDir, sibling.id, sibling.kind, sibling.name, i);
  }

  return getConfigStoreSnapshot();
}

async function saveConfigTypeSchema(input: SaveConfigTypeSchemaInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();
  const disk = await loadDiskSnapshot();
  const node = findNode(disk.nodes, input.nodeId);
  if (!node || node.kind !== 'configType') {
    throw new Error('Config type node does not exist.');
  }

  const previous = disk.schemasByNodeId.get(node.id);
  const baseTypeNodeId = normalizeBaseTypeNodeId(input.baseTypeNodeId);
  if (baseTypeNodeId) {
    const baseNode = findNode(disk.nodes, baseTypeNodeId);
    if (!baseNode || baseNode.kind !== 'configType') {
      throw new Error('Inherited config type node does not exist.');
    }
    if (baseTypeNodeId === node.id) {
      throw new Error('Config type cannot inherit itself.');
    }
    if (hasTypeInheritanceCycle(node.id, baseTypeNodeId, disk.schemasByNodeId)) {
      throw new Error('Detected cyclic config type inheritance.');
    }
  }

  const now = new Date().toISOString();
  await writeSchemaDoc(node.dir, node.id, {
    baseTypeNodeId,
    className: input.className,
    namespace: input.namespace,
    exportAsTableList: Boolean(input.exportAsTableList),
    exportTableListFileName: normalizeExportListFileName(input.exportTableListFileName),
    fields: normalizeFieldDefs(input.fields),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now
  });

  return getConfigStoreSnapshot();
}

async function saveConfigTable(input: SaveConfigTableInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();
  const disk = await loadDiskSnapshot();
  const node = findNode(disk.nodes, input.nodeId);
  if (!node || node.kind !== 'configTable') {
    throw new Error('Config table node does not exist.');
  }

  const parent = node.parentId ? findNode(disk.nodes, node.parentId) : null;
  const schema = parent ? disk.schemasByNodeId.get(parent.id) : null;
  const schemaFields = parent ? resolveSchemaFieldsWithInheritance(parent.id, disk.schemasByNodeId) : [];
  const previous = disk.tablesByNodeId.get(node.id);
  const now = new Date().toISOString();
  await writeTableDoc(node.dir, node.id, {
    values: schema ? normalizeValuesBySchema(input.values as Record<string, unknown>, schemaFields) : input.values,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now
  });

  return getConfigStoreSnapshot();
}

export {
  createConfigNode,
  deleteConfigNode,
  getConfigStoreSnapshot,
  moveConfigNode,
  renameConfigNode,
  saveConfigTable,
  saveConfigTypeSchema
};
