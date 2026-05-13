import { promises as fs } from 'node:fs';
import path from 'node:path';

import { dialog, shell } from 'electron';

import type {
  ConfigStoreSnapshot,
  ExportConfigInput,
  ExportLanguage,
  ExportResult
} from '../../shared/contracts';
import { getTypeScriptFileName, renderTableJson, renderTypeScript } from './codegen/handlebarsGenerator';
import { getCurrentProjectPath } from './projectStore';
import { getConfigStoreSnapshot } from './configStore';

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

function shouldExportTypeTables(typeId: string, selectedTypeIds: Set<string>): boolean {
  return selectedTypeIds.has(typeId);
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

async function exportConfigs(input: ExportConfigInput): Promise<ExportResult | null> {
  const currentProjectPath = await getCurrentProjectPath();
  if (!currentProjectPath) {
    throw new Error('请先创建或打开项目。');
  }

  const snapshot: ConfigStoreSnapshot = await getConfigStoreSnapshot();
  const selectedTypeIds = new Set(input.selectedTypeIds);
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

  // 类型文件夹：所有配置类型都导出（无视类型勾选）。
  for (const type of snapshot.types) {
    if (selectedLanguages.has('csharp')) {
      const csDir = path.join(typeRoot, 'csharp');
      await ensureDir(csDir);
      const csPath = path.join(csDir, sanitizeFileName(getTypeScriptFileName(type, 'csharp'), `${type.id}.cs`));
      await fs.writeFile(csPath, renderTypeScript(type, 'csharp', snapshot.types), 'utf8');
      generatedScriptFileCount += 1;
    }

    if (selectedLanguages.has('lua')) {
      const luaDir = path.join(typeRoot, 'lua');
      await ensureDir(luaDir);
      const luaPath = path.join(luaDir, sanitizeFileName(getTypeScriptFileName(type, 'lua'), `${type.id}.lua`));
      await fs.writeFile(luaPath, renderTypeScript(type, 'lua', snapshot.types), 'utf8');
      generatedScriptFileCount += 1;
    }
  }

  // 配置表文件夹：只导出勾选的配置类型。
  for (const type of snapshot.types) {
    if (!shouldExportTypeTables(type.id, selectedTypeIds)) {
      continue;
    }

    const typeFolderName = sanitizeFileName(type.name, type.id);
    const typeDir = path.join(tableRoot, typeFolderName);
    await ensureDir(typeDir);

    for (const table of type.tables) {
      const tableFileName = `${sanitizeFileName(table.name, table.id)}.json`;
      const tablePath = path.join(typeDir, tableFileName);
      await fs.writeFile(tablePath, renderTableJson(table, type, snapshot.types), 'utf8');
      exportedTableFileCount += 1;
    }
  }

  await shell.openPath(outputDir);

  return {
    outputDir,
    exportedTypeCount: snapshot.types.length,
    exportedTableFileCount,
    generatedScriptFileCount
  };
}

export {
  exportConfigs
};
