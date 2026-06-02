import type { ConfigFieldDef } from '../../../shared/contracts';

import type { ExportEnumRecord, ExportTableRecord, ExportTypeRecord } from './models';
import { resolveExportFieldName } from './modelBuilders';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIntegerValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return 0;
}

function toFloatValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function toBooleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '' || normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
      return false;
    }
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
  }
  return Boolean(value);
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function toEnumIntegerValue(value: unknown, field: ConfigFieldDef, enumById: ReadonlyMap<string, ExportEnumRecord>): number {
  const enumTypeNodeId = typeof field.enumTypeNodeId === 'string' ? field.enumTypeNodeId : '';
  const raw = toStringValue(value);
  if (enumTypeNodeId) {
    const enumRecord = enumById.get(enumTypeNodeId) ?? null;
    if (enumRecord) {
      const index = enumRecord.items.findIndex((item) => item.value === raw);
      if (index >= 0) {
        return index;
      }
    }
  }
  return toIntegerValue(raw);
}

function mergeTypeFieldsWithInheritance(type: ExportTypeRecord, typeById: ReadonlyMap<string, ExportTypeRecord>): ConfigFieldDef[] {
  const chain: ExportTypeRecord[] = [];
  const visited = new Set<string>();
  let cursor: ExportTypeRecord | null = type;

  while (cursor && !visited.has(cursor.id)) {
    chain.push(cursor);
    visited.add(cursor.id);
    cursor = cursor.baseTypeNodeId ? typeById.get(cursor.baseTypeNodeId) ?? null : null;
  }

  chain.reverse();
  const merged: ConfigFieldDef[] = [];
  const indexById = new Map<string, number>();
  for (const chainType of chain) {
    for (const field of chainType.fields) {
      const existingIndex = indexById.get(field.id);
      if (typeof existingIndex === 'number') {
        merged[existingIndex] = field;
      } else {
        indexById.set(field.id, merged.length);
        merged.push(field);
      }
    }
  }
  return merged;
}

function mapTableToJsonRecord(
  values: Record<string, unknown>,
  fields: ConfigFieldDef[],
  typeById: ReadonlyMap<string, ExportTypeRecord>,
  enumById: ReadonlyMap<string, ExportEnumRecord>,
  visitedTypeIds: ReadonlySet<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const fieldName = resolveExportFieldName(field, i);
    result[fieldName] = mapFieldValueForJson(values[field.id], field, typeById, enumById, visitedTypeIds);
  }
  return result;
}

function mapFieldValueForJson(
  value: unknown,
  field: ConfigFieldDef,
  typeById: ReadonlyMap<string, ExportTypeRecord>,
  enumById: ReadonlyMap<string, ExportEnumRecord>,
  visitedTypeIds: ReadonlySet<string>
): unknown {
  if (field.type === 'int') {
    return toIntegerValue(value);
  }
  if (field.type === 'float') {
    return toFloatValue(value);
  }
  if (field.type === 'string') {
    return toStringValue(value);
  }
  if (field.type === 'bool') {
    return toBooleanValue(value);
  }
  if (field.type === 'enum') {
    return toEnumIntegerValue(value, field, enumById);
  }
  if (field.type === 'int_array') {
    return Array.isArray(value) ? value.map((item) => toIntegerValue(item)) : [];
  }
  if (field.type === 'float_array') {
    return Array.isArray(value) ? value.map((item) => toFloatValue(item)) : [];
  }
  if (field.type === 'string_array') {
    return Array.isArray(value) ? value.map((item) => toStringValue(item)) : [];
  }
  if (field.type === 'bool_array') {
    return Array.isArray(value) ? value.map((item) => toBooleanValue(item)) : [];
  }

  if (field.type !== 'nested' && field.type !== 'nested_array') {
    return null;
  }

  const nestedTypeId = field.nestedTypeId ?? '';
  const nestedType = nestedTypeId ? typeById.get(nestedTypeId) ?? null : null;
  if (!nestedType || visitedTypeIds.has(nestedType.id)) {
    return {};
  }

  const nextVisited = new Set(visitedTypeIds);
  nextVisited.add(nestedType.id);
  const nestedFields = mergeTypeFieldsWithInheritance(nestedType, typeById);

  if (field.type === 'nested') {
    const nestedValues = isRecord(value) ? value : {};
    return mapTableToJsonRecord(nestedValues, nestedFields, typeById, enumById, nextVisited);
  }

  const nestedList = Array.isArray(value) ? value : [];
  return nestedList.map((item) =>
    mapTableToJsonRecord(isRecord(item) ? item : {}, nestedFields, typeById, enumById, nextVisited)
  );
}

function renderTableJson(
  table: ExportTableRecord,
  type: ExportTypeRecord,
  allTypes: ExportTypeRecord[],
  allEnums: ExportEnumRecord[] = []
): string {
  const typeById = new Map<string, ExportTypeRecord>(allTypes.map((item) => [item.id, item]));
  const enumById = new Map<string, ExportEnumRecord>(allEnums.map((item) => [item.id, item]));
  const mergedFields = mergeTypeFieldsWithInheritance(type, typeById);
  const record = mapTableToJsonRecord(table.values, mergedFields, typeById, enumById, new Set([type.id]));
  return `${JSON.stringify(record, null, 2)}\n`;
}

export {
  mergeTypeFieldsWithInheritance,
  renderTableJson
};
