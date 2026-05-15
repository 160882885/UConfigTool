import { useEffect, useMemo, useRef, useState } from 'react';

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
import TreeView, {
  type TreeDragEndEvent,
  type TreeNodeContextMenuHelpers,
  type TreeNodeItem
} from '../../shared/components/tree/TreeView';

import AutoGrowTextarea from './components/AutoGrowTextarea';
import ExportConfigModal from './components/ExportConfigModal';
import { DEFAULT_TABLE_NAME, DEFAULT_TYPE_NAME, EXPORT_LANGUAGE_OPTIONS, FIELD_TYPE_OPTIONS } from './constants';
import {
  cloneFields,
  formatConfigFieldTitle,
  getArrayDraftFromValue,
  getValueByPath,
  isArrayFieldType,
  isFloatType,
  isIntType,
  isValidFloatInput,
  isValidIntegerInput,
  normalizeFieldValue,
  normalizeSchemaDraftRuntime,
  setValueByPath
} from './fieldUtils';
import {
  applyTreeOrderToSnapshot,
  buildExpandedIds,
  buildTreeOrderPayload,
  buildTreeSnapshot,
  findNewTableId,
  findNewTypeId,
  makeTableNodeId,
  makeTypeNodeId,
  parseNodeId
} from './treeModel';
import type { NodeMeta, PendingDelete, PendingNodeSwitch, SchemaDraft, TreeOrderPayload } from './types';

function CustomPage() {
  const [snapshot, setSnapshot] = useState<ConfigStoreSnapshot>({ types: [] });
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [collapsedFields, setCollapsedFields] = useState<Record<string, boolean>>({});
  const [fieldSeed, setFieldSeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingSchema, setIsSavingSchema] = useState(false);
  const [schemaDraft, setSchemaDraft] = useState<SchemaDraft | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [treeSearchKeyword, setTreeSearchKeyword] = useState('');
  const [exportTypeSelection, setExportTypeSelection] = useState<Record<string, boolean>>({});
  const [exportLanguageSelection, setExportLanguageSelection] = useState<Record<ExportLanguage, boolean>>({
    csharp: true,
    lua: true,
    typescript: false,
    python: false,
    java: false,
    go: false,
    cpp: false,
    rust: false
  });
  const [isExporting, setIsExporting] = useState(false);
  const [pendingNodeSwitch, setPendingNodeSwitch] = useState<PendingNodeSwitch | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const tableSaveSequenceRef = useRef(0);
  const treeOrderSaveSequenceRef = useRef(0);
  const treeOrderSignatureRef = useRef('');
  const latestTreeNodesRef = useRef<TreeNodeItem[] | null>(null);
  const arrayDragStateRef = useRef<{ pathKey: string; fromIndex: number } | null>(null);
  const [arrayDragOverKey, setArrayDragOverKey] = useState<string | null>(null);
  const typeFieldDragStateRef = useRef<{ fieldId: string } | null>(null);
  const [typeFieldDragOverKey, setTypeFieldDragOverKey] = useState<string | null>(null);
  const typeFieldListRef = useRef<HTMLDivElement | null>(null);
  const typeFieldAutoScrollRafRef = useRef<number | null>(null);
  const typeFieldAutoScrollVelocityRef = useRef(0);

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
  const normalizedTreeSearchKeyword = treeSearchKeyword.trim().toLowerCase();
  const filteredNodes = useMemo(() => {
    if (!normalizedTreeSearchKeyword) {
      return nodes;
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const visibleNodeIds = new Set<string>();

    for (const node of nodes) {
      if (!node.name.toLowerCase().includes(normalizedTreeSearchKeyword)) {
        continue;
      }

      let cursor: string | null = node.id;
      while (cursor) {
        if (visibleNodeIds.has(cursor)) {
          break;
        }
        visibleNodeIds.add(cursor);
        cursor = nodeById.get(cursor)?.parentId ?? null;
      }
    }

    return nodes.filter((node) => visibleNodeIds.has(node.id));
  }, [nodes, normalizedTreeSearchKeyword]);
  const expandedIds = useMemo(() => buildExpandedIds(filteredNodes), [filteredNodes]);
  const isTreeFiltering = normalizedTreeSearchKeyword.length > 0;

  const selectedNodeId = selectedNodeIds[0] ?? null;
  const selectedMeta = selectedNodeId ? metaByNodeId.get(selectedNodeId) ?? parseNodeId(selectedNodeId) : null;
  const selectedMetas = useMemo(() => {
    return selectedNodeIds
      .map((nodeId) => metaByNodeId.get(nodeId) ?? parseNodeId(nodeId) ?? null)
      .filter((meta): meta is NodeMeta => Boolean(meta));
  }, [metaByNodeId, selectedNodeIds]);
  const hasMultipleSelection = selectedNodeIds.length > 1;

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

  const canAddConfig = !hasMultipleSelection && selectedMeta?.kind === 'group';

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
    setSelectedNodeIds((previous) => previous.filter((nodeId) => metaByNodeId.has(nodeId)));
  }, [metaByNodeId]);

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
      setSelectedNodeIds([makeTypeNodeId(createdTypeId)]);
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
      setSelectedNodeIds([makeTableNodeId(typeId, createdTableId)]);
    }
  };

  const openDeleteConfirmByMetas = (metas: NodeMeta[]) => {
    if (metas.length === 0) {
      return;
    }

    const uniqueByKey = new Map<string, NodeMeta>();
    for (const meta of metas) {
      const key = meta.kind === 'group' ? `group:${meta.typeId}` : `config:${meta.typeId}:${meta.tableId}`;
      if (!uniqueByKey.has(key)) {
        uniqueByKey.set(key, meta);
      }
    }

    const normalized = Array.from(uniqueByKey.values());
    const groups = normalized.filter((meta): meta is NodeMeta & { kind: 'group' } => meta.kind === 'group');
    const groupTypeIds = new Set(groups.map((meta) => meta.typeId));
    const tables = normalized.filter(
      (meta): meta is NodeMeta & { kind: 'config' } => meta.kind === 'config' && !groupTypeIds.has(meta.typeId)
    );

    const missingGroup = groups.find((meta) => !typeById.has(meta.typeId));
    if (missingGroup) {
      setErrorMessage('未找到目标配置类型。');
      return;
    }

    const missingTable = tables.find((meta) => !tableByTypeAndId.has(`${meta.typeId}::${meta.tableId}`));
    if (missingTable) {
      setErrorMessage('未找到目标配置表。');
      return;
    }

    const targetMetas: NodeMeta[] = [...groups, ...tables];
    const message =
      targetMetas.length === 1
        ? targetMetas[0].kind === 'group'
          ? `确认删除配置类型“${typeById.get(targetMetas[0].typeId)?.name ?? ''}”吗？\n该类型下所有配置表会一并删除。`
          : `确认删除配置表“${tableByTypeAndId.get(`${targetMetas[0].typeId}::${targetMetas[0].tableId}`)?.name ?? ''}”吗？`
        : `确认删除已选择的 ${groups.length} 个配置类型和 ${tables.length} 个配置表吗？`;

    setPendingDelete({
      metas: targetMetas,
      message
    });
  };

  const removeSelected = async () => {
    if (selectedMetas.length === 0) {
      window.alert('请先选中要删除的配置类型或配置表。');
      return;
    }

    openDeleteConfirmByMetas(selectedMetas);
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

  const persistTreeOrder = async (payload: TreeOrderPayload) => {
    const requestId = ++treeOrderSaveSequenceRef.current;

    try {
      const result = await appBridge.saveConfigTreeOrder(payload);
      if (requestId === treeOrderSaveSequenceRef.current) {
        persistSnapshot(result);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存配置树顺序失败。');
    }
  };

  const handleTreeNodesChange = (nextNodes: TreeNodeItem[]) => {
    latestTreeNodesRef.current = nextNodes;
    const payload = buildTreeOrderPayload(nextNodes);
    const nextSignature = JSON.stringify({
      typeOrderIds: payload.typeOrderIds,
      tableOrderByType: payload.tableOrderByType
    });
    if (treeOrderSignatureRef.current === nextSignature) {
      return;
    }
    treeOrderSignatureRef.current = nextSignature;
    setSnapshot((previous) => applyTreeOrderToSnapshot(previous, payload));
  };

  const canDropConfigTreeNodes = ({ dragNodeIds, parentId }: { dragNodeIds: string[]; parentId: string | null }) => {
    return dragNodeIds.every((nodeId) => {
      const dragMeta = parseNodeId(nodeId);
      if (!dragMeta) {
        return false;
      }
      if (dragMeta.kind === 'group') {
        return parentId === null;
      }
      const parentMeta = parentId ? parseNodeId(parentId) : null;
      return parentMeta?.kind === 'group' && parentMeta.typeId === dragMeta.typeId;
    });
  };

  const handleTreeDragEnd = (event: TreeDragEndEvent) => {
    if (event.cancelled) {
      return;
    }
    const nodesForPersist = latestTreeNodesRef.current;
    if (!nodesForPersist) {
      return;
    }
    const payload = buildTreeOrderPayload(nodesForPersist);
    void persistTreeOrder(payload);
  };

  useEffect(() => {
    const typeOrderIds = snapshot.types.map((type) => type.id);
    const tableOrderByType: Record<string, string[]> = {};
    for (const type of snapshot.types) {
      tableOrderByType[type.id] = type.tables.map((table) => table.id);
    }
    treeOrderSignatureRef.current = JSON.stringify({
      typeOrderIds,
      tableOrderByType
    });
  }, [snapshot]);

  const moveTypeDraftField = (fromFieldId: string, toFieldId: string, insertAfter: boolean) => {
    updateTypeDraft((draft) => {
      const fromIndex = draft.fields.findIndex((item) => item.id === fromFieldId);
      const toIndex = draft.fields.findIndex((item) => item.id === toFieldId);
      if (fromIndex < 0 || toIndex < 0) {
        return draft;
      }

      let insertIndex = insertAfter ? toIndex + 1 : toIndex;
      if (fromIndex < insertIndex) {
        insertIndex -= 1;
      }
      if (insertIndex === fromIndex) {
        return draft;
      }

      const nextFields = [...draft.fields];
      const [moved] = nextFields.splice(fromIndex, 1);
      nextFields.splice(insertIndex, 0, moved);
      return {
        ...draft,
        fields: nextFields
      };
    });
  };

  const stopTypeFieldAutoScroll = () => {
    if (typeFieldAutoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(typeFieldAutoScrollRafRef.current);
      typeFieldAutoScrollRafRef.current = null;
    }
    typeFieldAutoScrollVelocityRef.current = 0;
  };

  const ensureTypeFieldAutoScroll = () => {
    if (typeFieldAutoScrollRafRef.current !== null) {
      return;
    }

    const tick = () => {
      const container = typeFieldListRef.current;
      const velocity = typeFieldAutoScrollVelocityRef.current;
      if (!container || velocity === 0) {
        typeFieldAutoScrollRafRef.current = null;
        return;
      }

      container.scrollTop += velocity;
      typeFieldAutoScrollRafRef.current = window.requestAnimationFrame(tick);
    };

    typeFieldAutoScrollRafRef.current = window.requestAnimationFrame(tick);
  };

  useEffect(() => {
    return () => {
      stopTypeFieldAutoScroll();
    };
  }, []);

  const moveSelectedTableArrayItemAtPath = (
    path: string[],
    fromIndex: number,
    toIndex: number,
    boolArray: boolean,
    insertAfter: boolean
  ) => {
    updateSelectedTable((table) => {
      const current = getArrayDraftFromValue(getValueByPath(table.values, path), boolArray);
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) {
        return table;
      }

      let insertIndex = insertAfter ? toIndex + 1 : toIndex;
      if (fromIndex < insertIndex) {
        insertIndex -= 1;
      }
      if (insertIndex === fromIndex) {
        return table;
      }

      const [moved] = current.splice(fromIndex, 1);
      current.splice(insertIndex, 0, moved);
      const nextValue = (boolArray ? (current as boolean[]) : (current as string[])) as ConfigFieldValue;
      return {
        ...table,
        values: setValueByPath(table.values, path, nextValue)
      };
    });
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
                  <div
                    key={`${pathKey}-item-${index}`}
                    className={`custom-array-item${
                      arrayDragOverKey === `${pathKey}::${index}::before`
                        ? ' drag-over-before'
                        : arrayDragOverKey === `${pathKey}::${index}::after`
                          ? ' drag-over-after'
                          : ''
                    }`}
                    onDragOver={(event) => {
                      const dragState = arrayDragStateRef.current;
                      if (!dragState || dragState.pathKey !== pathKey) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      const rect = event.currentTarget.getBoundingClientRect();
                      const insertAfter = event.clientY >= rect.top + rect.height / 2;
                      setArrayDragOverKey(`${pathKey}::${index}::${insertAfter ? 'after' : 'before'}`);
                    }}
                    onDragLeave={(event) => {
                      const nextTarget = event.relatedTarget as Node | null;
                      if (nextTarget && event.currentTarget.contains(nextTarget)) {
                        return;
                      }
                      setArrayDragOverKey((previous) =>
                        previous?.startsWith(`${pathKey}::${index}::`) ? null : previous
                      );
                    }}
                    onDrop={(event) => {
                      const dragState = arrayDragStateRef.current;
                      event.preventDefault();
                      if (!dragState || dragState.pathKey !== pathKey) {
                        setArrayDragOverKey(null);
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const insertAfter = event.clientY >= rect.top + rect.height / 2;
                      moveSelectedTableArrayItemAtPath(path, dragState.fromIndex, index, isBoolArrayType, insertAfter);
                      setArrayDragOverKey(null);
                    }}
                  >
                    <button
                      type="button"
                      className="custom-array-drag-handle"
                      title="拖拽调整顺序"
                      aria-label={`拖拽调整元素${index + 1}顺序`}
                      draggable
                      onDragStart={(event) => {
                        arrayDragStateRef.current = {
                          pathKey,
                          fromIndex: index
                        };
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', `${pathKey}::${index}`);
                      }}
                      onDragEnd={() => {
                        arrayDragStateRef.current = null;
                        setArrayDragOverKey(null);
                      }}
                    >
                      ≡
                    </button>

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
    const isSelected = selectedNodeIds.includes(node.id);
    const renameDisabled = hasMultipleSelection || !isSelected;
    return [
      {
        key: 'rename',
        label: '重命名',
        disabled: renameDisabled,
        onSelect: () => {
          if (renameDisabled) {
            return;
          }
          setSelectedNodeIds([node.id]);
          helpers.beginRename();
        }
      }
    ];
  };

  const selectedTypeDraft =
    !hasMultipleSelection && selectedMeta?.kind === 'group' && schemaDraft && schemaDraft.typeId === selectedMeta.typeId
      ? schemaDraft
      : null;

  const fieldsForSelectedTable = selectedType?.fields ?? [];
  const selectedNodeDisplayName =
    selectedMeta?.kind === 'group'
      ? selectedType?.name ?? '未命名节点'
      : selectedMeta?.kind === 'config'
        ? selectedTable?.name ?? '未命名节点'
        : '未命名节点';

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
    setSelectedNodeIds(pendingNodeSwitch.nextNodeId ? [pendingNodeSwitch.nextNodeId] : []);
  };

  const confirmNodeSwitchDiscard = () => {
    if (!pendingNodeSwitch) {
      return;
    }
    setPendingNodeSwitch(null);
    setSelectedNodeIds(pendingNodeSwitch.nextNodeId ? [pendingNodeSwitch.nextNodeId] : []);
  };

  const cancelNodeSwitch = () => {
    setPendingNodeSwitch(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }

    const { metas } = pendingDelete;
    setPendingDelete(null);

    let result: ConfigStoreSnapshot | null = snapshot;
    for (const meta of metas) {
      if (!result) {
        break;
      }

      result =
        meta.kind === 'group'
          ? await withStoreAction(() => appBridge.deleteConfigType({ typeId: meta.typeId }))
          : await withStoreAction(() =>
              appBridge.deleteConfigTable({
                typeId: meta.typeId,
                tableId: meta.tableId
              })
            );
    }

    if (!result) {
      return;
    }

    setSelectedNodeIds([]);
    setSchemaDraft(null);
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  return (
    <section className="panel tool-panel">
      <header className="panel-head">
        <h1 className="title">配置管理</h1>
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

            <div className="custom-tree-search-row">
              <input
                className="custom-input custom-tree-search-input"
                value={treeSearchKeyword}
                placeholder="搜索点位节点"
                onChange={(event) => {
                  setTreeSearchKeyword(event.currentTarget.value);
                }}
              />
            </div>

            <div className="custom-tree-shell">
              {isTreeFiltering && filteredNodes.length === 0 ? (
                <div className="custom-prop-empty-inline custom-tree-search-empty">未找到匹配的点位节点。</div>
              ) : (
                <TreeView
                  nodes={filteredNodes}
                  onNodesChange={isTreeFiltering ? undefined : handleTreeNodesChange}
                  onDragEnd={isTreeFiltering ? undefined : handleTreeDragEnd}
                  canDrop={isTreeFiltering ? () => false : canDropConfigTreeNodes}
                  selectedNodeIds={selectedNodeIds}
                  selectedNodeId={selectedNodeId}
                  disableRename={hasMultipleSelection}
                  selectionSyncToken={
                    pendingNodeSwitch ? pendingNodeSwitch.nextNodeId ?? '__null__' : selectedNodeIds.join('|') || '__idle__'
                  }
                  onSelectionChange={(nextNodes) => {
                    const nextIds = nextNodes.map((node) => node.id);
                    if (pendingNodeSwitch) {
                      return;
                    }
                    if (nextIds.length === selectedNodeIds.length && nextIds.every((id, index) => id === selectedNodeIds[index])) {
                      return;
                    }

                    const isDirtyTypeDraft =
                      selectedMeta?.kind === 'group' && schemaDraft && schemaDraft.typeId === selectedMeta.typeId && schemaDraft.dirty;

                    if (isDirtyTypeDraft && nextIds[0] !== selectedNodeId) {
                      setPendingNodeSwitch({ nextNodeId: nextIds[0] ?? null });
                      return;
                    }

                    setSelectedNodeIds(nextIds);
                  }}
                  onFocusedNodeChange={() => {
                    if (pendingNodeSwitch) {
                      return;
                    }
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
              )}
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
            ) : hasMultipleSelection ? (
              <div className="custom-prop-empty">已选择多个节点，请选择单个节点后编辑属性。</div>
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

                  <div
                    className="custom-field-list"
                    ref={typeFieldListRef}
                    onDragOver={(event) => {
                      if (!typeFieldDragStateRef.current) {
                        return;
                      }
                      event.preventDefault();

                      const container = event.currentTarget;
                      const rect = container.getBoundingClientRect();
                      const threshold = 56;
                      const maxSpeed = 16;
                      let velocity = 0;

                      if (event.clientY < rect.top + threshold) {
                        const ratio = (rect.top + threshold - event.clientY) / threshold;
                        velocity = -Math.max(2, Math.round(ratio * maxSpeed));
                      } else if (event.clientY > rect.bottom - threshold) {
                        const ratio = (event.clientY - (rect.bottom - threshold)) / threshold;
                        velocity = Math.max(2, Math.round(ratio * maxSpeed));
                      }

                      typeFieldAutoScrollVelocityRef.current = velocity;
                      if (velocity === 0) {
                        stopTypeFieldAutoScroll();
                      } else {
                        ensureTypeFieldAutoScroll();
                      }
                    }}
                    onDragLeave={(event) => {
                      const nextTarget = event.relatedTarget as Node | null;
                      if (nextTarget && event.currentTarget.contains(nextTarget)) {
                        return;
                      }
                      stopTypeFieldAutoScroll();
                    }}
                    onDrop={() => {
                      stopTypeFieldAutoScroll();
                    }}
                  >
                    {(selectedTypeDraft?.fields.length ?? 0) === 0 ? (
                      <div className="custom-prop-empty-inline">暂无字段，请添加。</div>
                    ) : null}

                    {selectedTypeDraft?.fields.map((field, index) => (
                      <div
                        key={field.id}
                        className={`custom-field-card${
                          typeFieldDragOverKey === `${field.id}::before`
                            ? ' drag-over-before'
                            : typeFieldDragOverKey === `${field.id}::after`
                              ? ' drag-over-after'
                              : ''
                        }`}
                        onDragOver={(event) => {
                          const dragState = typeFieldDragStateRef.current;
                          if (!dragState || dragState.fieldId === field.id) {
                            return;
                          }
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          const rect = event.currentTarget.getBoundingClientRect();
                          const insertAfter = event.clientY >= rect.top + rect.height / 2;
                          const nextKey = `${field.id}::${insertAfter ? 'after' : 'before'}`;
                          setTypeFieldDragOverKey((previous) => (previous === nextKey ? previous : nextKey));
                        }}
                        onDragLeave={(event) => {
                          const nextTarget = event.relatedTarget as Node | null;
                          if (nextTarget && event.currentTarget.contains(nextTarget)) {
                            return;
                          }
                          setTypeFieldDragOverKey((previous) =>
                            previous?.startsWith(`${field.id}::`) ? null : previous
                          );
                        }}
                        onDrop={(event) => {
                          const dragState = typeFieldDragStateRef.current;
                          event.preventDefault();
                          setTypeFieldDragOverKey(null);
                          if (!dragState || dragState.fieldId === field.id) {
                            return;
                          }
                          const rect = event.currentTarget.getBoundingClientRect();
                          const insertAfter = event.clientY >= rect.top + rect.height / 2;
                          moveTypeDraftField(dragState.fieldId, field.id, insertAfter);
                        }}
                      >
                        <div className="custom-field-card-head">
                          <button
                            type="button"
                            className="custom-field-drag-handle"
                            title="拖拽调整字段顺序"
                            aria-label={`拖拽调整字段${field.tag || field.fieldName || field.id}顺序`}
                            draggable
                            onDragStart={(event) => {
                              typeFieldDragStateRef.current = {
                                fieldId: field.id
                              };
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', field.id);
                            }}
                            onDragEnd={() => {
                              typeFieldDragStateRef.current = null;
                              setTypeFieldDragOverKey(null);
                              stopTypeFieldAutoScroll();
                            }}
                          >
                            ≡
                          </button>
                          <span className="custom-prop-label">字段顺序</span>
                          <span className="custom-field-index">#{index + 1}</span>
                        </div>

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
        <ExportConfigModal
          types={snapshot.types}
          typeSelection={exportTypeSelection}
          languageSelection={exportLanguageSelection}
          isExporting={isExporting}
          onClose={closeExportModal}
          onSubmit={() => void submitExport()}
          onToggleType={toggleExportType}
          onToggleLanguage={toggleExportLanguage}
        />
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


