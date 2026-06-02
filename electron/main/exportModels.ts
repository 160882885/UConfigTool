import type {
  ConfigEnumSchemaRecord,
  ConfigTableRecord,
  ConfigTypeSchemaRecord,
  ExportLanguage
} from '../../shared/contracts';

type ExportTypeRecord = {
  id: string;
  name: string;
  baseTypeNodeId?: string;
  className: string;
  namespace: string;
  exportAsTableList: boolean;
  exportTableListFileName: string;
  fields: ConfigTypeSchemaRecord['fields'];
  tables: Array<{
    id: string;
    name: string;
    typeId: string;
    values: ConfigTableRecord['values'];
  }>;
};

type ExportEnumRecord = {
  id: string;
  name: string;
  className: string;
  namespace: string;
  items: ConfigEnumSchemaRecord['items'];
};

type TableListExportGroup = {
  typeId: string;
  parentNodeId: string | null;
  parentDir: string;
  tables: Array<{
    id: string;
    name: string;
    values: ConfigTableRecord['values'];
  }>;
};

const SCRIPT_EXT_BY_LANGUAGE: Record<ExportLanguage, string> = {
  csharp: '.cs',
  lua: '.lua',
  typescript: '.ts',
  python: '.py',
  java: '.java',
  go: '.go',
  cpp: '.h',
  rust: '.rs'
};

export {
  SCRIPT_EXT_BY_LANGUAGE
};

export type {
  ExportEnumRecord,
  ExportTypeRecord,
  TableListExportGroup
};
