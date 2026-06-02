import type {
  ConfigFieldDef,
  ConfigFieldValue,
  ConfigStoreSnapshot,
  ConfigTableRecord,
  ConfigTypeSchemaRecord
} from '../../shared/contracts';
import type { DiskNode, DiskSnapshot, SchemaDoc } from './configStoreShared';

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
    enumSchemas: disk.nodes
      .filter((node) => node.kind === 'configEnum')
      .map((node) => {
        const enumSchema = disk.enumSchemasByNodeId.get(node.id);
        if (!enumSchema) {
          return null;
        }
        return {
          nodeId: node.id,
          className: enumSchema.className,
          namespace: enumSchema.namespace,
          items: enumSchema.items
        };
      })
      .filter((item): item is NonNullable<ConfigStoreSnapshot['enumSchemas'][number]> => Boolean(item)),
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

function normalizeValuesBySchema(values: Record<string, unknown>, fields: ConfigFieldDef[]): Record<string, ConfigFieldValue> {
  const result: Record<string, ConfigFieldValue> = {};
  for (const field of fields) {
    const raw = values[field.id];
    if (field.type === 'enum') {
      result[field.id] = typeof raw === 'string' ? raw : String(raw ?? '');
      continue;
    }
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

export {
  findNode,
  getChildren,
  hasTypeInheritanceCycle,
  isDescendant,
  normalizeValuesBySchema,
  resolveSchemaFieldsWithInheritance,
  toSnapshot
};
