import { promises as fs } from 'node:fs';
import path from 'node:path';

import { shell } from 'electron';

import type {
  ConfigTableRecord,
  ConfigTreeNodeRecord,
  ExportConfigInput,
  ExportLanguage,
  ExportResult
} from '../../shared/contracts';
import {
  getEnumScriptFileName,
  getTypeScriptFileName,
  renderEnumScript,
  renderTableJson,
  renderTypeScript
} from './codegen/handlebarsGenerator';
import { getConfigStoreSnapshot } from './configStore';
import {
  allocateUniqueName,
  buildChildrenByParent,
  buildExportEnums,
  buildExportTypes,
  ensureDir,
  pickExportFolder,
  sanitizeFileName,
  stringifyTableListValues,
  stringifyTableValues
} from './exportHelpers';
import {
  SCRIPT_EXT_BY_LANGUAGE,
  type ExportTypeRecord,
  type TableListExportGroup
} from './exportModels';
import { getCurrentProjectPath } from './projectStore';

async function exportConfigs(input: ExportConfigInput): Promise<ExportResult | null> {
  const currentProjectPath = await getCurrentProjectPath();
  if (!currentProjectPath) {
    throw new Error('\u8bf7\u5148\u521b\u5efa\u6216\u6253\u5f00\u9879\u76ee\u3002');
  }

  const snapshot = await getConfigStoreSnapshot();
  const exportTypes = buildExportTypes(snapshot);
  const exportEnums = buildExportEnums(snapshot);
  const exportTypeByNodeId = new Map(exportTypes.map((type) => [type.id, type]));
  const exportEnumByNodeId = new Map(exportEnums.map((item) => [item.id, item]));
  const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const tableByNodeId = new Map(snapshot.tables.map((table) => [table.nodeId, table]));
  const childrenByParent = buildChildrenByParent(snapshot.nodes);

  const selectedTypeNodeIdSet = new Set(input.selectedTypeNodeIds);
  const selectedLanguages = new Set<ExportLanguage>(input.selectedLanguages);
  if (selectedLanguages.size === 0) {
    throw new Error('\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u79cd\u7f16\u7a0b\u8bed\u8a00\u3002');
  }

  const outputDir = await pickExportFolder(currentProjectPath);
  if (!outputDir) {
    return null;
  }
  await ensureDir(outputDir);

  let generatedScriptFileCount = 0;
  let exportedTableFileCount = 0;
  const siblingNameRegistry = new Map<string, Set<string>>();
  const listExportGroups = new Map<string, TableListExportGroup>();

  const resolveSiblingName = (parentDir: string, preferredName: string): string => {
    const names = siblingNameRegistry.get(parentDir) ?? new Set<string>();
    siblingNameRegistry.set(parentDir, names);
    return allocateUniqueName(preferredName, names);
  };

  const writeScriptFiles = async (
    parentDir: string,
    nodeId: string,
    resolvePreferredName: (language: ExportLanguage) => string,
    renderContent: (language: ExportLanguage) => string
  ) => {
    for (const language of selectedLanguages) {
      const fallbackName = `${nodeId}${SCRIPT_EXT_BY_LANGUAGE[language]}`;
      const preferredScriptName = sanitizeFileName(resolvePreferredName(language), fallbackName);
      const scriptName = resolveSiblingName(parentDir, preferredScriptName);
      const scriptPath = path.join(parentDir, scriptName);
      await fs.writeFile(scriptPath, renderContent(language), 'utf8');
      generatedScriptFileCount += 1;
    }
  };

  const collectTableListExport = (
    ownerTypeNodeId: string,
    node: ConfigTreeNodeRecord,
    parentDir: string,
    values: ConfigTableRecord['values']
  ) => {
    const groupKey = `${ownerTypeNodeId}::${node.parentId ?? '__root__'}`;
    const grouped = listExportGroups.get(groupKey) ?? {
      typeId: ownerTypeNodeId,
      parentNodeId: node.parentId,
      parentDir,
      tables: []
    };
    grouped.tables.push({
      id: node.id,
      name: node.name,
      values
    });
    listExportGroups.set(groupKey, grouped);
  };

  const writeTableNode = async (
    node: ConfigTreeNodeRecord,
    parentDir: string,
    ownerTypeNodeId: string | null
  ): Promise<void> => {
    const table = tableByNodeId.get(node.id);
    if (!table || !ownerTypeNodeId || !selectedTypeNodeIdSet.has(ownerTypeNodeId)) {
      return;
    }

    const typeRecord = exportTypeByNodeId.get(ownerTypeNodeId) ?? null;
    if (typeRecord?.exportAsTableList) {
      collectTableListExport(ownerTypeNodeId, node, parentDir, table.values);
      return;
    }

    const baseFileName = `${sanitizeFileName(node.name, node.id)}.json`;
    const fileName = resolveSiblingName(parentDir, baseFileName);
    const filePath = path.join(parentDir, fileName);
    const content = typeRecord
      ? renderTableJson(
          {
            id: node.id,
            name: node.name,
            typeId: ownerTypeNodeId,
            values: table.values
          },
          typeRecord,
          exportTypes,
          exportEnums
        )
      : stringifyTableValues(table.values);
    await fs.writeFile(filePath, content, 'utf8');
    exportedTableFileCount += 1;
  };

  const writeEnumNode = async (node: ConfigTreeNodeRecord, parentDir: string): Promise<void> => {
    const enumRecord = exportEnumByNodeId.get(node.id);
    if (!enumRecord) {
      return;
    }

    await writeScriptFiles(
      parentDir,
      node.id,
      (language) => getEnumScriptFileName(enumRecord, language),
      (language) => renderEnumScript(enumRecord, language)
    );
  };

  const writeTypeNodeScripts = async (
    node: ConfigTreeNodeRecord,
    parentDir: string,
    typeRecord: ExportTypeRecord
  ): Promise<void> => {
    await writeScriptFiles(
      parentDir,
      node.id,
      (language) => getTypeScriptFileName(typeRecord, language),
      (language) => renderTypeScript(typeRecord, language, exportTypes, exportEnums)
    );
  };

  const writeTableListGroups = async (): Promise<void> => {
    const sortedGroups = [...listExportGroups.values()].sort((a, b) => {
      if (a.typeId !== b.typeId) {
        return a.typeId.localeCompare(b.typeId);
      }
      return (a.parentNodeId ?? '').localeCompare(b.parentNodeId ?? '');
    });

    for (const group of sortedGroups) {
      const typeRecord = exportTypeByNodeId.get(group.typeId);
      if (!typeRecord || !typeRecord.exportAsTableList) {
        continue;
      }

      const tableRecords = group.tables.map((table) =>
        renderTableJson(
          {
            id: table.id,
            name: table.name,
            typeId: group.typeId,
            values: table.values
          },
          typeRecord,
          exportTypes,
          exportEnums
        )
      );
      const parsedRecords = tableRecords.map((item) => JSON.parse(item) as Record<string, unknown>);

      const parentNode = group.parentNodeId ? nodeById.get(group.parentNodeId) ?? null : null;
      const fallbackTypeName = sanitizeFileName(typeRecord.name, typeRecord.id);
      const preferredBaseName =
        parentNode?.kind === 'configType'
          ? sanitizeFileName(typeRecord.exportTableListFileName, fallbackTypeName)
          : parentNode?.kind === 'empty'
            ? sanitizeFileName(parentNode.name, parentNode.id)
            : sanitizeFileName(typeRecord.exportTableListFileName, fallbackTypeName);
      const preferredName = `${preferredBaseName}.json`;
      const fileName = resolveSiblingName(group.parentDir, preferredName);
      const filePath = path.join(group.parentDir, fileName);
      await fs.writeFile(filePath, stringifyTableListValues(parsedRecords), 'utf8');
      exportedTableFileCount += 1;
    }
  };

  const writeNode = async (
    node: ConfigTreeNodeRecord,
    parentDir: string,
    ownerTypeNodeId: string | null
  ): Promise<void> => {
    if (node.kind === 'configTable') {
      await writeTableNode(node, parentDir, ownerTypeNodeId);
      return;
    }

    if (node.kind === 'configEnum') {
      await writeEnumNode(node, parentDir);
      return;
    }

    const folderName = resolveSiblingName(parentDir, sanitizeFileName(node.name, node.id));
    const folderPath = path.join(parentDir, folderName);
    await ensureDir(folderPath);

    let nextOwnerTypeNodeId = ownerTypeNodeId;
    if (node.kind === 'configType') {
      nextOwnerTypeNodeId = node.id;
      const typeRecord = exportTypeByNodeId.get(node.id);
      if (typeRecord) {
        await writeTypeNodeScripts(node, parentDir, typeRecord);
      }
    }

    const children = childrenByParent.get(node.id) ?? [];
    for (const child of children) {
      await writeNode(child, folderPath, nextOwnerTypeNodeId);
    }
  };

  const roots = childrenByParent.get(null) ?? [];
  for (const root of roots) {
    await writeNode(root, outputDir, null);
  }

  await writeTableListGroups();
  await shell.openPath(outputDir);

  return {
    outputDir,
    exportedTypeCount: exportTypes.length,
    exportedTableFileCount,
    generatedScriptFileCount
  };
}

export {
  exportConfigs
};
