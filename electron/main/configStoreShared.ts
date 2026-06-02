import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type {
  ConfigFieldDef,
  ConfigFieldType,
  ConfigFieldValue,
  ConfigEnumItemDef,
  ConfigNodeKind
} from '../../shared/contracts';

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

type EnumSchemaDoc = {
  id: string;
  className: string;
  namespace: string;
  items: ConfigEnumItemDef[];
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
  enumSchemasByNodeId: Map<string, EnumSchemaDoc>;
  tablesByNodeId: Map<string, TableDoc>;
};

const DEFAULT_NAMES: Record<ConfigNodeKind, string> = {
  empty: '新空节点',
  configType: '新配置表类型',
  configTable: '新配置表',
  configEnum: '新枚举'
};

const FIELD_TYPE_SET: ReadonlySet<ConfigFieldType> = new Set<ConfigFieldType>([
  'int',
  'float',
  'string',
  'bool',
  'enum',
  'nested',
  'nested_array',
  'int_array',
  'float_array',
  'string_array',
  'bool_array'
]);

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
    const enumTypeNodeId = normalizeText(raw.enumTypeNodeId).trim();
    result.push({
      id,
      tag: normalizeText(raw.tag),
      fieldName: normalizeText(raw.fieldName),
      type,
      nestedTypeId: type === 'nested' || type === 'nested_array' ? nestedTypeId || undefined : undefined,
      enumTypeNodeId: type === 'enum' ? enumTypeNodeId || undefined : undefined
    });
  }
  return result;
}

function normalizeEnumItems(rawItems: unknown): ConfigEnumItemDef[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const result: ConfigEnumItemDef[] = [];
  const usedIds = new Set<string>();
  for (const rawItem of rawItems) {
    const raw = rawItem as Partial<ConfigEnumItemDef>;
    let id = normalizeText(raw.id).trim() || randomUUID();
    while (usedIds.has(id)) {
      id = randomUUID();
    }
    usedIds.add(id);
    result.push({
      id,
      value: normalizeText(raw.value)
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

export {
  normalizeBaseTypeNodeId,
  normalizeEnumItems,
  normalizeExportListFileName,
  normalizeFieldDefs,
  normalizeNodeName,
  normalizeText,
  parseYaml,
  serializeYaml
};

export type {
  DiskNode,
  DiskSnapshot,
  EnumSchemaDoc,
  NodeMetaDoc,
  SchemaDoc,
  TableDoc
};
