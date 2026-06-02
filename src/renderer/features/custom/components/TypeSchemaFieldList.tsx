import type { DragEvent } from 'react';

import type { ConfigFieldDef, ConfigFieldType } from '../../../../../shared/contracts';

import { FIELD_TYPE_OPTIONS } from '../constants';
import { isEnumFieldType, isNestedFieldType } from '../fieldUtils';

type NodeOption = {
  id: string;
  name: string;
};

interface TypeSchemaFieldListProps {
  fields: ConfigFieldDef[];
  nestedTypeCandidates: NodeOption[];
  enumTypeCandidates: NodeOption[];
  dragOverFieldId: string | null;
  dragOverPosition: 'before' | 'after' | null;
  onAddField: () => void;
  onRemoveField: (fieldId: string) => void;
  onUpdateField: (fieldId: string, updater: (field: ConfigFieldDef) => ConfigFieldDef) => void;
  onFieldDragOver: (fieldId: string, event: DragEvent<HTMLDivElement>) => void;
  onFieldDrop: (fieldId: string, event: DragEvent<HTMLDivElement>) => void;
  onFieldDragStart: (fieldId: string, event: DragEvent<HTMLButtonElement>) => void;
  onFieldDragEnd: () => void;
}

function TypeSchemaFieldList({
  fields,
  nestedTypeCandidates,
  enumTypeCandidates,
  dragOverFieldId,
  dragOverPosition,
  onAddField,
  onRemoveField,
  onUpdateField,
  onFieldDragOver,
  onFieldDrop,
  onFieldDragStart,
  onFieldDragEnd
}: TypeSchemaFieldListProps) {
  return (
    <>
      <div className="custom-prop-row custom-prop-header-row">
        <div className="custom-prop-label-row">
          <span className="custom-prop-label">字段列表</span>
          <button type="button" className="custom-btn" onClick={onAddField}>
            添加字段
          </button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="custom-prop-empty-inline">暂无字段，请先添加字段。</div>
      ) : (
        <div className="custom-field-list">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className={`custom-field-card${dragOverFieldId === field.id && dragOverPosition ? ` drag-over-${dragOverPosition}` : ''}`}
              onDragOver={(event) => {
                onFieldDragOver(field.id, event);
              }}
              onDrop={(event) => {
                onFieldDrop(field.id, event);
              }}
            >
              <div className="custom-field-card-head">
                <button
                  type="button"
                  className="custom-field-drag-handle"
                  draggable
                  onDragStart={(event) => {
                    onFieldDragStart(field.id, event);
                  }}
                  onDragEnd={onFieldDragEnd}
                  aria-label="拖拽调整字段顺序"
                  title="拖拽调整字段顺序"
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
                      onRemoveField(field.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="custom-field-grid">
                <div className="custom-field-cell">
                  <label className="custom-prop-label">标签(tag)</label>
                  <input
                    className="custom-input"
                    value={field.tag}
                    onChange={(event) => {
                      const nextTag = event.currentTarget.value;
                      onUpdateField(field.id, (previous) => ({ ...previous, tag: nextTag }));
                    }}
                  />
                </div>

                <div className="custom-field-cell">
                  <label className="custom-prop-label">字段名(fieldName)</label>
                  <input
                    className="custom-input"
                    value={field.fieldName}
                    onChange={(event) => {
                      const nextFieldName = event.currentTarget.value;
                      onUpdateField(field.id, (previous) => ({ ...previous, fieldName: nextFieldName }));
                    }}
                  />
                </div>

                <div className="custom-field-cell">
                  <label className="custom-prop-label">字段类型</label>
                  <select
                    className="custom-select"
                    value={field.type}
                    onChange={(event) => {
                      const nextType = event.currentTarget.value as ConfigFieldType;
                      onUpdateField(field.id, (previous) => ({
                        ...previous,
                        type: nextType,
                        nestedTypeId: isNestedFieldType(nextType) ? previous.nestedTypeId : undefined,
                        enumTypeNodeId: isEnumFieldType(nextType) ? previous.enumTypeNodeId : undefined
                      }));
                    }}
                  >
                    {FIELD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {isNestedFieldType(field.type) ? (
                  <div className="custom-field-cell">
                    <label className="custom-prop-label">嵌套类型</label>
                    <select
                      className="custom-select"
                      value={field.nestedTypeId ?? ''}
                      onChange={(event) => {
                        const nextNestedTypeId = event.currentTarget.value || undefined;
                        onUpdateField(field.id, (previous) => ({
                          ...previous,
                          nestedTypeId: nextNestedTypeId
                        }));
                      }}
                    >
                      <option value="">请选择</option>
                      {nestedTypeCandidates.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {isEnumFieldType(field.type) ? (
                  <div className="custom-field-cell">
                    <label className="custom-prop-label">枚举类型</label>
                    <select
                      className="custom-select"
                      value={field.enumTypeNodeId ?? ''}
                      onChange={(event) => {
                        const nextEnumTypeNodeId = event.currentTarget.value || undefined;
                        onUpdateField(field.id, (previous) => ({
                          ...previous,
                          enumTypeNodeId: nextEnumTypeNodeId
                        }));
                      }}
                    >
                      <option value="">请选择</option>
                      {enumTypeCandidates.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {isEnumFieldType(field.type) && enumTypeCandidates.length === 0 ? (
                  <div className="custom-prop-empty-inline">暂无可选枚举类型，请先创建枚举节点。</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default TypeSchemaFieldList;
