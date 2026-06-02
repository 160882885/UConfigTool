import type { NodeApi } from 'react-arborist';

import type { ArborNodeData, GenericTreeNode, TreeIndex } from './treeTypes';

function buildIndex<TData>(nodes: Array<GenericTreeNode<TData>>): TreeIndex<TData> {
  const nodeById = new Map<string, GenericTreeNode<TData>>();
  const childrenByParent = new Map<string | null, string[]>();
  const siblingIndexById = new Map<string, number>();

  for (const node of nodes) {
    nodeById.set(node.id, node);
    const siblings = childrenByParent.get(node.parentId);
    if (siblings) {
      siblings.push(node.id);
    } else {
      childrenByParent.set(node.parentId, [node.id]);
    }
  }

  for (const [parentId, siblingIds] of childrenByParent.entries()) {
    siblingIds.sort((a, b) => {
      const orderA = nodeById.get(a)?.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = nodeById.get(b)?.order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });

    for (let i = 0; i < siblingIds.length; i++) {
      siblingIndexById.set(siblingIds[i], i);
    }

    childrenByParent.set(parentId, siblingIds);
  }

  return {
    nodeById,
    childrenByParent,
    siblingIndexById,
    roots: childrenByParent.get(null) ?? []
  };
}

function buildArborData<TData>(index: TreeIndex<TData>): Array<ArborNodeData<TData>> {
  const createNode = (id: string): ArborNodeData<TData> | null => {
    const source = index.nodeById.get(id);
    if (!source) {
      return null;
    }

    const childIds = index.childrenByParent.get(id) ?? [];
    const children = childIds
      .map((childId) => createNode(childId))
      .filter((node): node is ArborNodeData<TData> => Boolean(node));

    return {
      id: source.id,
      label: source.label,
      source,
      children: children.length > 0 || source.canHaveChildren ? children : undefined
    };
  };

  return index.roots
    .map((rootId) => createNode(rootId))
    .filter((node): node is ArborNodeData<TData> => Boolean(node));
}

function normalizeParentId<TData>(node: NodeApi<ArborNodeData<TData>> | null): string | null {
  if (!node || node.isRoot) {
    return null;
  }
  return node.id;
}

function toSelectedNodes<TData>(ids: string[], index: TreeIndex<TData>): Array<GenericTreeNode<TData>> {
  return ids.map((id) => index.nodeById.get(id)).filter((node): node is GenericTreeNode<TData> => Boolean(node));
}

export {
  buildArborData,
  buildIndex,
  normalizeParentId,
  toSelectedNodes
};
