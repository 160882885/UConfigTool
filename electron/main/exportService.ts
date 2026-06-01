import { promises as fs } from 'node:fs';
import path from 'node:path';

import { dialog, shell } from 'electron';

import type {
  ConfigStoreSnapshot,
  ConfigTableRecord,
  ConfigTreeNodeRecord,
  ConfigTypeSchemaRecord,
  ExportConfigInput,
  ExportLanguage,
  ExportResult
} from '../../shared/contracts';
import { getTypeScriptFileName, renderTableJson, renderTypeScript } from './codegen/handlebarsGenerator';
import { getConfigStoreSnapshot } from './configStore';
import { getCurrentProjectPath } from './projectStore';

type ExportTypeRecord = {
  id: string;
  name: string;
  baseTypeNodeId?: string;
  className: string;
  namespace: string;
  exportAsTableList: boolean;
  exportTableListFileName: string;
  fields: ConfigTypeSchemaRecord['fields'];
  tables: Array<{
    id: string;
    name: string;
    typeId: string;
    values: ConfigTableRecord['values'];
  }>;
};

const SCRIPT_EXT_BY_LANGUAGE: Record<ExportLanguage, string> = {
  csharp: '.cs',
  lua: '.lua',
  typescript: '.ts',
  python: '.py',
  java: '.java',
  go: '.go',
  cpp: '.h',
  rust: '.rs'
};

function sanitizeFileName(value: string, fallback: string): string {
  const cleaned = (value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || fallback;
}

async function ensureDir(targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
}

async function pickExportFolder(defaultPath: string): Promise<string | null> {
  const filePaths = (dialog as unknown as { showOpenDialogSync: (options: unknown) => string[] | undefined }).showOpenDialogSync({
    title: '选择导出文件夹',
    defaultPath,
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    buttonLabel: '导出到此文件夹'
  });

  if (!filePaths || filePaths.length === 0) {
    return null;
  }
  return filePaths[0];
}

function sortNodes(nodes: ConfigTreeNodeRecord[]): ConfigTreeNodeRecord[] {
  return [...nodes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function buildChildrenByParent(nodes: ConfigTreeNodeRecord[]): Map<string | null, ConfigTreeNodeRecord[]> {
  const map = new Map<string | null, ConfigTreeNodeRecord[]>();
  for (const node of nodes) {
    const children = map.get(node.parentId);
    if (children) {
      children.push(node);
    } else {
      map.set(node.parentId, [node]);
    }
  }
  for (const children of map.values()) {
    children.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  return map;
}

function buildExportTypes(snapshot: ConfigStoreSnapshot): ExportTypeRecord[] {
  const schemaByNodeId = new Map(snapshot.typeSchemas.map((schema) => [schema.nodeId, schema]));
  const typeNodes = sortNodes(snapshot.nodes.filter((node) => node.kind === 'configType'));

  const exportTypes: ExportTypeRecord[] = [];
  for (const typeNode of typeNodes) {
    const schema = schemaByNodeId.get(typeNode.id);
    if (!schema) {
      continue;
    }
    exportTypes.push({
      id: typeNode.id,
      name: typeNode.name,
      baseTypeNodeId: schema.baseTypeNodeId,
      className: schema.className,
      namespace: schema.namespace,
      exportAsTableList: schema.exportAsTableList,
      exportTableListFileName: schema.exportTableListFileName,
      fields: schema.fields,
      tables: []
    });
  }

  return exportTypes;
}

function allocateUniqueName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }

  const parsed = path.parse(name);
  let index = 2;
  while (true) {
    const candidate = `${parsed.name}_${index}${parsed.ext}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    index += 1;
  }
}

function stringifyTableValues(values: ConfigTableRecord['values']): string {
  return `${JSON.stringify(values ?? {}, null, 2)}\n`;
}

function stringifyTableListValues(records: unknown[]): string {
  return `${JSON.stringify(records, null, 2)}\n`;
}

type TableListExportGroup = {
  typeId: string;
  parentNodeId: string | null;
  parentDir: string;
  tables: Array<{
    id: string;
    name: string;
    values: ConfigTableRecord['values'];
  }>;
};

async function exportConfigs(input: ExportConfigInput): Promise<ExportResult | null> {
  const currentProjectPath = await getCurrentProjectPath();
  if (!currentProjectPath) {
    throw new Error('请先创建或打开项目。');
  }

  const snapshot = await getConfigStoreSnapshot();
  const exportTypes = buildExportTypes(snapshot);
  const exportTypeByNodeId = new Map(exportTypes.map((type) => [type.id, type]));
  const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const tableByNodeId = new Map(snapshot.tables.map((table) => [table.nodeId, table]));
  const childrenByParent = buildChildrenByParent(snapshot.nodes);

  const selectedTypeNodeIdSet = new Set(input.selectedTypeNodeIds);
  const selectedLanguages = new Set<ExportLanguage>(input.selectedLanguages);
  if (selectedLanguages.size === 0) {
    throw new Error('请至少选择一种编程语言。');
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

  const writeNode = async (
    node: ConfigTreeNodeRecord,
    parentDir: string,
    ownerTypeNodeId: string | null
  ): Promise<void> => {
    if (node.kind === 'configTable') {
      const table = tableByNodeId.get(node.id);
      if (!table) {
        return;
      }

      if (!ownerTypeNodeId || !selectedTypeNodeIdSet.has(ownerTypeNodeId)) {
        return;
      }

      const typeRecord = exportTypeByNodeId.get(ownerTypeNodeId) ?? null;
      if (typeRecord?.exportAsTableList) {
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
          values: table.values
        });
        listExportGroups.set(groupKey, grouped);
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
            exportTypes
          )
        : stringifyTableValues(table.values);
      await fs.writeFile(filePath, content, 'utf8');
      exportedTableFileCount += 1;
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
        for (const language of selectedLanguages) {
          const fallbackName = `${node.id}${SCRIPT_EXT_BY_LANGUAGE[language]}`;
          const preferredScriptName = sanitizeFileName(getTypeScriptFileName(typeRecord, language), fallbackName);
          const scriptName = resolveSiblingName(parentDir, preferredScriptName);
          const scriptPath = path.join(parentDir, scriptName);
          await fs.writeFile(scriptPath, renderTypeScript(typeRecord, language, exportTypes), 'utf8');
          generatedScriptFileCount += 1;
        }
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
        exportTypes
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
