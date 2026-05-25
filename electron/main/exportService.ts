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
import { getCurrentProjectPath } from './projectStore';
import { getConfigStoreSnapshot } from './configStore';

type ExportTypeRecord = {
  id: string;
  name: string;
  className: string;
  namespace: string;
  fields: ConfigTypeSchemaRecord['fields'];
  tables: Array<{
    id: string;
    name: string;
    typeId: string;
    values: ConfigTableRecord['values'];
  }>;
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

function getNodeById(nodes: ConfigTreeNodeRecord[], nodeId: string): ConfigTreeNodeRecord | null {
  return nodes.find((node) => node.id === nodeId) ?? null;
}

function collectTablesUnderType(
  nodes: ConfigTreeNodeRecord[],
  tableByNodeId: Map<string, ConfigTableRecord>,
  typeNodeId: string
): Array<{ node: ConfigTreeNodeRecord; table: ConfigTableRecord }> {
  const result: Array<{ node: ConfigTreeNodeRecord; table: ConfigTableRecord }> = [];

  const queue = nodes.filter((node) => node.parentId === typeNodeId).sort((a, b) => a.order - b.order);
  while (queue.length > 0) {
    const current = queue.shift() as ConfigTreeNodeRecord;
    if (current.kind === 'configTable') {
      const table = tableByNodeId.get(current.id);
      if (table) {
        result.push({ node: current, table });
      }
    }

    const children = nodes
      .filter((node) => node.parentId === current.id)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    queue.push(...children);
  }

  return result;
}

function buildExportTypes(snapshot: ConfigStoreSnapshot): ExportTypeRecord[] {
  const schemaByNodeId = new Map(snapshot.typeSchemas.map((schema) => [schema.nodeId, schema]));
  const tableByNodeId = new Map(snapshot.tables.map((table) => [table.nodeId, table]));
  const typeNodes = snapshot.nodes
    .filter((node) => node.kind === 'configType')
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const exportTypes: ExportTypeRecord[] = [];
  for (const typeNode of typeNodes) {
    const schema = schemaByNodeId.get(typeNode.id);
    if (!schema) {
      continue;
    }

    const tables = collectTablesUnderType(snapshot.nodes, tableByNodeId, typeNode.id).map(({ node, table }) => ({
      id: node.id,
      name: node.name,
      typeId: typeNode.id,
      values: table.values
    }));

    exportTypes.push({
      id: typeNode.id,
      name: typeNode.name,
      className: schema.className,
      namespace: schema.namespace,
      fields: schema.fields,
      tables
    });
  }

  return exportTypes;
}

async function exportConfigs(input: ExportConfigInput): Promise<ExportResult | null> {
  const currentProjectPath = await getCurrentProjectPath();
  if (!currentProjectPath) {
    throw new Error('请先创建或打开项目。');
  }

  const snapshot = await getConfigStoreSnapshot();
  const exportTypes = buildExportTypes(snapshot);

  const selectedTypeNodeIdSet = new Set(input.selectedTypeNodeIds);
  const selectedLanguages = new Set<ExportLanguage>(input.selectedLanguages);
  if (selectedLanguages.size === 0) {
    throw new Error('请至少选择一种编程语言。');
  }

  const outputDir = await pickExportFolder(currentProjectPath);
  if (!outputDir) {
    return null;
  }

  const typeRoot = path.join(outputDir, '类型文件夹');
  const tableRoot = path.join(outputDir, '配置表文件夹');
  await ensureDir(typeRoot);
  await ensureDir(tableRoot);

  let generatedScriptFileCount = 0;
  let exportedTableFileCount = 0;

  for (const type of exportTypes) {
    for (const language of selectedLanguages) {
      const languageDir = path.join(typeRoot, language);
      await ensureDir(languageDir);

      const fallbackExtByLanguage: Record<ExportLanguage, string> = {
        csharp: '.cs',
        lua: '.lua',
        typescript: '.ts',
        python: '.py',
        java: '.java',
        go: '.go',
        cpp: '.h',
        rust: '.rs'
      };
      const fallbackName = `${type.id}${fallbackExtByLanguage[language]}`;
      const filePath = path.join(languageDir, sanitizeFileName(getTypeScriptFileName(type, language), fallbackName));
      await fs.writeFile(filePath, renderTypeScript(type, language, exportTypes), 'utf8');
      generatedScriptFileCount += 1;
    }
  }

  for (const type of exportTypes) {
    if (!selectedTypeNodeIdSet.has(type.id)) {
      continue;
    }

    const typeDir = path.join(tableRoot, sanitizeFileName(type.name, type.id));
    await ensureDir(typeDir);
    for (const table of type.tables) {
      const tableFilePath = path.join(typeDir, `${sanitizeFileName(table.name, table.id)}.json`);
      await fs.writeFile(tableFilePath, renderTableJson(table, type, exportTypes), 'utf8');
      exportedTableFileCount += 1;
    }
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
