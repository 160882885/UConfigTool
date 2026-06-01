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
  DEFAULT_ENUM_NODE_NAME,
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
  isEnumFieldType,
  isFloatType,
  isIntType,
  isNestedFieldType,
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

type TypeSchemaLayer = {
  nodeId: string;
  nodeName: string;
  schema: NonNullable<ConfigStoreSnapshot['typeSchemas'][number]>;
};

function buildTypeSchemaLayers(
  typeNodeId: string,
  nodeMap: ReadonlyMap<string, ConfigNodeModel>,
  typeSchemaByNodeId: ReadonlyMap<string, NonNullable<ConfigStoreSnapshot['typeSchemas'][number]>>
): TypeSchemaLayer[] {
  const stack: TypeSchemaLayer[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = typeNodeId;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const schema = typeSchemaByNodeId.get(cursor);
    const node = nodeMap.get(cursor);
    if (!schema || !node || node.kind !== 'configType') {
      break;
    }
    stack.push({
      nodeId: cursor,
      nodeName: node.name,
      schema
    });
    cursor = schema.baseTypeNodeId;
  }
  return stack.reverse();
}

function collectInheritedDescendantTypeIds(
  typeNodeId: string,
  typeSchemaByNodeId: ReadonlyMap<string, NonNullable<ConfigStoreSnapshot['typeSchemas'][number]>>
): Set<string> {
  const childrenByBaseId = new Map<string, string[]>();
  for (const [nodeId, schema] of typeSchemaByNodeId.entries()) {
    const baseId = schema.baseTypeNodeId;
    if (!baseId) {
      continue;
    }
    const list = childrenByBaseId.get(baseId);
    if (list) {
      list.push(nodeId);
    } else {
      childrenByBaseId.set(baseId, [nodeId]);
    }
  }

  const descendants = new Set<string>();
  const queue = [...(childrenByBaseId.get(typeNodeId) ?? [])];
  while (queue.length > 0) {
    const nextId = queue.shift() as string;
    if (descendants.has(nextId)) {
      continue;
    }
    descendants.add(nextId);
    const children = childrenByBaseId.get(nextId) ?? [];
    for (const childId of children) {
      queue.push(childId);
    }
  }
  return descendants;
}

function CustomPage() {
  const treeViewRef = useRef<TreeViewRef<ConfigNodeModel> | null>(null);

  const [snapshot, setSnapshot] = useState<ConfigStoreSnapshot>({ nodes: [], typeSchemas: [], enumSchemas: [], tables: [] });
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [treeSearchKeyword, setTreeSearchKeyword] = useState('');
  const [schemaDraft, setSchemaDraft] = useState<SchemaDraft | null>(null);
  const [isSavingSchema, setIsSavingSchema] = useState(false);
  const [pendingNodeSwitch, setPendingNodeSwitch] = useState<PendingNodeSwitch | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [isBaseTypeDropdownOpen, setIsBaseTypeDropdownOpen] = useState(false);
  const [baseTypeKeyword, setBaseTypeKeyword] = useState('');
  const [enumItemsDraft, setEnumItemsDraft] = useState<Array<{ id: string; value: string }>>([]);
  const [enumClassNameDraft, setEnumClassNameDraft] = useState('');
  const [enumNamespaceDraft, setEnumNamespaceDraft] = useState('');
  const [enumDraftDirty, setEnumDraftDirty] = useState(false);
  const [isSavingEnumSchema, setIsSavingEnumSchema] = useState(false);

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
  const [draggingArrayListKey, setDraggingArrayListKey] = useState<string | null>(null);
  const [draggingArrayIndex, setDraggingArrayIndex] = useState<number | null>(null);
  const [dragOverArrayListKey, setDragOverArrayListKey] = useState<string | null>(null);
  const [dragOverArrayIndex, setDragOverArrayIndex] = useState<number | null>(null);
  const [dragOverArrayPosition, setDragOverArrayPosition] = useState<'before' | 'after' | null>(null);

  const nodes = useMemo(() => buildConfigNodes(snapshot), [snapshot]);
  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);
  const treeNodes = useMemo(() => buildTreeNodes(nodes), [nodes]);

  const typeSchemaByNodeId = useMemo(() => new Map(snapshot.typeSchemas.map((schema) => [schema.nodeId, schema])), [snapshot.typeSchemas]);
  const enumSchemaByNodeId = useMemo(() => new Map(snapshot.enumSchemas.map((schema) => [schema.nodeId, schema])), [snapshot.enumSchemas]);
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
  const selectedEnumSchema = selectedNode?.kind === 'configEnum' ? enumSchemaByNodeId.get(selectedNode.id) ?? null : null;
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
  const enumNodes = useMemo(() => nodes.filter((node) => node.kind === 'configEnum').map((node) => ({ id: node.id, name: node.name })), [nodes]);

  const loadSnapshot = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = await appBridge.getConfigStoreSnapshot();
      setSnapshot(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '\u52a0\u8f7d\u914d\u7f6e\u6570\u636e\u5931\u8d25\u3002');
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
        baseTypeNodeId: selectedTypeSchema.baseTypeNodeId,
        className: selectedTypeSchema.className,
        namespace: selectedTypeSchema.namespace,
        exportAsTableList: selectedTypeSchema.exportAsTableList,
        exportTableListFileName: selectedTypeSchema.exportTableListFileName,
        fields: cloneFields(selectedTypeSchema.fields),
        dirty: false
      };
    });
  }, [selectedNode, selectedTypeSchema]);

  useEffect(() => {
    if (!selectedNode || selectedNode.kind !== 'configEnum' || !selectedEnumSchema) {
      setEnumItemsDraft([]);
      setEnumClassNameDraft('');
      setEnumNamespaceDraft('');
      setEnumDraftDirty(false);
      return;
    }
    setEnumClassNameDraft(selectedEnumSchema.className);
    setEnumNamespaceDraft(selectedEnumSchema.namespace);
    setEnumItemsDraft(selectedEnumSchema.items.map((item) => ({ id: item.id, value: item.value })));
    setEnumDraftDirty(false);
  }, [selectedNode, selectedEnumSchema]);

  useEffect(() => {
    setIsBaseTypeDropdownOpen(false);
    setBaseTypeKeyword('');
  }, [selectedNodeId]);

  const withStoreAction = async (action: () => Promise<ConfigStoreSnapshot>) => {
    try {
      const next = await action();
      setSnapshot(next);
      setErrorMessage(null);
      return next;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '\u64cd\u4f5c\u5931\u8d25\u3002');
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
        baseTypeNodeId: draft.baseTypeNodeId,
        className: draft.className,
        namespace: draft.namespace,
        exportAsTableList: draft.exportAsTableList,
        exportTableListFileName: draft.exportTableListFileName,
        fields: draft.fields
      });
      setSnapshot(next);
      setSchemaDraft({
        nodeId: draft.nodeId,
        baseTypeNodeId: draft.baseTypeNodeId,
        className: draft.className,
        namespace: draft.namespace,
        exportAsTableList: draft.exportAsTableList,
        exportTableListFileName: draft.exportTableListFileName,
        fields: cloneFields(draft.fields),
        dirty: false
      });
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '\u4fdd\u5b58\u914d\u7f6e\u7c7b\u578b\u5931\u8d25\u3002');
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
      } else if (kind === 'configEnum' && selected.kind === 'configType') {
        parentId = selected.parentId;
      } else {
        parentId = selected.id;
      }
    }

    if (kind === 'configTable' && !parentId) {
      window.alert('\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u53ef\u6302\u8f7d\u914d\u7f6e\u8868\u7c7b\u578b\u7684\u8282\u70b9\u3002');
      return;
    }

    const defaultName =
      kind === 'empty'
        ? DEFAULT_EMPTY_NODE_NAME
        : kind === 'configType'
          ? DEFAULT_TYPE_NODE_NAME
          : kind === 'configTable'
            ? DEFAULT_TABLE_NODE_NAME
            : DEFAULT_ENUM_NODE_NAME;
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
      window.alert('\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u8282\u70b9\u3002');
      return;
    }
    setPendingDelete({
      nodeIds: [...selectedNodeIds],
      message:
        selectedNodeIds.length === 1
          ? '\u786e\u8ba4\u5220\u9664\u5f53\u524d\u8282\u70b9\u53ca\u5176\u5b50\u8282\u70b9\u5417\uff1f'
          : `\u786e\u8ba4\u5220\u9664\u5df2\u9009\u4e2d\u7684 ${selectedNodeIds.length} \u4e2a\u8282\u70b9\u5417\uff1f`
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

      if (dragNode.data.kind === 'configEnum') {
        if (!targetParent || targetParent.kind === 'configType' || targetParent.kind === 'configTable' || targetTypeAncestor) {
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
    let canAddEnum = false;
    let canAddTable = false;
    let canRename = selectedNodeIds.length <= 1;

    if (noneSelected) {
      canAddEmpty = true;
      canAddType = true;
      canAddEnum = true;
      canAddTable = false;
      canRename = false;
    } else if (selected.kind === 'configTable') {
      canRename = true;
    } else if (selected.kind === 'configEnum') {
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
      canAddEnum = !hasTypeAncestor;
      canAddTable = hasTypeAncestor;
    }

    return [
      {
        key: 'add-empty',
        label: '\u6dfb\u52a0\u7a7a\u8282\u70b9',
        disabled: !canAddEmpty,
        onSelect: () => void addNode('empty')
      },
      {
        key: 'add-type',
        label: '\u6dfb\u52a0\u914d\u7f6e\u8868\u7c7b\u578b',
        disabled: !canAddType,
        onSelect: () => void addNode('configType')
      },
      {
        key: 'add-table',
        label: '\u6dfb\u52a0\u914d\u7f6e\u8868',
        disabled: !canAddTable,
        onSelect: () => void addNode('configTable')
      },
      {
        key: 'add-enum',
        label: '\u6dfb\u52a0\u679a\u4e3e',
        disabled: !canAddEnum,
        onSelect: () => void addNode('configEnum')
      },
      {
        key: 'sep',
        type: 'separator'
      },
      {
        key: 'rename',
        label: '\u91cd\u547d\u540d',
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
  const selectedTypeSchemaLayers = useMemo(() => {
    if (!selectedTypeNode) {
      return [];
    }
    return buildTypeSchemaLayers(selectedTypeNode.id, nodeMap, typeSchemaByNodeId);
  }, [nodeMap, selectedTypeNode, typeSchemaByNodeId]);
  const fieldsForSelectedTableLayers = useMemo(
    () =>
      selectedTypeSchemaLayers.map((layer) => ({
        nodeId: layer.nodeId,
        nodeName: layer.nodeName,
        fields: layer.schema.fields
      })),
    [selectedTypeSchemaLayers]
  );
  const fieldsForSelectedTable = useMemo(
    () => fieldsForSelectedTableLayers.flatMap((layer) => layer.fields),
    [fieldsForSelectedTableLayers]
  );
  const nestedTypeCandidates = useMemo(
    () => typeNodesForExport.filter((item) => item.id !== safeSelectedTypeDraft?.nodeId),
    [safeSelectedTypeDraft?.nodeId, typeNodesForExport]
  );
  const enumTypeCandidates = useMemo(() => enumNodes, [enumNodes]);
  const inheritanceCandidates = useMemo(() => {
    if (!safeSelectedTypeDraft) {
      return [] as Array<{ id: string; name: string }>;
    }
    const blockedIds = new Set<string>();
    blockedIds.add(safeSelectedTypeDraft.nodeId);
    const descendantIds = collectInheritedDescendantTypeIds(safeSelectedTypeDraft.nodeId, typeSchemaByNodeId);
    for (const descendantId of descendantIds) {
      blockedIds.add(descendantId);
    }
    let cursor = safeSelectedTypeDraft.baseTypeNodeId;
    while (cursor && !blockedIds.has(cursor)) {
      blockedIds.add(cursor);
      const schema = typeSchemaByNodeId.get(cursor);
      cursor = schema?.baseTypeNodeId;
    }
    return typeNodesForExport.filter((item) => !blockedIds.has(item.id));
  }, [safeSelectedTypeDraft, typeNodesForExport, typeSchemaByNodeId]);
  const normalizedBaseTypeKeyword = baseTypeKeyword.trim().toLowerCase();
  const filteredInheritanceCandidates = useMemo(() => {
    if (!normalizedBaseTypeKeyword) {
      return inheritanceCandidates;
    }
    return inheritanceCandidates.filter((item) => item.name.toLowerCase().includes(normalizedBaseTypeKeyword));
  }, [inheritanceCandidates, normalizedBaseTypeKeyword]);
  const selectedBaseTypeName = useMemo(() => {
    if (!safeSelectedTypeDraft?.baseTypeNodeId) {
      return '\u65e0';
    }
    const matched = typeNodesForExport.find((item) => item.id === safeSelectedTypeDraft.baseTypeNodeId);
    return matched?.name ?? '\u65e0';
  }, [safeSelectedTypeDraft?.baseTypeNodeId, typeNodesForExport]);

  const createSchemaField = (index: number): ConfigFieldDef => ({
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `field_${Date.now()}`,
    tag: `field_${index + 1}`,
    fieldName: `field_${index + 1}`,
    type: 'string',
    nestedTypeId: undefined,
    enumTypeNodeId: undefined
  });

  const saveEnumSchema = async (): Promise<boolean> => {
    if (!selectedNode || selectedNode.kind !== 'configEnum') {
      return true;
    }
    setIsSavingEnumSchema(true);
    try {
      const next = await appBridge.saveConfigEnumSchema({
        nodeId: selectedNode.id,
        className: enumClassNameDraft,
        namespace: enumNamespaceDraft,
        items: enumItemsDraft
      });
      setSnapshot(next);
      setEnumDraftDirty(false);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '\u4fdd\u5b58\u679a\u4e3e\u5931\u8d25\u3002');
      return false;
    } finally {
      setIsSavingEnumSchema(false);
    }
  };

  const addEnumItem = () => {
    const itemId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `enum_${Date.now()}`;
    setEnumItemsDraft((previous) => [...previous, { id: itemId, value: '' }]);
    setEnumDraftDirty(true);
  };

  const updateEnumItem = (itemId: string, value: string) => {
    setEnumItemsDraft((previous) => previous.map((item) => (item.id === itemId ? { ...item, value } : item)));
    setEnumDraftDirty(true);
  };

  const removeEnumItem = (itemId: string) => {
    setEnumItemsDraft((previous) => previous.filter((item) => item.id !== itemId));
    setEnumDraftDirty(true);
  };

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

  const clearArrayDragState = () => {
    setDraggingArrayListKey(null);
    setDraggingArrayIndex(null);
    setDragOverArrayListKey(null);
    setDragOverArrayIndex(null);
    setDragOverArrayPosition(null);
  };

  const handleArrayItemDragStart = (listKey: string, index: number, event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${listKey}:${index}`);
    setDraggingArrayListKey(listKey);
    setDraggingArrayIndex(index);
    setDragOverArrayListKey(null);
    setDragOverArrayIndex(null);
    setDragOverArrayPosition(null);
  };

  const handleArrayItemDragOver = (listKey: string, index: number, event: DragEvent<HTMLDivElement>) => {
    if (draggingArrayListKey !== listKey || draggingArrayIndex === null || draggingArrayIndex === index) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position: 'before' | 'after' = event.clientY < midpoint ? 'before' : 'after';
    if (dragOverArrayListKey !== listKey || dragOverArrayIndex !== index || dragOverArrayPosition !== position) {
      setDragOverArrayListKey(listKey);
      setDragOverArrayIndex(index);
      setDragOverArrayPosition(position);
    }
  };

  const reorderArrayItems = <T,>(
    listKey: string,
    targetIndex: number,
    items: T[],
    commit: (next: T[]) => void,
    event?: DragEvent<HTMLElement>
  ) => {
    if (
      draggingArrayListKey !== listKey ||
      draggingArrayIndex === null ||
      dragOverArrayPosition === null ||
      draggingArrayIndex < 0 ||
      draggingArrayIndex >= items.length ||
      targetIndex < 0 ||
      targetIndex >= items.length
    ) {
      clearArrayDragState();
      return;
    }

    if (event) {
      event.preventDefault();
    }

    const fromIndex = draggingArrayIndex;
    const next = [...items];
    const [moving] = next.splice(fromIndex, 1);
    const adjustedTargetIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = dragOverArrayPosition === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1;
    const safeInsertIndex = Math.max(0, Math.min(insertIndex, next.length));
    next.splice(safeInsertIndex, 0, moving);
    commit(next);
    clearArrayDragState();
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

  const readSelectedTableValueAtPath = (path: string[]) => (selectedTable ? getValueByPath(selectedTable.values, path) : undefined);
  const writeSelectedTableValueAtPath = (path: string[], nextValue: ConfigFieldValue) => updateSelectedTableValueAtPath(path, nextValue);

  const renderConfigFieldEditor = (
    field: ConfigFieldDef,
    path: string[],
    visitedNestedTypeIds: Set<string> = new Set(),
    readValue: (path: string[]) => unknown = readSelectedTableValueAtPath,
    writeValue: (path: string[], nextValue: ConfigFieldValue) => void = writeSelectedTableValueAtPath,
    scopePath = '__root__'
  ) => {
    const pathKey = path.join('/');
    const arrayListKey = `${scopePath}:${pathKey}`;
    const raw = readValue(path);
    const value = normalizeFieldValue(field.type, raw);
    const isArray = isArrayFieldType(field.type);
    const isBoolArray = field.type === 'bool_array';
    const arrayValues = isArray ? getArrayDraftFromValue(value, isBoolArray) : [];

    if (isNestedFieldType(field.type)) {
      const nestedTypeId = typeof field.nestedTypeId === 'string' ? field.nestedTypeId : '';
      const nestedSchema = nestedTypeId ? typeSchemaByNodeId.get(nestedTypeId) ?? null : null;
      const nestedLayers = nestedTypeId ? buildTypeSchemaLayers(nestedTypeId, nodeMap, typeSchemaByNodeId) : [];
      const nestedFields = nestedLayers.flatMap((layer) => layer.schema.fields);

      if (!nestedTypeId) {
        return (
          <div key={pathKey} className="custom-config-field vertical">
            <div className="custom-config-field-head">
              <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
            </div>
            <div className="custom-prop-empty-inline">{'\u672a\u5173\u8054\u5d4c\u5957\u914d\u7f6e\u7c7b\u578b\u3002'}</div>
          </div>
        );
      }

      if (visitedNestedTypeIds.has(nestedTypeId)) {
        return (
          <div key={pathKey} className="custom-config-field vertical">
            <div className="custom-config-field-head">
              <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
            </div>
            <div className="custom-prop-empty-inline">{'\u68c0\u6d4b\u5230\u5faa\u73af\u5d4c\u5957\uff0c\u5df2\u505c\u6b62\u5c55\u5f00\u3002'}</div>
          </div>
        );
      }

      if (!nestedSchema || nestedFields.length === 0) {
        return (
          <div key={pathKey} className="custom-config-field vertical">
            <div className="custom-config-field-head">
              <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
            </div>
            <div className="custom-prop-empty-inline">{'\u5d4c\u5957\u914d\u7f6e\u7c7b\u578b\u672a\u914d\u7f6e\u5b57\u6bb5\u3002'}</div>
          </div>
        );
      }

      const nextVisited = new Set(visitedNestedTypeIds);
      for (const layer of nestedLayers) {
        nextVisited.add(layer.nodeId);
      }

      if (field.type === 'nested_array') {
        const nestedItems = Array.isArray(value) ? (value as Record<string, ConfigFieldValue>[]) : [];

        return (
          <div key={pathKey} className="custom-config-field vertical">
            <div className="custom-config-field-head">
              <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
            </div>
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
                    handleArrayItemDragOver(arrayListKey, index, event);
                  }}
                  onDrop={(event) => {
                    reorderArrayItems(arrayListKey, index, nestedItems, (next) => {
                      writeValue(path, next);
                    }, event);
                  }}
                >
                  <button
                    type="button"
                    className="custom-array-drag-handle custom-nested-array-drag-handle"
                    draggable
                    onDragStart={(event) => {
                      handleArrayItemDragStart(arrayListKey, index, event);
                    }}
                    onDragEnd={clearArrayDragState}
                    aria-label={'\u62d6\u62fd\u8c03\u6574\u6761\u76ee\u987a\u5e8f'}
                    title={'\u62d6\u62fd\u8c03\u6574\u6761\u76ee\u987a\u5e8f'}
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
                      const nextItems = [...nestedItems];
                      nextItems.splice(index, 1);
                      writeValue(path, nextItems);
                    }}
                  >
                    {'\u5220\u9664'}
                  </button>
                  <div className="custom-config-fields custom-nested-array-fields">
                    {nestedFields.map((nestedField) =>
                      renderConfigFieldEditor(
                        nestedField,
                        [nestedField.id],
                        nextVisited,
                        (nestedPath) => getValueByPath(item, nestedPath),
                        (nestedPath, nextNestedValue) => {
                          const nextItem = setValueByPath(item, nestedPath, nextNestedValue);
                          const nextItems = [...nestedItems];
                          nextItems[index] = nextItem;
                          writeValue(path, nextItems);
                        },
                        `${arrayListKey}[${index}]`
                      )
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="custom-btn"
                onClick={() => {
                  const nextItem = nestedFields.reduce<Record<string, ConfigFieldValue>>((acc, nestedField) => {
                    acc[nestedField.id] = normalizeFieldValue(nestedField.type, undefined);
                    return acc;
                  }, {});
                  writeValue(path, [...nestedItems, nextItem]);
                }}
              >
                {'\u6dfb\u52a0\u6761\u76ee'}
              </button>
            </div>
          </div>
        );
      }

      return (
        <div key={pathKey} className="custom-config-field vertical">
          <div className="custom-config-field-head">
            <div className="custom-config-field-title">{formatConfigFieldTitle(field)}</div>
          </div>
          <div className="custom-config-fields">
            {nestedFields.map((nestedField) =>
              renderConfigFieldEditor(nestedField, [...path, nestedField.id], nextVisited, readValue, writeValue, scopePath)
            )}
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
                  writeValue(path, event.currentTarget.checked);
                }}
              />
              <span>{'\u5e03\u5c14\u503c'}</span>
            </label>
          ) : field.type === 'enum' ? (
            <select
              className="custom-select"
              value={String(value ?? '')}
              onChange={(event) => {
                writeValue(path, event.currentTarget.value);
              }}
            >
              <option value="">{'\u8bf7\u9009\u62e9'}</option>
              {(() => {
                const enumTypeId = field.enumTypeNodeId ?? '';
                const enumSchema = enumTypeId ? enumSchemaByNodeId.get(enumTypeId) ?? null : null;
                if (!enumSchema) {
                  return null;
                }
                return enumSchema.items.map((item) => (
                  <option key={item.id} value={item.value}>
                    {item.value || '\u7a7a\u503c'}
                  </option>
                ));
              })()}
            </select>
          ) : isArray ? (
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
                    handleArrayItemDragOver(arrayListKey, index, event);
                  }}
                  onDrop={(event) => {
                    reorderArrayItems(
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
                      handleArrayItemDragStart(arrayListKey, index, event);
                    }}
                    onDragEnd={clearArrayDragState}
                    aria-label={'\u62d6\u62fd\u8c03\u6574\u6761\u76ee\u987a\u5e8f'}
                    title={'\u62d6\u62fd\u8c03\u6574\u6761\u76ee\u987a\u5e8f'}
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
                      <span>{`\u6761\u76ee${index + 1}`}</span>
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
                    {'\u5220\u9664'}
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
                {'\u6dfb\u52a0\u6761\u76ee'}
              </button>
            </div>
          ) : field.type === 'string' ? (
            <AutoGrowTextarea
              value={String(value)}
              placeholder={'\u8bf7\u8f93\u5165\u503c'}
              onChange={(nextValue) => {
                writeValue(path, nextValue);
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
                writeValue(path, nextValue);
              }}
            />
          )}
        </div>
      </div>
    );
  };

  const selectedNodeDisplayName = selectedNode?.name ?? '\u672a\u547d\u540d\u8282\u70b9';

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
      window.alert('\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u79cd\u5bfc\u51fa\u8bed\u8a00\u3002');
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
      setErrorMessage(error instanceof Error ? error.message : '\u5bfc\u51fa\u5931\u8d25\u3002');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="panel tool-panel">
      <header className="panel-head">
        <h1 className="title">{'\u914d\u7f6e\u7ba1\u7406'}</h1>
      </header>

      <SplitWorkspace
        className="custom-layout"
        left={
          <section className="custom-pane custom-pane-left">
            <div className="custom-pane-head">
              <h2 className="custom-pane-title">{'\u914d\u7f6e\u5217\u8868'}</h2>
            </div>

            <div className="custom-toolbar">
              <button type="button" className="custom-btn" onClick={() => setShowExportModal(true)}>
                {'\u5bfc\u51fa'}
              </button>
              <button type="button" className="custom-btn danger" onClick={removeSelected}>
                {'\u5220\u9664'}
              </button>
            </div>

            <div className="custom-tree-search-row">
              <input
                className="custom-input custom-tree-search-input"
                value={treeSearchKeyword}
                placeholder={'\u641c\u7d22\u8282\u70b9'}
                onChange={(event) => {
                  setTreeSearchKeyword(event.currentTarget.value);
                }}
              />
            </div>

            <div className="custom-tree-shell">
              {normalizedSearch && filteredTreeNodes.length === 0 ? (
                <div className="custom-prop-empty-inline custom-tree-search-empty">{'\u672a\u627e\u5230\u5339\u914d\u8282\u70b9\u3002'}</div>
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
                        if (node.data.kind === 'configEnum') {
                          return (
                            <span className="tree-icon-glyph enum">
                              <span className="enum-mark">E</span>
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
              <h2 className="custom-pane-title">{'\u5c5e\u6027'}</h2>
            </div>

            {loading ? (
              <div className="custom-prop-empty">{'\u6b63\u5728\u52a0\u8f7d\u914d\u7f6e\u6570\u636e...'}</div>
            ) : errorMessage ? (
              <div className="custom-prop-empty">{errorMessage}</div>
            ) : hasMultipleSelection ? (
              <div className="custom-prop-empty">{'\u5df2\u9009\u62e9\u591a\u4e2a\u8282\u70b9\uff0c\u8bf7\u9009\u62e9\u5355\u4e2a\u8282\u70b9\u540e\u7f16\u8f91\u5c5e\u6027\u3002'}</div>
            ) : !selectedNode ? (
              <div className="custom-prop-empty">{'\u8bf7\u9009\u62e9\u5de6\u4fa7\u8282\u70b9\u540e\u7f16\u8f91\u5c5e\u6027\u3002'}</div>
            ) : selectedNode.kind === 'configType' && safeSelectedTypeDraft ? (
              <div className="custom-prop-form">
                <div className="custom-prop-row custom-prop-header-row">
                  <div className="custom-prop-label-row">
                    <span className="custom-prop-label">{selectedNodeDisplayName}</span>
                    <button type="button" className="custom-btn" onClick={() => void saveTypeSchema()} disabled={!safeSelectedTypeDraft.dirty || isSavingSchema}>
                      {'\u4fdd\u5b58'}
                    </button>
                  </div>
                </div>

                <div className="custom-prop-row">
                  <label className="custom-prop-label">{'\u7c7b\u540d'}</label>
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
                  <label className="custom-prop-label">{'\u547d\u540d\u7a7a\u95f4'}</label>
                  <input
                    className="custom-input"
                    value={safeSelectedTypeDraft.namespace}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateTypeDraft((draft) => ({ ...draft, namespace: value }));
                    }}
                  />
                </div>

                <div className="custom-prop-row">
                  <label className="custom-prop-label">{'\u7ee7\u627f\u7c7b\u578b'}</label>
                  <div className="custom-inherit-select">
                    <button
                      type="button"
                      className="custom-inherit-trigger"
                      onClick={() => {
                        setIsBaseTypeDropdownOpen((previous) => !previous);
                      }}
                    >
                      <span>{selectedBaseTypeName}</span>
                      <span className="custom-inherit-trigger-arrow">{isBaseTypeDropdownOpen ? '\u25b2' : '\u25bc'}</span>
                    </button>
                    {isBaseTypeDropdownOpen ? (
                      <div className="custom-inherit-dropdown">
                        <input
                          className="custom-input custom-inherit-search"
                          value={baseTypeKeyword}
                          placeholder={'\u641c\u7d22\u914d\u7f6e\u8868\u7c7b\u578b'}
                          onChange={(event) => {
                            setBaseTypeKeyword(event.currentTarget.value);
                          }}
                        />
                        <div className="custom-inherit-options">
                          <button
                            type="button"
                            className="custom-inherit-option"
                            onClick={() => {
                              updateTypeDraft((draft) => ({ ...draft, baseTypeNodeId: undefined }));
                              setIsBaseTypeDropdownOpen(false);
                            }}
                          >
                            {'\u65e0'}
                          </button>
                          {filteredInheritanceCandidates.map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              className="custom-inherit-option"
                              onClick={() => {
                                updateTypeDraft((draft) => ({ ...draft, baseTypeNodeId: candidate.id }));
                                setIsBaseTypeDropdownOpen(false);
                              }}
                            >
                              {candidate.name}
                            </button>
                          ))}
                          {filteredInheritanceCandidates.length === 0 ? (
                            <div className="custom-prop-empty-inline">{'\u672a\u627e\u5230\u5339\u914d\u7684\u914d\u7f6e\u8868\u7c7b\u578b\u3002'}</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="custom-prop-row custom-prop-header-row">
                  <div className="custom-prop-label-row">
                    <span className="custom-prop-label">{'\u5217\u8868\u5bfc\u51fa'}</span>
                  </div>
                </div>

                <div className="custom-prop-row">
                  <label className="custom-checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={safeSelectedTypeDraft.exportAsTableList}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        updateTypeDraft((draft) => ({ ...draft, exportAsTableList: checked }));
                      }}
                    />
                    <span>{'\u542f\u7528\u5408\u5e76\u5217\u8868 JSON \u5bfc\u51fa'}</span>
                  </label>
                </div>

                <div className="custom-prop-row">
                  <label className="custom-prop-label">{'\u5bfc\u51fa\u6587\u4ef6\u540d'}</label>
                  <input
                    className="custom-input"
                    value={safeSelectedTypeDraft.exportTableListFileName}
                    placeholder={'\u7559\u7a7a\u5219\u9ed8\u8ba4\u4f7f\u7528\u914d\u7f6e\u7c7b\u578b\u540d\u79f0'}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateTypeDraft((draft) => ({ ...draft, exportTableListFileName: value }));
                    }}
                  />
                </div>

                <div className="custom-prop-row custom-prop-header-row">
                  <div className="custom-prop-label-row">
                    <span className="custom-prop-label">{'\u914d\u7f6e\u7ed3\u6784\u5b57\u6bb5'}</span>
                    <button type="button" className="custom-btn" onClick={addSchemaField}>
                      {'\u6dfb\u52a0\u5b57\u6bb5'}
                    </button>
                  </div>
                </div>

                {safeSelectedTypeDraft.fields.length === 0 ? (
                  <div className="custom-prop-empty-inline">{'\u5f53\u524d\u914d\u7f6e\u7c7b\u578b\u8fd8\u6ca1\u6709\u5b57\u6bb5\u3002'}</div>
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
                            aria-label={'\u62d6\u62fd\u8c03\u6574\u5b57\u6bb5\u987a\u5e8f'}
                            title={'\u62d6\u62fd\u8c03\u6574\u5b57\u6bb5\u987a\u5e8f'}
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
                              {'\u5220\u9664'}
                            </button>
                          </div>
                        </div>

                        <div className="custom-field-grid">
                          <div className="custom-field-cell">
                            <label className="custom-prop-label">{'\u6807\u7b7e(tag)'}</label>
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
                            <label className="custom-prop-label">{'\u5b57\u6bb5\u540d(fieldName)'}</label>
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
                            <label className="custom-prop-label">{'\u7c7b\u578b'}</label>
                            <select
                              className="custom-select"
                              value={field.type}
                              onChange={(event) => {
                                const nextType = event.currentTarget.value as ConfigFieldType;
                                updateSchemaField(field.id, (previous) => ({
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
                              <label className="custom-prop-label">{'\u5d4c\u5957\u914d\u7f6e\u7c7b\u578b'}</label>
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
                                <option value="">{'\u8bf7\u9009\u62e9'}</option>
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
                              <label className="custom-prop-label">{'\u679a\u4e3e\u8282\u70b9'}</label>
                              <select
                                className="custom-select"
                                value={field.enumTypeNodeId ?? ''}
                                onChange={(event) => {
                                  const nextEnumTypeNodeId = event.currentTarget.value;
                                  updateSchemaField(field.id, (previous) => ({
                                    ...previous,
                                    enumTypeNodeId: nextEnumTypeNodeId || undefined
                                  }));
                                }}
                              >
                                <option value="">{'\u8bf7\u9009\u62e9'}</option>
                                {enumTypeCandidates.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                          {isEnumFieldType(field.type) && enumTypeCandidates.length === 0 ? (
                            <div className="custom-prop-empty-inline">{'\u5f53\u524d\u6ca1\u6709\u53ef\u9009\u62e9\u7684\u679a\u4e3e\u8282\u70b9\u3002'}</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : selectedNode.kind === 'configEnum' ? (
              <div className="custom-prop-form">
                <div className="custom-prop-row custom-prop-header-row">
                  <div className="custom-prop-label-row">
                    <span className="custom-prop-label">{selectedNodeDisplayName}</span>
                    <button type="button" className="custom-btn" onClick={() => void saveEnumSchema()} disabled={!enumDraftDirty || isSavingEnumSchema}>
                      {'\u4fdd\u5b58'}
                    </button>
                  </div>
                </div>
                <div className="custom-prop-row">
                  <label className="custom-prop-label">{'\u679a\u4e3e\u540d'}</label>
                  <input
                    className="custom-input"
                    value={enumClassNameDraft}
                    onChange={(event) => {
                      setEnumClassNameDraft(event.currentTarget.value);
                      setEnumDraftDirty(true);
                    }}
                  />
                </div>
                <div className="custom-prop-row">
                  <label className="custom-prop-label">{'\u547d\u540d\u7a7a\u95f4'}</label>
                  <input
                    className="custom-input"
                    value={enumNamespaceDraft}
                    onChange={(event) => {
                      setEnumNamespaceDraft(event.currentTarget.value);
                      setEnumDraftDirty(true);
                    }}
                  />
                </div>
                <div className="custom-prop-row custom-prop-header-row">
                  <div className="custom-prop-label-row">
                    <span className="custom-prop-label">{'\u679a\u4e3e\u9879\u5217\u8868'}</span>
                    <button type="button" className="custom-btn" onClick={addEnumItem}>
                      {'\u6dfb\u52a0\u9879'}
                    </button>
                  </div>
                </div>
                {enumItemsDraft.length === 0 ? (
                  <div className="custom-prop-empty-inline">{'\u5f53\u524d\u679a\u4e3e\u8fd8\u6ca1\u6709\u4efb\u4f55\u9879\u3002'}</div>
                ) : (
                  <div className="custom-field-list">
                    {enumItemsDraft.map((item, index) => (
                      <div
                        key={item.id}
                        className={`custom-field-card custom-enum-item-card${
                          dragOverArrayListKey === '__enum_items__' && dragOverArrayIndex === index && dragOverArrayPosition
                            ? ` drag-over-${dragOverArrayPosition}`
                            : ''
                        }`}
                        onDragOver={(event) => {
                          handleArrayItemDragOver('__enum_items__', index, event);
                        }}
                        onDrop={(event) => {
                          reorderArrayItems(
                            '__enum_items__',
                            index,
                            enumItemsDraft,
                            (next) => {
                              setEnumItemsDraft(next as Array<{ id: string; value: string }>);
                              setEnumDraftDirty(true);
                            },
                            event
                          );
                        }}
                      >
                        <div className="custom-field-card-head">
                          <button
                            type="button"
                            className="custom-field-drag-handle"
                            draggable
                            onDragStart={(event) => {
                              handleArrayItemDragStart('__enum_items__', index, event);
                            }}
                            onDragEnd={clearArrayDragState}
                            aria-label={'\u62d6\u62fd\u8c03\u6574\u679a\u4e3e\u9879\u987a\u5e8f'}
                            title={'\u62d6\u62fd\u8c03\u6574\u679a\u4e3e\u9879\u987a\u5e8f'}
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
                                removeEnumItem(item.id);
                              }}
                            >
                              {'\u5220\u9664'}
                            </button>
                          </div>
                        </div>
                        <div className="custom-field-grid custom-field-grid-single">
                          <div className="custom-field-cell">
                            <input
                              className="custom-input"
                              value={item.value}
                              onChange={(event) => {
                                updateEnumItem(item.id, event.currentTarget.value);
                              }}
                            />
                          </div>
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
                  <div className="custom-prop-empty-inline">{'\u6240\u5c5e\u914d\u7f6e\u7c7b\u578b\u672a\u914d\u7f6e\u5b57\u6bb5\u3002'}</div>
                ) : (
                  <div className="custom-config-fields">
                    {fieldsForSelectedTableLayers.map((layer) => (
                      <div key={layer.nodeId} className="custom-inherit-layer-block">
                        <div className="custom-inherit-layer-title">
                          {`${layer.nodeId === selectedTypeNode?.id ? '\u5f53\u524d\u5c42' : '\u7ee7\u627f\u5c42'}: ${layer.nodeName}`}
                        </div>
                        {layer.fields.length === 0 ? (
                          <div className="custom-prop-empty-inline">{'\u8be5\u5c42\u6ca1\u6709\u5b57\u6bb5\u3002'}</div>
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
            ) : (
              <div className="custom-prop-empty">{'\u5f53\u524d\u8282\u70b9\u6ca1\u6709\u53ef\u7f16\u8f91\u5c5e\u6027\u3002'}</div>
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
        title={'\u672a\u4fdd\u5b58\u4fee\u6539'}
        message={'\u5f53\u524d\u914d\u7f6e\u7c7b\u578b\u6709\u672a\u4fdd\u5b58\u4fee\u6539\uff0c\u662f\u5426\u4fdd\u5b58\u540e\u518d\u5207\u6362\u8282\u70b9\uff1f'}
        cancelText={'\u53d6\u6d88'}
        altText={'\u4e0d\u4fdd\u5b58'}
        altDanger
        confirmText={isSavingSchema ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58\u5e76\u5207\u6362'}
        busy={isSavingSchema}
        onCancel={() => setPendingNodeSwitch(null)}
        onAlt={confirmNodeSwitchDiscard}
        onConfirm={() => {
          void confirmNodeSwitchSave();
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={'\u5220\u9664\u786e\u8ba4'}
        message={pendingDelete?.message ?? ''}
        cancelText={'\u53d6\u6d88'}
        confirmText={'\u786e\u8ba4\u5220\u9664'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}

export default CustomPage;
