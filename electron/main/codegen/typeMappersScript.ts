import type { ConfigFieldDef, ConfigFieldType } from '../../../shared/contracts';

import type { GeneratorContext } from './models';
import { resolveEnumTypeName, resolveNestedClassName } from './typeMapperHelpers';

function mapLuaTypeHint(type: ConfigFieldType, field: ConfigFieldDef, context: GeneratorContext): string {
  if (type === 'int' || type === 'float') {
    return 'number';
  }
  if (type === 'bool') {
    return 'boolean';
  }
  if (type === 'enum') {
    return resolveEnumTypeName(field, context) ?? 'string';
  }
  if (type === 'nested_array') {
    const nestedTypeName = resolveNestedClassName(field, context);
    return nestedTypeName ? `${nestedTypeName}[]` : 'table';
  }
  if (type.endsWith('_array')) {
    return 'table';
  }
  if (type === 'nested') {
    return resolveNestedClassName(field, context) ?? 'table';
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
  if (type === 'enum') {
    return '0';
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
  if (type === 'enum') {
    return resolveEnumTypeName(field, context) ?? 'string';
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
    return resolveNestedClassName(field, context) ?? 'Record<string, unknown>';
  }
  if (type === 'nested_array') {
    const nestedTypeName = resolveNestedClassName(field, context);
    return nestedTypeName ? `${nestedTypeName}[]` : 'Array<Record<string, unknown>>';
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
  if (type === 'enum') {
    return resolveEnumTypeName(field, context) ?? 'str';
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
    return resolveNestedClassName(field, context) ?? 'dict[str, Any]';
  }
  if (type === 'nested_array') {
    const nestedTypeName = resolveNestedClassName(field, context);
    return nestedTypeName ? `List[${nestedTypeName}]` : 'List[dict[str, Any]]';
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
  if (type === 'enum') {
    return '0';
  }
  if (type.endsWith('_array')) {
    return 'field(default_factory=list)';
  }
  if (type === 'nested') {
    return 'field(default_factory=dict)';
  }
  return '""';
}

export {
  mapLuaDefaultLiteral,
  mapLuaTypeHint,
  mapPythonDefaultLiteral,
  mapPythonType,
  mapTypeScriptType
};
