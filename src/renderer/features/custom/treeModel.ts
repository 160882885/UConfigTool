import type { ConfigNodeKind, ConfigStoreSnapshot } from '../../../../shared/contracts';
import type { GenericTreeNode } from '../../shared/components/tree/TreeView';
import type { ConfigNodeModel } from './types';

export function buildConfigNodes(snapshot: ConfigStoreSnapshot): ConfigNodeModel[] {
  return [...snapshot.nodes]
    .map((node) => ({
      id: node.id,
      parentId: node.parentId,
      kind: node.kind,
      name: node.name,
      order: node.order
    }))
    .sort((a, b) => a.order - b.order);
}

export function buildTreeNodes(nodes: ConfigNodeModel[]): Array<GenericTreeNode<ConfigNodeModel>> {
  return nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    label: node.name,
    order: node.order,
    canHaveChildren: node.kind !== 'configTable' && node.kind !== 'configEnum',
    data: node
  }));
}

export function buildExpandedIds(nodes: ConfigNodeModel[]): string[] {
  const parentIdSet = new Set(nodes.map((node) => node.parentId).filter((id): id is string => Boolean(id)));
  return nodes.filter((node) => parentIdSet.has(node.id) && node.parentId === null).map((node) => node.id);
}

export function buildChildrenMap(nodes: ConfigNodeModel[]): Map<string | null, ConfigNodeModel[]> {
  const map = new Map<string | null, ConfigNodeModel[]>();
  for (const node of nodes) {
    const siblings = map.get(node.parentId);
    if (siblings) {
      siblings.push(node);
    } else {
      map.set(node.parentId, [node]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.order - b.order);
  }
  return map;
}

export function buildNodeMap(nodes: ConfigNodeModel[]): Map<string, ConfigNodeModel> {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function findAncestorByKind(
  nodeId: string | null,
  nodeMap: Map<string, ConfigNodeModel>,
  targetKind: ConfigNodeKind
): ConfigNodeModel | null {
  let cursor = nodeId ? nodeMap.get(nodeId) ?? null : null;
  while (cursor) {
    if (cursor.kind === targetKind) {
      return cursor;
    }
    cursor = cursor.parentId ? nodeMap.get(cursor.parentId) ?? null : null;
  }
  return null;
}

export function hasAncestorKind(nodeId: string | null, nodeMap: Map<string, ConfigNodeModel>, targetKind: ConfigNodeKind): boolean {
  return Boolean(findAncestorByKind(nodeId, nodeMap, targetKind));
}

export function collectDescendantIds(rootId: string, childrenMap: Map<string | null, ConfigNodeModel[]>): string[] {
  const result: string[] = [];
  const stack = [...(childrenMap.get(rootId) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop() as ConfigNodeModel;
    result.push(node.id);
    const children = childrenMap.get(node.id) ?? [];
    for (const child of children) {
      stack.push(child);
    }
  }
  return result;
}

export function isDescendant(targetId: string, maybeAncestorId: string, nodeMap: Map<string, ConfigNodeModel>): boolean {
  let cursor = nodeMap.get(targetId) ?? null;
  while (cursor) {
    if (cursor.parentId === maybeAncestorId) {
      return true;
    }
    cursor = cursor.parentId ? nodeMap.get(cursor.parentId) ?? null : null;
  }
  return false;
}
