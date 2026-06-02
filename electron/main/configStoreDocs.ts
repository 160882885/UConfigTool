import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  ConfigFieldValue,
  ConfigNodeKind
} from '../../shared/contracts';

import {
  normalizeBaseTypeNodeId,
  normalizeEnumItems,
  normalizeExportListFileName,
  normalizeFieldDefs,
  normalizeNodeName,
  normalizeText,
  parseYaml,
  serializeYaml,
  type EnumSchemaDoc,
  type NodeMetaDoc,
  type SchemaDoc,
  type TableDoc
} from './configStoreShared';

function nodeMetaPath(parentDir: string, nodeId: string): string {
  return path.join(parentDir, `${nodeId}.meta.yaml`);
}

function nodeDataPath(dir: string, nodeId: string): string {
  return path.join(dir, `${nodeId}.yaml`);
}

async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeYaml(value), 'utf8');
}

async function readNodeMeta(parentDir: string, nodeId: string, fallbackOrder: number): Promise<NodeMetaDoc | null> {
  try {
    const raw = await fs.readFile(nodeMetaPath(parentDir, nodeId), 'utf8');
    const parsed = parseYaml<Partial<NodeMetaDoc>>(raw, { id: nodeId, kind: 'empty', name: '新空节点' });
    const kind =
      parsed.kind === 'empty' || parsed.kind === 'configType' || parsed.kind === 'configTable' || parsed.kind === 'configEnum'
        ? parsed.kind
        : 'empty';
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

async function readEnumSchemaDoc(dir: string, nodeId: string): Promise<EnumSchemaDoc | null> {
  try {
    const raw = await fs.readFile(nodeDataPath(dir, nodeId), 'utf8');
    const now = new Date().toISOString();
    const parsed = parseYaml<Partial<EnumSchemaDoc>>(raw, {
      id: nodeId,
      className: `Enum${nodeId}`,
      namespace: '',
      items: [],
      createdAt: now,
      updatedAt: now
    });
    return {
      id: nodeId,
      className: normalizeText(parsed.className, `Enum${nodeId}`),
      namespace: normalizeText(parsed.namespace),
      items: normalizeEnumItems(parsed.items),
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

async function writeEnumSchemaDoc(dir: string, nodeId: string, schema: Omit<EnumSchemaDoc, 'id'>): Promise<void> {
  await writeYamlFile(nodeDataPath(dir, nodeId), {
    id: nodeId,
    className: schema.className,
    namespace: schema.namespace,
    items: schema.items,
    createdAt: schema.createdAt,
    updatedAt: schema.updatedAt
  } satisfies EnumSchemaDoc);
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

export {
  nodeDataPath,
  nodeMetaPath,
  readEnumSchemaDoc,
  readNodeMeta,
  readSchemaDoc,
  readTableDoc,
  writeEnumSchemaDoc,
  writeNodeMeta,
  writeSchemaDoc,
  writeTableDoc
};
