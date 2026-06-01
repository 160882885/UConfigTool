import type { ConfigFieldType, ExportLanguage } from '../../../../shared/contracts';

export const FIELD_TYPE_OPTIONS: Array<{ value: ConfigFieldType; label: string }> = [
  { value: 'int', label: 'int' },
  { value: 'float', label: 'float' },
  { value: 'string', label: 'string' },
  { value: 'bool', label: 'bool' },
  { value: 'enum', label: '\u679a\u4e3e' },
  { value: 'nested', label: '\u5d4c\u5957\u914d\u7f6e\u7c7b\u578b' },
  { value: 'nested_array', label: '\u5d4c\u5957\u914d\u7f6e\u7c7b\u578b\u6570\u7ec4' },
  { value: 'int_array', label: 'int\u6570\u7ec4' },
  { value: 'float_array', label: 'float\u6570\u7ec4' },
  { value: 'string_array', label: 'string\u6570\u7ec4' },
  { value: 'bool_array', label: 'bool\u6570\u7ec4' }
];

export const DEFAULT_EMPTY_NODE_NAME = '\u65b0\u7a7a\u8282\u70b9';
export const DEFAULT_TYPE_NODE_NAME = '\u65b0\u914d\u7f6e\u8868\u7c7b\u578b';
export const DEFAULT_TABLE_NODE_NAME = '\u65b0\u914d\u7f6e\u8868';
export const DEFAULT_ENUM_NODE_NAME = '\u65b0\u679a\u4e3e';

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
