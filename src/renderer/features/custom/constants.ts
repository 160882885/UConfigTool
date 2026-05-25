import type { ConfigFieldType, ExportLanguage } from '../../../../shared/contracts';

export const FIELD_TYPE_OPTIONS: Array<{ value: ConfigFieldType; label: string }> = [
  { value: 'int', label: 'int' },
  { value: 'float', label: 'float' },
  { value: 'string', label: 'string' },
  { value: 'bool', label: 'bool' },
  { value: 'nested', label: '嵌套配置类型' },
  { value: 'int_array', label: 'int数组' },
  { value: 'float_array', label: 'float数组' },
  { value: 'string_array', label: 'string数组' },
  { value: 'bool_array', label: 'bool数组' }
];

export const DEFAULT_EMPTY_NODE_NAME = '新空节点';
export const DEFAULT_TYPE_NODE_NAME = '新配置表类型';
export const DEFAULT_TABLE_NODE_NAME = '新配置表';

export const EXPORT_LANGUAGE_OPTIONS: Array<{ key: ExportLanguage; label: string }> = [
  { key: 'csharp', label: 'c#' },
  { key: 'lua', label: 'lua' },
  { key: 'typescript', label: 'typescript' },
  { key: 'python', label: 'python' },
  { key: 'java', label: 'java' },
  { key: 'go', label: 'go' },
  { key: 'cpp', label: 'c++' },
  { key: 'rust', label: 'rust' }
];
