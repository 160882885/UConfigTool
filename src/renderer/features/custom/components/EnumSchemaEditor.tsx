import type { DragEvent } from 'react';

interface EnumItemDraft {
  id: string;
  value: string;
}

interface EnumSchemaEditorProps {
  selectedNodeDisplayName: string;
  classNameDraft: string;
  namespaceDraft: string;
  itemsDraft: EnumItemDraft[];
  enumDraftDirty: boolean;
  isSavingEnumSchema: boolean;
  dragOverArrayListKey: string | null;
  dragOverArrayIndex: number | null;
  dragOverArrayPosition: 'before' | 'after' | null;
  onSave: () => void;
  onClassNameChange: (value: string) => void;
  onNamespaceChange: (value: string) => void;
  onAddEnumItem: () => void;
  onUpdateEnumItem: (itemId: string, value: string) => void;
  onRemoveEnumItem: (itemId: string) => void;
  onArrayItemDragOver: (listKey: string, index: number, event: DragEvent<HTMLDivElement>) => void;
  onArrayItemDragStart: (listKey: string, index: number, event: DragEvent<HTMLButtonElement>) => void;
  onArrayDragEnd: () => void;
  onReorderEnumItems: (index: number, event: DragEvent<HTMLDivElement>) => void;
}

function EnumSchemaEditor({
  selectedNodeDisplayName,
  classNameDraft,
  namespaceDraft,
  itemsDraft,
  enumDraftDirty,
  isSavingEnumSchema,
  dragOverArrayListKey,
  dragOverArrayIndex,
  dragOverArrayPosition,
  onSave,
  onClassNameChange,
  onNamespaceChange,
  onAddEnumItem,
  onUpdateEnumItem,
  onRemoveEnumItem,
  onArrayItemDragOver,
  onArrayItemDragStart,
  onArrayDragEnd,
  onReorderEnumItems
}: EnumSchemaEditorProps) {
  return (
    <div className="custom-prop-form">
      <div className="custom-prop-row custom-prop-header-row">
        <div className="custom-prop-label-row">
          <span className="custom-prop-label">{selectedNodeDisplayName}</span>
          <button type="button" className="custom-btn" onClick={onSave} disabled={!enumDraftDirty || isSavingEnumSchema}>
            {'保存'}
          </button>
        </div>
      </div>
      <div className="custom-prop-row">
        <label className="custom-prop-label">{'枚举名'}</label>
        <input
          className="custom-input"
          value={classNameDraft}
          onChange={(event) => {
            onClassNameChange(event.currentTarget.value);
          }}
        />
      </div>
      <div className="custom-prop-row">
        <label className="custom-prop-label">{'命名空间'}</label>
        <input
          className="custom-input"
          value={namespaceDraft}
          onChange={(event) => {
            onNamespaceChange(event.currentTarget.value);
          }}
        />
      </div>
      <div className="custom-prop-row custom-prop-header-row">
        <div className="custom-prop-label-row">
          <span className="custom-prop-label">{'枚举项列表'}</span>
          <button type="button" className="custom-btn" onClick={onAddEnumItem}>
            {'添加项'}
          </button>
        </div>
      </div>
      {itemsDraft.length === 0 ? (
        <div className="custom-prop-empty-inline">{'当前枚举还没有任何项。'}</div>
      ) : (
        <div className="custom-field-list">
          {itemsDraft.map((item, index) => (
            <div
              key={item.id}
              className={`custom-field-card custom-enum-item-card${
                dragOverArrayListKey === '__enum_items__' && dragOverArrayIndex === index && dragOverArrayPosition
                  ? ` drag-over-${dragOverArrayPosition}`
                  : ''
              }`}
              onDragOver={(event) => {
                onArrayItemDragOver('__enum_items__', index, event);
              }}
              onDrop={(event) => {
                onReorderEnumItems(index, event);
              }}
            >
              <div className="custom-field-card-head">
                <button
                  type="button"
                  className="custom-field-drag-handle"
                  draggable
                  onDragStart={(event) => {
                    onArrayItemDragStart('__enum_items__', index, event);
                  }}
                  onDragEnd={onArrayDragEnd}
                  aria-label={'拖拽调整枚举项顺序'}
                  title={'拖拽调整枚举项顺序'}
                >
                  <svg className="custom-drag-glyph" viewBox="0 0 12 12" aria-hidden>
                    <rect x="1" y="2" width="10" height="1.5" rx="0.75" />
                    <rect x="1" y="5.25" width="10" height="1.5" rx="0.75" />
                    <rect x="1" y="8.5" width="10" height="1.5" rx="0.75" />
                  </svg>
                </button>
                <span className="custom-field-index">#{index + 1}</span>
                <div className="custom-field-actions">
                  <button
                    type="button"
                    className="custom-btn danger"
                    onClick={() => {
                      onRemoveEnumItem(item.id);
                    }}
                  >
                    {'删除'}
                  </button>
                </div>
              </div>
              <div className="custom-field-grid custom-field-grid-single">
                <div className="custom-field-cell">
                  <input
                    className="custom-input"
                    value={item.value}
                    onChange={(event) => {
                      onUpdateEnumItem(item.id, event.currentTarget.value);
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default EnumSchemaEditor;
