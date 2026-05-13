import Handlebars from 'handlebars';

import type {
  ConfigFieldDef,
  ConfigFieldType,
  ConfigFieldValue,
  ConfigTableRecord,
  ConfigTypeRecord,
  ExportLanguage
} from '../../../shared/contracts';

type TemplateFieldModel = {
  fieldName: string;
  propertyName: string;
  csType: string;
  luaTypeHint: string;
  luaFieldKeyExpr: string;
  luaDefaultLiteral: string;
};

type TypeTemplateModel = {
  className: string;
  namespaceName: string;
  hasNamespace: boolean;
  fullTypeName: string;
  hasFields: boolean;
  fields: TemplateFieldModel[];
};

const handlebars = Handlebars.create();

const CSHARP_TEMPLATE = handlebars.compile(
  `using System;

{{#if hasNamespace}}
namespace {{namespaceName}}
{
  public class {{className}}
  {
{{#if hasFields}}
{{#each fields}}
    public {{csType}} {{propertyName}} { get; set; }
{{/each}}
{{else}}
    // Empty config type
{{/if}}
  }
}
{{else}}
public class {{className}}
{
{{#if hasFields}}
{{#each fields}}
  public {{csType}} {{propertyName}} { get; set; }
{{/each}}
{{else}}
  // Empty config type
{{/if}}
}
{{/if}}
`,
  { noEscape: true }
);

const LUA_TEMPLATE = handlebars.compile(
  `---@class {{fullTypeName}}
{{#each fields}}
---@field {{fieldName}} {{luaTypeHint}}
{{/each}}
local {{className}} = {
{{#each fields}}
  {{luaFieldKeyExpr}} = {{luaDefaultLiteral}},
{{/each}}
}

return {{className}}
`,
  { noEscape: true }
);

handlebars.registerHelper('toJson', (value: unknown) => JSON.stringify(value, null, 2));

const JSON_TEMPLATE = handlebars.compile(
  `{{{toJson record}}}
`,
  { noEscape: true }
);

type GeneratorContext = {
  classNameByTypeId: Map<string, string>;
  namespaceByTypeId: Map<string, string>;
  fullTypeNameByTypeId: Map<string, string>;
};

function toPascalCase(value: string): string {
  const raw = (value || '').trim();
  if (!raw) {
    return 'ConfigType';
  }

  const parts = raw
    .replace(/[^a-zA-Z0-9_\-\s]+/g, ' ')
    .split(/[\s_\-]+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'ConfigType';
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
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

function mapCSharpType(type: ConfigFieldType, field: ConfigFieldDef, context: GeneratorContext): string {
  if (type === 'int') {
    return 'int';
  }
  if (type === 'float') {
    return 'float';
  }
  if (type === 'bool') {
    return 'bool';
  }
  if (type === 'int_array') {
    return 'int[]';
  }
  if (type === 'float_array') {
    return 'float[]';
  }
  if (type === 'bool_array') {
    return 'bool[]';
  }
  if (type === 'nested') {
    if (field.nestedTypeId) {
      const nestedTypeName = context.fullTypeNameByTypeId.get(field.nestedTypeId);
      if (nestedTypeName) {
        return nestedTypeName;
      }
    }
    return 'object';
  }
  return type === 'string_array' ? 'string[]' : 'string';
}

function mapLuaTypeHint(type: ConfigFieldType, field: ConfigFieldDef, context: GeneratorContext): string {
  if (type === 'int' || type === 'float') {
    return 'number';
  }
  if (type === 'bool') {
    return 'boolean';
  }
  if (type.endsWith('_array')) {
    return 'table';
  }
  if (type === 'nested') {
    if (field.nestedTypeId) {
      const nestedTypeName = context.fullTypeNameByTypeId.get(field.nestedTypeId);
      if (nestedTypeName) {
        return nestedTypeName;
      }
    }
    return 'table';
  }
  return 'string';
}

function mapLuaDefaultLiteral(type: ConfigFieldType): string {
  if (type === 'int' || type === 'float') {
    return '0';
  }
  if (type === 'bool') {
    return 'false';
  }
  if (type.endsWith('_array') || type === 'nested') {
    return '{}';
  }
  return '""';
}

function toLuaFieldKeyExpr(fieldName: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)) {
    return fieldName;
  }
  return `[${JSON.stringify(fieldName)}]`;
}

function resolveExportFieldName(field: ConfigFieldDef, index: number): string {
  if (typeof field.fieldName === 'string' && field.fieldName.length > 0) {
    return field.fieldName;
  }
  return `field_${index + 1}`;
}

function resolveClassName(type: ConfigTypeRecord): string {
  return sanitizeIdentifier(type.className) || toPascalCase(type.name || 'ConfigType');
}

function buildGeneratorContext(types: ConfigTypeRecord[]): GeneratorContext {
  const classNameByTypeId = new Map<string, string>();
  const namespaceByTypeId = new Map<string, string>();
  const fullTypeNameByTypeId = new Map<string, string>();

  for (const type of types) {
    const className = resolveClassName(type);
    const namespaceName = sanitizeNamespace(type.namespace);
    classNameByTypeId.set(type.id, className);
    namespaceByTypeId.set(type.id, namespaceName);
    fullTypeNameByTypeId.set(type.id, namespaceName ? `${namespaceName}.${className}` : className);
  }

  return {
    classNameByTypeId,
    namespaceByTypeId,
    fullTypeNameByTypeId
  };
}

function buildTypeTemplateModel(type: ConfigTypeRecord, context: GeneratorContext): TypeTemplateModel {
  const className = context.classNameByTypeId.get(type.id) ?? resolveClassName(type);
  const namespaceName = context.namespaceByTypeId.get(type.id) ?? sanitizeNamespace(type.namespace);
  const fields: TemplateFieldModel[] = type.fields.map((field, index) => {
    const fieldName = resolveExportFieldName(field, index);
    return {
      fieldName,
      propertyName: fieldName,
      csType: mapCSharpType(field.type, field, context),
      luaTypeHint: mapLuaTypeHint(field.type, field, context),
      luaFieldKeyExpr: toLuaFieldKeyExpr(fieldName),
      luaDefaultLiteral: mapLuaDefaultLiteral(field.type)
    };
  });

  return {
    className,
    namespaceName,
    hasNamespace: namespaceName.length > 0,
    fullTypeName: namespaceName ? `${namespaceName}.${className}` : className,
    hasFields: fields.length > 0,
    fields
  };
}

function renderTypeScript(type: ConfigTypeRecord, language: ExportLanguage, allTypes: ConfigTypeRecord[]): string {
  const context = buildGeneratorContext(allTypes);
  const model = buildTypeTemplateModel(type, context);
  if (language === 'csharp') {
    return CSHARP_TEMPLATE(model);
  }
  return LUA_TEMPLATE(model);
}

function getTypeScriptFileName(type: ConfigTypeRecord, language: ExportLanguage): string {
  const className = resolveClassName(type);
  const ext = language === 'csharp' ? '.cs' : '.lua';
  return `${className}${ext}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapNestedValueForJson(
  value: unknown,
  field: ConfigFieldDef,
  typeById: ReadonlyMap<string, ConfigTypeRecord>,
  visitedTypeIds: ReadonlySet<string>
): unknown {
  if (field.type !== 'nested') {
    return value;
  }

  const nestedTypeId = field.nestedTypeId ?? '';
  const nestedType = nestedTypeId ? typeById.get(nestedTypeId) ?? null : null;
  if (!nestedType || visitedTypeIds.has(nestedType.id)) {
    return {};
  }

  const nextVisited = new Set(visitedTypeIds);
  nextVisited.add(nestedType.id);
  const nestedValues = isRecord(value) ? value : {};
  return mapTableToJsonRecord(nestedValues, nestedType.fields, typeById, nextVisited);
}

function mapTableToJsonRecord(
  values: Record<string, unknown>,
  fields: ConfigFieldDef[],
  typeById: ReadonlyMap<string, ConfigTypeRecord>,
  visitedTypeIds: ReadonlySet<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const fieldName = resolveExportFieldName(field, i);
    result[fieldName] = mapNestedValueForJson(values[field.id], field, typeById, visitedTypeIds);
  }
  return result;
}

function renderTableJson(table: ConfigTableRecord, type: ConfigTypeRecord, allTypes: ConfigTypeRecord[]): string {
  const typeById = new Map<string, ConfigTypeRecord>(allTypes.map((item) => [item.id, item]));
  const record = mapTableToJsonRecord(table.values, type.fields, typeById, new Set([type.id]));
  return JSON_TEMPLATE({ record });
}

export {
  getTypeScriptFileName,
  renderTableJson,
  renderTypeScript
};
