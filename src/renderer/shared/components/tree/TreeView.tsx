import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from 'react';
import {
  Tree,
  type MoveHandler,
  type NodeApi,
  type NodeRendererProps,
  type RowRendererProps,
  type TreeApi as ArborTreeApi
} from 'react-arborist';
import type { TreeProps } from 'react-arborist/dist/module/types/tree-props';
import ContextMenu, { type ContextMenuItem } from '../context-menu/ContextMenu';

export interface TreeNodeItem {
  id: string;
  parentId: string | null;
  name: string;
  order?: number;
  canReparent?: boolean;
  canDrag?: boolean;
  icon?: ReactNode;
  data?: unknown;
}

interface TreeArborNode {
  id: string;
  name: string;
  icon?: ReactNode;
  canReparent?: boolean;
  canDrag?: boolean;
  sourceParentId: string | null;
  sourceOrder: number;
  children?: TreeArborNode[];
}

export interface TreeDragStartEvent {
  nodeId: string;
  parentId: string | null;
  index: number;
}

export interface TreeDragEndEvent {
  nodeId: string;
  fromParentId: string | null;
  toParentId: string | null;
  fromIndex: number;
  toIndex: number;
  cancelled: boolean;
}

export interface TreeRenameCompleteEvent {
  nodeId: string;
  previousName: string;
  nextName: string;
}

export interface TreeNodeContextMenuHelpers {
  beginRename: () => void;
  focus: () => void;
  select: () => void;
}

export interface TreeViewRef {
  getNodeById: (id: string) => TreeNodeItem | null;
  getNodeByPath: (path: string | string[]) => TreeNodeItem | null;
  scrollToNode: (target: string | string[], options?: { align?: 'start' | 'center' | 'end'; expandAncestors?: boolean }) => void;
}

interface TreeViewProps {
  nodes: TreeNodeItem[];
  selectedNodeId?: string | null;
  selectionSyncToken?: string | number | boolean | null;
  className?: string;
  rowHeight?: number;
  indentSize?: number;
  overscan?: number;
  allowReparent?: boolean;
  defaultExpandedIds?: string[];
  showHierarchyLines?: boolean;
  onNodesChange?: (nodes: TreeNodeItem[]) => void;
  onFocusedNodeChange?: (node: TreeNodeItem | null) => void;
  onDragStart?: (event: TreeDragStartEvent) => void;
  onDragEnd?: (event: TreeDragEndEvent) => void;
  canDrop?: (event: { dragNodeIds: string[]; parentId: string | null; index: number }) => boolean;
  onRenameComplete?: (event: TreeRenameCompleteEvent) => void;
  getNodeContextMenuItems?: (node: TreeNodeItem, helpers: TreeNodeContextMenuHelpers) => ContextMenuItem[];
  renderNodeIcon?: (node: TreeNodeItem, ctx: { isLeaf: boolean; isOpen: boolean }) => ReactNode;
  renderNodeExtra?: (node: TreeNodeItem) => ReactNode;
  renderFoldToggle?: (ctx: { node: TreeNodeItem; isLeaf: boolean; isOpen: boolean }) => ReactNode;
}

interface TreeIndex {
  nodeById: Map<string, TreeNodeItem>;
  childrenByParent: Map<string | null, string[]>;
  siblingIndexById: Map<string, number>;
}

interface DragSession {
  nodeId: string;
  fromParentId: string | null;
  fromIndex: number;
  moved: boolean;
}

function buildIndex(nodes: TreeNodeItem[]): TreeIndex {
  const nodeById = new Map<string, TreeNodeItem>();
  const childrenByParent = new Map<string | null, string[]>();
  const siblingIndexById = new Map<string, number>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    nodeById.set(node.id, node);
    const list = childrenByParent.get(node.parentId);
    if (list) {
      list.push(node.id);
    } else {
      childrenByParent.set(node.parentId, [node.id]);
    }
  }

  for (const [, ids] of childrenByParent) {
    ids.sort((a, b) => {
      const na = nodeById.get(a);
      const nb = nodeById.get(b);
      if (!na || !nb) {
        return 0;
      }
      const oa = na.order ?? Number.MAX_SAFE_INTEGER;
      const ob = nb.order ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) {
        return oa - ob;
      }
      return a.localeCompare(b);
    });

    for (let i = 0; i < ids.length; i++) {
      siblingIndexById.set(ids[i], i);
    }
  }

  return {
    nodeById,
    childrenByParent,
    siblingIndexById
  };
}

function toTreeData(index: TreeIndex): TreeArborNode[] {
  const create = (id: string): TreeArborNode | null => {
    const node = index.nodeById.get(id);
    if (!node) {
      return null;
    }

    const childrenIds = index.childrenByParent.get(id) ?? [];
    const children = childrenIds.map((childId) => create(childId)).filter((item): item is TreeArborNode => Boolean(item));

    return {
      id: node.id,
      name: node.name,
      icon: node.icon,
      canReparent: node.canReparent,
      canDrag: node.canDrag,
      sourceParentId: node.parentId,
      sourceOrder: node.order ?? 0,
      children: children.length > 0 ? children : undefined
    };
  };

  const roots = index.childrenByParent.get(null) ?? [];
  return roots.map((rootId) => create(rootId)).filter((item): item is TreeArborNode => Boolean(item));
}

function findByPath(index: TreeIndex, segments: string[]): TreeNodeItem | null {
  let parentId: string | null = null;
  let current: TreeNodeItem | null = null;

  for (const segment of segments) {
    const children: string[] = index.childrenByParent.get(parentId) ?? [];
    let nextId: string | undefined = children.find((id: string) => id === segment);

    if (!nextId) {
      nextId = children.find((id: string) => index.nodeById.get(id)?.name === segment);
    }

    if (!nextId) {
      return null;
    }

    current = index.nodeById.get(nextId) ?? null;
    parentId = nextId;
  }

  return current;
}

function normalizeParentId(node: NodeApi<TreeArborNode> | null): string | null {
  if (!node || node.isRoot) {
    return null;
  }
  return node.id;
}

function normalizeMoveParentId(parentId: string | null | undefined): string | null {
  return parentId ?? null;
}

function getAdjustedInsertIndex(
  index: TreeIndex,
  dragIds: string[],
  targetParentId: string | null,
  insertIndex: number,
  targetSiblingsLength: number
): number {
  let adjustedIndex = insertIndex;
  for (const id of dragIds) {
    const node = index.nodeById.get(id);
    const sourceIndex = index.siblingIndexById.get(id);
    if (!node || sourceIndex === undefined) {
      continue;
    }
    if (node.parentId === targetParentId && sourceIndex < insertIndex) {
      adjustedIndex -= 1;
    }
  }
  return Math.max(0, Math.min(adjustedIndex, targetSiblingsLength));
}

function isMoveAllowed(index: TreeIndex, dragIds: string[], targetParentId: string | null, allowReparent: boolean): boolean {
  return dragIds.every((id) => {
    const node = index.nodeById.get(id);
    if (!node) {
      return false;
    }
    if (!allowReparent && node.parentId !== targetParentId) {
      return false;
    }
    if (node.canReparent === false && node.parentId !== targetParentId) {
      return false;
    }
    return true;
  });
}

function alignToArbor(align: 'start' | 'center' | 'end') {
  if (align === 'start') {
    return 'start' as const;
  }
  if (align === 'end') {
    return 'end' as const;
  }
  return 'center' as const;
}

function splitLabel(name: string): { main: string; meta: string } {
  const match = name.match(/^(.*?)(\s*\(.*\))$/);
  if (!match) {
    return { main: name, meta: '' };
  }
  return {
    main: match[1],
    meta: match[2]
  };
}

function ArborRow<T>({ node, attrs, innerRef, children }: RowRendererProps<T>) {
  return (
    <div
      {...attrs}
      ref={innerRef}
      className={`tree-row ${attrs.className ?? ''}`.trim()}
      onFocus={(event) => event.stopPropagation()}
      onClick={node.handleClick}
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

interface NodeRendererExtras {
  onNodeDragStart: (node: NodeApi<TreeArborNode>) => void;
  onNodeDragEnd: (node: NodeApi<TreeArborNode>) => void;
  onNodeRename: (node: NodeApi<TreeArborNode>) => void;
  showHierarchyLines: boolean;
  indentSize: number;
  renderNodeIcon?: (node: TreeNodeItem, ctx: { isLeaf: boolean; isOpen: boolean }) => ReactNode;
  renderNodeExtra?: (node: TreeNodeItem) => ReactNode;
  renderFoldToggle?: (ctx: { node: TreeNodeItem; isLeaf: boolean; isOpen: boolean }) => ReactNode;
  getNodeContextMenuItems?: (node: TreeNodeItem, helpers: TreeNodeContextMenuHelpers) => ContextMenuItem[];
  nodeById: Map<string, TreeNodeItem>;
}

function ArborNodeRenderer(props: NodeRendererProps<TreeArborNode> & NodeRendererExtras) {
  const {
    node,
    style,
    dragHandle,
    onNodeDragStart,
    onNodeDragEnd,
    onNodeRename,
    showHierarchyLines,
    indentSize,
    renderNodeIcon,
    renderNodeExtra,
    renderFoldToggle,
    getNodeContextMenuItems,
    nodeById
  } = props;

  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const wasDraggingRef = useRef(node.isDragging);

  const raw = nodeById.get(node.id);
  const icon = raw ? (renderNodeIcon ? renderNodeIcon(raw, { isLeaf: node.isLeaf, isOpen: node.isOpen }) : raw.icon) : null;
  const toggle = raw ? renderFoldToggle?.({ node: raw, isLeaf: node.isLeaf, isOpen: node.isOpen }) : null;
  const labelText = String(node.data.name ?? '');
  const labelParts = splitLabel(labelText);
  const isCSharpFile = node.isLeaf && /\.cs$/i.test(labelText);
  const toggleCenter = 8;
  const contextMenuItems =
    raw && getNodeContextMenuItems
      ? getNodeContextMenuItems(raw, {
          beginRename: () => onNodeRename(node),
          focus: () => node.focus(),
          select: () => node.select()
        })
      : [];

  const branchGuides = useMemo(() => {
    if (node.level <= 0) {
      return {
        ancestorLines: [] as Array<{ key: string; left: number }>,
        parentX: 0
      };
    }

    const ancestors: NodeApi<TreeArborNode>[] = [];
    let cursor = node.parent;
    while (cursor && !cursor.isRoot) {
      ancestors.unshift(cursor);
      cursor = cursor.parent;
    }

    const ancestorLines: Array<{ key: string; left: number }> = [];
    for (let depth = 0; depth < ancestors.length - 1; depth++) {
      const ancestor = ancestors[depth];
      if (ancestor.nextSibling) {
        ancestorLines.push({
          key: `${node.id}-ancestor-line-${depth}`,
          left: depth * indentSize + toggleCenter
        });
      }
    }

    const parentX = (node.level - 1) * indentSize + toggleCenter;
    return {
      ancestorLines,
      parentX
    };
  }, [indentSize, node, node.id, node.level]);

  useEffect(() => {
    if (!wasDraggingRef.current && node.isDragging) {
      onNodeDragStart(node);
    }
    if (wasDraggingRef.current && !node.isDragging) {
      onNodeDragEnd(node);
    }
    wasDraggingRef.current = node.isDragging;
  }, [node, node.isDragging, onNodeDragEnd, onNodeDragStart]);

  useLayoutEffect(() => {
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

  const rowContent = (
    <div
      ref={node.isEditing ? undefined : dragHandle}
      style={style}
      className={`tree-row-content tree-drag-handle${node.isSelected ? ' selected' : ''}${node.isDragging ? ' dragging' : ''}`}
      onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (!node.isSelected) {
          node.select();
        }
        node.focus();
      }}
      onDoubleClick={() => onNodeRename(node)}
    >
      {showHierarchyLines ? (
        <span className="tree-guides" style={{ width: node.level * indentSize + toggleCenter + 2 }} aria-hidden>
          {node.level > 0 ? (
            <>
              {branchGuides.ancestorLines.map((line) => (
                <span key={line.key} className="tree-guide-v through" style={{ left: line.left }} />
              ))}
              <span
                className={`tree-guide-v parent${node.nextSibling ? ' through' : ''}`}
                style={{ left: branchGuides.parentX }}
              />
              <span className="tree-guide-h" style={{ left: branchGuides.parentX, width: indentSize }} />
            </>
          ) : null}
        </span>
      ) : null}

      <button
        type="button"
        className={`tree-expander${node.isLeaf ? ' empty' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          if (!node.isLeaf) {
            node.toggle();
          }
        }}
        tabIndex={-1}
      >
        {toggle ?? (node.isLeaf ? null : <span className={`tree-expander-glyph${node.isOpen ? ' open' : ''}`} />)}
      </button>

      <span className="tree-icon" aria-hidden>
        {icon ?? (
          <span
            className={`tree-icon-glyph ${
              node.isLeaf ? (isCSharpFile ? 'csharp' : 'file') : node.isOpen ? 'folder-open' : 'folder'
            }`}
          >
            {node.isLeaf ? (
              isCSharpFile ? (
                <span className="csharp-mark">C#</span>
              ) : (
              <>
                <span className="file-corner" />
                <span className="file-line file-line-1" />
                <span className="file-line file-line-2" />
                <span className="file-line file-line-3" />
              </>
              )
            ) : (
              <span className="folder-lip" />
            )}
          </span>
        )}
      </span>

      {node.isEditing ? (
        <input
          ref={renameInputRef}
          className="tree-rename-input"
          defaultValue={node.data.name}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onDragStart={(event) => event.preventDefault()}
          onBlur={() => node.reset()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              node.reset();
            }
            if (event.key === 'Enter') {
              const next = (event.currentTarget.value || '').trim();
              if (next) {
                node.submit(next);
              } else {
                node.reset();
              }
            }
          }}
        />
      ) : (
        <span className={`tree-label${isCSharpFile ? ' csharp-file' : ''}`} title={labelText}>
          <span className="tree-label-main">{labelParts.main}</span>
          {labelParts.meta ? <span className="tree-label-meta">{labelParts.meta}</span> : null}
        </span>
      )}

      {raw && renderNodeExtra ? <div className="tree-extra">{renderNodeExtra(raw)}</div> : null}
    </div>
  );

  if (contextMenuItems.length === 0) {
    return rowContent;
  }

  return <ContextMenu items={contextMenuItems}>{rowContent}</ContextMenu>;
}

const TreeView = forwardRef<TreeViewRef, TreeViewProps>(function TreeView(
  {
    nodes,
    selectedNodeId = null,
    selectionSyncToken = null,
    className = '',
    rowHeight = 26,
    indentSize = 20,
    overscan = 8,
    allowReparent = true,
    defaultExpandedIds = [],
    showHierarchyLines = true,
    onNodesChange,
    onFocusedNodeChange,
    onDragStart,
    onDragEnd,
    canDrop,
    onRenameComplete,
    getNodeContextMenuItems,
    renderNodeIcon,
    renderNodeExtra,
    renderFoldToggle
  },
  ref
) {
  const [treeNodes, setTreeNodes] = useState<TreeNodeItem[]>(nodes);
  const arborRef = useRef<ArborTreeApi<TreeArborNode> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const indexRef = useRef<TreeIndex>(buildIndex(nodes));
  const [height, setHeight] = useState(600);

  useEffect(() => {
    setTreeNodes(nodes);
  }, [nodes]);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      setHeight(Math.max(120, element.clientHeight));
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const index = useMemo(() => buildIndex(treeNodes), [treeNodes]);
  indexRef.current = index;

  const treeData = useMemo(() => toTreeData(index), [index]);

  useEffect(() => {
    const tree = arborRef.current;
    if (!tree) {
      return;
    }

    if (!selectedNodeId) {
      tree.deselectAll();
      return;
    }

    if (!indexRef.current.nodeById.has(selectedNodeId)) {
      return;
    }

    tree.select(selectedNodeId, { focus: false });
  }, [selectedNodeId, treeData, selectionSyncToken]);

  const initialOpenState = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const id of defaultExpandedIds) {
      state[id] = true;
    }
    return state;
  }, [defaultExpandedIds]);

  const updateTreeNodes = useCallback(
    (next: TreeNodeItem[]) => {
      setTreeNodes(next);
      onNodesChange?.(next);
    },
    [onNodesChange]
  );

  const handleMove = useCallback<MoveHandler<TreeArborNode>>(
    ({ dragIds, parentId, index: insertIndex }) => {
      if (dragIds.length === 0) {
        return;
      }

      const currentIndex = indexRef.current;
      const targetParent = normalizeMoveParentId(parentId);
      if (!isMoveAllowed(currentIndex, dragIds, targetParent, allowReparent)) {
        return;
      }
      if (canDrop && !canDrop({ dragNodeIds: dragIds, parentId: targetParent, index: insertIndex })) {
        return;
      }

      const nextChildrenByParent = new Map<string | null, string[]>();
      for (const [pid, ids] of currentIndex.childrenByParent) {
        nextChildrenByParent.set(pid, [...ids]);
      }

      const firstDragId = dragIds[0];
      const firstSourceParent = currentIndex.nodeById.get(firstDragId)?.parentId ?? null;
      const firstSourceIndex = currentIndex.siblingIndexById.get(firstDragId) ?? 0;

      for (const id of dragIds) {
        const sourceParent = currentIndex.nodeById.get(id)?.parentId ?? null;
        const siblings = nextChildrenByParent.get(sourceParent);
        if (!siblings) {
          continue;
        }
        const at = siblings.indexOf(id);
        if (at >= 0) {
          siblings.splice(at, 1);
        }
      }

      const targetSiblings = nextChildrenByParent.get(targetParent) ?? [];
      if (!nextChildrenByParent.has(targetParent)) {
        nextChildrenByParent.set(targetParent, targetSiblings);
      }

      const safeInsert = getAdjustedInsertIndex(currentIndex, dragIds, targetParent, insertIndex, targetSiblings.length);
      targetSiblings.splice(safeInsert, 0, ...dragIds);

      const nextById = new Map<string, TreeNodeItem>();
      for (const node of currentIndex.nodeById.values()) {
        nextById.set(node.id, { ...node });
      }

      for (const [pid, ids] of nextChildrenByParent) {
        for (let i = 0; i < ids.length; i++) {
          const n = nextById.get(ids[i]);
          if (!n) {
            continue;
          }
          n.parentId = pid;
          n.order = i;
        }
      }

      const nextNodes = Array.from(nextById.values());
      updateTreeNodes(nextNodes);

      const toIndex = nextChildrenByParent.get(targetParent)?.indexOf(firstDragId) ?? safeInsert;
      const cancelled = firstSourceParent === targetParent && firstSourceIndex === toIndex;

      if (onDragEnd) {
        onDragEnd({
          nodeId: firstDragId,
          fromParentId: firstSourceParent,
          toParentId: targetParent,
          fromIndex: firstSourceIndex,
          toIndex,
          cancelled
        });
      }

      if (dragSessionRef.current && dragSessionRef.current.nodeId === firstDragId) {
        dragSessionRef.current.moved = !cancelled;
      }
    },
    [allowReparent, canDrop, onDragEnd, updateTreeNodes]
  );

  const handleRename = useCallback<NonNullable<TreeProps<TreeArborNode>['onRename']>>(
    ({ id, name }) => {
      const current = indexRef.current.nodeById.get(id);
      if (!current) {
        return;
      }
      const nextName = name.trim();
      if (!nextName || nextName === current.name) {
        return;
      }

      const nextNodes = treeNodes.map((node) => (node.id === id ? { ...node, name: nextName } : node));
      updateTreeNodes(nextNodes);

      onRenameComplete?.({
        nodeId: id,
        previousName: current.name,
        nextName
      });
    },
    [onRenameComplete, treeNodes, updateTreeNodes]
  );

  const handleNodeDragStart = useCallback(
    (node: NodeApi<TreeArborNode>) => {
      const current = indexRef.current;
      const parentId = current.nodeById.get(node.id)?.parentId ?? null;
      const fromIndex = current.siblingIndexById.get(node.id) ?? 0;

      dragSessionRef.current = {
        nodeId: node.id,
        fromParentId: parentId,
        fromIndex,
        moved: false
      };

      onDragStart?.({
        nodeId: node.id,
        parentId,
        index: fromIndex
      });
    },
    [onDragStart]
  );

  const handleNodeDragEnd = useCallback(
    (node: NodeApi<TreeArborNode>) => {
      const session = dragSessionRef.current;
      if (!session || session.nodeId !== node.id) {
        return;
      }

      if (!session.moved) {
        onDragEnd?.({
          nodeId: session.nodeId,
          fromParentId: session.fromParentId,
          toParentId: session.fromParentId,
          fromIndex: session.fromIndex,
          toIndex: session.fromIndex,
          cancelled: true
        });
      }

      dragSessionRef.current = null;
    },
    [onDragEnd]
  );

  const handleNodeRename = useCallback((node: NodeApi<TreeArborNode>) => {
    void node.edit();
  }, []);

  const getNodeById = useCallback((id: string) => {
    return indexRef.current.nodeById.get(id) ?? null;
  }, []);

  const getNodeByPath = useCallback((path: string | string[]) => {
    const segments = Array.isArray(path)
      ? path.filter(Boolean)
      : path
          .split('/')
          .map((segment) => segment.trim())
          .filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    return findByPath(indexRef.current, segments);
  }, []);

  const scrollToNode = useCallback(
    (target: string | string[], options?: { align?: 'start' | 'center' | 'end'; expandAncestors?: boolean }) => {
      const align = options?.align ?? 'center';
      const expandAncestors = options?.expandAncestors ?? true;

      let node: TreeNodeItem | null;
      if (Array.isArray(target)) {
        node = getNodeByPath(target);
      } else if (target.includes('/')) {
        node = getNodeByPath(target);
      } else {
        node = getNodeById(target);
      }

      if (!node) {
        return;
      }

      const tree = arborRef.current;
      if (!tree) {
        return;
      }

      if (!expandAncestors && !tree.get(node.id)) {
        return;
      }

      void tree.scrollTo(node.id, alignToArbor(align));
    },
    [getNodeById, getNodeByPath]
  );

  useImperativeHandle(
    ref,
    () => ({
      getNodeById,
      getNodeByPath,
      scrollToNode
    }),
    [getNodeById, getNodeByPath, scrollToNode]
  );

  const disableDrop = useCallback(
    ({ parentNode, dragNodes, index }: { parentNode: NodeApi<TreeArborNode>; dragNodes: NodeApi<TreeArborNode>[]; index: number }) => {
      const targetParentId = normalizeParentId(parentNode);
      const dragNodeIds = dragNodes.map((dragNode) => dragNode.id);

      if (canDrop && !canDrop({ dragNodeIds, parentId: targetParentId, index })) {
        return true;
      }

      if (!allowReparent) {
        return dragNodes.some((dragNode) => normalizeParentId(dragNode.parent) !== targetParentId);
      }

      return dragNodes.some((dragNode) => {
        if (dragNode.data.canReparent === false) {
          return normalizeParentId(dragNode.parent) !== targetParentId;
        }
        return false;
      });
    },
    [allowReparent, canDrop]
  );

  const disableDrag = useCallback((data: TreeArborNode) => data.canDrag === false, []);

  const handleFocusedNode = useCallback<NonNullable<TreeProps<TreeArborNode>['onFocus']>>(() => {
    // Selection is externally controlled and synced via onSelect.
  }, []);

  const handleSelectedNode = useCallback<NonNullable<TreeProps<TreeArborNode>['onSelect']>>(
    (selectedNodes) => {
      if (selectedNodes.length === 0 && selectedNodeId) {
        return;
      }
      const first = selectedNodes[0];
      onFocusedNodeChange?.(first ? indexRef.current.nodeById.get(first.id) ?? null : null);
    },
    [onFocusedNodeChange, selectedNodeId]
  );

  const handleTreeKeyDownCapture = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'F2') {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    const tree = arborRef.current;
    if (!tree || !tree.hasFocus || tree.isEditing) {
      return;
    }

    const focused = tree.focusedNode ?? tree.mostRecentNode;
    if (!focused || !focused.isEditable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void focused.edit();
  }, []);

  const handleTreeClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (!target.closest('.tree-row')) {
        onFocusedNodeChange?.(null);
      }
    },
    [onFocusedNodeChange]
  );

  return (
    <div
      className={`tree-view ${className}`.trim()}
      ref={wrapperRef}
      onKeyDownCapture={handleTreeKeyDownCapture}
      onClickCapture={handleTreeClickCapture}
    >
      <Tree<TreeArborNode>
        ref={arborRef}
        data={treeData}
        selection={selectedNodeId ?? undefined}
        idAccessor="id"
        childrenAccessor="children"
        width="100%"
        height={height}
        rowHeight={rowHeight}
        indent={indentSize}
        overscanCount={overscan}
        initialOpenState={initialOpenState}
        onMove={handleMove}
        onRename={handleRename}
        onFocus={handleFocusedNode}
        onSelect={handleSelectedNode}
        disableDrag={disableDrag}
        disableDrop={disableDrop}
        disableEdit={false}
        dndRootElement={typeof document === 'undefined' ? undefined : document.body}
        renderRow={ArborRow<TreeArborNode>}
      >
        {(nodeProps) => (
          <ArborNodeRenderer
            {...nodeProps}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragEnd={handleNodeDragEnd}
            onNodeRename={handleNodeRename}
            showHierarchyLines={showHierarchyLines}
            indentSize={indentSize}
            renderNodeIcon={renderNodeIcon}
            renderNodeExtra={renderNodeExtra}
            renderFoldToggle={renderFoldToggle}
            getNodeContextMenuItems={getNodeContextMenuItems}
            nodeById={index.nodeById}
          />
        )}
      </Tree>
    </div>
  );
});

export default TreeView;
