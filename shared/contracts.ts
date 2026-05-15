export interface ApiSuccess<TData> {
  ok: true;
  data: TData;
}

export interface ApiFailure {
  ok: false;
  code: string;
  message: string;
}

export type ApiResult<TData> = ApiSuccess<TData> | ApiFailure;

export interface AppMeta {
  name: string;
  version: string;
  environment: 'development' | 'production';
}

export type TemplateCapability =
  | 'feature-manifest'
  | 'typed-ipc-contract'
  | 'toolbox-shell'
  | 'split-pane'
  | 'bootstrap-pipeline'
  | 'feature-flags';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
}

export interface RuntimeBootstrap {
  appMeta: AppMeta;
  capabilities: TemplateCapability[];
  featureFlags: FeatureFlag[];
  generatedAt: string;
}

export interface ProjectInfo {
  path: string;
  name: string;
}

export type ConfigFieldType =
  | 'int'
  | 'float'
  | 'string'
  | 'bool'
  | 'nested'
  | 'int_array'
  | 'float_array'
  | 'string_array'
  | 'bool_array';

export interface ConfigFieldDef {
  id: string;
  tag: string;
  fieldName: string;
  type: ConfigFieldType;
  nestedTypeId?: string;
}

export interface ConfigFieldNestedValue {
  [key: string]: ConfigFieldValue;
}

export type ConfigFieldValue = string | boolean | string[] | boolean[] | ConfigFieldNestedValue;

export interface ConfigTableRecord {
  id: string;
  name: string;
  typeId: string;
  values: Record<string, ConfigFieldValue>;
}

export interface ConfigTypeRecord {
  id: string;
  name: string;
  className: string;
  namespace: string;
  fields: ConfigFieldDef[];
  tables: ConfigTableRecord[];
}

export interface ConfigStoreSnapshot {
  types: ConfigTypeRecord[];
}

export interface CreateConfigTypeInput {
  name: string;
}

export interface DeleteConfigTypeInput {
  typeId: string;
}

export interface CreateConfigTableInput {
  typeId: string;
  name: string;
}

export interface DeleteConfigTableInput {
  typeId: string;
  tableId: string;
}

export interface SaveConfigTypeSchemaInput {
  typeId: string;
  name: string;
  className: string;
  namespace: string;
  fields: ConfigFieldDef[];
}

export interface SaveConfigTableInput {
  typeId: string;
  tableId: string;
  name: string;
  values: Record<string, ConfigFieldValue>;
}

export interface SaveConfigTreeOrderInput {
  typeOrderIds: string[];
  tableOrderByType: Record<string, string[]>;
}

export type ExportLanguage = 'csharp' | 'lua' | 'typescript' | 'python' | 'java' | 'go' | 'cpp' | 'rust';

export interface ExportConfigInput {
  selectedTypeIds: string[];
  selectedLanguages: ExportLanguage[];
}

export interface ExportResult {
  outputDir: string;
  exportedTypeCount: number;
  exportedTableFileCount: number;
  generatedScriptFileCount: number;
}

export interface AppApi {
  ping: () => Promise<ApiResult<string>>;
  getAppMeta: () => Promise<ApiResult<AppMeta>>;
  getCapabilities: () => Promise<ApiResult<TemplateCapability[]>>;
  getBootstrap: () => Promise<ApiResult<RuntimeBootstrap>>;
  getCurrentProject: () => Promise<ApiResult<ProjectInfo | null>>;
  createProject: () => Promise<ApiResult<ProjectInfo | null>>;
  openProject: () => Promise<ApiResult<ProjectInfo | null>>;
  showCurrentProjectFolder: () => Promise<ApiResult<boolean>>;
  getConfigStoreSnapshot: () => Promise<ApiResult<ConfigStoreSnapshot>>;
  exportConfigs: (input: ExportConfigInput) => Promise<ApiResult<ExportResult | null>>;
  createConfigType: (input: CreateConfigTypeInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  deleteConfigType: (input: DeleteConfigTypeInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  createConfigTable: (input: CreateConfigTableInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  deleteConfigTable: (input: DeleteConfigTableInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  saveConfigTypeSchema: (input: SaveConfigTypeSchemaInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  saveConfigTable: (input: SaveConfigTableInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  saveConfigTreeOrder: (input: SaveConfigTreeOrderInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
}
