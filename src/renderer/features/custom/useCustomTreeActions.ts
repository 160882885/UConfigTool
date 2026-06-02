import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { ConfigNodeKind, ConfigStoreSnapshot } from '../../../../shared/contracts';
import { appBridge } from '../../shared/api/appBridge';
import type { ContextMenuItem } from '../../shared/components/context-menu/ContextMenu';
import type { TreeCanDropContext, TreeDragDropEvent, TreeSelectionChangeEvent, TreeViewRef } from '../../shared/components/tree/TreeView';

import {
  DEFAULT_EMPTY_NODE_NAME,
  DEFAULT_ENUM_NODE_NAME,
  DEFAULT_TABLE_NODE_NAME,
  DEFAULT_TYPE_NODE_NAME
} from './constants';
import { buildConfigNodes, findAncestorByKind, hasAncestorKind, isDescendant } from './treeModel';
import type { ConfigNodeModel, DirtyEditorKind, PendingDelete, PendingNodeSwitch, SchemaDraft } from './types';

interface UseCustomTreeActionsOptions {
  nodes: ConfigNodeModel[];
  nodeMap: Map<string, ConfigNodeModel>;
  selectedNode: ConfigNodeModel | null;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  pendingDelete: PendingDelete | null;
  pendingNodeSwitch: PendingNodeSwitch | null;
  dirtyEditorKind: DirtyEditorKind | null;
  treeViewRef: MutableRefObject<TreeViewRef<ConfigNodeModel> | null>;
  withStoreAction: (action: () => Promise<ConfigStoreSnapshot>) => Promise<ConfigStoreSnapshot | null>;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  setPendingNodeSwitch: Dispatch<SetStateAction<PendingNodeSwitch | null>>;
  setPendingDelete: Dispatch<SetStateAction<PendingDelete | null>>;
  setSchemaDraft: Dispatch<SetStateAction<SchemaDraft | null>>;
  setInfoDialogMessage: Dispatch<SetStateAction<string | null>>;
}

function useCustomTreeActions({
  nodes,
  nodeMap,
  selectedNode,
  selectedNodeId,
  selectedNodeIds,
  pendingDelete,
  pendingNodeSwitch,
  dirtyEditorKind,
  treeViewRef,
  withStoreAction,
  setSelectedNodeIds,
  setPendingNodeSwitch,
  setPendingDelete,
  setSchemaDraft,
  setInfoDialogMessage
}: UseCustomTreeActionsOptions) {
  const addNode = useCallback(
    async (kind: ConfigNodeKind) => {
      const selected = selectedNode;
      let parentId: string | null = null;

      if (selected) {
        if (kind === 'configTable' && selected.kind === 'configType') {
          parentId = selected.id;
        } else if (kind === 'configTable' && selected.kind !== 'configType') {
          const typeAncestor = findAncestorByKind(selected.id, nodeMap, 'configType');
          parentId = typeAncestor?.id ?? null;
        } else if (kind === 'configEnum' && selected.kind === 'configType') {
          parentId = selected.parentId;
        } else {
          parentId = selected.id;
        }
      }

      if (kind === 'configTable' && !parentId) {
        setInfoDialogMessage('请先选择一个可挂载配置表类型的节点。');
        return;
      }

      const defaultName =
        kind === 'empty'
          ? DEFAULT_EMPTY_NODE_NAME
          : kind === 'configType'
            ? DEFAULT_TYPE_NODE_NAME
            : kind === 'configTable'
              ? DEFAULT_TABLE_NODE_NAME
              : DEFAULT_ENUM_NODE_NAME;
      const result = await withStoreAction(() => appBridge.createConfigNode({ kind, name: defaultName, parentId }));
      if (!result) {
        return;
      }

      const nextNodes = buildConfigNodes(result);
      const previousIdSet = new Set(nodes.map((node) => node.id));
      const createdNode = nextNodes.find((node) => !previousIdSet.has(node.id)) ?? null;
      if (createdNode) {
        setSelectedNodeIds([createdNode.id]);
      }
    },
    [nodeMap, nodes, selectedNode, setInfoDialogMessage, setSelectedNodeIds, withStoreAction]
  );

  const removeSelected = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      setInfoDialogMessage('请先选择要删除的节点。');
      return;
    }

    setPendingDelete({
      nodeIds: [...selectedNodeIds],
      message:
        selectedNodeIds.length === 1
          ? '确认删除当前节点及其子节点吗？'
          : `确认删除已选中的 ${selectedNodeIds.length} 个节点吗？`
    });
  }, [selectedNodeIds, setInfoDialogMessage, setPendingDelete]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) {
      return;
    }

    const ids = [...pendingDelete.nodeIds];
    setPendingDelete(null);

    for (const nodeId of ids) {
      const ok = await withStoreAction(() => appBridge.deleteConfigNode({ nodeId }));
      if (!ok) {
        return;
      }
    }

    setSelectedNodeIds([]);
    setSchemaDraft(null);
  }, [pendingDelete, setPendingDelete, setSchemaDraft, setSelectedNodeIds, withStoreAction]);

  const canDropNodes = useCallback(
    (context: TreeCanDropContext<ConfigNodeModel>): boolean => {
      const { dragNodes, targetParentId } = context;
      const targetParent = targetParentId ? nodeMap.get(targetParentId) ?? null : null;
      const targetTypeAncestor = targetParent ? findAncestorByKind(targetParent.id, nodeMap, 'configType') : null;
      const targetIsEmptyNode = targetParent?.kind === 'empty';

      for (const dragNode of dragNodes) {
        if (targetParentId && (targetParentId === dragNode.id || isDescendant(targetParentId, dragNode.id, nodeMap))) {
          return false;
        }

        if (dragNode.data.kind === 'configType') {
          if (!targetParent) {
            continue;
          }
          if (targetIsEmptyNode) {
            if (targetTypeAncestor) {
              return false;
            }
            continue;
          }
          if (targetParent.kind === 'configType') {
            return false;
          }
          if (targetTypeAncestor) {
            return false;
          }
          continue;
        }

        if (dragNode.data.kind === 'configEnum') {
          if (!targetParent || targetParent.kind === 'configType' || targetParent.kind === 'configTable' || targetTypeAncestor) {
            return false;
          }
          continue;
        }

        if (dragNode.data.kind === 'configTable') {
          if (!targetParent || targetParent.kind === 'configTable') {
            return false;
          }
          const sourceType = findAncestorByKind(dragNode.id, nodeMap, 'configType');
          const directType = targetParent.kind === 'configType' ? targetParent : targetTypeAncestor;
          if (targetIsEmptyNode && (!sourceType || !directType || sourceType.id !== directType.id)) {
            return false;
          }
          if (!directType) {
            return false;
          }
        }
      }

      return true;
    },
    [nodeMap]
  );

  const handleDrop = useCallback(
    async (event: TreeDragDropEvent<ConfigNodeModel>) => {
      if (event.cancelled) {
        return;
      }
      await withStoreAction(() =>
        appBridge.moveConfigNode({
          nodeIds: event.nodeIds,
          parentId: event.toParentId,
          index: event.toIndex
        })
      );
    },
    [withStoreAction]
  );

  const handleRename = useCallback(
    async (nodeId: string, nextName: string) => {
      await withStoreAction(() =>
        appBridge.renameConfigNode({
          nodeId,
          name: nextName
        })
      );
    },
    [withStoreAction]
  );

  const handleSelectionChange = useCallback(
    (event: TreeSelectionChangeEvent<ConfigNodeModel>) => {
      const nextIds = event.selectedNodes.map((node) => node.id);
      if (pendingNodeSwitch) {
        return;
      }

      if (dirtyEditorKind && nextIds[0] !== selectedNode?.id) {
        setPendingNodeSwitch({
          nextNodeId: nextIds[0] ?? null,
          dirtyEditorKind
        });
        return;
      }

      setSelectedNodeIds(nextIds);
    },
    [dirtyEditorKind, pendingNodeSwitch, selectedNode?.id, setPendingNodeSwitch, setSelectedNodeIds]
  );

  const buildContextMenuItems = useCallback((): ContextMenuItem[] => {
    const selected = selectedNode;
    const noneSelected = !selected;

    let canAddEmpty = false;
    let canAddType = false;
    let canAddEnum = false;
    let canAddTable = false;
    let canRename = selectedNodeIds.length <= 1;

    if (noneSelected) {
      canAddEmpty = true;
      canAddType = true;
      canAddEnum = true;
      canRename = false;
    } else if (selected.kind === 'configTable' || selected.kind === 'configEnum') {
      canRename = true;
    } else if (selected.kind === 'configType') {
      canRename = true;
      canAddEmpty = true;
      canAddTable = true;
    } else {
      const hasTypeAncestor = hasAncestorKind(selected.id, nodeMap, 'configType');
      canRename = true;
      canAddEmpty = true;
      canAddType = !hasTypeAncestor;
      canAddEnum = !hasTypeAncestor;
      canAddTable = hasTypeAncestor;
    }

    return [
      {
        key: 'add-empty',
        label: '添加空节点',
        disabled: !canAddEmpty,
        onSelect: () => void addNode('empty')
      },
      {
        key: 'add-type',
        label: '添加配置表类型',
        disabled: !canAddType,
        onSelect: () => void addNode('configType')
      },
      {
        key: 'add-table',
        label: '添加配置表',
        disabled: !canAddTable,
        onSelect: () => void addNode('configTable')
      },
      {
        key: 'add-enum',
        label: '添加枚举',
        disabled: !canAddEnum,
        onSelect: () => void addNode('configEnum')
      },
      {
        key: 'sep',
        type: 'separator'
      },
      {
        key: 'rename',
        label: '重命名',
        disabled: !canRename || !selectedNodeId,
        onSelect: () => {
          if (!selectedNodeId) {
            return;
          }
          treeViewRef.current?.beginRename(selectedNodeId);
        }
      }
    ];
  }, [addNode, nodeMap, selectedNode, selectedNodeId, selectedNodeIds.length, treeViewRef]);

  return {
    addNode,
    buildContextMenuItems,
    canDropNodes,
    confirmDelete,
    handleDrop,
    handleRename,
    handleSelectionChange,
    removeSelected
  };
}

export { useCustomTreeActions };
