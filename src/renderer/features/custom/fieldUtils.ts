import type { ConfigFieldDef, ConfigFieldType, ConfigFieldValue } from '../../../../shared/contracts';
import { FIELD_TYPE_OPTIONS } from './constants';
import type { SchemaDraft } from './types';

export function isArrayFieldType(type: ConfigFieldType): boolean {
  return type === 'int_array' || type === 'float_array' || type === 'string_array' || type === 'bool_array';
}

export function isIntType(type: ConfigFieldType): boolean {
  return type === 'int' || type === 'int_array';
}

export function isFloatType(type: ConfigFieldType): boolean {
  return type === 'float' || type === 'float_array';
}

export function isValidIntegerInput(value: string): boolean {
  return /^-?\d*$/.test(value);
}

export function isValidFloatInput(value: string): boolean {
  return /^-?\d*(\.\d*)?$/.test(value);
}

export function normalizeFieldValue(type: ConfigFieldType, value: unknown): ConfigFieldValue {
  if (type === 'nested') {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, ConfigFieldValue>;
    }
    return {};
  }
  if (type === 'bool') {
    return typeof value === 'boolean' ? value : false;
  }
  if (type === 'bool_array') {
    return Array.isArray(value) ? value.map((item) => Boolean(item)) : [];
  }
  if (isArrayFieldType(type)) {
    return Array.isArray(value) ? value.map((item) => String(item ?? '')) : [];
  }
  return typeof value === 'string' ? value : String(value ?? '');
}

export function getArrayDraftFromValue(value: unknown, boolArray: boolean): Array<string | boolean> {
  if (!Array.isArray(value)) {
    return [];
  }
  if (boolArray) {
    return value.map((item) => Boolean(item));
  }
  return value.map((item) => String(item ?? ''));
}

export function cloneFields(fields: ConfigFieldDef[]): ConfigFieldDef[] {
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields.map((field, index) => normalizeDraftField(field, index));
}

export function normalizeDraftField(fieldInput: Partial<ConfigFieldDef> | null | undefined, index: number): ConfigFieldDef {
  const field = fieldInput && typeof fieldInput === 'object' ? fieldInput : {};
  const fieldType = FIELD_TYPE_OPTIONS.some((option) => option.value === field.type) ? (field.type as ConfigFieldType) : 'string';
  const nestedTypeId = typeof field.nestedTypeId === 'string' ? field.nestedTypeId.trim() : '';
  return {
    id: typeof field.id === 'string' && field.id.trim() ? field.id : `field_invalid_${index + 1}`,
    tag: typeof field.tag === 'string' ? field.tag : '',
    fieldName: typeof field.fieldName === 'string' ? field.fieldName : '',
    type: fieldType,
    nestedTypeId: fieldType === 'nested' ? nestedTypeId || undefined : undefined
  };
}

export function normalizeSchemaDraftRuntime(draft: SchemaDraft): SchemaDraft {
  const normalizedFields = Array.isArray(draft.fields)
    ? draft.fields.map((field, index) => normalizeDraftField(field, index))
    : [];

  return {
    nodeId: typeof draft.nodeId === 'string' ? draft.nodeId : '',
    className: typeof draft.className === 'string' ? draft.className : '',
    namespace: typeof draft.namespace === 'string' ? draft.namespace : '',
    fields: normalizedFields,
    dirty: Boolean(draft.dirty)
  };
}

export function formatConfigFieldTitle(fieldInput: ConfigFieldDef | null | undefined): string {
  const field = fieldInput && typeof fieldInput === 'object' ? fieldInput : ({} as Partial<ConfigFieldDef>);
  const tag = typeof field.tag === 'string' ? field.tag.trim() : '';
  const fieldName = typeof field.fieldName === 'string' ? field.fieldName.trim() : '';
  if (tag && fieldName) {
    return `${tag}(${fieldName})`;
  }
  if (tag) {
    return tag;
  }
  if (fieldName) {
    return `(${fieldName})`;
  }
  return '未命名字段';
}

export function isRecord(value: unknown): value is Record<string, ConfigFieldValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getValueByPath(root: Record<string, ConfigFieldValue>, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor;
}

export function setValueByPath(
  root: Record<string, ConfigFieldValue>,
  path: string[],
  nextValue: ConfigFieldValue
): Record<string, ConfigFieldValue> {
  if (path.length === 0) {
    return root;
  }

  const nextRoot: Record<string, ConfigFieldValue> = { ...root };
  let cursor: Record<string, ConfigFieldValue> = nextRoot;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const existing = cursor[key];
    const nextChild: Record<string, ConfigFieldValue> = isRecord(existing) ? { ...existing } : {};
    cursor[key] = nextChild;
    cursor = nextChild;
  }

  cursor[path[path.length - 1]] = nextValue;
  return nextRoot;
}
