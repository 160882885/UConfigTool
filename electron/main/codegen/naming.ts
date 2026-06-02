import type { ConfigFieldDef } from '../../../shared/contracts';

import type { ExportEnumRecord, ExportTypeRecord } from './models';

function toPascalCase(value: string): string {
  const raw = (value || '').trim();
  if (!raw) {
    return 'ConfigType';
  }

  const parts = raw
    .replace(/[^a-zA-Z0-9_\s-]+/g, ' ')
    .split(/[\s_-]+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'ConfigType';
  }

  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function sanitizeIdentifier(value: string): string {
  const raw = (value || '').trim();
  if (!raw) {
    return '';
  }

  const normalized = raw.replace(/[^a-zA-Z0-9_]/g, '_');
  if (!normalized) {
    return '';
  }

  if (/^\d/.test(normalized)) {
    return `_${normalized}`;
  }

  return normalized;
}

function sanitizeNamespace(value: string): string {
  return value
    .split('.')
    .map((part) => sanitizeIdentifier(part))
    .filter(Boolean)
    .join('.');
}

function resolveExportFieldName(field: ConfigFieldDef, index: number): string {
  if (typeof field.fieldName === 'string' && field.fieldName.length > 0) {
    return field.fieldName;
  }
  return `field_${index + 1}`;
}

function resolveClassName(type: ExportTypeRecord): string {
  return sanitizeIdentifier(type.className) || toPascalCase(type.name || 'ConfigType');
}

function resolveEnumName(enumRecord: ExportEnumRecord): string {
  return sanitizeIdentifier(enumRecord.className) || sanitizeIdentifier(enumRecord.name) || toPascalCase(enumRecord.name || 'ConfigEnum');
}

export {
  resolveClassName,
  resolveEnumName,
  resolveExportFieldName,
  sanitizeIdentifier,
  sanitizeNamespace,
  toPascalCase
};
