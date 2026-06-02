import type { DragEvent, ReactNode } from 'react';

import type { ConfigFieldDef, ConfigFieldValue } from '../../../../../shared/contracts';

interface NestedConfigFieldArrayEditorProps {
  pathKey: string;
  arrayListKey: string;
  nestedFields: ConfigFieldDef[];
  nestedItems: Array<Record<string, ConfigFieldValue>>;
  dragOverArrayListKey: string | null;
  dragOverArrayIndex: number | null;
  dragOverArrayPosition: 'before' | 'after' | null;
  onArrayItemDragOver: (listKey: string, index: number, event: DragEvent<HTMLDivElement>) => void;
  onArrayItemDragStart: (listKey: string, index: number, event: DragEvent<HTMLButtonElement>) => void;
  onArrayDragEnd: () => void;
  onReorderArrayItems: <T>(
    listKey: string,
    targetIndex: number,
    items: T[],
    commit: (next: T[]) => void,
    event?: DragEvent<HTMLElement>
  ) => void;
  onCommitReorder: (next: Array<Record<string, ConfigFieldValue>>) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: () => void;
  renderNestedField: (nestedField: ConfigFieldDef, index: number, item: Record<string, ConfigFieldValue>) => ReactNode;
}

function NestedConfigFieldArrayEditor({
  pathKey,
  arrayListKey,
  nestedFields,
  nestedItems,
  dragOverArrayListKey,
  dragOverArrayIndex,
  dragOverArrayPosition,
  onArrayItemDragOver,
  onArrayItemDragStart,
  onArrayDragEnd,
  onReorderArrayItems,
  onCommitReorder,
  onRemoveItem,
  onAddItem,
  renderNestedField
}: NestedConfigFieldArrayEditorProps) {
  return (
    <div className="custom-array-list">
      {nestedItems.map((item, index) => (
        <div
          key={`${pathKey}-nested-${index}`}
          className={`custom-array-item custom-array-item-nested${
            dragOverArrayListKey === arrayListKey && dragOverArrayIndex === index && dragOverArrayPosition
              ? ` drag-over-${dragOverArrayPosition}`
              : ''
          }`}
          onDragOver={(event) => {
            onArrayItemDragOver(arrayListKey, index, event);
          }}
          onDrop={(event) => {
            onReorderArrayItems(
              arrayListKey,
              index,
              nestedItems,
              (next) => {
                onCommitReorder(next as Array<Record<string, ConfigFieldValue>>);
              },
              event
            );
          }}
        >
          <button
            type="button"
            className="custom-array-drag-handle custom-nested-array-drag-handle"
            draggable
            onDragStart={(event) => {
              onArrayItemDragStart(arrayListKey, index, event);
            }}
            onDragEnd={onArrayDragEnd}
            aria-label="拖拽调整顺序"
            title="拖拽调整顺序"
          >
            <svg className="custom-drag-glyph" viewBox="0 0 12 12" aria-hidden>
              <rect x="1" y="2" width="10" height="1.5" rx="0.75" />
              <rect x="1" y="5.25" width="10" height="1.5" rx="0.75" />
              <rect x="1" y="8.5" width="10" height="1.5" rx="0.75" />
            </svg>
          </button>
          <button
            type="button"
            className="custom-btn danger custom-array-remove-btn custom-nested-array-remove-btn"
            onClick={() => {
              onRemoveItem(index);
            }}
          >
            删除
          </button>
          <div className="custom-config-fields custom-nested-array-fields">
            {nestedFields.map((nestedField) => renderNestedField(nestedField, index, item))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="custom-btn"
        onClick={onAddItem}
      >
        添加一项
      </button>
    </div>
  );
}

export default NestedConfigFieldArrayEditor;
