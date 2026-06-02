import type { DragEvent } from 'react';

import type { ConfigFieldDef } from '../../../../../shared/contracts';

import type { SchemaDraft } from '../types';
import TypeInheritanceSelector from './TypeInheritanceSelector';
import TypeSchemaFieldList from './TypeSchemaFieldList';

type NodeOption = {
  id: string;
  name: string;
};

interface TypeSchemaEditorProps {
  selectedNodeDisplayName: string;
  draft: SchemaDraft;
  isSavingSchema: boolean;
  selectedBaseTypeName: string;
  isBaseTypeDropdownOpen: boolean;
  baseTypeKeyword: string;
  filteredInheritanceCandidates: NodeOption[];
  nestedTypeCandidates: NodeOption[];
  enumTypeCandidates: NodeOption[];
  dragOverFieldId: string | null;
  dragOverPosition: 'before' | 'after' | null;
  onSave: () => void;
  onClassNameChange: (value: string) => void;
  onNamespaceChange: (value: string) => void;
  onToggleBaseTypeDropdown: () => void;
  onBaseTypeKeywordChange: (value: string) => void;
  onSelectBaseType: (nodeId?: string) => void;
  onExportAsTableListChange: (checked: boolean) => void;
  onExportTableListFileNameChange: (value: string) => void;
  onAddSchemaField: () => void;
  onRemoveSchemaField: (fieldId: string) => void;
  onUpdateSchemaField: (fieldId: string, updater: (field: ConfigFieldDef) => ConfigFieldDef) => void;
  onFieldDragOver: (fieldId: string, event: DragEvent<HTMLDivElement>) => void;
  onFieldDrop: (fieldId: string, event: DragEvent<HTMLDivElement>) => void;
  onFieldDragStart: (fieldId: string, event: DragEvent<HTMLButtonElement>) => void;
  onFieldDragEnd: () => void;
}

function TypeSchemaEditor({
  selectedNodeDisplayName,
  draft,
  isSavingSchema,
  selectedBaseTypeName,
  isBaseTypeDropdownOpen,
  baseTypeKeyword,
  filteredInheritanceCandidates,
  nestedTypeCandidates,
  enumTypeCandidates,
  dragOverFieldId,
  dragOverPosition,
  onSave,
  onClassNameChange,
  onNamespaceChange,
  onToggleBaseTypeDropdown,
  onBaseTypeKeywordChange,
  onSelectBaseType,
  onExportAsTableListChange,
  onExportTableListFileNameChange,
  onAddSchemaField,
  onRemoveSchemaField,
  onUpdateSchemaField,
  onFieldDragOver,
  onFieldDrop,
  onFieldDragStart,
  onFieldDragEnd
}: TypeSchemaEditorProps) {
  return (
    <div className="custom-prop-form">
      <div className="custom-prop-row custom-prop-header-row">
        <div className="custom-prop-label-row">
          <span className="custom-prop-label">{selectedNodeDisplayName}</span>
          <button type="button" className="custom-btn" onClick={onSave} disabled={!draft.dirty || isSavingSchema}>
            保存
          </button>
        </div>
      </div>

      <div className="custom-prop-row">
        <label className="custom-prop-label">类名</label>
        <input
          className="custom-input"
          value={draft.className}
          onChange={(event) => {
            onClassNameChange(event.currentTarget.value);
          }}
        />
      </div>

      <div className="custom-prop-row">
        <label className="custom-prop-label">命名空间</label>
        <input
          className="custom-input"
          value={draft.namespace}
          onChange={(event) => {
            onNamespaceChange(event.currentTarget.value);
          }}
        />
      </div>

      <TypeInheritanceSelector
        selectedBaseTypeName={selectedBaseTypeName}
        isOpen={isBaseTypeDropdownOpen}
        keyword={baseTypeKeyword}
        candidates={filteredInheritanceCandidates}
        onToggle={onToggleBaseTypeDropdown}
        onKeywordChange={onBaseTypeKeywordChange}
        onSelect={onSelectBaseType}
      />

      <div className="custom-prop-row custom-prop-header-row">
        <div className="custom-prop-label-row">
          <span className="custom-prop-label">列表导出</span>
        </div>
      </div>

      <div className="custom-prop-row">
        <label className="custom-checkbox-wrap">
          <input
            type="checkbox"
            checked={draft.exportAsTableList}
            onChange={(event) => {
              onExportAsTableListChange(event.currentTarget.checked);
            }}
          />
          <span>启用合并列表 JSON 导出</span>
        </label>
      </div>

      <div className="custom-prop-row">
        <label className="custom-prop-label">导出文件名</label>
        <input
          className="custom-input"
          value={draft.exportTableListFileName}
          placeholder="留空则默认使用配置类型名称"
          onChange={(event) => {
            onExportTableListFileNameChange(event.currentTarget.value);
          }}
        />
      </div>

      <TypeSchemaFieldList
        fields={draft.fields}
        nestedTypeCandidates={nestedTypeCandidates}
        enumTypeCandidates={enumTypeCandidates}
        dragOverFieldId={dragOverFieldId}
        dragOverPosition={dragOverPosition}
        onAddField={onAddSchemaField}
        onRemoveField={onRemoveSchemaField}
        onUpdateField={onUpdateSchemaField}
        onFieldDragOver={onFieldDragOver}
        onFieldDrop={onFieldDrop}
        onFieldDragStart={onFieldDragStart}
        onFieldDragEnd={onFieldDragEnd}
      />
    </div>
  );
}

export default TypeSchemaEditor;
