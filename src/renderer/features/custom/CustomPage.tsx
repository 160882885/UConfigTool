import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';

import type {
  ConfigFieldDef,
  ConfigFieldType,
  ConfigFieldValue,
  ConfigNodeKind,
  ConfigStoreSnapshot,
  ExportLanguage
} from '../../../../shared/contracts';
import { appBridge } from '../../shared/api/appBridge';
import ContextMenu, { type ContextMenuItem } from '../../shared/components/context-menu/ContextMenu';
import ConfirmDialog from '../../shared/components/dialog/ConfirmDialog';
import SplitWorkspace from '../../shared/components/SplitWorkspace';
import TreeView, {
  type TreeCanDropContext,
  type TreeDragDropEvent,
  type TreeSelectionChangeEvent,
  type TreeViewRef
} from '../../shared/components/tree/TreeView';

import AutoGrowTextarea from './components/AutoGrowTextarea';
import ExportConfigModal from './components/ExportConfigModal';
import {
  DEFAULT_EMPTY_NODE_NAME,
  DEFAULT_TABLE_NODE_NAME,
  DEFAULT_TYPE_NODE_NAME,
  EXPORT_LANGUAGE_OPTIONS,
  FIELD_TYPE_OPTIONS
} from './constants';
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
  buildConfigNodes,
  buildExpandedIds,
  buildNodeMap,
  buildTreeNodes,
  findAncestorByKind,
  hasAncestorKind,
  isDescendant
} from './treeModel';
import type { ConfigNodeModel, PendingDelete, PendingNodeSwitch, SchemaDraft } from './types';

function CustomPage() {
  const treeViewRef = useRef<TreeViewRef<ConfigNodeModel> | null>(null);

  const [snapshot, setSnapshot] = useState<ConfigStoreSnapshot>({ nodes: [], typeSchemas: [], tables: [] });
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [treeSearchKeyword, setTreeSearchKeyword] = useState('');
  const [schemaDraft, setSchemaDraft] = useState<SchemaDraft | null>(null);
  const [isSavingSchema, setIsSavingSchema] = useState(false);
  const [pendingNodeSwitch, setPendingNodeSwitch] = useState<PendingNodeSwitch | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const [showExportModal, setShowExportModal] = useState(false);
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
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | null>(null);

  const nodes = useMemo(() => buildConfigNodes(snapshot), [snapshot]);
  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);
  const treeNodes = useMemo(() => buildTreeNodes(nodes), [nodes]);

  const typeSchemaByNodeId = useMemo(() => new Map(snapshot.typeSchemas.map((schema) => [schema.nodeId, schema])), [snapshot.typeSchemas]);
  const tableByNodeId = useMemo(() => new Map(snapshot.tables.map((table) => [table.nodeId, table])), [snapshot.tables]);

  const selectedNodeId = selectedNodeIds[0] ?? null;
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null;
  const hasMultipleSelection = selectedNodeIds.length > 1;

  const selectedTypeNode = useMemo(() => {
    if (!selectedNodeId) {
      return null;
    }
    if (selectedNode?.kind === 'configType') {
      return selectedNode;
    }
    return findAncestorByKind(selectedNodeId, nodeMap, 'configType');
  }, [selectedNode, selectedNodeId, nodeMap]);

  const selectedTypeSchema = selectedTypeNode ? typeSchemaByNodeId.get(selectedTypeNode.id) ?? null : null;
  const selectedTable = selectedNode?.kind === 'configTable' ? tableByNodeId.get(selectedNode.id) ?? null : null;

  const normalizedSearch = treeSearchKeyword.trim().toLowerCase();
  const filteredTreeNodes = useMemo(() => {
    if (!normalizedSearch) {
      return treeNodes;
    }

    const visible = new Set<string>();
    for (const node of nodes) {
      if (!node.name.toLowerCase().includes(normalizedSearch)) {
        continue;
      }
      let cursor: ConfigNodeModel | null = node;
      while (cursor) {
        visible.add(cursor.id);
        cursor = cursor.parentId ? nodeMap.get(cursor.parentId) ?? null : null;
      }
    }

    return treeNodes.filter((node) => visible.has(node.id));
  }, [nodeMap, nodes, normalizedSearch, treeNodes]);

  const expandedIds = useMemo(() => buildExpandedIds(nodes), [nodes]);
  const typeNodesForExport = useMemo(
    () => nodes.filter((node) => node.kind === 'configType').map((node) => ({ id: node.id, name: node.name })),
    [nodes]
  );

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
    setSelectedNodeIds((previous) => previous.filter((id) => nodeMap.has(id)));
  }, [nodeMap]);

  useEffect(() => {
    setExportTypeSelection((previous) => {
      const next: Record<string, boolean> = {};
      for (const typeNode of typeNodesForExport) {
        next[typeNode.id] = previous[typeNode.id] ?? true;
      }
      return next;
    });
  }, [typeNodesForExport]);

  useEffect(() => {
    if (!selectedNode || selectedNode.kind !== 'configType' || !selectedTypeSchema) {
      setSchemaDraft(null);
      return;
    }
    setSchemaDraft((previous) => {
      if (previous && previous.nodeId === selectedNode.id) {
        return previous;
      }
      return {
        nodeId: selectedNode.id,
        className: selectedTypeSchema.className,
        namespace: selectedTypeSchema.namespace,
        fields: cloneFields(selectedTypeSchema.fields),
        dirty: false
      };
    });
  }, [selectedNode, selectedTypeSchema]);

  const withStoreAction = async (action: () => Promise<ConfigStoreSnapshot>) => {
    try {
      const next = await action();
      setSnapshot(next);
      setErrorMessage(null);
      return next;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '操作失败。');
      return null;
    }
  };

  const updateTypeDraft = (updater: (draft: SchemaDraft) => SchemaDraft) => {
    setSchemaDraft((previous) => {
      if (!previous) {
        return previous;
      }
      const next = normalizeSchemaDraftRuntime(updater(normalizeSchemaDraftRuntime(previous)));
      return {
        ...next,
        dirty: true
      };
    });
  };

  const saveTypeSchema = async (draftOverride?: SchemaDraft): Promise<boolean> => {
    const draft = draftOverride ? normalizeSchemaDraftRuntime(draftOverride) : schemaDraft ? normalizeSchemaDraftRuntime(schemaDraft) : null;
    if (!draft) {
      return true;
    }

    setIsSavingSchema(true);
    try {
      const next = await appBridge.saveConfigTypeSchema({
        nodeId: draft.nodeId,
        className: draft.className,
        namespace: draft.namespace,
        fields: draft.fields
      });
      setSnapshot(next);
      setSchemaDraft({
        nodeId: draft.nodeId,
        className: draft.className,
        namespace: draft.namespace,
        fields: cloneFields(draft.fields),
        dirty: false
      });
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存配置类型失败。');
      return false;
    } finally {
      setIsSavingSchema(false);
    }
  };

  const addNode = async (kind: ConfigNodeKind) => {
    const selected = selectedNode;
    let parentId: string | null = null;

    if (selected) {
      if (kind === 'configTable' && selected.kind === 'configType') {
        parentId = selected.id;
      } else if (kind === 'configTable' && selected.kind !== 'configType') {
        const typeAncestor = findAncestorByKind(selected.id, nodeMap, 'configType');
        parentId = typeAncestor?.id ?? null;
      } else {
        parentId = selected.id;
      }
    }

    if (kind === 'configTable' && !parentId) {
      window.alert('请先选择一个可挂载配置表类型的节点。');
      return;
    }

    const defaultName =
      kind === 'empty' ? DEFAULT_EMPTY_NODE_NAME : kind === 'configType' ? DEFAULT_TYPE_NODE_NAME : DEFAULT_TABLE_NODE_NAME;
    const result = await withStoreAction(() => appBridge.createConfigNode({ kind, name: defaultName, parentId }));
    if (!result) {
      return;
    }

    const nextNodes = buildConfigNodes(result);
    const previousIdSet = new Set(nodes.map((node) => node.id));
    const createdNode = nextNodes.find((node) => !previousIdSet.has(node.id)) ?? null;
    if (createdNode) {
      setSelectedNodeIds([createdNode.id]);
    }
  };

  const removeSelected = () => {
    if (selectedNodeIds.length === 0) {
      window.alert('请先选择要删除的节点。');
      return;
    }
    setPendingDelete({
      nodeIds: [...selectedNodeIds],
      message: selectedNodeIds.length === 1 ? '确认删除当前节点及其子节点吗？' : `确认删除已选中的 ${selectedNodeIds.length} 个节点吗？`
    });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    const ids = [...pendingDelete.nodeIds];
    setPendingDelete(null);

    for (const nodeId of ids) {
      const ok = await withStoreAction(() => appBridge.deleteConfigNode({ nodeId }));
      if (!ok) {
        return;
      }
    }

    setSelectedNodeIds([]);
    setSchemaDraft(null);
  };

  const canDropNodes = (context: TreeCanDropContext<ConfigNodeModel>): boolean => {
    const { dragNodes, targetParentId } = context;
    const targetParent = targetParentId ? nodeMap.get(targetParentId) ?? null : null;
    const targetTypeAncestor = targetParent ? findAncestorByKind(targetParent.id, nodeMap, 'configType') : null;
    const targetIsEmptyNode = targetParent?.kind === 'empty';

    for (const dragNode of dragNodes) {
      if (targetParentId && (targetParentId === dragNode.id || isDescendant(targetParentId, dragNode.id, nodeMap))) {
        return false;
      }

      if (dragNode.data.kind === 'configType') {
        if (!targetParent) {
          continue;
        }
        if (targetIsEmptyNode) {
          if (targetTypeAncestor) {
            return false;
          }
          continue;
        }
        if (targetParent.kind === 'configType') {
          return false;
        }
        if (targetTypeAncestor) {
          return false;
        }
        continue;
      }

      if (dragNode.data.kind === 'configTable') {
        if (!targetParent || targetParent.kind === 'configTable') {
          return false;
        }
        const sourceType = findAncestorByKind(dragNode.id, nodeMap, 'configType');
        const directType = targetParent.kind === 'configType' ? targetParent : targetTypeAncestor;
        if (targetIsEmptyNode && (!sourceType || !directType || sourceType.id !== directType.id)) {
          return false;
        }
        if (!directType) {
          return false;
        }
        continue;
      }
    }

    return true;
  };

  const handleDrop = async (event: TreeDragDropEvent<ConfigNodeModel>) => {
    if (event.cancelled) {
      return;
    }
    await withStoreAction(() =>
      appBridge.moveConfigNode({
        nodeIds: event.nodeIds,
        parentId: event.toParentId,
        index: event.toIndex
      })
    );
  };

  const handleRename = async (nodeId: string, nextName: string) => {
    await withStoreAction(() =>
      appBridge.renameConfigNode({
        nodeId,
        name: nextName
      })
    );
  };

  const handleSelectionChange = (event: TreeSelectionChangeEvent<ConfigNodeModel>) => {
    const nextIds = event.selectedNodes.map((node) => node.id);
    if (pendingNodeSwitch) {
      return;
    }

    if (schemaDraft?.dirty && selectedNode?.kind === 'configType' && nextIds[0] !== selectedNode.id) {
      setPendingNodeSwitch({
        nextNodeId: nextIds[0] ?? null
      });
      return;
    }

    setSelectedNodeIds(nextIds);
  };

  const buildContextMenuItems = (): ContextMenuItem[] => {
    const selected = selectedNode;
    const noneSelected = !selected;

    let canAddEmpty = false;
    let canAddType = false;
    let canAddTable = false;
    let canRename = selectedNodeIds.length <= 1;

    if (noneSelected) {
      canAddEmpty = true;
      canAddType = true;
      canAddTable = false;
      canRename = false;
    } else if (selected.kind === 'configTable') {
      canRename = true;
    } else if (selected.kind === 'configType') {
      canRename = true;
      canAddEmpty = true;
      canAddTable = true;
    } else {
      const hasTypeAncestor = hasAncestorKind(selected.id, nodeMap, 'configType');
      canRename = true;
      canAddEmpty = true;
      canAddType = !hasTypeAncestor;
      canAddTable = hasTypeAncestor;
    }

    return [
      {
        key: 'add-empty',
        label: '添加空节点',
        disabled: !canAddEmpty,
        onSelect: () => void addNode('empty')
      },
      {
        key: 'add-type',
        label: '添加配置表类型',
        disabled: !canAddType,
        onSelect: () => void addNode('configType')
      },
      {
        key: 'add-table',
        label: '添加配置表',
        disabled: !canAddTable,
        onSelect: () => void addNode('configTable')
      },
      {
        key: 'sep',
        type: 'separator'
      },
      {
        key: 'rename',
        label: '重命名',
        disabled: !canRename || !selectedNodeId,
        onSelect: () => {
          if (!selectedNodeId) {
            return;
          }
          treeViewRef.current?.beginRename(selectedNodeId);
        }
      }
    ];
  };

  const selectedTypeDraft = selectedNode?.kind === 'configType' && schemaDraft && schemaDraft.nodeId === selectedNode.id ? schemaDraft : null;
  const safeSelectedTypeDraft = useMemo(
    () => (selectedTypeDraft ? normalizeSchemaDraftRuntime(selectedTypeDraft) : null),
    [selectedTypeDraft]
  );
  const fieldsForSelectedTable = selectedTypeSchema?.fields ?? [];
  const nestedTypeCandidates = useMemo(
    () => typeNodesForExport.filter((item) => item.id !== safeSelectedTypeDraft?.nodeId),
    [safeSelectedTypeDraft?.nodeId, typeNodesForExport]
  );

  const createSchemaField = (index: number): ConfigFieldDef => ({
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `field_${Date.now()}`,
    tag: `field_${index + 1}`,
    fieldName: `field_${index + 1}`,
    type: 'string',
    nestedTypeId: undefined
  });

  const addSchemaField = () => {
    updateTypeDraft((draft) => ({
      ...draft,
      fields: [...draft.fields, createSchemaField(draft.fields.length)]
    }));
  };

  const removeSchemaField = (fieldId: string) => {
    updateTypeDraft((draft) => ({
      ...draft,
      fields: draft.fields.filter((field) => field.id !== fieldId)
    }));
  };

  const updateSchemaField = (fieldId: string, updater: (field: ConfigFieldDef) => ConfigFieldDef) => {
    updateTypeDraft((draft) => ({
      ...draft,
      fields: draft.fields.map((field) => (field.id === fieldId ? updater({ ...field }) : field))
    }));
  };

  const clearFieldDragState = () => {
    setDraggingFieldId(null);
    setDragOverFieldId(null);
    setDragOverPosition(null);
  };

  const handleFieldDragStart = (fieldId: string, event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', fieldId);
    setDraggingFieldId(fieldId);
    setDragOverFieldId(null);
    setDragOverPosition(null);
  };

  const handleFieldDragOver = (fieldId: string, event: DragEvent<HTMLDivElement>) => {
    if (!draggingFieldId || draggingFieldId === fieldId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position: 'before' | 'after' = event.clientY < midpoint ? 'before' : 'after';
    if (dragOverFieldId !== fieldId || dragOverPosition !== position) {
      setDragOverFieldId(fieldId);
      setDragOverPosition(position);
    }
  };

  const handleFieldDrop = (fieldId: string, event: DragEvent<HTMLDivElement>) => {
    if (!draggingFieldId || !dragOverPosition || draggingFieldId === fieldId) {
      clearFieldDragState();
      return;
    }
    event.preventDefault();

    updateTypeDraft((draft) => {
      const fields = [...draft.fields];
      const fromIndex = fields.findIndex((field) => field.id === draggingFieldId);
      const targetIndex = fields.findIndex((field) => field.id === fieldId);
      if (fromIndex < 0 || targetIndex < 0) {
        return draft;
      }

      const [moving] = fields.splice(fromIndex, 1);
      const adjustedTargetIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertIndex = dragOverPosition === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1;
      const safeInsertIndex = Math.max(0, Math.min(insertIndex, fields.length));
      fields.splice(safeInsertIndex, 0, moving);

      return {
        ...draft,
        fields
      };
    });

    clearFieldDragState();
  };

  const updateSelectedTableValueAtPath = (path: string[], nextValue: ConfigFieldValue) => {
    if (!selectedTable || !selectedNode || selectedNode.kind !== 'configTable') {
      return;
    }
    const nextValues = setValueByPath(selectedTable.values, path, nextValue);
    void withStoreAction(() =>
      appBridge.saveConfigTable({
        nodeId: selectedNode.id,
        values: nextValues
      })
    );
  };

  const renderConfigFieldEditor = (field: ConfigFieldDef, path: string[], visitedNestedTypeIds: Set<string> = new Set()) => {
    const pathKey = path.join('/');
    const raw = selectedTable ? getValueByPath(selectedTable.values, path) : undefined;
    const value = normalizeFieldValue(field.type, raw);
    const isArray = isArrayFieldType(field.type);
    const isBoolArray = field.type === 'bool_array';
    const arrayValues = isArray ? getArrayDraftFromValue(value, isBoolArray) : [];

    if (field.type === 'nested') {
      const nestedTypeId = typeof field.nestedTypeId === 'string' ? field.nestedTypeId : '';
      const nestedSchema = nestedTypeId ? typeSchemaByNodeId.get(nestedTypeId) ?? null : null;

      if (!nestedTypeId) {
        return (
          <div key={pathKey} className="custom-config-field vertical">
            <div className="custom-config-field-head">
              <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
            </div>
            <div className="custom-prop-empty-inline">未关联嵌套配置类型。</div>
          </div>
        );
      }

      if (visitedNestedTypeIds.has(nestedTypeId)) {
        return (
          <div key={pathKey} className="custom-config-field vertical">
            <div className="custom-config-field-head">
              <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
            </div>
            <div className="custom-prop-empty-inline">检测到循环嵌套，已停止展开。</div>
          </div>
        );
      }

      if (!nestedSchema || nestedSchema.fields.length === 0) {
        return (
          <div key={pathKey} className="custom-config-field vertical">
            <div className="custom-config-field-head">
              <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
            </div>
            <div className="custom-prop-empty-inline">嵌套配置类型未配置字段。</div>
          </div>
        );
      }

      const nextVisited = new Set(visitedNestedTypeIds);
      nextVisited.add(nestedTypeId);

      return (
        <div key={pathKey} className="custom-config-field vertical">
          <div className="custom-config-field-head">
            <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
          </div>
          <div className="custom-config-fields">
            {nestedSchema.fields.map((nestedField) => renderConfigFieldEditor(nestedField, [...path, nestedField.id], nextVisited))}
          </div>
        </div>
      );
    }

    return (
      <div key={pathKey} className="custom-config-field vertical">
        <div className="custom-config-field-head">
          <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
        </div>
        <div className="custom-config-field-input-wrap">
          {field.type === 'bool' ? (
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
          ) : isArray ? (
            <div className="custom-array-list">
              {arrayValues.map((item, index) => (
                <div key={`${pathKey}-${index}`} className="custom-array-item">
                  {isBoolArray ? (
                    <label className="custom-checkbox-wrap">
                      <input
                        type="checkbox"
                        checked={Boolean(item)}
                        onChange={(event) => {
                          const next = getArrayDraftFromValue(getValueByPath(selectedTable?.values ?? {}, path), true);
                          next[index] = event.currentTarget.checked;
                          updateSelectedTableValueAtPath(path, next as boolean[]);
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
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        if (isIntType(field.type) && !isValidIntegerInput(nextValue)) {
                          return;
                        }
                        if (isFloatType(field.type) && !isValidFloatInput(nextValue)) {
                          return;
                        }
                        const next = getArrayDraftFromValue(getValueByPath(selectedTable?.values ?? {}, path), false);
                        next[index] = nextValue;
                        updateSelectedTableValueAtPath(path, next as string[]);
                      }}
                    />
                  )}
                  <button
                    type="button"
                    className="custom-btn danger custom-array-remove-btn"
                    onClick={() => {
                      const next = getArrayDraftFromValue(getValueByPath(selectedTable?.values ?? {}, path), isBoolArray);
                      next.splice(index, 1);
                      updateSelectedTableValueAtPath(path, next as string[] | boolean[]);
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
                  const next = getArrayDraftFromValue(getValueByPath(selectedTable?.values ?? {}, path), isBoolArray);
                  next.push(isBoolArray ? false : '');
                  updateSelectedTableValueAtPath(path, next as string[] | boolean[]);
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
      </div>
    );
  };

  const selectedNodeDisplayName = selectedNode?.name ?? '未命名节点';

  const confirmNodeSwitchSave = async () => {
    if (!pendingNodeSwitch) {
      return;
    }
    const draft = schemaDraft ? normalizeSchemaDraftRuntime(schemaDraft) : null;
    const saved = await saveTypeSchema(draft ?? undefined);
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

  const submitExport = async () => {
    const selectedTypeNodeIds = typeNodesForExport.filter((node) => exportTypeSelection[node.id]).map((node) => node.id);
    const selectedLanguages = EXPORT_LANGUAGE_OPTIONS.filter((item) => exportLanguageSelection[item.key]).map((item) => item.key);
    if (selectedLanguages.length === 0) {
      window.alert('请至少选择一种导出语言。');
      return;
    }
    setIsExporting(true);
    try {
      await appBridge.exportConfigs({
        selectedTypeNodeIds,
        selectedLanguages
      });
      setShowExportModal(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导出失败。');
    } finally {
      setIsExporting(false);
    }
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
              <button type="button" className="custom-btn" onClick={() => setShowExportModal(true)}>
                导出
              </button>
              <button type="button" className="custom-btn danger" onClick={removeSelected}>
                删除
              </button>
            </div>

            <div className="custom-tree-search-row">
              <input
                className="custom-input custom-tree-search-input"
                value={treeSearchKeyword}
                placeholder="搜索节点"
                onChange={(event) => {
                  setTreeSearchKeyword(event.currentTarget.value);
                }}
              />
            </div>

            <div className="custom-tree-shell">
              {normalizedSearch && filteredTreeNodes.length === 0 ? (
                <div className="custom-prop-empty-inline custom-tree-search-empty">未找到匹配节点。</div>
              ) : (
                <ContextMenu items={buildContextMenuItems}>
                  <div className="custom-tree-context-scope">
                    <TreeView<ConfigNodeModel>
                      ref={treeViewRef}
                      nodes={filteredTreeNodes}
                      selectedNodeIds={selectedNodeIds}
                      selectionSyncToken={pendingNodeSwitch ? pendingNodeSwitch.nextNodeId ?? '__pending__' : selectedNodeIds.join('|')}
                      defaultExpandedIds={expandedIds}
                      allowMultiSelect
                      disableRename={hasMultipleSelection}
                      nodeSelectedBackgroundColor="#2C5D87"
                      nodeHoverBackgroundColor="#214361"
                      canDrop={canDropNodes}
                      onSelectionChange={handleSelectionChange}
                      onRename={(event) => {
                        void handleRename(event.node.id, event.nextLabel);
                      }}
                      onDrop={(event: TreeDragDropEvent<ConfigNodeModel>) => {
                        void handleDrop(event);
                      }}
                      renderNodeIcon={(node) => {
                        if (node.data.kind === 'configType') {
                          return (
                            <span className="tree-icon-glyph folder">
                              <span className="folder-lip" />
                            </span>
                          );
                        }
                        if (node.data.kind === 'empty') {
                          return <span className="tree-icon-glyph dot" />;
                        }
                        return (
                          <span className="tree-icon-glyph file">
                            <span className="file-corner" />
                            <span className="file-line file-line-1" />
                            <span className="file-line file-line-2" />
                            <span className="file-line file-line-3" />
                          </span>
                        );
                      }}
                    />
                  </div>
                </ContextMenu>
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
            ) : !selectedNode ? (
              <div className="custom-prop-empty">请选择左侧节点后编辑属性。</div>
            ) : selectedNode.kind === 'configType' && safeSelectedTypeDraft ? (
              <div className="custom-prop-form">
                <div className="custom-prop-row custom-prop-header-row">
                  <div className="custom-prop-label-row">
                    <span className="custom-prop-label">{selectedNodeDisplayName}</span>
                    <button type="button" className="custom-btn" onClick={() => void saveTypeSchema()} disabled={!safeSelectedTypeDraft.dirty || isSavingSchema}>
                      保存
                    </button>
                  </div>
                </div>

                <div className="custom-prop-row">
                  <label className="custom-prop-label">类名</label>
                  <input
                    className="custom-input"
                    value={safeSelectedTypeDraft.className}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateTypeDraft((draft) => ({ ...draft, className: value }));
                    }}
                  />
                </div>

                <div className="custom-prop-row">
                  <label className="custom-prop-label">命名空间</label>
                  <input
                    className="custom-input"
                    value={safeSelectedTypeDraft.namespace}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateTypeDraft((draft) => ({ ...draft, namespace: value }));
                    }}
                  />
                </div>

                <div className="custom-prop-row custom-prop-header-row">
                  <div className="custom-prop-label-row">
                    <span className="custom-prop-label">配置结构字段</span>
                    <button type="button" className="custom-btn" onClick={addSchemaField}>
                      添加字段
                    </button>
                  </div>
                </div>

                {safeSelectedTypeDraft.fields.length === 0 ? (
                  <div className="custom-prop-empty-inline">当前配置类型还没有字段。</div>
                ) : (
                  <div className="custom-field-list">
                    {safeSelectedTypeDraft.fields.map((field, index) => (
                      <div
                        key={field.id}
                        className={`custom-field-card${
                          dragOverFieldId === field.id && dragOverPosition ? ` drag-over-${dragOverPosition}` : ''
                        }`}
                        onDragOver={(event) => {
                          handleFieldDragOver(field.id, event);
                        }}
                        onDrop={(event) => {
                          handleFieldDrop(field.id, event);
                        }}
                      >
                        <div className="custom-field-card-head">
                          <button
                            type="button"
                            className="custom-field-drag-handle"
                            draggable
                            onDragStart={(event) => {
                              handleFieldDragStart(field.id, event);
                            }}
                            onDragEnd={clearFieldDragState}
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
                                removeSchemaField(field.id);
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
                                const value = event.currentTarget.value;
                                updateSchemaField(field.id, (previous) => ({ ...previous, tag: value }));
                              }}
                            />
                          </div>

                          <div className="custom-field-cell">
                            <label className="custom-prop-label">字段名(fieldName)</label>
                            <input
                              className="custom-input"
                              value={field.fieldName}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                updateSchemaField(field.id, (previous) => ({ ...previous, fieldName: value }));
                              }}
                            />
                          </div>

                          <div className="custom-field-cell">
                            <label className="custom-prop-label">类型</label>
                            <select
                              className="custom-select"
                              value={field.type}
                              onChange={(event) => {
                                const nextType = event.currentTarget.value as ConfigFieldType;
                                updateSchemaField(field.id, (previous) => ({
                                  ...previous,
                                  type: nextType,
                                  nestedTypeId: nextType === 'nested' ? previous.nestedTypeId : undefined
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

                          {field.type === 'nested' ? (
                            <div className="custom-field-cell">
                              <label className="custom-prop-label">嵌套配置类型</label>
                              <select
                                className="custom-select"
                                value={field.nestedTypeId ?? ''}
                                onChange={(event) => {
                                  const nextTypeId = event.currentTarget.value;
                                  updateSchemaField(field.id, (previous) => ({
                                    ...previous,
                                    nestedTypeId: nextTypeId || undefined
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
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : selectedNode.kind === 'configTable' && selectedTable ? (
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
                    {fieldsForSelectedTable.map((field) => renderConfigFieldEditor(field, [field.id]))}
                  </div>
                )}
              </div>
            ) : (
              <div className="custom-prop-empty">当前节点没有可编辑属性。</div>
            )}
          </section>
        }
      />

      {showExportModal ? (
        <ExportConfigModal
          types={typeNodesForExport}
          typeSelection={exportTypeSelection}
          languageSelection={exportLanguageSelection}
          isExporting={isExporting}
          onClose={() => {
            if (!isExporting) {
              setShowExportModal(false);
            }
          }}
          onSubmit={() => void submitExport()}
          onToggleType={(typeNodeId) => {
            setExportTypeSelection((previous) => ({ ...previous, [typeNodeId]: !previous[typeNodeId] }));
          }}
          onToggleLanguage={(language) => {
            setExportLanguageSelection((previous) => ({ ...previous, [language]: !previous[language] }));
          }}
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
        onCancel={() => setPendingNodeSwitch(null)}
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
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}

export default CustomPage;
