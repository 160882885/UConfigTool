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
  type MouseEvent,
  type ReactNode
} from 'react';
import { Tree, type NodeApi, type NodeRendererProps, type RowRendererProps, type TreeApi as ArborTreeApi } from 'react-arborist';
import type { TreeProps } from 'react-arborist/dist/module/types/tree-props';

export interface GenericTreeNode<TData = unknown> {
  id: string;
  parentId: string | null;
  label: string;
  order?: number;
  canHaveChildren?: boolean;
  data: TData;
}

export interface TreeSelectionChangeEvent<TData = unknown> {
  selectedNodes: Array<GenericTreeNode<TData>>;
}

export interface TreeRenameEvent<TData = unknown> {
  node: GenericTreeNode<TData>;
  previousLabel: string;
  nextLabel: string;
}

export interface TreeDragStartEvent<TData = unknown> {
  nodeIds: string[];
  nodes: Array<GenericTreeNode<TData>>;
  fromParentId: string | null;
  fromIndex: number;
}

export interface TreeDragOverEvent<TData = unknown> {
  nodeIds: string[];
  nodes: Array<GenericTreeNode<TData>>;
  targetParentId: string | null;
  targetIndex: number;
}

export interface TreeDragDropEvent<TData = unknown> {
  nodeIds: string[];
  nodes: Array<GenericTreeNode<TData>>;
  fromParentId: string | null;
  fromIndex: number;
  toParentId: string | null;
  toIndex: number;
  cancelled: boolean;
}

export interface TreeNodeRenderContext {
  isLeaf: boolean;
  isOpen: boolean;
  isSelected: boolean;
  level: number;
}

export interface TreeNodeContextMenuEvent<TData = unknown> {
  node: GenericTreeNode<TData>;
  selectedNodeIds: string[];
  selectedNodes: Array<GenericTreeNode<TData>>;
  nativeEvent: MouseEvent<HTMLDivElement>;
}

export interface TreeCanvasContextMenuEvent<TData = unknown> {
  selectedNodeIds: string[];
  selectedNodes: Array<GenericTreeNode<TData>>;
  nativeEvent: MouseEvent<HTMLDivElement>;
}

export interface TreeCanDragContext<TData = unknown> {
  node: GenericTreeNode<TData>;
  selectedNodes: Array<GenericTreeNode<TData>>;
}

export interface TreeCanDropContext<TData = unknown> {
  dragNodes: Array<GenericTreeNode<TData>>;
  targetParentId: string | null;
  targetIndex: number;
}

export interface TreeViewRef<TData = unknown> {
  beginRename: (nodeId: string) => void;
  clearSelection: () => void;
  getSelectedNodes: () => Array<GenericTreeNode<TData>>;
  getNodeById: (nodeId: string) => GenericTreeNode<TData> | null;
}

interface ArborNodeData<TData> {
  id: string;
  label: string;
  source: GenericTreeNode<TData>;
  children?: Array<ArborNodeData<TData>>;
}

interface DragSession<TData> {
  nodeIds: string[];
  fromParentId: string | null;
  fromIndex: number;
  moved: boolean;
  lastHoverSignature: string;
  lastHoverTarget: {
    parentId: string | null;
    index: number;
  };
  nodes: Array<GenericTreeNode<TData>>;
}

interface TreeIndex<TData> {
  nodeById: Map<string, GenericTreeNode<TData>>;
  childrenByParent: Map<string | null, string[]>;
  siblingIndexById: Map<string, number>;
  roots: string[];
}

interface TreeViewProps<TData> {
  nodes: Array<GenericTreeNode<TData>>;
  className?: string;
  rowHeight?: number;
  indentSize?: number;
  overscan?: number;
  allowMultiSelect?: boolean;
  defaultExpandedIds?: string[];
  disableRename?: boolean;
  selectedNodeIds?: string[];
  selectionSyncToken?: string | number | boolean | null;
  nodeHoverBackgroundColor?: string;
  nodeSelectedBackgroundColor?: string;
  onNodesChange?: (nodes: Array<GenericTreeNode<TData>>) => void;
  onSelectionChange?: (event: TreeSelectionChangeEvent<TData>) => void;
  onRename?: (event: TreeRenameEvent<TData>) => void;
  onDragStart?: (event: TreeDragStartEvent<TData>) => void;
  onDragOver?: (event: TreeDragOverEvent<TData>) => void;
  onDrop?: (event: TreeDragDropEvent<TData>) => void;
  canDrag?: (context: TreeCanDragContext<TData>) => boolean;
  canDrop?: (context: TreeCanDropContext<TData>) => boolean;
  renderNodeIcon?: (node: GenericTreeNode<TData>, context: TreeNodeRenderContext) => ReactNode;
  renderNodeExtra?: (node: GenericTreeNode<TData>, context: TreeNodeRenderContext) => ReactNode;
  onNodeContextMenu?: (event: TreeNodeContextMenuEvent<TData>) => void;
  onCanvasContextMenu?: (event: TreeCanvasContextMenuEvent<TData>) => void;
}

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

function TreeRow<TData>({
  node,
  attrs,
  innerRef,
  children,
  onNodeContextMenu
}: RowRendererProps<ArborNodeData<TData>> & {
  onNodeContextMenu?: (event: MouseEvent<HTMLDivElement>, node: NodeApi<ArborNodeData<TData>>) => void;
}) {
  const applySelection = (event: Pick<MouseEvent<HTMLDivElement>, 'ctrlKey' | 'metaKey' | 'shiftKey'>) => {
    if ((event.ctrlKey || event.metaKey) && !node.tree.props.disableMultiSelection) {
      node.isSelected ? node.deselect() : node.selectMulti();
      return;
    }
    if (event.shiftKey && !node.tree.props.disableMultiSelection) {
      node.selectContiguous();
      return;
    }
    node.select();
    node.activate();
  };

  return (
    <div
      {...attrs}
      ref={innerRef}
      className={`tree-row ${attrs.className ?? ''}`.trim()}
      onFocus={(event) => event.stopPropagation()}
      onClick={applySelection}
      onMouseDown={(event) => {
        if (event.button !== 2) {
          return;
        }
        applySelection(event);
        node.focus();
      }}
      onContextMenu={(event) => {
        onNodeContextMenu?.(event, node);
      }}
      onKeyDown={(event) => {
        if (event.key === 'F2' && node.isEditable) {
          event.preventDefault();
          event.stopPropagation();
          void node.edit();
        }
      }}
    >
      {children}
    </div>
  );
}

interface NodeRendererExtras<TData> {
  disableRename: boolean;
  renderNodeIcon?: (node: GenericTreeNode<TData>, context: TreeNodeRenderContext) => ReactNode;
  renderNodeExtra?: (node: GenericTreeNode<TData>, context: TreeNodeRenderContext) => ReactNode;
}

function TreeNodeRenderer<TData>(props: NodeRendererProps<ArborNodeData<TData>> & NodeRendererExtras<TData>) {
  const { node, style, dragHandle, disableRename, renderNodeIcon, renderNodeExtra } = props;

  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const hasVisibleChildren = (node.children?.length ?? 0) > 0;

  useEffect(() => {
    if (!node.isEditing) {
      return;
    }
    const input = renameInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }, [node.isEditing]);

  const source = node.data.source;
  const renderContext: TreeNodeRenderContext = {
    isLeaf: !hasVisibleChildren,
    isOpen: node.isOpen,
    isSelected: node.isSelected,
    level: node.level
  };

  const body = (
    <div ref={node.isEditing ? undefined : dragHandle} style={style} className={`tree-row-content${node.isSelected ? ' selected' : ''}`}>
      <button
        type="button"
        className={`tree-expander${hasVisibleChildren ? '' : ' empty'}`}
        onClick={(event) => {
          event.stopPropagation();
          if (hasVisibleChildren) {
            node.toggle();
          }
        }}
        tabIndex={-1}
      >
        {hasVisibleChildren ? <span className={`tree-expander-glyph${node.isOpen ? ' open' : ''}`} /> : null}
      </button>

      <span className="tree-icon" aria-hidden>
        {renderNodeIcon?.(source, renderContext) ?? null}
      </span>

      {node.isEditing ? (
        <input
          ref={renameInputRef}
          className="tree-rename-input"
          defaultValue={node.data.label}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onBlur={() => node.reset()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              node.reset();
              return;
            }
            if (event.key === 'Enter') {
              const nextLabel = event.currentTarget.value.trim();
              if (!nextLabel) {
                node.reset();
                return;
              }
              node.submit(nextLabel);
            }
          }}
        />
      ) : (
        <span
          className="tree-label"
          onDoubleClick={() => {
            if (!disableRename && node.isEditable) {
              void node.edit();
            }
          }}
        >
          {source.label}
        </span>
      )}

      {renderNodeExtra ? <div className="tree-extra">{renderNodeExtra(source, renderContext)}</div> : null}
    </div>
  );
  return body;
}

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
  const [internalNodes, setInternalNodes] = useState<Array<GenericTreeNode<TData>>>(nodes);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<ArborTreeApi<ArborNodeData<TData>> | null>(null);
  const indexRef = useRef<TreeIndex<TData>>(buildIndex(nodes));
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
    (next: Array<GenericTreeNode<TData>>) => {
      setInternalNodes(next);
      onNodesChange?.(next);
    },
    [onNodesChange]
  );

  const handleSelect = useCallback<NonNullable<TreeProps<ArborNodeData<TData>>['onSelect']>>(
    (selected) => {
      const selectedIds = selected.map((item) => item.id);
      const selectedNodes = toSelectedNodes(selectedIds, indexRef.current);
      onSelectionChange?.({
        selectedNodes
      });
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

      const nextById = new Map<string, GenericTreeNode<TData>>();
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

      const nextNodes: Array<GenericTreeNode<TData>> = [];
      const visit = (parentId: string | null) => {
        const children = nextChildrenByParent.get(parentId) ?? [];
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

  const handleTreeContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
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
  }, [onCanvasContextMenu, onSelectionChange]);

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

  const treeView = (
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
            renderNodeIcon={renderNodeIcon}
            renderNodeExtra={renderNodeExtra}
          />
        )}
      </Tree>
    </div>
  );
  return treeView;
}

const TreeView = forwardRef(TreeViewInner) as <TData>(
  props: TreeViewProps<TData> & { ref?: React.ForwardedRef<TreeViewRef<TData>> }
) => React.ReactElement;

export default TreeView;
