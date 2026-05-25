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

export type ConfigNodeKind = 'empty' | 'configType' | 'configTable';

export interface ConfigTreeNodeRecord {
  id: string;
  parentId: string | null;
  kind: ConfigNodeKind;
  name: string;
  order: number;
}

export interface ConfigTableRecord {
  nodeId: string;
  values: Record<string, ConfigFieldValue>;
}

export interface ConfigTypeSchemaRecord {
  nodeId: string;
  className: string;
  namespace: string;
  fields: ConfigFieldDef[];
}

export interface ConfigStoreSnapshot {
  nodes: ConfigTreeNodeRecord[];
  typeSchemas: ConfigTypeSchemaRecord[];
  tables: ConfigTableRecord[];
}

export interface CreateConfigNodeInput {
  kind: ConfigNodeKind;
  name: string;
  parentId: string | null;
}

export interface DeleteConfigNodeInput {
  nodeId: string;
}

export interface RenameConfigNodeInput {
  nodeId: string;
  name: string;
}

export interface MoveConfigNodeInput {
  nodeIds: string[];
  parentId: string | null;
  index: number;
}

export interface SaveConfigTypeSchemaInput {
  nodeId: string;
  className: string;
  namespace: string;
  fields: ConfigFieldDef[];
}

export interface SaveConfigTableInput {
  nodeId: string;
  values: Record<string, ConfigFieldValue>;
}

export type ExportLanguage = 'csharp' | 'lua' | 'typescript' | 'python' | 'java' | 'go' | 'cpp' | 'rust';

export interface ExportConfigInput {
  selectedTypeNodeIds: string[];
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
  createConfigNode: (input: CreateConfigNodeInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  deleteConfigNode: (input: DeleteConfigNodeInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  renameConfigNode: (input: RenameConfigNodeInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  moveConfigNode: (input: MoveConfigNodeInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  saveConfigTypeSchema: (input: SaveConfigTypeSchemaInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
  saveConfigTable: (input: SaveConfigTableInput) => Promise<ApiResult<ConfigStoreSnapshot>>;
}
