import type { ReactNode } from 'react';

import type { ConfigFieldDef } from '../../../../../shared/contracts';

type TableFieldLayer = {
  nodeId: string;
  nodeName: string;
  fields: ConfigFieldDef[];
};

interface TableDataEditorProps {
  selectedNodeDisplayName: string;
  selectedTypeNodeId?: string;
  fieldsForSelectedTable: ConfigFieldDef[];
  fieldsForSelectedTableLayers: TableFieldLayer[];
  renderConfigFieldEditor: (field: ConfigFieldDef, path: string[]) => ReactNode;
}

function TableDataEditor({
  selectedNodeDisplayName,
  selectedTypeNodeId,
  fieldsForSelectedTable,
  fieldsForSelectedTableLayers,
  renderConfigFieldEditor
}: TableDataEditorProps) {
  return (
    <div className="custom-prop-form">
      <div className="custom-prop-row custom-prop-header-row">
        <div className="custom-prop-label-row">
          <span className="custom-prop-label">{selectedNodeDisplayName}</span>
        </div>
      </div>
      {fieldsForSelectedTable.length === 0 ? (
        <div className="custom-prop-empty-inline">{'所属配置类型未配置字段。'}</div>
      ) : (
        <div className="custom-config-fields">
          {fieldsForSelectedTableLayers.map((layer) => (
            <div key={layer.nodeId} className="custom-inherit-layer-block">
              <div className="custom-inherit-layer-title">
                {`${layer.nodeId === selectedTypeNodeId ? '当前层' : '继承层'}: ${layer.nodeName}`}
              </div>
              {layer.fields.length === 0 ? (
                <div className="custom-prop-empty-inline">{'该层没有字段。'}</div>
              ) : (
                <div className="custom-config-fields">
                  {layer.fields.map((field) => renderConfigFieldEditor(field, [field.id]))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TableDataEditor;
