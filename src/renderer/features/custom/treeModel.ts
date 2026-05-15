import type { ConfigStoreSnapshot, ConfigTableRecord, ConfigTypeRecord } from '../../../../shared/contracts';
import type { TreeNodeItem } from '../../shared/components/tree/TreeView';
import type { NodeMeta, TreeOrderPayload } from './types';

export function makeTypeNodeId(typeId: string): string {
  return `type:${typeId}`;
}

export function makeTableNodeId(typeId: string, tableId: string): string {
  return `table:${typeId}:${tableId}`;
}

export function parseNodeId(nodeId: string): NodeMeta | null {
  if (nodeId.startsWith('type:')) {
    return {
      kind: 'group',
      typeId: nodeId.slice('type:'.length)
    };
  }

  if (nodeId.startsWith('table:')) {
    const body = nodeId.slice('table:'.length);
    const firstColon = body.indexOf(':');
    if (firstColon <= 0 || firstColon >= body.length - 1) {
      return null;
    }
    const typeId = body.slice(0, firstColon);
    const tableId = body.slice(firstColon + 1);
    return {
      kind: 'config',
      typeId,
      tableId
    };
  }

  return null;
}

export function buildExpandedIds(nodes: TreeNodeItem[]): string[] {
  return nodes.filter((node) => node.parentId === null).map((node) => node.id);
}

export function findNewTypeId(previous: ConfigStoreSnapshot, next: ConfigStoreSnapshot): string | null {
  const existing = new Set(previous.types.map((item) => item.id));
  const created = next.types.find((item) => !existing.has(item.id));
  return created?.id ?? null;
}

export function findNewTableId(previousType: ConfigTypeRecord | null, nextType: ConfigTypeRecord | null): string | null {
  if (!nextType) {
    return null;
  }
  const existing = new Set((previousType?.tables ?? []).map((item) => item.id));
  const created = nextType.tables.find((item) => !existing.has(item.id));
  return created?.id ?? null;
}

export function buildTreeSnapshot(snapshot: ConfigStoreSnapshot): {
  nodes: TreeNodeItem[];
  metaByNodeId: Map<string, NodeMeta>;
} {
  const nodes: TreeNodeItem[] = [];
  const metaByNodeId = new Map<string, NodeMeta>();

  for (let typeIndex = 0; typeIndex < snapshot.types.length; typeIndex++) {
    const type = snapshot.types[typeIndex];
    const typeNodeId = makeTypeNodeId(type.id);

    nodes.push({
      id: typeNodeId,
      parentId: null,
      name: type.name,
      order: typeIndex,
      canDrag: true,
      canReparent: false
    });

    metaByNodeId.set(typeNodeId, {
      kind: 'group',
      typeId: type.id
    });

    for (let tableIndex = 0; tableIndex < type.tables.length; tableIndex++) {
      const table = type.tables[tableIndex];
      const tableNodeId = makeTableNodeId(type.id, table.id);

      nodes.push({
        id: tableNodeId,
        parentId: typeNodeId,
        name: table.name,
        order: tableIndex,
        canDrag: true,
        canReparent: false
      });

      metaByNodeId.set(tableNodeId, {
        kind: 'config',
        typeId: type.id,
        tableId: table.id
      });
    }
  }

  return {
    nodes,
    metaByNodeId
  };
}

export function buildTreeOrderPayload(nodes: TreeNodeItem[]): TreeOrderPayload {
  const typeOrderIds = nodes
    .filter((node) => node.parentId === null)
    .sort(compareTreeNodesByOrder)
    .map((node) => parseNodeId(node.id))
    .filter((meta): meta is NodeMeta & { kind: 'group' } => Boolean(meta && meta.kind === 'group'))
    .map((meta) => meta.typeId);

  const tableNodesWithOrderByType: Record<string, Array<{ tableId: string; order: number }>> = {};
  for (const node of nodes) {
    if (node.parentId === null) {
      continue;
    }
    const tableMeta = parseNodeId(node.id);
    const parentMeta = parseNodeId(node.parentId);
    if (
      !tableMeta ||
      tableMeta.kind !== 'config' ||
      !parentMeta ||
      parentMeta.kind !== 'group' ||
      tableMeta.typeId !== parentMeta.typeId
    ) {
      continue;
    }

    const list = tableNodesWithOrderByType[parentMeta.typeId] ?? [];
    list.push({
      tableId: tableMeta.tableId,
      order: node.order ?? Number.MAX_SAFE_INTEGER
    });
    tableNodesWithOrderByType[parentMeta.typeId] = list;
  }

  const tableOrderByType: Record<string, string[]> = {};
  for (const typeId of Object.keys(tableNodesWithOrderByType)) {
    tableOrderByType[typeId] = tableNodesWithOrderByType[typeId]
      .sort((a, b) => a.order - b.order)
      .map((item) => item.tableId);
  }

  return {
    typeOrderIds,
    tableOrderByType
  };
}

export function applyTreeOrderToSnapshot(snapshot: ConfigStoreSnapshot, payload: TreeOrderPayload): ConfigStoreSnapshot {
  const typeById = new Map(snapshot.types.map((type) => [type.id, type]));
  const orderedTypes: ConfigTypeRecord[] = [];
  const usedTypeIds = new Set<string>();

  for (const typeId of payload.typeOrderIds) {
    const matched = typeById.get(typeId);
    if (!matched || usedTypeIds.has(typeId)) {
      continue;
    }
    orderedTypes.push(matched);
    usedTypeIds.add(typeId);
  }

  for (const type of snapshot.types) {
    if (usedTypeIds.has(type.id)) {
      continue;
    }
    orderedTypes.push(type);
    usedTypeIds.add(type.id);
  }

  return {
    types: orderedTypes.map((type) => orderTables(type, payload.tableOrderByType[type.id] ?? []))
  };
}

function compareTreeNodesByOrder(a: TreeNodeItem, b: TreeNodeItem): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
}

function orderTables(type: ConfigTypeRecord, preferredTableIds: string[]): ConfigTypeRecord {
  if (preferredTableIds.length === 0) {
    return type;
  }

  const tableById = new Map(type.tables.map((table) => [table.id, table]));
  const orderedTables: ConfigTableRecord[] = [];
  const usedTableIds = new Set<string>();

  for (const tableId of preferredTableIds) {
    const matched = tableById.get(tableId);
    if (!matched || usedTableIds.has(tableId)) {
      continue;
    }
    orderedTables.push(matched);
    usedTableIds.add(tableId);
  }

  for (const table of type.tables) {
    if (usedTableIds.has(table.id)) {
      continue;
    }
    orderedTables.push(table);
    usedTableIds.add(table.id);
  }

  return {
    ...type,
    tables: orderedTables
  };
}
