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
  tsType: string;
  pyType: string;
  pyDefaultLiteral: string;
  javaType: string;
  goType: string;
  cppType: string;
  rustType: string;
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

const TYPESCRIPT_TEMPLATE = handlebars.compile(
  `export interface {{className}} {
{{#if hasFields}}
{{#each fields}}
  {{fieldName}}: {{tsType}};
{{/each}}
{{else}}
  // Empty config type
{{/if}}
}
`,
  { noEscape: true }
);

const PYTHON_TEMPLATE = handlebars.compile(
  `from dataclasses import dataclass, field
from typing import Any, List

@dataclass
class {{className}}:
{{#if hasFields}}
{{#each fields}}
    {{fieldName}}: {{pyType}} = {{pyDefaultLiteral}}
{{/each}}
{{else}}
    pass
{{/if}}
`,
  { noEscape: true }
);

const JAVA_TEMPLATE = handlebars.compile(
  `{{#if hasNamespace}}package {{namespaceName}};

{{/if}}public class {{className}} {
{{#if hasFields}}
{{#each fields}}
  private {{javaType}} {{fieldName}};
{{/each}}
{{else}}
  // Empty config type
{{/if}}
}
`,
  { noEscape: true }
);

const GO_TEMPLATE = handlebars.compile(
  `package config

type {{className}} struct {
{{#if hasFields}}
{{#each fields}}
  {{propertyName}} {{goType}} ` + "`json:\"{{fieldName}}\"`" + `
{{/each}}
{{/if}}
}
`,
  { noEscape: true }
);

const CPP_TEMPLATE = handlebars.compile(
  `#pragma once
#include <string>
#include <vector>
#include <unordered_map>

struct {{className}} {
{{#if hasFields}}
{{#each fields}}
  {{cppType}} {{fieldName}};
{{/each}}
{{else}}
  // Empty config type
{{/if}}
};
`,
  { noEscape: true }
);

const RUST_TEMPLATE = handlebars.compile(
  `#[derive(Debug, Clone, Default)]
pub struct {{className}} {
{{#if hasFields}}
{{#each fields}}
    pub {{fieldName}}: {{rustType}},
{{/each}}
{{/if}}
}
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

function mapTypeScriptType(type: ConfigFieldType, field: ConfigFieldDef, context: GeneratorContext): string {
  if (type === 'int' || type === 'float') {
    return 'number';
  }
  if (type === 'bool') {
    return 'boolean';
  }
  if (type === 'int_array' || type === 'float_array') {
    return 'number[]';
  }
  if (type === 'bool_array') {
    return 'boolean[]';
  }
  if (type === 'string_array') {
    return 'string[]';
  }
  if (type === 'nested') {
    if (field.nestedTypeId) {
      const nestedTypeName = context.classNameByTypeId.get(field.nestedTypeId);
      if (nestedTypeName) {
        return nestedTypeName;
      }
    }
    return 'Record<string, unknown>';
  }
  return 'string';
}

function mapPythonType(type: ConfigFieldType, field: ConfigFieldDef, context: GeneratorContext): string {
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
    return 'List[int]';
  }
  if (type === 'float_array') {
    return 'List[float]';
  }
  if (type === 'string_array') {
    return 'List[str]';
  }
  if (type === 'bool_array') {
    return 'List[bool]';
  }
  if (type === 'nested') {
    if (field.nestedTypeId) {
      const nestedTypeName = context.classNameByTypeId.get(field.nestedTypeId);
      if (nestedTypeName) {
        return nestedTypeName;
      }
    }
    return 'dict[str, Any]';
  }
  return 'str';
}

function mapPythonDefaultLiteral(type: ConfigFieldType): string {
  if (type === 'int') {
    return '0';
  }
  if (type === 'float') {
    return '0.0';
  }
  if (type === 'bool') {
    return 'False';
  }
  if (type.endsWith('_array')) {
    return 'field(default_factory=list)';
  }
  if (type === 'nested') {
    return 'field(default_factory=dict)';
  }
  return '""';
}

function mapJavaType(type: ConfigFieldType, field: ConfigFieldDef, context: GeneratorContext): string {
  if (type === 'int') {
    return 'int';
  }
  if (type === 'float') {
    return 'double';
  }
  if (type === 'bool') {
    return 'boolean';
  }
  if (type === 'int_array') {
    return 'int[]';
  }
  if (type === 'float_array') {
    return 'double[]';
  }
  if (type === 'string_array') {
    return 'String[]';
  }
  if (type === 'bool_array') {
    return 'boolean[]';
  }
  if (type === 'nested') {
    if (field.nestedTypeId) {
      const nestedTypeName = context.classNameByTypeId.get(field.nestedTypeId);
      if (nestedTypeName) {
        return nestedTypeName;
      }
    }
    return 'Object';
  }
  return 'String';
}

function mapGoType(type: ConfigFieldType, field: ConfigFieldDef, context: GeneratorContext): string {
  if (type === 'int') {
    return 'int';
  }
  if (type === 'float') {
    return 'float64';
  }
  if (type === 'bool') {
    return 'bool';
  }
  if (type === 'int_array') {
    return '[]int';
  }
  if (type === 'float_array') {
    return '[]float64';
  }
  if (type === 'string_array') {
    return '[]string';
  }
  if (type === 'bool_array') {
    return '[]bool';
  }
  if (type === 'nested') {
    if (field.nestedTypeId) {
      const nestedTypeName = context.classNameByTypeId.get(field.nestedTypeId);
      if (nestedTypeName) {
        return nestedTypeName;
      }
    }
    return 'map[string]any';
  }
  return 'string';
}

function mapCppType(type: ConfigFieldType, field: ConfigFieldDef, context: GeneratorContext): string {
  if (type === 'int') {
    return 'int';
  }
  if (type === 'float') {
    return 'double';
  }
  if (type === 'bool') {
    return 'bool';
  }
  if (type === 'int_array') {
    return 'std::vector<int>';
  }
  if (type === 'float_array') {
    return 'std::vector<double>';
  }
  if (type === 'string_array') {
    return 'std::vector<std::string>';
  }
  if (type === 'bool_array') {
    return 'std::vector<bool>';
  }
  if (type === 'nested') {
    if (field.nestedTypeId) {
      const nestedTypeName = context.classNameByTypeId.get(field.nestedTypeId);
      if (nestedTypeName) {
        return nestedTypeName;
      }
    }
    return 'std::unordered_map<std::string, std::string>';
  }
  return 'std::string';
}

function mapRustType(type: ConfigFieldType, field: ConfigFieldDef, context: GeneratorContext): string {
  if (type === 'int') {
    return 'i64';
  }
  if (type === 'float') {
    return 'f64';
  }
  if (type === 'bool') {
    return 'bool';
  }
  if (type === 'int_array') {
    return 'Vec<i64>';
  }
  if (type === 'float_array') {
    return 'Vec<f64>';
  }
  if (type === 'string_array') {
    return 'Vec<String>';
  }
  if (type === 'bool_array') {
    return 'Vec<bool>';
  }
  if (type === 'nested') {
    if (field.nestedTypeId) {
      const nestedTypeName = context.classNameByTypeId.get(field.nestedTypeId);
      if (nestedTypeName) {
        return nestedTypeName;
      }
    }
    return 'std::collections::HashMap<String, String>';
  }
  return 'String';
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
      propertyName: toPascalCase(fieldName),
      csType: mapCSharpType(field.type, field, context),
      luaTypeHint: mapLuaTypeHint(field.type, field, context),
      luaFieldKeyExpr: toLuaFieldKeyExpr(fieldName),
      luaDefaultLiteral: mapLuaDefaultLiteral(field.type),
      tsType: mapTypeScriptType(field.type, field, context),
      pyType: mapPythonType(field.type, field, context),
      pyDefaultLiteral: mapPythonDefaultLiteral(field.type),
      javaType: mapJavaType(field.type, field, context),
      goType: mapGoType(field.type, field, context),
      cppType: mapCppType(field.type, field, context),
      rustType: mapRustType(field.type, field, context)
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
  if (language === 'lua') {
    return LUA_TEMPLATE(model);
  }
  if (language === 'typescript') {
    return TYPESCRIPT_TEMPLATE(model);
  }
  if (language === 'python') {
    return PYTHON_TEMPLATE(model);
  }
  if (language === 'java') {
    return JAVA_TEMPLATE(model);
  }
  if (language === 'go') {
    return GO_TEMPLATE(model);
  }
  if (language === 'cpp') {
    return CPP_TEMPLATE(model);
  }
  return RUST_TEMPLATE(model);
}

function getTypeScriptFileName(type: ConfigTypeRecord, language: ExportLanguage): string {
  const className = resolveClassName(type);
  const extByLanguage: Record<ExportLanguage, string> = {
    csharp: '.cs',
    lua: '.lua',
    typescript: '.ts',
    python: '.py',
    java: '.java',
    go: '.go',
    cpp: '.h',
    rust: '.rs'
  };
  const ext = extByLanguage[language];
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
