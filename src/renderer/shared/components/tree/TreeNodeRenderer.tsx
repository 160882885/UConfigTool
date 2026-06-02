import { useEffect, useRef } from 'react';

import type { NodeRendererProps } from 'react-arborist';

import type { ArborNodeData, NodeRendererExtras, TreeNodeRenderContext } from './treeTypes';

function TreeNodeRenderer<TData>(props: NodeRendererProps<ArborNodeData<TData>> & NodeRendererExtras<TData>) {
  const { node, style, dragHandle, disableRename, onNodeDragStart, onNodeDragEnd, renderNodeIcon, renderNodeExtra } = props;

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

  return (
    <div
      ref={node.isEditing ? undefined : dragHandle}
      style={style}
      className={`tree-row-content${node.isSelected ? ' selected' : ''}`}
      onDragStart={() => {
        onNodeDragStart?.(node);
      }}
      onDragEnd={() => {
        onNodeDragEnd?.(node);
      }}
    >
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
}

export default TreeNodeRenderer;
