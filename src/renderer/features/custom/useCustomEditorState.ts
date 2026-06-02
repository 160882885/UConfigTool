import { useEffect, useMemo, useState } from 'react';

import type {
  ConfigFieldDef,
  ConfigStoreSnapshot
} from '../../../../shared/contracts';
import { appBridge } from '../../shared/api/appBridge';

import { cloneFields, normalizeSchemaDraftRuntime } from './fieldUtils';
import type { ConfigNodeModel, SchemaDraft } from './types';

interface UseCustomEditorStateOptions {
  selectedNode: ConfigNodeModel | null;
  selectedNodeId: string | null;
  selectedTypeSchema: {
    baseTypeNodeId?: string;
    className: string;
    namespace: string;
    exportAsTableList: boolean;
    exportTableListFileName: string;
    fields: ConfigFieldDef[];
  } | null;
  selectedEnumSchema: {
    className: string;
    namespace: string;
    items: Array<{ id: string; value: string }>;
  } | null;
  setSnapshot: (snapshot: ConfigStoreSnapshot) => void;
  setErrorMessage: (message: string | null) => void;
  workspaceRevision: number;
}

function useCustomEditorState({
  selectedNode,
  selectedNodeId,
  selectedTypeSchema,
  selectedEnumSchema,
  setSnapshot,
  setErrorMessage,
  workspaceRevision
}: UseCustomEditorStateOptions) {
  const [schemaDraft, setSchemaDraft] = useState<SchemaDraft | null>(null);
  const [isSavingSchema, setIsSavingSchema] = useState(false);
  const [isBaseTypeDropdownOpen, setIsBaseTypeDropdownOpen] = useState(false);
  const [baseTypeKeyword, setBaseTypeKeyword] = useState('');
  const [enumItemsDraft, setEnumItemsDraft] = useState<Array<{ id: string; value: string }>>([]);
  const [enumClassNameDraft, setEnumClassNameDraft] = useState('');
  const [enumNamespaceDraft, setEnumNamespaceDraft] = useState('');
  const [enumDraftDirty, setEnumDraftDirty] = useState(false);
  const [isSavingEnumSchema, setIsSavingEnumSchema] = useState(false);

  useEffect(() => {
    setSchemaDraft(null);
    setEnumItemsDraft([]);
    setEnumClassNameDraft('');
    setEnumNamespaceDraft('');
    setEnumDraftDirty(false);
  }, [workspaceRevision]);

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
  }, [selectedEnumSchema, selectedNode]);

  useEffect(() => {
    setIsBaseTypeDropdownOpen(false);
    setBaseTypeKeyword('');
  }, [selectedNodeId]);

  const selectedTypeDraft = selectedNode?.kind === 'configType' && schemaDraft && schemaDraft.nodeId === selectedNode.id ? schemaDraft : null;
  const safeSelectedTypeDraft = useMemo(
    () => (selectedTypeDraft ? normalizeSchemaDraftRuntime(selectedTypeDraft) : null),
    [selectedTypeDraft]
  );

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
      setErrorMessage(error instanceof Error ? error.message : '保存配置类型失败。');
      return false;
    } finally {
      setIsSavingSchema(false);
    }
  };

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
      setErrorMessage(error instanceof Error ? error.message : '保存枚举失败。');
      return false;
    } finally {
      setIsSavingEnumSchema(false);
    }
  };

  const createSchemaField = (index: number): ConfigFieldDef => ({
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `field_${Date.now()}`,
    tag: `field_${index + 1}`,
    fieldName: `field_${index + 1}`,
    type: 'string',
    nestedTypeId: undefined,
    enumTypeNodeId: undefined
  });

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

  return {
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
  };
}

export { useCustomEditorState };
