import type { MouseEvent, ReactNode } from 'react';

import type { NodeApi } from 'react-arborist';

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

export interface ArborNodeData<TData> {
  id: string;
  label: string;
  source: GenericTreeNode<TData>;
  children?: Array<ArborNodeData<TData>>;
}

export interface DragSession<TData> {
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

export interface TreeIndex<TData> {
  nodeById: Map<string, GenericTreeNode<TData>>;
  childrenByParent: Map<string | null, string[]>;
  siblingIndexById: Map<string, number>;
  roots: string[];
}

export interface TreeViewProps<TData> {
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

export interface NodeRendererExtras<TData> {
  disableRename: boolean;
  onNodeDragStart?: (node: NodeApi<ArborNodeData<TData>>) => void;
  onNodeDragEnd?: (node: NodeApi<ArborNodeData<TData>>) => void;
  renderNodeIcon?: (node: GenericTreeNode<TData>, context: TreeNodeRenderContext) => ReactNode;
  renderNodeExtra?: (node: GenericTreeNode<TData>, context: TreeNodeRenderContext) => ReactNode;
}
