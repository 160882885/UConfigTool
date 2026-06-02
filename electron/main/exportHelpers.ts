import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  ConfigStoreSnapshot,
  ConfigTableRecord,
  ConfigTreeNodeRecord
} from '../../shared/contracts';
import { pickDirectory } from './folderDialog';
import type { ExportEnumRecord, ExportTypeRecord } from './exportModels';

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
  return pickDirectory({
    title: '\u9009\u62e9\u5bfc\u51fa\u6587\u4ef6\u5939',
    defaultPath,
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    buttonLabel: '\u5bfc\u51fa\u5230\u6b64\u6587\u4ef6\u5939'
  });
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

function buildExportEnums(snapshot: ConfigStoreSnapshot): ExportEnumRecord[] {
  const schemaByNodeId = new Map(snapshot.enumSchemas.map((schema) => [schema.nodeId, schema]));
  const enumNodes = sortNodes(snapshot.nodes.filter((node) => node.kind === 'configEnum'));
  const exportEnums: ExportEnumRecord[] = [];
  for (const enumNode of enumNodes) {
    const schema = schemaByNodeId.get(enumNode.id);
    if (!schema) {
      continue;
    }
    exportEnums.push({
      id: enumNode.id,
      name: enumNode.name,
      className: schema.className,
      namespace: schema.namespace,
      items: schema.items
    });
  }
  return exportEnums;
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

export {
  allocateUniqueName,
  buildChildrenByParent,
  buildExportEnums,
  buildExportTypes,
  ensureDir,
  pickExportFolder,
  sanitizeFileName,
  stringifyTableListValues,
  stringifyTableValues
};
