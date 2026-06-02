import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';

import type {
  ConfigFieldDef,
  ConfigFieldValue,
  ConfigStoreSnapshot
} from '../../../../shared/contracts';
import { useWorkspace } from '../../app/workspace/WorkspaceContext';
import { appBridge } from '../../shared/api/appBridge';
import ContextMenu from '../../shared/components/context-menu/ContextMenu';
import ConfirmDialog from '../../shared/components/dialog/ConfirmDialog';
import MessageDialog from '../../shared/components/dialog/MessageDialog';
import SplitWorkspace from '../../shared/components/SplitWorkspace';
import TreeView, { type TreeViewRef } from '../../shared/components/tree/TreeView';

import ConfigFieldEditor from './components/ConfigFieldEditor';
import EnumSchemaEditor from './components/EnumSchemaEditor';
import ExportConfigModal from './components/ExportConfigModal';
import TableDataEditor from './components/TableDataEditor';
import TypeSchemaEditor from './components/TypeSchemaEditor';
import {
  getValueByPath,
  normalizeSchemaDraftRuntime,
  setValueByPath
} from './fieldUtils';
import {
  buildConfigNodes,
  buildExpandedIds,
  buildNodeMap,
  buildTreeNodes,
  findAncestorByKind
} from './treeModel';
import {
  buildTypeSchemaLayers,
  collectInheritedDescendantTypeIds
} from './runtime';
import type { ConfigNodeModel, PendingDelete, PendingNodeSwitch } from './types';
import { useCustomDragState } from './useCustomDragState';
import { useCustomEditorState } from './useCustomEditorState';
import { useCustomExportState } from './useCustomExportState';
import { useCustomTreeActions } from './useCustomTreeActions';
import { useCustomSnapshotState } from './useCustomSnapshotState';

function CustomPage() {
  const treeViewRef = useRef<TreeViewRef<ConfigNodeModel> | null>(null);
  const { currentProject, workspaceRevision } = useWorkspace();

  const {
    snapshot,
    setSnapshot,
    loading,
    errorMessage,
    setErrorMessage
  } = useCustomSnapshotState(currentProject, workspaceRevision);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [treeSearchKeyword, setTreeSearchKeyword] = useState('');
  const [pendingNodeSwitch, setPendingNodeSwitch] = useState<PendingNodeSwitch | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [infoDialogMessage, setInfoDialogMessage] = useState<string | null>(null);

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
  const {
    addEnumItem,
    addSchemaField,
    baseTypeKeyword,
    enumClassNameDraft,
    enumDraftDirty,
    enumItemsDraft,
    enumNamespaceDraft,
    isBaseTypeDropdownOpen,
    isSavingEnumSchema,
    isSavingSchema,
    removeEnumItem,
    removeSchemaField,
    safeSelectedTypeDraft,
    saveEnumSchema,
    saveTypeSchema,
    schemaDraft,
    setBaseTypeKeyword,
    setEnumClassNameDraft,
    setEnumDraftDirty,
    setEnumItemsDraft,
    setEnumNamespaceDraft,
    setIsBaseTypeDropdownOpen,
    setSchemaDraft,
    updateEnumItem,
    updateSchemaField,
    updateTypeDraft
  } = useCustomEditorState({
    selectedNode,
    selectedNodeId,
    selectedTypeSchema,
    selectedEnumSchema,
    setSnapshot,
    setErrorMessage,
    workspaceRevision
  });
  const dirtyEditorKind =
    selectedNode?.kind === 'configType' && schemaDraft?.dirty
      ? 'configType'
      : selectedNode?.kind === 'configEnum' && enumDraftDirty
        ? 'configEnum'
        : null;
  const {
    dragOverArrayIndex,
    dragOverArrayListKey,
    dragOverArrayPosition,
    dragOverFieldId,
    dragOverPosition,
    clearArrayDragState,
    clearFieldDragState,
    handleArrayItemDragOver,
    handleArrayItemDragStart,
    handleFieldDragOver,
    handleFieldDragStart,
    reorderArrayItems,
    reorderFieldItems
  } = useCustomDragState();

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
  const {
    exportLanguageSelection,
    exportTypeSelection,
    isExporting,
    setExportLanguageSelection,
    setExportTypeSelection,
    setShowExportModal,
    showExportModal,
    submitExport
  } = useCustomExportState({
    typeNodesForExport,
    setErrorMessage,
    setInfoDialogMessage
  });

  useEffect(() => {
    setSelectedNodeIds([]);
    setPendingNodeSwitch(null);
    setPendingDelete(null);
  }, [workspaceRevision]);

  useEffect(() => {
    setSelectedNodeIds((previous) => previous.filter((id) => nodeMap.has(id)));
  }, [nodeMap]);

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
  const {
    buildContextMenuItems,
    canDropNodes,
    confirmDelete,
    handleDrop,
    handleRename,
    handleSelectionChange,
    removeSelected
  } = useCustomTreeActions({
    nodes,
    nodeMap,
    selectedNode,
    selectedNodeId,
    selectedNodeIds,
    pendingDelete,
    pendingNodeSwitch,
    dirtyEditorKind,
    treeViewRef,
    withStoreAction,
    setSelectedNodeIds,
    setPendingNodeSwitch,
    setPendingDelete,
    setSchemaDraft,
    setInfoDialogMessage
  });
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

  const handleFieldDrop = (fieldId: string, event: DragEvent<HTMLDivElement>) => {
    if (!safeSelectedTypeDraft) {
      clearFieldDragState();
      return;
    }
    reorderFieldItems(
      fieldId,
      safeSelectedTypeDraft.fields,
      (next) => {
        updateTypeDraft((draft) => ({
          ...draft,
          fields: next
        }));
      },
      event
    );
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
    visitedNestedTypeIds = new Set<string>(),
    readValue: (path: string[]) => unknown = readSelectedTableValueAtPath,
    writeValue: (path: string[], nextValue: ConfigFieldValue) => void = writeSelectedTableValueAtPath,
    scopePath = '__root__'
  ) => (
    <ConfigFieldEditor
      key={`${scopePath}:${path.join('/')}`}
      field={field}
      path={path}
      nodeMap={nodeMap}
      typeSchemaByNodeId={typeSchemaByNodeId}
      enumSchemaByNodeId={enumSchemaByNodeId}
      dragOverArrayListKey={dragOverArrayListKey}
      dragOverArrayIndex={dragOverArrayIndex}
      dragOverArrayPosition={dragOverArrayPosition}
      visitedNestedTypeIds={visitedNestedTypeIds}
      readValue={readValue}
      writeValue={writeValue}
      scopePath={scopePath}
      onArrayItemDragOver={handleArrayItemDragOver}
      onArrayItemDragStart={handleArrayItemDragStart}
      onArrayDragEnd={clearArrayDragState}
      onReorderArrayItems={reorderArrayItems}
    />
  );

  const selectedNodeDisplayName = selectedNode?.name ?? '\u672a\u547d\u540d\u8282\u70b9';

  const confirmNodeSwitchSave = async () => {
    if (!pendingNodeSwitch) {
      return;
    }

    const saved =
      pendingNodeSwitch.dirtyEditorKind === 'configType'
        ? await saveTypeSchema(schemaDraft ? normalizeSchemaDraftRuntime(schemaDraft) : undefined)
        : await saveEnumSchema();
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
                      onDrop={(event) => {
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
              <TypeSchemaEditor
                selectedNodeDisplayName={selectedNodeDisplayName}
                draft={safeSelectedTypeDraft}
                isSavingSchema={isSavingSchema}
                selectedBaseTypeName={selectedBaseTypeName}
                isBaseTypeDropdownOpen={isBaseTypeDropdownOpen}
                baseTypeKeyword={baseTypeKeyword}
                filteredInheritanceCandidates={filteredInheritanceCandidates}
                nestedTypeCandidates={nestedTypeCandidates}
                enumTypeCandidates={enumTypeCandidates}
                dragOverFieldId={dragOverFieldId}
                dragOverPosition={dragOverPosition}
                onSave={() => {
                  void saveTypeSchema();
                }}
                onClassNameChange={(value) => {
                  updateTypeDraft((draft) => ({ ...draft, className: value }));
                }}
                onNamespaceChange={(value) => {
                  updateTypeDraft((draft) => ({ ...draft, namespace: value }));
                }}
                onToggleBaseTypeDropdown={() => {
                  setIsBaseTypeDropdownOpen((previous) => !previous);
                }}
                onBaseTypeKeywordChange={setBaseTypeKeyword}
                onSelectBaseType={(nodeId) => {
                  updateTypeDraft((draft) => ({ ...draft, baseTypeNodeId: nodeId }));
                  setIsBaseTypeDropdownOpen(false);
                }}
                onExportAsTableListChange={(checked) => {
                  updateTypeDraft((draft) => ({ ...draft, exportAsTableList: checked }));
                }}
                onExportTableListFileNameChange={(value) => {
                  updateTypeDraft((draft) => ({ ...draft, exportTableListFileName: value }));
                }}
                onAddSchemaField={addSchemaField}
                onRemoveSchemaField={removeSchemaField}
                onUpdateSchemaField={updateSchemaField}
                onFieldDragOver={handleFieldDragOver}
                onFieldDrop={handleFieldDrop}
                onFieldDragStart={handleFieldDragStart}
                onFieldDragEnd={clearFieldDragState}
              />
            ) : selectedNode.kind === 'configEnum' ? (
              <EnumSchemaEditor
                selectedNodeDisplayName={selectedNodeDisplayName}
                classNameDraft={enumClassNameDraft}
                namespaceDraft={enumNamespaceDraft}
                itemsDraft={enumItemsDraft}
                enumDraftDirty={enumDraftDirty}
                isSavingEnumSchema={isSavingEnumSchema}
                dragOverArrayListKey={dragOverArrayListKey}
                dragOverArrayIndex={dragOverArrayIndex}
                dragOverArrayPosition={dragOverArrayPosition}
                onSave={() => {
                  void saveEnumSchema();
                }}
                onClassNameChange={(value) => {
                  setEnumClassNameDraft(value);
                  setEnumDraftDirty(true);
                }}
                onNamespaceChange={(value) => {
                  setEnumNamespaceDraft(value);
                  setEnumDraftDirty(true);
                }}
                onAddEnumItem={addEnumItem}
                onUpdateEnumItem={updateEnumItem}
                onRemoveEnumItem={removeEnumItem}
                onArrayItemDragOver={handleArrayItemDragOver}
                onArrayItemDragStart={handleArrayItemDragStart}
                onArrayDragEnd={clearArrayDragState}
                onReorderEnumItems={(index, event) => {
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
              />
            ) : selectedNode.kind === 'configTable' && selectedTable ? (
              <TableDataEditor
                selectedNodeDisplayName={selectedNodeDisplayName}
                selectedTypeNodeId={selectedTypeNode?.id}
                fieldsForSelectedTable={fieldsForSelectedTable}
                fieldsForSelectedTableLayers={fieldsForSelectedTableLayers}
                renderConfigFieldEditor={renderConfigFieldEditor}
              />
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

      <MessageDialog
        open={Boolean(infoDialogMessage)}
        title="提示"
        message={infoDialogMessage ?? ''}
        onConfirm={() => {
          setInfoDialogMessage(null);
        }}
      />
    </section>
  );
}

export default CustomPage;
