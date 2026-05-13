import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type {
  ConfigFieldDef,
  ConfigFieldType,
  ConfigFieldValue,
  ConfigStoreSnapshot,
  ConfigTableRecord,
  ConfigTypeRecord,
  ExportLanguage
} from '../../../../shared/contracts';
import { appBridge } from '../../shared/api/appBridge';
import type { ContextMenuItem } from '../../shared/components/context-menu/ContextMenu';
import ConfirmDialog from '../../shared/components/dialog/ConfirmDialog';
import SplitWorkspace from '../../shared/components/SplitWorkspace';
import TreeView, { type TreeNodeContextMenuHelpers, type TreeNodeItem } from '../../shared/components/tree/TreeView';

type NodeMeta =
  | {
      kind: 'group';
      typeId: string;
    }
  | {
      kind: 'config';
      typeId: string;
      tableId: string;
    };

type SchemaDraft = {
  typeId: string;
  name: string;
  className: string;
  namespace: string;
  fields: ConfigFieldDef[];
  dirty: boolean;
};

type PendingNodeSwitch = {
  nextNodeId: string | null;
};

type PendingDelete = {
  meta: NodeMeta;
  message: string;
};

const FIELD_TYPE_OPTIONS: Array<{ value: ConfigFieldType; label: string }> = [
  { value: 'int', label: 'int' },
  { value: 'float', label: 'float' },
  { value: 'string', label: 'string' },
  { value: 'bool', label: 'bool' },
  { value: 'nested', label: '嵌套配置类型' },
  { value: 'int_array', label: 'int数组' },
  { value: 'float_array', label: 'float数组' },
  { value: 'string_array', label: 'string数组' },
  { value: 'bool_array', label: 'bool数组' }
];

const DEFAULT_TYPE_NAME = '新配置类型';
const DEFAULT_TABLE_NAME = '新配置表';
const EXPORT_LANGUAGE_OPTIONS: Array<{ key: ExportLanguage; label: string }> = [
  { key: 'csharp', label: 'c#' },
  { key: 'lua', label: 'lua' }
];

function makeTypeNodeId(typeId: string): string {
  return `type:${typeId}`;
}

function makeTableNodeId(typeId: string, tableId: string): string {
  return `table:${typeId}:${tableId}`;
}

function parseNodeId(nodeId: string): NodeMeta | null {
  if (nodeId.startsWith('type:')) {
    return {
      kind: 'group',
      typeId: nodeId.slice('type:'.length)
    };
  }

  if (nodeId.startsWith('table:')) {
    const body = nodeId.slice('table:'.length);
    const firstColon = body.indexOf(':');
    if (firstColon <= 0 || firstColon >= body.length - 1) {
      return null;
    }
    const typeId = body.slice(0, firstColon);
    const tableId = body.slice(firstColon + 1);
    return {
      kind: 'config',
      typeId,
      tableId
    };
  }

  return null;
}

function isArrayFieldType(type: ConfigFieldType): boolean {
  return type === 'int_array' || type === 'float_array' || type === 'string_array' || type === 'bool_array';
}

function isIntType(type: ConfigFieldType): boolean {
  return type === 'int' || type === 'int_array';
}

function isFloatType(type: ConfigFieldType): boolean {
  return type === 'float' || type === 'float_array';
}

function isValidIntegerInput(value: string): boolean {
  return /^-?\d*$/.test(value);
}

function isValidFloatInput(value: string): boolean {
  return /^-?\d*(\.\d*)?$/.test(value);
}

function normalizeFieldValue(type: ConfigFieldType, value: unknown): ConfigFieldValue {
  if (type === 'nested') {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, ConfigFieldValue>;
    }
    return {};
  }
  if (type === 'bool') {
    return typeof value === 'boolean' ? value : false;
  }
  if (type === 'bool_array') {
    return Array.isArray(value) ? value.map((item) => Boolean(item)) : [];
  }
  if (isArrayFieldType(type)) {
    return Array.isArray(value) ? value.map((item) => String(item ?? '')) : [];
  }
  return typeof value === 'string' ? value : String(value ?? '');
}

function getArrayDraft(values: Record<string, ConfigFieldValue>, fieldId: string, boolArray: boolean): Array<string | boolean> {
  const raw = values[fieldId];
  if (!Array.isArray(raw)) {
    return [];
  }
  if (boolArray) {
    return raw.map((item) => Boolean(item));
  }
  return raw.map((item) => String(item ?? ''));
}

function getArrayDraftFromValue(value: unknown, boolArray: boolean): Array<string | boolean> {
  if (!Array.isArray(value)) {
    return [];
  }
  if (boolArray) {
    return value.map((item) => Boolean(item));
  }
  return value.map((item) => String(item ?? ''));
}

function cloneFields(fields: ConfigFieldDef[]): ConfigFieldDef[] {
  return fields.map((field) => ({ ...field }));
}

function normalizeDraftField(field: Partial<ConfigFieldDef>, index: number): ConfigFieldDef {
  const fieldType = FIELD_TYPE_OPTIONS.some((option) => option.value === field.type) ? (field.type as ConfigFieldType) : 'string';
  const nestedTypeId = typeof field.nestedTypeId === 'string' ? field.nestedTypeId.trim() : '';
  return {
    id: typeof field.id === 'string' && field.id.trim() ? field.id : `field_invalid_${index + 1}`,
    tag: typeof field.tag === 'string' ? field.tag : '',
    fieldName: typeof field.fieldName === 'string' ? field.fieldName : '',
    type: fieldType,
    nestedTypeId: fieldType === 'nested' ? nestedTypeId || undefined : undefined
  };
}

function normalizeSchemaDraftRuntime(draft: SchemaDraft): SchemaDraft {
  const normalizedFields = Array.isArray(draft.fields)
    ? draft.fields.map((field, index) => normalizeDraftField(field as Partial<ConfigFieldDef>, index))
    : [];
  return {
    typeId: typeof draft.typeId === 'string' ? draft.typeId : '',
    name: typeof draft.name === 'string' ? draft.name : '',
    className: typeof draft.className === 'string' ? draft.className : '',
    namespace: typeof draft.namespace === 'string' ? draft.namespace : '',
    fields: normalizedFields,
    dirty: Boolean(draft.dirty)
  };
}

function formatConfigFieldTitle(field: ConfigFieldDef): string {
  const tag = field.tag.trim();
  const fieldName = field.fieldName.trim();
  if (tag && fieldName) {
    return `${tag}(${fieldName})`;
  }
  if (tag) {
    return tag;
  }
  if (fieldName) {
    return `(${fieldName})`;
  }
  return '未命名字段';
}

function isRecord(value: unknown): value is Record<string, ConfigFieldValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getValueByPath(root: Record<string, ConfigFieldValue>, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor;
}

function setValueByPath(
  root: Record<string, ConfigFieldValue>,
  path: string[],
  nextValue: ConfigFieldValue
): Record<string, ConfigFieldValue> {
  if (path.length === 0) {
    return root;
  }

  const nextRoot: Record<string, ConfigFieldValue> = { ...root };
  let cursor: Record<string, ConfigFieldValue> = nextRoot;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const existing = cursor[key];
    const nextChild: Record<string, ConfigFieldValue> = isRecord(existing) ? { ...existing } : {};
    cursor[key] = nextChild;
    cursor = nextChild;
  }

  cursor[path[path.length - 1]] = nextValue;
  return nextRoot;
}

function buildExpandedIds(nodes: TreeNodeItem[]): string[] {
  return nodes.filter((node) => node.parentId === null).map((node) => node.id);
}

function findNewTypeId(previous: ConfigStoreSnapshot, next: ConfigStoreSnapshot): string | null {
  const existing = new Set(previous.types.map((item) => item.id));
  const created = next.types.find((item) => !existing.has(item.id));
  return created?.id ?? null;
}

function findNewTableId(previousType: ConfigTypeRecord | null, nextType: ConfigTypeRecord | null): string | null {
  if (!nextType) {
    return null;
  }
  const existing = new Set((previousType?.tables ?? []).map((item) => item.id));
  const created = nextType.tables.find((item) => !existing.has(item.id));
  return created?.id ?? null;
}

function buildTreeSnapshot(snapshot: ConfigStoreSnapshot): {
  nodes: TreeNodeItem[];
  metaByNodeId: Map<string, NodeMeta>;
} {
  const nodes: TreeNodeItem[] = [];
  const metaByNodeId = new Map<string, NodeMeta>();

  for (let typeIndex = 0; typeIndex < snapshot.types.length; typeIndex++) {
    const type = snapshot.types[typeIndex];
    const typeNodeId = makeTypeNodeId(type.id);

    nodes.push({
      id: typeNodeId,
      parentId: null,
      name: type.name,
      order: typeIndex,
      canDrag: true,
      canReparent: false
    });

    metaByNodeId.set(typeNodeId, {
      kind: 'group',
      typeId: type.id
    });

    for (let tableIndex = 0; tableIndex < type.tables.length; tableIndex++) {
      const table = type.tables[tableIndex];
      const tableNodeId = makeTableNodeId(type.id, table.id);

      nodes.push({
        id: tableNodeId,
        parentId: typeNodeId,
        name: table.name,
        order: tableIndex,
        canDrag: true,
        canReparent: false
      });

      metaByNodeId.set(tableNodeId, {
        kind: 'config',
        typeId: type.id,
        tableId: table.id
      });
    }
  }

  return {
    nodes,
    metaByNodeId
  };
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder = ''
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      className="custom-textarea custom-textarea-autogrow"
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function CustomPage() {
  const [snapshot, setSnapshot] = useState<ConfigStoreSnapshot>({ types: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [collapsedFields, setCollapsedFields] = useState<Record<string, boolean>>({});
  const [fieldSeed, setFieldSeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingSchema, setIsSavingSchema] = useState(false);
  const [schemaDraft, setSchemaDraft] = useState<SchemaDraft | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTypeSelection, setExportTypeSelection] = useState<Record<string, boolean>>({});
  const [exportLanguageSelection, setExportLanguageSelection] = useState<Record<ExportLanguage, boolean>>({
    csharp: true,
    lua: true
  });
  const [isExporting, setIsExporting] = useState(false);
  const [pendingNodeSwitch, setPendingNodeSwitch] = useState<PendingNodeSwitch | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const tableSaveSequenceRef = useRef(0);

  const typeById = useMemo(() => {
    const map = new Map<string, ConfigTypeRecord>();
    for (const type of snapshot.types) {
      map.set(type.id, type);
    }
    return map;
  }, [snapshot]);

  const tableByTypeAndId = useMemo(() => {
    const map = new Map<string, ConfigTableRecord>();
    for (const type of snapshot.types) {
      for (const table of type.tables) {
        map.set(`${type.id}::${table.id}`, table);
      }
    }
    return map;
  }, [snapshot]);

  const treeSnapshot = useMemo(() => buildTreeSnapshot(snapshot), [snapshot]);
  const nodes = treeSnapshot.nodes;
  const metaByNodeId = treeSnapshot.metaByNodeId;
  const expandedIds = useMemo(() => buildExpandedIds(nodes), [nodes]);

  const selectedMeta = selectedNodeId ? metaByNodeId.get(selectedNodeId) ?? parseNodeId(selectedNodeId) : null;

  const selectedType = useMemo(() => {
    if (!selectedMeta) {
      return null;
    }
    return typeById.get(selectedMeta.typeId) ?? null;
  }, [selectedMeta, typeById]);

  const selectedTable = useMemo(() => {
    if (!selectedMeta || selectedMeta.kind !== 'config') {
      return null;
    }
    return tableByTypeAndId.get(`${selectedMeta.typeId}::${selectedMeta.tableId}`) ?? null;
  }, [selectedMeta, tableByTypeAndId]);

  const canAddConfig = selectedMeta?.kind === 'group';

  const loadSnapshot = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = await appBridge.getConfigStoreSnapshot();
      setSnapshot(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '加载配置数据失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, []);

  useEffect(() => {
    if (!selectedMeta || selectedMeta.kind !== 'group' || !selectedType) {
      setSchemaDraft(null);
      return;
    }

    setSchemaDraft((previous) => {
      if (previous && previous.typeId === selectedType.id) {
        return previous;
      }
      return {
        typeId: selectedType.id,
        name: selectedType.name,
        className: selectedType.className,
        namespace: selectedType.namespace,
        fields: cloneFields(selectedType.fields),
        dirty: false
      };
    });
  }, [selectedMeta, selectedType]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }
    if (!metaByNodeId.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [metaByNodeId, selectedNodeId]);

  useEffect(() => {
    setExportTypeSelection((previous) => {
      const next: Record<string, boolean> = {};
      for (const type of snapshot.types) {
        next[type.id] = previous[type.id] ?? true;
      }
      return next;
    });
  }, [snapshot.types]);

  const persistSnapshot = (next: ConfigStoreSnapshot) => {
    setSnapshot(next);
    setErrorMessage(null);
  };

  const withStoreAction = async (action: () => Promise<ConfigStoreSnapshot>) => {
    try {
      const next = await action();
      persistSnapshot(next);
      return next;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '操作失败。');
      return null;
    }
  };

  const openExportModal = () => {
    setShowExportModal(true);
  };

  const closeExportModal = () => {
    if (isExporting) {
      return;
    }
    setShowExportModal(false);
  };

  const toggleExportType = (typeId: string) => {
    setExportTypeSelection((previous) => ({
      ...previous,
      [typeId]: !previous[typeId]
    }));
  };

  const toggleExportLanguage = (language: ExportLanguage) => {
    setExportLanguageSelection((previous) => ({
      ...previous,
      [language]: !previous[language]
    }));
  };

  const submitExport = async () => {
    const selectedTypeIds = snapshot.types.filter((type) => exportTypeSelection[type.id]).map((type) => type.id);
    const selectedLanguages = EXPORT_LANGUAGE_OPTIONS.filter((option) => exportLanguageSelection[option.key]).map((option) => option.key);

    if (selectedLanguages.length === 0) {
      window.alert('请至少选择一种导出语言。');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);
    try {
      const result = await appBridge.exportConfigs({
        selectedTypeIds,
        selectedLanguages
      });

      if (!result) {
        return;
      }
      setShowExportModal(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导出失败。');
    } finally {
      setIsExporting(false);
    }
  };

  const addGroup = async () => {
    const previous = snapshot;
    const result = await withStoreAction(() => appBridge.createConfigType({ name: DEFAULT_TYPE_NAME }));
    if (!result) {
      return;
    }

    const createdTypeId = findNewTypeId(previous, result);
    if (createdTypeId) {
      setSelectedNodeId(makeTypeNodeId(createdTypeId));
    }
  };

  const addConfig = async (targetTypeId?: string) => {
    const typeId = targetTypeId ?? (selectedMeta?.kind === 'group' ? selectedMeta.typeId : null);
    if (!typeId) {
      window.alert('请先选中一个配置类型。');
      return;
    }

    const previousType = typeById.get(typeId) ?? null;
    const result = await withStoreAction(() =>
      appBridge.createConfigTable({
        typeId,
        name: DEFAULT_TABLE_NAME
      })
    );
    if (!result) {
      return;
    }

    const nextType = result.types.find((item) => item.id === typeId) ?? null;
    const createdTableId = findNewTableId(previousType, nextType);
    if (createdTableId) {
      setSelectedNodeId(makeTableNodeId(typeId, createdTableId));
    }
  };

  const openDeleteConfirmByMeta = (meta: NodeMeta) => {
    const type = typeById.get(meta.typeId);
    if (!type) {
      setErrorMessage('未找到目标配置类型。');
      return;
    }

    const table = meta.kind === 'config' ? tableByTypeAndId.get(`${meta.typeId}::${meta.tableId}`) ?? null : null;
    if (meta.kind === 'config' && !table) {
      setErrorMessage('未找到目标配置表。');
      return;
    }

    const message =
      meta.kind === 'group'
        ? `确认删除配置类型“${type.name}”吗？\n该类型下所有配置表会一并删除。`
        : `确认删除配置表“${table?.name ?? ''}”吗？`;

    setPendingDelete({
      meta,
      message
    });
  };

  const removeSelected = async () => {
    if (!selectedMeta) {
      window.alert('请先选中要删除的配置类型或配置表。');
      return;
    }

    openDeleteConfirmByMeta(selectedMeta);
  };

  const updateTypeDraft = (updater: (draft: SchemaDraft) => SchemaDraft) => {
    setSchemaDraft((previous) => {
      if (!previous) {
        return previous;
      }
      let next: SchemaDraft;
      try {
        next = updater(normalizeSchemaDraftRuntime(previous));
      } catch {
        return normalizeSchemaDraftRuntime(previous);
      }
      const normalizedNext = normalizeSchemaDraftRuntime(next);
      return {
        ...normalizedNext,
        dirty: true
      };
    });
  };

  const saveTypeSchema = async (draftOverride?: SchemaDraft): Promise<boolean> => {
    const draftToSave = draftOverride ? normalizeSchemaDraftRuntime(draftOverride) : schemaDraft ? normalizeSchemaDraftRuntime(schemaDraft) : null;
    if (!draftToSave) {
      return true;
    }

    setIsSavingSchema(true);
    try {
      const result = await appBridge.saveConfigTypeSchema({
        typeId: draftToSave.typeId,
        name: draftToSave.name,
        className: draftToSave.className,
        namespace: draftToSave.namespace,
        fields: draftToSave.fields
      });

      persistSnapshot(result);

      const savedType = result.types.find((item) => item.id === draftToSave.typeId);
      if (savedType) {
        setSchemaDraft({
          typeId: savedType.id,
          name: savedType.name,
          className: savedType.className,
          namespace: savedType.namespace,
          fields: cloneFields(savedType.fields),
          dirty: false
        });
      }
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存字段失败。');
      return false;
    } finally {
      setIsSavingSchema(false);
    }
  };

  const updateSnapshotTableOptimistic = (
    typeId: string,
    tableId: string,
    updater: (table: ConfigTableRecord, type: ConfigTypeRecord) => ConfigTableRecord
  ): { table: ConfigTableRecord; type: ConfigTypeRecord } | null => {
    let changedTable: ConfigTableRecord | null = null;
    let changedType: ConfigTypeRecord | null = null;

    setSnapshot((previous) => {
      const nextTypes = previous.types.map((type) => {
        if (type.id !== typeId) {
          return type;
        }

        const nextTables = type.tables.map((table) => {
          if (table.id !== tableId) {
            return table;
          }
          const nextTable = updater(table, type);
          changedTable = nextTable;
          return nextTable;
        });

        const nextType = {
          ...type,
          tables: nextTables
        };

        changedType = nextType;
        return nextType;
      });

      return {
        types: nextTypes
      };
    });

    if (!changedTable || !changedType) {
      return null;
    }

    return {
      table: changedTable,
      type: changedType
    };
  };

  const persistTableChange = async (type: ConfigTypeRecord, table: ConfigTableRecord) => {
    const requestId = ++tableSaveSequenceRef.current;

    try {
      const result = await appBridge.saveConfigTable({
        typeId: type.id,
        tableId: table.id,
        name: table.name,
        values: table.values
      });

      if (requestId === tableSaveSequenceRef.current) {
        persistSnapshot(result);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存配置表失败。');
      void loadSnapshot();
    }
  };

  const updateSelectedTable = (updater: (table: ConfigTableRecord, type: ConfigTypeRecord) => ConfigTableRecord) => {
    if (!selectedMeta || selectedMeta.kind !== 'config') {
      return;
    }

    const updated = updateSnapshotTableOptimistic(selectedMeta.typeId, selectedMeta.tableId, updater);
    if (!updated) {
      return;
    }

    void persistTableChange(updated.type, updated.table);
  };

  const updateSelectedTableValueAtPath = (path: string[], nextValue: ConfigFieldValue) => {
    updateSelectedTable((table) => ({
      ...table,
      values: setValueByPath(table.values, path, nextValue)
    }));
  };

  const getFieldCollapseKey = (configNodeId: string, fieldPath: string) => `${configNodeId}::${fieldPath}`;

  const renderConfigFieldEditor = (
    field: ConfigFieldDef,
    path: string[],
    depth: number,
    visitedTypeIds: Set<string>
  ) => {
    const rawValue = selectedTable ? getValueByPath(selectedTable.values, path) : undefined;
    const value = normalizeFieldValue(field.type, rawValue);
    const isArrayType = isArrayFieldType(field.type);
    const isBoolArrayType = field.type === 'bool_array';
    const arrayValues: Array<string | boolean> = isArrayType ? getArrayDraftFromValue(value, isBoolArrayType) : [];
    const pathKey = path.join('/');
    const collapseKey = getFieldCollapseKey(selectedNodeId ?? '', pathKey);
    const isCollapsed = collapsedFields[collapseKey] === true;
    const nestedTypeId = field.nestedTypeId ?? '';
    const nestedType = nestedTypeId ? typeById.get(nestedTypeId) ?? null : null;
    const nestedVisited = new Set(visitedTypeIds);

    return (
      <div key={pathKey} className="custom-config-field vertical" style={{ marginLeft: depth > 0 ? 12 : 0 }}>
        <div className="custom-config-field-head">
          <button
            type="button"
            className="custom-field-toggle"
            aria-label={isCollapsed ? '展开字段' : '折叠字段'}
            onClick={() => {
              setCollapsedFields((previous) => ({
                ...previous,
                [collapseKey]: !isCollapsed
              }));
            }}
          >
            <span className={`custom-field-toggle-glyph${isCollapsed ? '' : ' open'}`} />
          </button>
          <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
        </div>

        {!isCollapsed ? (
          <div className="custom-config-field-input-wrap">
            {field.type === 'nested' ? (
              !nestedTypeId ? (
                <div className="custom-prop-empty-inline">请先在配置类型中为该字段选择嵌套配置类型。</div>
              ) : !nestedType ? (
                <div className="custom-prop-empty-inline">嵌套配置类型不存在，字段已失效。</div>
              ) : visitedTypeIds.has(nestedType.id) ? (
                <div className="custom-prop-empty-inline">检测到循环嵌套，已停止继续展开。</div>
              ) : nestedType.fields.length === 0 ? (
                <div className="custom-prop-empty-inline">嵌套配置类型暂无字段。</div>
              ) : (
                <div className="custom-config-fields">
                  {(() => {
                    nestedVisited.add(nestedType.id);
                    return nestedType.fields.map((nestedField) =>
                      renderConfigFieldEditor(nestedField, [...path, nestedField.id], depth + 1, nestedVisited)
                    );
                  })()}
                </div>
              )
            ) : field.type === 'bool' ? (
              <label className="custom-checkbox-wrap">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => {
                    updateSelectedTableValueAtPath(path, event.currentTarget.checked);
                  }}
                />
                <span>布尔值</span>
              </label>
            ) : isArrayType ? (
              <div className="custom-array-list">
                {arrayValues.length === 0 ? <div className="custom-prop-empty-inline">暂无元素，请添加。</div> : null}

                {arrayValues.map((item, index) => (
                  <div key={`${pathKey}-item-${index}`} className="custom-array-item">
                    {isBoolArrayType ? (
                      <label className="custom-checkbox-wrap">
                        <input
                          type="checkbox"
                          checked={Boolean(item)}
                          onChange={(event) => {
                            const current = getArrayDraftFromValue(getValueByPath(selectedTable?.values ?? {}, path), true);
                            current[index] = event.currentTarget.checked;
                            updateSelectedTableValueAtPath(path, current as boolean[]);
                          }}
                        />
                        <span>元素{index + 1}</span>
                      </label>
                    ) : (
                      <input
                        className="custom-input"
                        type={isIntType(field.type) || isFloatType(field.type) ? 'number' : 'text'}
                        step={isFloatType(field.type) ? 'any' : undefined}
                        value={String(item ?? '')}
                        placeholder={`元素${index + 1}`}
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          if (isIntType(field.type) && !isValidIntegerInput(nextValue)) {
                            return;
                          }
                          if (isFloatType(field.type) && !isValidFloatInput(nextValue)) {
                            return;
                          }
                          const current = getArrayDraftFromValue(getValueByPath(selectedTable?.values ?? {}, path), false);
                          current[index] = nextValue;
                          updateSelectedTableValueAtPath(path, current as string[]);
                        }}
                      />
                    )}

                    <button
                      type="button"
                      className="custom-btn danger"
                      onClick={() => {
                        const current = getArrayDraftFromValue(getValueByPath(selectedTable?.values ?? {}, path), isBoolArrayType);
                        current.splice(index, 1);
                        updateSelectedTableValueAtPath(path, (isBoolArrayType ? (current as boolean[]) : (current as string[])) as ConfigFieldValue);
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
                    const current = getArrayDraftFromValue(getValueByPath(selectedTable?.values ?? {}, path), isBoolArrayType);
                    current.push(isBoolArrayType ? false : '');
                    updateSelectedTableValueAtPath(path, (isBoolArrayType ? (current as boolean[]) : (current as string[])) as ConfigFieldValue);
                  }}
                >
                  添加元素
                </button>
              </div>
            ) : field.type === 'string' ? (
              <AutoGrowTextarea
                value={String(value)}
                placeholder="请输入值"
                onChange={(nextValue) => {
                  updateSelectedTableValueAtPath(path, nextValue);
                }}
              />
            ) : (
              <input
                className="custom-input"
                type={isIntType(field.type) || isFloatType(field.type) ? 'number' : 'text'}
                step={isFloatType(field.type) ? 'any' : undefined}
                value={String(value)}
                placeholder="请输入值"
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  if (isIntType(field.type) && !isValidIntegerInput(nextValue)) {
                    return;
                  }
                  if (isFloatType(field.type) && !isValidFloatInput(nextValue)) {
                    return;
                  }
                  updateSelectedTableValueAtPath(path, nextValue);
                }}
              />
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderConfigIcon = (node: TreeNodeItem) => {
    const meta = metaByNodeId.get(node.id);
    if (meta?.kind === 'group') {
      return (
        <span className="tree-icon-glyph folder">
          <span className="folder-lip" />
        </span>
      );
    }
    return (
      <span className="tree-icon-glyph file">
        <span className="file-corner" />
        <span className="file-line file-line-1" />
        <span className="file-line file-line-2" />
        <span className="file-line file-line-3" />
      </span>
    );
  };

  const getTreeNodeContextMenuItems = (node: TreeNodeItem, helpers: TreeNodeContextMenuHelpers): ContextMenuItem[] => {
    const isSelected = selectedNodeId === node.id;
    return [
      {
        key: 'rename',
        label: '重命名',
        disabled: !isSelected,
        onSelect: () => {
          if (!isSelected) {
            return;
          }
          setSelectedNodeId(node.id);
          helpers.beginRename();
        }
      }
    ];
  };

  const selectedTypeDraft =
    selectedMeta?.kind === 'group' && schemaDraft && schemaDraft.typeId === selectedMeta.typeId ? schemaDraft : null;

  const fieldsForSelectedTable = selectedType?.fields ?? [];
  const selectedNodeDisplayName =
    selectedMeta?.kind === 'group'
      ? selectedType?.name ?? '未命名节点'
      : selectedMeta?.kind === 'config'
        ? selectedTable?.name ?? '未命名节点'
        : '未命名节点';

  const handleNodeSelectionChange = (nextNodeId: string | null) => {
    if (nextNodeId === selectedNodeId) {
      return;
    }

    const isDirtyTypeDraft =
      selectedMeta?.kind === 'group' && schemaDraft && schemaDraft.typeId === selectedMeta.typeId && schemaDraft.dirty;

    if (!isDirtyTypeDraft) {
      setSelectedNodeId(nextNodeId);
      return;
    }

    setPendingNodeSwitch({ nextNodeId });
  };

  const confirmNodeSwitchSave = async () => {
    if (!pendingNodeSwitch) {
      return;
    }
    const draftAtConfirm = schemaDraft ? normalizeSchemaDraftRuntime(schemaDraft) : null;
    const saved = await saveTypeSchema(draftAtConfirm ?? undefined);
    if (!saved) {
      return;
    }
    setPendingNodeSwitch(null);
    setSelectedNodeId(pendingNodeSwitch.nextNodeId);
  };

  const confirmNodeSwitchDiscard = () => {
    if (!pendingNodeSwitch) {
      return;
    }
    setPendingNodeSwitch(null);
    setSelectedNodeId(pendingNodeSwitch.nextNodeId);
  };

  const cancelNodeSwitch = () => {
    setPendingNodeSwitch(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }

    const { meta } = pendingDelete;
    setPendingDelete(null);

    const result =
      meta.kind === 'group'
        ? await withStoreAction(() => appBridge.deleteConfigType({ typeId: meta.typeId }))
        : await withStoreAction(() =>
            appBridge.deleteConfigTable({
              typeId: meta.typeId,
              tableId: meta.tableId
            })
          );

    if (!result) {
      return;
    }

    setSelectedNodeId(null);
    setSchemaDraft(null);
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  return (
    <section className="panel tool-panel">
      <header className="panel-head">
        <h1 className="title">配置管理</h1>
        {/*<p className="subtitle">配置管理</p>*/}
      </header>

      <SplitWorkspace
        className="custom-layout"
        left={
          <section className="custom-pane custom-pane-left">
            <div className="custom-pane-head">
              <h2 className="custom-pane-title">配置列表</h2>
            </div>

            <div className="custom-toolbar">
              <button type="button" className="custom-btn" onClick={() => void addGroup()}>
                添加配置表类型
              </button>
              <button type="button" className="custom-btn" onClick={() => void addConfig()} disabled={!canAddConfig}>
                添加配置表
              </button>
              <button type="button" className="custom-btn" onClick={openExportModal}>
                导出
              </button>
              <button type="button" className="custom-btn danger" onClick={() => void removeSelected()}>
                删除
              </button>
            </div>

            <div className="custom-tree-shell">
              <TreeView
                nodes={nodes}
                onFocusedNodeChange={(node) => {
                  void handleNodeSelectionChange(node?.id ?? null);
                }}
                onRenameComplete={(event) => {
                  const meta = metaByNodeId.get(event.nodeId);
                  if (!meta) {
                    return;
                  }

                  if (meta.kind === 'group') {
                    const currentType = typeById.get(meta.typeId);
                    if (!currentType) {
                      return;
                    }

                    void (async () => {
                      const nextSnapshot = await withStoreAction(() =>
                        appBridge.saveConfigTypeSchema({
                          typeId: currentType.id,
                          name: event.nextName,
                          className: currentType.className,
                          namespace: currentType.namespace,
                          fields: currentType.fields
                        })
                      );

                      if (!nextSnapshot) {
                        return;
                      }

                      const nextType = nextSnapshot.types.find((item) => item.id === currentType.id);
                      if (!nextType) {
                        return;
                      }

                      setSchemaDraft({
                        typeId: nextType.id,
                        name: nextType.name,
                        className: nextType.className,
                        namespace: nextType.namespace,
                        fields: cloneFields(nextType.fields),
                        dirty: false
                      });
                    })();
                    return;
                  }

                  const currentType = typeById.get(meta.typeId);
                  const currentTable = tableByTypeAndId.get(`${meta.typeId}::${meta.tableId}`);
                  if (!currentType || !currentTable) {
                    return;
                  }

                  const nextTable: ConfigTableRecord = {
                    ...currentTable,
                    name: event.nextName
                  };

                  setSnapshot((previous) => ({
                    types: previous.types.map((type) =>
                      type.id !== currentType.id
                        ? type
                        : {
                            ...type,
                            tables: type.tables.map((table) =>
                              table.id !== currentTable.id
                                ? table
                                : {
                                    ...table,
                                    name: event.nextName
                                  }
                            )
                          }
                    )
                  }));
                  void persistTableChange(currentType, nextTable);
                }}
                allowReparent={false}
                defaultExpandedIds={expandedIds}
                renderNodeIcon={renderConfigIcon}
                getNodeContextMenuItems={getTreeNodeContextMenuItems}
              />
            </div>
          </section>
        }
        right={
          <section className="custom-pane custom-pane-right">
            <div className="custom-pane-head">
              <h2 className="custom-pane-title">属性</h2>
            </div>

            {loading ? (
              <div className="custom-prop-empty">正在加载配置数据...</div>
            ) : errorMessage ? (
              <div className="custom-prop-empty">{errorMessage}</div>
            ) : !selectedMeta || !selectedType ? (
              <div className="custom-prop-empty">请选择左侧节点后编辑属性。</div>
            ) : selectedMeta.kind === 'group' ? (
              <div className="custom-prop-form">
                <div className="custom-prop-row custom-prop-header-row">
                  <div className="custom-prop-label-row">
                    <span className="custom-prop-label">{selectedNodeDisplayName}</span>
                    <button
                      type="button"
                      className="custom-btn"
                      onClick={() => void saveTypeSchema()}
                      disabled={!selectedTypeDraft || !selectedTypeDraft.dirty || isSavingSchema}
                    >
                      保存
                    </button>
                  </div>
                </div>

                <div className="custom-prop-row">
                  <label className="custom-prop-label" htmlFor="prop-group-class-name">
                    类名
                  </label>
                  <input
                    id="prop-group-class-name"
                    className="custom-input"
                    value={selectedTypeDraft?.className ?? selectedType.className}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (!selectedTypeDraft) {
                        return;
                      }
                      updateTypeDraft((draft) => ({
                        ...draft,
                        className: value
                      }));
                    }}
                  />
                </div>

                <div className="custom-prop-row">
                  <label className="custom-prop-label" htmlFor="prop-group-namespace">
                    命名空间
                  </label>
                  <input
                    id="prop-group-namespace"
                    className="custom-input"
                    value={selectedTypeDraft?.namespace ?? selectedType.namespace}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (!selectedTypeDraft) {
                        return;
                      }
                      updateTypeDraft((draft) => ({
                        ...draft,
                        namespace: value
                      }));
                    }}
                  />
                </div>

                <div className="custom-prop-row">
                  <div className="custom-prop-label-row">
                    <label className="custom-prop-label">配置结构字段</label>
                    <div className="custom-toolbar">
                      <button
                        type="button"
                        className="custom-btn"
                        onClick={() => {
                          if (!selectedTypeDraft) {
                            return;
                          }
                          updateTypeDraft((draft) => {
                            const nextField: ConfigFieldDef = {
                              id: `field-${Date.now()}-${fieldSeed}`,
                              tag: `字段${fieldSeed}`,
                              fieldName: `field_${fieldSeed}`,
                              type: 'string'
                            };
                            setFieldSeed((previous) => previous + 1);
                            return {
                              ...draft,
                              fields: [...draft.fields, nextField]
                            };
                          });
                        }}
                      >
                        添加字段
                      </button>
                    </div>
                  </div>

                  <div className="custom-field-list">
                    {(selectedTypeDraft?.fields.length ?? 0) === 0 ? (
                      <div className="custom-prop-empty-inline">暂无字段，请添加。</div>
                    ) : null}

                    {selectedTypeDraft?.fields.map((field) => (
                      <div key={field.id} className="custom-field-card">
                        <div className="custom-field-grid">
                          <label className="custom-field-cell">
                            <span className="custom-prop-label">Tag名</span>
                            <input
                              className="custom-input"
                              value={field.tag}
                              onChange={(event) => {
                                if (!selectedTypeDraft) {
                                  return;
                                }
                                updateTypeDraft((draft) => ({
                                  ...draft,
                                  fields: draft.fields.map((item) =>
                                    item.id === field.id
                                      ? {
                                          ...item,
                                          tag: event.currentTarget.value
                                        }
                                      : item
                                  )
                                }));
                              }}
                            />
                          </label>

                          <label className="custom-field-cell">
                            <span className="custom-prop-label">字段名</span>
                            <input
                              className="custom-input"
                              value={field.fieldName}
                              onChange={(event) => {
                                if (!selectedTypeDraft) {
                                  return;
                                }
                                updateTypeDraft((draft) => ({
                                  ...draft,
                                  fields: draft.fields.map((item) =>
                                    item.id === field.id
                                      ? {
                                          ...item,
                                          fieldName: event.currentTarget.value
                                        }
                                      : item
                                  )
                                }));
                              }}
                            />
                          </label>

                          <label className="custom-field-cell">
                            <span className="custom-prop-label">字段类型</span>
                            <select
                              className="custom-select"
                              value={field.type}
                              onChange={(event) => {
                                const value = event.currentTarget.value as ConfigFieldType;
                                if (!selectedTypeDraft) {
                                  return;
                                }
                                updateTypeDraft((draft) => ({
                                  ...draft,
                                  fields: draft.fields.map((item) =>
                                    item.id === field.id
                                      ? {
                                          ...item,
                                          type: value,
                                          nestedTypeId: value === 'nested' ? item.nestedTypeId : undefined
                                        }
                                      : item
                                  )
                                }));
                              }}
                            >
                              {FIELD_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          {field.type === 'nested' ? (
                            <label className="custom-field-cell">
                              <span className="custom-prop-label">嵌套配置类型</span>
                              <select
                                className="custom-select"
                                value={field.nestedTypeId ?? ''}
                                onChange={(event) => {
                                  if (!selectedTypeDraft) {
                                    return;
                                  }
                                  const nextNestedTypeId = event.currentTarget.value || undefined;
                                  updateTypeDraft((draft) => ({
                                    ...draft,
                                    fields: draft.fields.map((item) =>
                                      item.id === field.id
                                        ? {
                                            ...item,
                                            nestedTypeId: nextNestedTypeId
                                          }
                                        : item
                                    )
                                  }));
                                }}
                              >
                                <option value="">请选择配置类型</option>
                                {snapshot.types
                                  .filter((type) => type.id !== selectedType.id)
                                  .map((type) => (
                                    <option key={type.id} value={type.id}>
                                      {type.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          ) : null}
                        </div>

                        <div className="custom-field-actions">
                          <button
                            type="button"
                            className="custom-btn danger"
                            onClick={() => {
                              if (!selectedTypeDraft) {
                                return;
                              }
                              updateTypeDraft((draft) => ({
                                ...draft,
                                fields: draft.fields.filter((item) => item.id !== field.id)
                              }));
                            }}
                          >
                            删除字段
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : !selectedTable ? (
              <div className="custom-prop-empty">未找到当前配置表。</div>
            ) : (
              <div className="custom-prop-form">
                <div className="custom-prop-row custom-prop-header-row">
                  <div className="custom-prop-label-row">
                    <span className="custom-prop-label">{selectedNodeDisplayName}</span>
                  </div>
                </div>

                {fieldsForSelectedTable.length === 0 ? (
                  <div className="custom-prop-empty-inline">所属配置类型未配置字段。</div>
                ) : (
                  <div className="custom-config-fields">
                    {fieldsForSelectedTable.map((field) => renderConfigFieldEditor(field, [field.id], 0, new Set([selectedType.id])))}
                  </div>
                )}
              </div>
            )}
          </section>
        }
      />

      {showExportModal ? (
        <div className="custom-export-modal-mask" onClick={closeExportModal}>
          <div
            className="custom-export-modal"
            role="dialog"
            aria-modal="true"
            aria-label="导出设置"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="custom-export-head">
              <h3 className="custom-export-title">导出设置</h3>
            </div>

            <div className="custom-export-body">
              <section className="custom-export-section">
                <h4 className="custom-export-section-title">配置类型（控制配置表JSON导出）</h4>
                <div className="custom-export-list">
                  {snapshot.types.length === 0 ? (
                    <div className="custom-prop-empty-inline">暂无配置类型。</div>
                  ) : (
                    snapshot.types.map((type) => (
                      <label key={type.id} className="custom-export-item">
                        <input
                          type="checkbox"
                          checked={Boolean(exportTypeSelection[type.id])}
                          onChange={() => toggleExportType(type.id)}
                        />
                        <span>{type.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </section>

              <section className="custom-export-section">
                <h4 className="custom-export-section-title">编程语言（控制类型脚本导出）</h4>
                <div className="custom-export-list">
                  {EXPORT_LANGUAGE_OPTIONS.map((language) => (
                    <label key={language.key} className="custom-export-item">
                      <input
                        type="checkbox"
                        checked={Boolean(exportLanguageSelection[language.key])}
                        onChange={() => toggleExportLanguage(language.key)}
                      />
                      <span>{language.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <div className="custom-export-actions">
              <button type="button" className="custom-btn" onClick={closeExportModal} disabled={isExporting}>
                取消
              </button>
              <button type="button" className="custom-btn" onClick={() => void submitExport()} disabled={isExporting}>
                {isExporting ? '导出中...' : '导出'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingNodeSwitch)}
        title="未保存修改"
        message="当前配置类型有未保存修改，是否保存后再切换节点？"
        cancelText="取消"
        altText="不保存"
        altDanger
        confirmText={isSavingSchema ? '保存中...' : '保存并切换'}
        busy={isSavingSchema}
        onCancel={cancelNodeSwitch}
        onAlt={confirmNodeSwitchDiscard}
        onConfirm={() => {
          void confirmNodeSwitchSave();
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除确认"
        message={pendingDelete?.message ?? ''}
        cancelText="取消"
        confirmText="确认删除"
        onCancel={cancelDelete}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}

export default CustomPage;
