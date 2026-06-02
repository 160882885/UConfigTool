import type { ConfigFieldDef, ConfigFieldType } from '../../../shared/contracts';

import type { GeneratorContext } from './models';
import { resolveEnumTypeName, resolveNestedClassName, resolveNestedFullTypeName } from './typeMapperHelpers';

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
  if (type === 'enum') {
    return resolveEnumTypeName(field, context) ?? 'string';
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
    return resolveNestedFullTypeName(field, context) ?? 'object';
  }
  if (type === 'nested_array') {
    const nestedTypeName = resolveNestedFullTypeName(field, context);
    return nestedTypeName ? `${nestedTypeName}[]` : 'object[]';
  }
  return type === 'string_array' ? 'string[]' : 'string';
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
  if (type === 'enum') {
    return resolveEnumTypeName(field, context) ?? 'String';
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
    return resolveNestedClassName(field, context) ?? 'Object';
  }
  if (type === 'nested_array') {
    const nestedTypeName = resolveNestedClassName(field, context);
    return nestedTypeName ? `${nestedTypeName}[]` : 'Object[]';
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
  if (type === 'enum') {
    return resolveEnumTypeName(field, context) ?? 'string';
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
    return resolveNestedClassName(field, context) ?? 'map[string]any';
  }
  if (type === 'nested_array') {
    const nestedTypeName = resolveNestedClassName(field, context);
    return nestedTypeName ? `[]${nestedTypeName}` : '[]map[string]any';
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
  if (type === 'enum') {
    return resolveEnumTypeName(field, context) ?? 'std::string';
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
    return resolveNestedClassName(field, context) ?? 'std::unordered_map<std::string, std::string>';
  }
  if (type === 'nested_array') {
    const nestedTypeName = resolveNestedClassName(field, context);
    return nestedTypeName ? `std::vector<${nestedTypeName}>` : 'std::vector<std::unordered_map<std::string, std::string>>';
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
  if (type === 'enum') {
    return resolveEnumTypeName(field, context) ?? 'String';
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
    return resolveNestedClassName(field, context) ?? 'std::collections::HashMap<String, String>';
  }
  if (type === 'nested_array') {
    const nestedTypeName = resolveNestedClassName(field, context);
    return nestedTypeName ? `Vec<${nestedTypeName}>` : 'Vec<std::collections::HashMap<String, String>>';
  }
  return 'String';
}

export {
  mapCSharpType,
  mapCppType,
  mapGoType,
  mapJavaType,
  mapRustType
};
