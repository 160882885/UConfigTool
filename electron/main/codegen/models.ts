import type {
  ConfigEnumSchemaRecord,
  ConfigFieldDef,
  ExportLanguage
} from '../../../shared/contracts';

type ExportTableRecord = {
  id: string;
  name: string;
  typeId: string;
  values: Record<string, unknown>;
};

type ExportTypeRecord = {
  id: string;
  name: string;
  baseTypeNodeId?: string;
  className: string;
  namespace: string;
  fields: ConfigFieldDef[];
  tables: ExportTableRecord[];
};

type ExportEnumRecord = {
  id: string;
  name: string;
  className: string;
  namespace: string;
  items: ConfigEnumSchemaRecord['items'];
};

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
  baseClassName: string;
  baseFullTypeName: string;
  hasBaseType: boolean;
  hasFields: boolean;
  fields: TemplateFieldModel[];
};

type EnumTemplateModel = {
  enumName: string;
  namespaceName: string;
  hasNamespace: boolean;
  hasItems: boolean;
  items: Array<{
    key: string;
    value: string;
  }>;
};

type GeneratorContext = {
  classNameByTypeId: Map<string, string>;
  namespaceByTypeId: Map<string, string>;
  fullTypeNameByTypeId: Map<string, string>;
  enumNameByEnumId: Map<string, string>;
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
  EnumTemplateModel,
  ExportEnumRecord,
  ExportTableRecord,
  ExportTypeRecord,
  GeneratorContext,
  TemplateFieldModel,
  TypeTemplateModel
};
