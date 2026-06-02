import type { MouseEvent } from 'react';

import type { NodeApi, RowRendererProps } from 'react-arborist';

import type { ArborNodeData } from './treeTypes';

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
      if (node.isSelected) {
        node.deselect();
      } else {
        node.selectMulti();
      }
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

export default TreeRow;
