import type { DragEvent, ReactNode } from 'react';

import type {
  ConfigEnumSchemaRecord,
  ConfigFieldDef,
  ConfigFieldValue,
  ConfigTypeSchemaRecord
} from '../../../../../shared/contracts';

import {
  formatConfigFieldTitle,
  getArrayDraftFromValue,
  getValueByPath,
  isArrayFieldType,
  isNestedFieldType,
  normalizeFieldValue,
  setValueByPath
} from '../fieldUtils';
import { buildTypeSchemaLayers } from '../runtime';
import type { ConfigNodeModel } from '../types';
import ConfigFieldArrayEditor from './ConfigFieldArrayEditor';
import ConfigFieldScalarInput from './ConfigFieldScalarInput';
import NestedConfigFieldArrayEditor from './NestedConfigFieldArrayEditor';

type ReadValue = (path: string[]) => unknown;
type WriteValue = (path: string[], nextValue: ConfigFieldValue) => void;

interface ConfigFieldEditorProps {
  field: ConfigFieldDef;
  path: string[];
  nodeMap: Map<string, ConfigNodeModel>;
  typeSchemaByNodeId: Map<string, ConfigTypeSchemaRecord>;
  enumSchemaByNodeId: Map<string, ConfigEnumSchemaRecord>;
  dragOverArrayListKey: string | null;
  dragOverArrayIndex: number | null;
  dragOverArrayPosition: 'before' | 'after' | null;
  readValue: ReadValue;
  writeValue: WriteValue;
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
  visitedNestedTypeIds?: Set<string>;
  scopePath?: string;
}

function renderFieldContainer(title: string, body: ReactNode, pathKey: string) {
  return (
    <div key={pathKey} className="custom-config-field vertical">
      <div className="custom-config-field-head">
        <div className="custom-config-field-title">{title}</div>
      </div>
      {body}
    </div>
  );
}

function ConfigFieldEditor({
  field,
  path,
  nodeMap,
  typeSchemaByNodeId,
  enumSchemaByNodeId,
  dragOverArrayListKey,
  dragOverArrayIndex,
  dragOverArrayPosition,
  readValue,
  writeValue,
  onArrayItemDragOver,
  onArrayItemDragStart,
  onArrayDragEnd,
  onReorderArrayItems,
  visitedNestedTypeIds = new Set(),
  scopePath = '__root__'
}: ConfigFieldEditorProps) {
  const pathKey = path.join('/');
  const title = formatConfigFieldTitle(field);
  const arrayListKey = `${scopePath}:${pathKey}`;
  const raw = readValue(path);
  const value = normalizeFieldValue(field.type, raw);
  const isArray = isArrayFieldType(field.type);
  const isBoolArray = field.type === 'bool_array';

  if (isNestedFieldType(field.type)) {
    const nestedTypeId = typeof field.nestedTypeId === 'string' ? field.nestedTypeId : '';
    const nestedSchema = nestedTypeId ? typeSchemaByNodeId.get(nestedTypeId) ?? null : null;
    const nestedLayers = nestedTypeId ? buildTypeSchemaLayers(nestedTypeId, nodeMap, typeSchemaByNodeId) : [];
    const nestedFields = nestedLayers.flatMap((layer) => layer.schema.fields);

    if (!nestedTypeId) {
      return renderFieldContainer(title, <div className="custom-prop-empty-inline">{'未关联嵌套配置类型。'}</div>, pathKey);
    }

    if (visitedNestedTypeIds.has(nestedTypeId)) {
      return renderFieldContainer(title, <div className="custom-prop-empty-inline">{'检测到循环嵌套，已停止展开。'}</div>, pathKey);
    }

    if (!nestedSchema || nestedFields.length === 0) {
      return renderFieldContainer(title, <div className="custom-prop-empty-inline">{'嵌套配置类型未配置字段。'}</div>, pathKey);
    }

    const nextVisited = new Set(visitedNestedTypeIds);
    for (const layer of nestedLayers) {
      nextVisited.add(layer.nodeId);
    }

    if (field.type === 'nested_array') {
      const nestedItems = Array.isArray(value) ? (value as Record<string, ConfigFieldValue>[]) : [];

      return renderFieldContainer(
        title,
        <NestedConfigFieldArrayEditor
          pathKey={pathKey}
          arrayListKey={arrayListKey}
          nestedFields={nestedFields}
          nestedItems={nestedItems}
          dragOverArrayListKey={dragOverArrayListKey}
          dragOverArrayIndex={dragOverArrayIndex}
          dragOverArrayPosition={dragOverArrayPosition}
          onArrayItemDragOver={onArrayItemDragOver}
          onArrayItemDragStart={onArrayItemDragStart}
          onArrayDragEnd={onArrayDragEnd}
          onReorderArrayItems={onReorderArrayItems}
          onCommitReorder={(next) => {
            writeValue(path, next);
          }}
          onRemoveItem={(index) => {
            const nextItems = [...nestedItems];
            nextItems.splice(index, 1);
            writeValue(path, nextItems);
          }}
          onAddItem={() => {
            const nextItem = nestedFields.reduce<Record<string, ConfigFieldValue>>((acc, nestedField) => {
              acc[nestedField.id] = normalizeFieldValue(nestedField.type, undefined);
              return acc;
            }, {});
            writeValue(path, [...nestedItems, nextItem]);
          }}
          renderNestedField={(nestedField, index, item) => (
            <ConfigFieldEditor
              key={`${pathKey}-nested-field-${nestedField.id}-${index}`}
              field={nestedField}
              path={[nestedField.id]}
              nodeMap={nodeMap}
              typeSchemaByNodeId={typeSchemaByNodeId}
              enumSchemaByNodeId={enumSchemaByNodeId}
              dragOverArrayListKey={dragOverArrayListKey}
              dragOverArrayIndex={dragOverArrayIndex}
              dragOverArrayPosition={dragOverArrayPosition}
              visitedNestedTypeIds={nextVisited}
              readValue={(nestedPath) => getValueByPath(item, nestedPath)}
              writeValue={(nestedPath, nextNestedValue) => {
                const nextItem = setValueByPath(item, nestedPath, nextNestedValue);
                const nextItems = [...nestedItems];
                nextItems[index] = nextItem;
                writeValue(path, nextItems);
              }}
              scopePath={`${arrayListKey}[${index}]`}
              onArrayItemDragOver={onArrayItemDragOver}
              onArrayItemDragStart={onArrayItemDragStart}
              onArrayDragEnd={onArrayDragEnd}
              onReorderArrayItems={onReorderArrayItems}
            />
          )}
        />,
        pathKey
      );
    }

    return renderFieldContainer(
      title,
      <div className="custom-config-fields">
        {nestedFields.map((nestedField) => (
          <ConfigFieldEditor
            key={`${pathKey}-field-${nestedField.id}`}
            field={nestedField}
            path={[...path, nestedField.id]}
            nodeMap={nodeMap}
            typeSchemaByNodeId={typeSchemaByNodeId}
            enumSchemaByNodeId={enumSchemaByNodeId}
            dragOverArrayListKey={dragOverArrayListKey}
            dragOverArrayIndex={dragOverArrayIndex}
            dragOverArrayPosition={dragOverArrayPosition}
            visitedNestedTypeIds={nextVisited}
            readValue={readValue}
            writeValue={writeValue}
            scopePath={scopePath}
            onArrayItemDragOver={onArrayItemDragOver}
            onArrayItemDragStart={onArrayItemDragStart}
            onArrayDragEnd={onArrayDragEnd}
            onReorderArrayItems={onReorderArrayItems}
          />
        ))}
      </div>,
      pathKey
    );
  }

  if (isArray) {
    const arrayValues = getArrayDraftFromValue(value, isBoolArray) as Array<string | boolean>;
    return renderFieldContainer(
      title,
      <div className="custom-config-field-input-wrap">
        <ConfigFieldArrayEditor
          pathKey={pathKey}
          arrayListKey={arrayListKey}
          path={path}
          fieldType={field.type}
          arrayValues={arrayValues}
          isBoolArray={isBoolArray}
          dragOverArrayListKey={dragOverArrayListKey}
          dragOverArrayIndex={dragOverArrayIndex}
          dragOverArrayPosition={dragOverArrayPosition}
          readValue={readValue}
          writeValue={writeValue}
          onArrayItemDragOver={onArrayItemDragOver}
          onArrayItemDragStart={onArrayItemDragStart}
          onArrayDragEnd={onArrayDragEnd}
          onReorderArrayItems={onReorderArrayItems}
        />
      </div>,
      pathKey
    );
  }

  return renderFieldContainer(
    title,
    <div className="custom-config-field-input-wrap">
      <ConfigFieldScalarInput
        field={field}
        value={value}
        path={path}
        enumSchemaByNodeId={enumSchemaByNodeId}
        writeValue={writeValue}
      />
    </div>,
    pathKey
  );
}

export default ConfigFieldEditor;
