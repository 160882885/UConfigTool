import type {
  ConfigStoreSnapshot,
  ExportLanguage
} from '../../../../shared/contracts';

import type { ConfigNodeModel } from './types';

const EMPTY_SNAPSHOT: ConfigStoreSnapshot = {
  nodes: [],
  typeSchemas: [],
  enumSchemas: [],
  tables: []
};

type TypeSchemaLayer = {
  nodeId: string;
  nodeName: string;
  schema: NonNullable<ConfigStoreSnapshot['typeSchemas'][number]>;
};

const INITIAL_EXPORT_LANGUAGE_SELECTION: Record<ExportLanguage, boolean> = {
  csharp: true,
  lua: true,
  typescript: false,
  python: false,
  java: false,
  go: false,
  cpp: false,
  rust: false
};

function buildTypeSchemaLayers(
  typeNodeId: string,
  nodeMap: ReadonlyMap<string, ConfigNodeModel>,
  typeSchemaByNodeId: ReadonlyMap<string, NonNullable<ConfigStoreSnapshot['typeSchemas'][number]>>
): TypeSchemaLayer[] {
  const stack: TypeSchemaLayer[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = typeNodeId;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const schema = typeSchemaByNodeId.get(cursor);
    const node = nodeMap.get(cursor);
    if (!schema || !node || node.kind !== 'configType') {
      break;
    }
    stack.push({
      nodeId: cursor,
      nodeName: node.name,
      schema
    });
    cursor = schema.baseTypeNodeId;
  }
  return stack.reverse();
}

function collectInheritedDescendantTypeIds(
  typeNodeId: string,
  typeSchemaByNodeId: ReadonlyMap<string, NonNullable<ConfigStoreSnapshot['typeSchemas'][number]>>
): Set<string> {
  const childrenByBaseId = new Map<string, string[]>();
  for (const [nodeId, schema] of typeSchemaByNodeId.entries()) {
    const baseId = schema.baseTypeNodeId;
    if (!baseId) {
      continue;
    }
    const list = childrenByBaseId.get(baseId);
    if (list) {
      list.push(nodeId);
    } else {
      childrenByBaseId.set(baseId, [nodeId]);
    }
  }

  const descendants = new Set<string>();
  const queue = [...(childrenByBaseId.get(typeNodeId) ?? [])];
  while (queue.length > 0) {
    const nextId = queue.shift() as string;
    if (descendants.has(nextId)) {
      continue;
    }
    descendants.add(nextId);
    const children = childrenByBaseId.get(nextId) ?? [];
    for (const childId of children) {
      queue.push(childId);
    }
  }
  return descendants;
}

export {
  buildTypeSchemaLayers,
  collectInheritedDescendantTypeIds,
  EMPTY_SNAPSHOT,
  INITIAL_EXPORT_LANGUAGE_SELECTION
};

export type { TypeSchemaLayer };
