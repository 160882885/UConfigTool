import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent
} from 'react';

import { Tree, type NodeApi, type TreeApi as ArborTreeApi } from 'react-arborist';
import type { TreeProps } from 'react-arborist/dist/module/types/tree-props';

import TreeNodeRenderer from './TreeNodeRenderer';
import TreeRow from './TreeRow';
import type { ArborNodeData, DragSession, TreeViewProps, TreeViewRef } from './treeTypes';
import { buildArborData, buildIndex, normalizeParentId, toSelectedNodes } from './treeUtils';

export type {
  GenericTreeNode,
  TreeCanDragContext,
  TreeCanDropContext,
  TreeCanvasContextMenuEvent,
  TreeDragDropEvent,
  TreeDragOverEvent,
  TreeDragStartEvent,
  TreeNodeContextMenuEvent,
  TreeNodeRenderContext,
  TreeRenameEvent,
  TreeSelectionChangeEvent,
  TreeViewRef
} from './treeTypes';

function TreeViewInner<TData>(
  {
    nodes,
    className = '',
    rowHeight = 26,
    indentSize = 20,
    overscan = 8,
    allowMultiSelect = false,
    defaultExpandedIds = [],
    disableRename = false,
    selectedNodeIds,
    selectionSyncToken,
    nodeHoverBackgroundColor,
    nodeSelectedBackgroundColor,
    onNodesChange,
    onSelectionChange,
    onRename,
    onDragStart,
    onDragOver,
    onDrop,
    canDrag,
    canDrop,
    renderNodeIcon,
    renderNodeExtra,
    onNodeContextMenu,
    onCanvasContextMenu
  }: TreeViewProps<TData>,
  ref: React.ForwardedRef<TreeViewRef<TData>>
) {
  const [height, setHeight] = useState(520);
  const [internalNodes, setInternalNodes] = useState(nodes);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<ArborTreeApi<ArborNodeData<TData>> | null>(null);
  const indexRef = useRef(buildIndex(nodes));
  const dragSessionRef = useRef<DragSession<TData> | null>(null);

  useEffect(() => {
    setInternalNodes(nodes);
  }, [nodes]);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) {
      return;
    }

    const updateHeight = () => {
      setHeight(Math.max(120, element.clientHeight));
    };
    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const index = useMemo(() => buildIndex(internalNodes), [internalNodes]);
  indexRef.current = index;

  const treeData = useMemo(() => buildArborData(index), [index]);

  const initialOpenState = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const nodeId of defaultExpandedIds) {
      state[nodeId] = true;
    }
    return state;
  }, [defaultExpandedIds]);

  useEffect(() => {
    const tree = treeRef.current;
    if (!tree || !Array.isArray(selectedNodeIds)) {
      return;
    }

    const visibleSelection = selectedNodeIds.filter((id) => index.nodeById.has(id));
    const currentSelection = new Set(Array.from(tree.selectedIds));
    const nextSelection = new Set(visibleSelection);
    const isSameSelection =
      currentSelection.size === nextSelection.size && Array.from(nextSelection).every((id) => currentSelection.has(id));

    if (isSameSelection) {
      return;
    }

    if (visibleSelection.length === 0) {
      tree.deselectAll();
      return;
    }

    tree.setSelection({
      ids: visibleSelection,
      anchor: visibleSelection[0] ?? null,
      mostRecent: visibleSelection[visibleSelection.length - 1] ?? null
    });
  }, [index, selectedNodeIds, selectionSyncToken, treeData]);

  const publishNodes = useCallback(
    (next: Array<typeof internalNodes[number]>) => {
      setInternalNodes(next);
      onNodesChange?.(next);
    },
    [onNodesChange]
  );

  const handleSelect = useCallback<NonNullable<TreeProps<ArborNodeData<TData>>['onSelect']>>(
    (selected) => {
      const selectedIds = selected.map((item) => item.id);
      const selectedNodes = toSelectedNodes(selectedIds, indexRef.current);
      onSelectionChange?.({ selectedNodes });
    },
    [onSelectionChange]
  );

  const handleRename = useCallback<NonNullable<TreeProps<ArborNodeData<TData>>['onRename']>>(
    ({ id, name }) => {
      const target = indexRef.current.nodeById.get(id);
      if (!target) {
        return;
      }

      const nextLabel = name.trim();
      if (!nextLabel || nextLabel === target.label) {
        return;
      }

      const nextNodes = internalNodes.map((node) => (node.id === id ? { ...node, label: nextLabel } : node));
      publishNodes(nextNodes);
      onRename?.({
        node: target,
        previousLabel: target.label,
        nextLabel
      });
    },
    [internalNodes, onRename, publishNodes]
  );

  const emitDragOver = useCallback(() => {
    const session = dragSessionRef.current;
    const tree = treeRef.current;
    if (!session || !tree) {
      return;
    }

    const targetParentId = tree.dragDestinationParent?.id ?? null;
    const targetIndex = tree.dragDestinationIndex ?? 0;
    const signature = `${targetParentId ?? '__root__'}::${targetIndex}`;
    if (session.lastHoverSignature === signature) {
      return;
    }

    session.lastHoverSignature = signature;
    session.lastHoverTarget = {
      parentId: targetParentId,
      index: targetIndex
    };

    onDragOver?.({
      nodeIds: session.nodeIds,
      nodes: session.nodes,
      targetParentId,
      targetIndex
    });
  }, [onDragOver]);

  useEffect(() => {
    if (!onDragOver) {
      return;
    }

    const timer = window.setInterval(() => {
      emitDragOver();
    }, 33);

    return () => {
      window.clearInterval(timer);
    };
  }, [emitDragOver, onDragOver]);

  const handleMove = useCallback<NonNullable<TreeProps<ArborNodeData<TData>>['onMove']>>(
    ({ dragIds, parentId, index: insertIndex }) => {
      if (dragIds.length === 0) {
        return;
      }

      const current = indexRef.current;
      const targetParentId = parentId ?? null;
      const draggedNodes = toSelectedNodes(dragIds, current);

      if (canDrop && !canDrop({ dragNodes: draggedNodes, targetParentId, targetIndex: insertIndex })) {
        return;
      }

      const nextChildrenByParent = new Map<string | null, string[]>();
      for (const [pid, ids] of current.childrenByParent.entries()) {
        nextChildrenByParent.set(pid, [...ids]);
      }

      const firstDragId = dragIds[0];
      const sourceParentId = current.nodeById.get(firstDragId)?.parentId ?? null;
      const sourceIndex = current.siblingIndexById.get(firstDragId) ?? 0;

      for (const dragId of dragIds) {
        const sourceParent = current.nodeById.get(dragId)?.parentId ?? null;
        const siblings = nextChildrenByParent.get(sourceParent);
        if (!siblings) {
          continue;
        }
        const at = siblings.indexOf(dragId);
        if (at >= 0) {
          siblings.splice(at, 1);
        }
      }

      const targetSiblings = nextChildrenByParent.get(targetParentId) ?? [];
      if (!nextChildrenByParent.has(targetParentId)) {
        nextChildrenByParent.set(targetParentId, targetSiblings);
      }

      let adjustedInsert = insertIndex;
      for (const dragId of dragIds) {
        const sourceNode = current.nodeById.get(dragId);
        const sourceAt = current.siblingIndexById.get(dragId);
        if (!sourceNode || sourceAt === undefined) {
          continue;
        }
        if (sourceNode.parentId === targetParentId && sourceAt < insertIndex) {
          adjustedInsert -= 1;
        }
      }

      const safeInsert = Math.max(0, Math.min(adjustedInsert, targetSiblings.length));
      targetSiblings.splice(safeInsert, 0, ...dragIds);

      const nextById = new Map<string, typeof internalNodes[number]>();
      for (const node of current.nodeById.values()) {
        nextById.set(node.id, { ...node });
      }

      for (const [pid, ids] of nextChildrenByParent.entries()) {
        for (let i = 0; i < ids.length; i++) {
          const node = nextById.get(ids[i]);
          if (!node) {
            continue;
          }
          node.parentId = pid;
          node.order = i;
        }
      }

      const nextNodes: Array<typeof internalNodes[number]> = [];
      const visit = (parentNodeId: string | null) => {
        const children = nextChildrenByParent.get(parentNodeId) ?? [];
        for (const childId of children) {
          const node = nextById.get(childId);
          if (!node) {
            continue;
          }
          nextNodes.push(node);
          visit(childId);
        }
      };
      visit(null);
      publishNodes(nextNodes);

      const toIndex = targetSiblings.indexOf(firstDragId);
      const cancelled = sourceParentId === targetParentId && sourceIndex === toIndex;
      if (dragSessionRef.current) {
        dragSessionRef.current.moved = !cancelled;
      }

      onDrop?.({
        nodeIds: dragIds,
        nodes: draggedNodes,
        fromParentId: sourceParentId,
        fromIndex: sourceIndex,
        toParentId: targetParentId,
        toIndex,
        cancelled
      });
    },
    [canDrop, onDrop, publishNodes]
  );

  const handleDisableDrop = useCallback(
    ({
      parentNode,
      dragNodes,
      index: insertIndex
    }: {
      parentNode: NodeApi<ArborNodeData<TData>>;
      dragNodes: NodeApi<ArborNodeData<TData>>[];
      index: number;
    }) => {
      if (!canDrop) {
        return false;
      }
      const targetParentId = normalizeParentId(parentNode);
      const dragData = dragNodes.map((item) => item.data.source);
      return !canDrop({
        dragNodes: dragData,
        targetParentId,
        targetIndex: insertIndex
      });
    },
    [canDrop]
  );

  const handleDisableDrag = useCallback(
    (data: ArborNodeData<TData>) => {
      if (!canDrag) {
        return false;
      }
      const tree = treeRef.current;
      const selectedIds = tree ? Array.from(tree.selectedIds) : [];
      const selectedNodes = selectedIds.length > 0 ? toSelectedNodes(selectedIds, indexRef.current) : [data.source];
      return !canDrag({
        node: data.source,
        selectedNodes
      });
    },
    [canDrag]
  );

  const handleTreeClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (!target.closest('.tree-row')) {
        treeRef.current?.deselectAll();
        onSelectionChange?.({ selectedNodes: [] });
      }
    },
    [onSelectionChange]
  );

  const handleTreeContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('.tree-row')) {
        return;
      }
      treeRef.current?.deselectAll();
      onSelectionChange?.({ selectedNodes: [] });
      onCanvasContextMenu?.({
        selectedNodeIds: [],
        selectedNodes: [],
        nativeEvent: event
      });
    },
    [onCanvasContextMenu, onSelectionChange]
  );

  const handleNodeContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>, node: NodeApi<ArborNodeData<TData>>) => {
      const tree = treeRef.current;
      const selectedIds = tree ? Array.from(tree.selectedIds) : [node.id];
      const selectedNodes = toSelectedNodes(selectedIds, indexRef.current);
      onNodeContextMenu?.({
        node: node.data.source,
        selectedNodeIds: selectedIds,
        selectedNodes,
        nativeEvent: event
      });
    },
    [onNodeContextMenu]
  );

  const handleTreeKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'F2') {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const tree = treeRef.current;
      if (!tree || !tree.hasFocus || tree.isEditing || disableRename) {
        return;
      }
      const focused = tree.focusedNode ?? tree.mostRecentNode;
      if (!focused || !focused.isEditable) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void focused.edit();
    },
    [disableRename]
  );

  const handleNodeDragStart = useCallback(
    (node: NodeApi<ArborNodeData<TData>>) => {
      const tree = treeRef.current;
      const current = indexRef.current;
      const selectedIds = tree ? Array.from(tree.selectedIds) : [];
      const nodeIds = selectedIds.includes(node.id) ? selectedIds : [node.id];
      const draggedNodes = toSelectedNodes(nodeIds, current);
      const fromParentId = current.nodeById.get(nodeIds[0])?.parentId ?? null;
      const fromIndex = current.siblingIndexById.get(nodeIds[0]) ?? 0;

      dragSessionRef.current = {
        nodeIds,
        fromParentId,
        fromIndex,
        moved: false,
        lastHoverSignature: '',
        lastHoverTarget: {
          parentId: fromParentId,
          index: fromIndex
        },
        nodes: draggedNodes
      };

      onDragStart?.({
        nodeIds,
        nodes: draggedNodes,
        fromParentId,
        fromIndex
      });
    },
    [onDragStart]
  );

  const handleNodeDragEnd = useCallback(
    (node: NodeApi<ArborNodeData<TData>>) => {
      const session = dragSessionRef.current;
      if (!session || !session.nodeIds.includes(node.id)) {
        return;
      }
      if (!session.moved) {
        onDrop?.({
          nodeIds: session.nodeIds,
          nodes: session.nodes,
          fromParentId: session.fromParentId,
          fromIndex: session.fromIndex,
          toParentId: session.fromParentId,
          toIndex: session.fromIndex,
          cancelled: true
        });
      }
      dragSessionRef.current = null;
    },
    [onDrop]
  );

  useImperativeHandle(
    ref,
    (): TreeViewRef<TData> => ({
      beginRename: (nodeId: string) => {
        if (disableRename || !nodeId) {
          return;
        }
        const tree = treeRef.current;
        if (!tree) {
          return;
        }
        const target = tree.get(nodeId);
        if (!target || !target.isEditable) {
          return;
        }
        target.select();
        target.focus();
        void target.edit();
      },
      clearSelection: () => {
        treeRef.current?.deselectAll();
      },
      getSelectedNodes: () => {
        const tree = treeRef.current;
        if (!tree) {
          return [];
        }
        return toSelectedNodes(Array.from(tree.selectedIds), indexRef.current);
      },
      getNodeById: (nodeId: string) => indexRef.current.nodeById.get(nodeId) ?? null
    }),
    [disableRename]
  );

  const treeStyle =
    nodeHoverBackgroundColor || nodeSelectedBackgroundColor
      ? ({
          ...(nodeHoverBackgroundColor ? { '--tree-row-hover-bg': nodeHoverBackgroundColor } : {}),
          ...(nodeSelectedBackgroundColor ? { '--tree-row-selected-bg': nodeSelectedBackgroundColor } : {})
        } as CSSProperties)
      : undefined;

  return (
    <div
      className={`tree-view ${className}`.trim()}
      style={treeStyle}
      ref={wrapperRef}
      onClickCapture={handleTreeClickCapture}
      onContextMenu={handleTreeContextMenu}
      onKeyDownCapture={handleTreeKeyDownCapture}
    >
      <Tree<ArborNodeData<TData>>
        ref={treeRef}
        data={treeData}
        idAccessor="id"
        childrenAccessor="children"
        width="100%"
        height={height}
        rowHeight={rowHeight}
        indent={indentSize}
        overscanCount={overscan}
        initialOpenState={initialOpenState}
        disableMultiSelection={!allowMultiSelect}
        disableEdit={disableRename}
        disableDrag={handleDisableDrag}
        disableDrop={handleDisableDrop}
        dndRootElement={typeof document === 'undefined' ? undefined : document.body}
        onMove={handleMove}
        onSelect={handleSelect}
        onRename={handleRename}
        renderRow={(rowProps) => <TreeRow {...rowProps} onNodeContextMenu={handleNodeContextMenu} />}
      >
        {(nodeProps) => (
          <TreeNodeRenderer
            {...nodeProps}
            disableRename={disableRename}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragEnd={handleNodeDragEnd}
            renderNodeIcon={renderNodeIcon}
            renderNodeExtra={renderNodeExtra}
          />
        )}
      </Tree>
    </div>
  );
}

const TreeView = forwardRef(TreeViewInner) as <TData>(
  props: TreeViewProps<TData> & { ref?: React.ForwardedRef<TreeViewRef<TData>> }
) => React.ReactElement;

export default TreeView;
