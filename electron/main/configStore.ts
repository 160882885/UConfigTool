import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Dirent } from 'node:fs';

import type {
  ConfigStoreSnapshot,
  CreateConfigNodeInput,
  DeleteConfigNodeInput,
  MoveConfigNodeInput,
  RenameConfigNodeInput,
  SaveConfigEnumSchemaInput,
  SaveConfigTableInput,
  SaveConfigTypeSchemaInput
} from '../../shared/contracts';
import { getCurrentProjectPath } from './projectStore';
import {
  nodeMetaPath,
  readEnumSchemaDoc,
  readNodeMeta,
  readSchemaDoc,
  readTableDoc,
  writeEnumSchemaDoc,
  writeNodeMeta,
  writeSchemaDoc,
  writeTableDoc
} from './configStoreDocs';
import {
  normalizeBaseTypeNodeId,
  normalizeFieldDefs,
  normalizeEnumItems,
  normalizeExportListFileName,
  normalizeText,
  type DiskNode,
  type DiskSnapshot,
  type EnumSchemaDoc,
  type SchemaDoc,
  type TableDoc
} from './configStoreShared';
import {
  findNode,
  getChildren,
  hasTypeInheritanceCycle,
  isDescendant,
  normalizeValuesBySchema,
  resolveSchemaFieldsWithInheritance,
  toSnapshot
} from './configStoreHelpers';

const STORE_ROOT_NAME = 'config-store';
const TREE_ROOT_NAME = 'tree';

let runtimeStoreRootDir: string | null = null;

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

async function loadDiskSnapshot(): Promise<DiskSnapshot> {
  await refreshStoreRootDir();
  if (!runtimeStoreRootDir) {
    return {
      nodes: [],
      schemasByNodeId: new Map<string, SchemaDoc>(),
      enumSchemasByNodeId: new Map<string, EnumSchemaDoc>(),
      tablesByNodeId: new Map<string, TableDoc>()
    };
  }

  const rootDir = getTreeRootDir();
  await fs.mkdir(rootDir, { recursive: true });

  const nodes: DiskNode[] = [];
  const schemasByNodeId = new Map<string, SchemaDoc>();
  const enumSchemasByNodeId = new Map<string, EnumSchemaDoc>();
  const tablesByNodeId = new Map<string, TableDoc>();

  const walk = async (dir: string, parentId: string | null) => {
    let entries: Dirent[];
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
      } else if (node.kind === 'configEnum') {
        const enumSchema = await readEnumSchemaDoc(childDir, node.id);
        if (enumSchema) {
          enumSchemasByNodeId.set(node.id, enumSchema);
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
    enumSchemasByNodeId,
    tablesByNodeId
  };
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
  } else if (input.kind === 'configEnum') {
    const now = new Date().toISOString();
    await writeEnumSchemaDoc(dir, nodeId, {
      className: `Enum${nodeId}`,
      namespace: '',
      items: [],
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
  const enumNodeIdSet = new Set(disk.nodes.filter((item) => item.kind === 'configEnum').map((item) => item.id));
  const normalizedFields = normalizeFieldDefs(input.fields).map((field) => {
    if (field.type !== 'enum') {
      return field;
    }
    const enumTypeNodeId = field.enumTypeNodeId;
    if (!enumTypeNodeId || !enumNodeIdSet.has(enumTypeNodeId)) {
      return {
        ...field,
        enumTypeNodeId: undefined
      };
    }
    return field;
  });
  await writeSchemaDoc(node.dir, node.id, {
    baseTypeNodeId,
    className: input.className,
    namespace: input.namespace,
    exportAsTableList: Boolean(input.exportAsTableList),
    exportTableListFileName: normalizeExportListFileName(input.exportTableListFileName),
    fields: normalizedFields,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now
  });

  return getConfigStoreSnapshot();
}

async function saveConfigEnumSchema(input: SaveConfigEnumSchemaInput): Promise<ConfigStoreSnapshot> {
  await ensureStoreReady();
  const disk = await loadDiskSnapshot();
  const node = findNode(disk.nodes, input.nodeId);
  if (!node || node.kind !== 'configEnum') {
    throw new Error('Config enum node does not exist.');
  }

  const previous = disk.enumSchemasByNodeId.get(node.id);
  const now = new Date().toISOString();
  await writeEnumSchemaDoc(node.dir, node.id, {
    className: normalizeText(input.className, `Enum${node.id}`),
    namespace: normalizeText(input.namespace),
    items: normalizeEnumItems(input.items),
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
  saveConfigEnumSchema,
  saveConfigTable,
  saveConfigTypeSchema
};
