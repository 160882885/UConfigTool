import type { DragEvent } from 'react';

import type { ConfigFieldType, ConfigFieldValue } from '../../../../../shared/contracts';

import {
  getArrayDraftFromValue,
  isFloatType,
  isIntType,
  isValidFloatInput,
  isValidIntegerInput
} from '../fieldUtils';

interface ConfigFieldArrayEditorProps {
  pathKey: string;
  arrayListKey: string;
  path: string[];
  fieldType: ConfigFieldType;
  arrayValues: Array<string | boolean>;
  isBoolArray: boolean;
  dragOverArrayListKey: string | null;
  dragOverArrayIndex: number | null;
  dragOverArrayPosition: 'before' | 'after' | null;
  readValue: (path: string[]) => unknown;
  writeValue: (path: string[], nextValue: ConfigFieldValue) => void;
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
}

function ConfigFieldArrayEditor({
  pathKey,
  arrayListKey,
  path,
  fieldType,
  arrayValues,
  isBoolArray,
  dragOverArrayListKey,
  dragOverArrayIndex,
  dragOverArrayPosition,
  readValue,
  writeValue,
  onArrayItemDragOver,
  onArrayItemDragStart,
  onArrayDragEnd,
  onReorderArrayItems
}: ConfigFieldArrayEditorProps) {
  return (
    <div className="custom-array-list">
      {arrayValues.map((item, index) => (
        <div
          key={`${pathKey}-${index}`}
          className={`custom-array-item${
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
              arrayValues,
              (next) => {
                writeValue(path, next as string[] | boolean[]);
              },
              event
            );
          }}
        >
          <button
            type="button"
            className="custom-array-drag-handle"
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
          {isBoolArray ? (
            <label className="custom-checkbox-wrap">
              <input
                type="checkbox"
                checked={Boolean(item)}
                onChange={(event) => {
                  const next = getArrayDraftFromValue(readValue(path), true);
                  next[index] = event.currentTarget.checked;
                  writeValue(path, next as boolean[]);
                }}
              />
              <span>{`数组项 ${index + 1}`}</span>
            </label>
          ) : (
            <input
              className="custom-input"
              type={isIntType(fieldType) || isFloatType(fieldType) ? 'number' : 'text'}
              step={isFloatType(fieldType) ? 'any' : undefined}
              value={String(item ?? '')}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                if (isIntType(fieldType) && !isValidIntegerInput(nextValue)) {
                  return;
                }
                if (isFloatType(fieldType) && !isValidFloatInput(nextValue)) {
                  return;
                }
                const next = getArrayDraftFromValue(readValue(path), false);
                next[index] = nextValue;
                writeValue(path, next as string[]);
              }}
            />
          )}
          <button
            type="button"
            className="custom-btn danger custom-array-remove-btn"
            onClick={() => {
              const next = getArrayDraftFromValue(readValue(path), isBoolArray);
              next.splice(index, 1);
              writeValue(path, next as string[] | boolean[]);
            }}
          >
            删除
          </button>
        </div>
      ))}
      <button
        type="button"
        className="custom-btn"
        onClick={() => {
          const next = getArrayDraftFromValue(readValue(path), isBoolArray);
          next.push(isBoolArray ? false : '');
          writeValue(path, next as string[] | boolean[]);
        }}
      >
        添加一项
      </button>
    </div>
  );
}

export default ConfigFieldArrayEditor;
