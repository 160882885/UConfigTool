import type {
  ConfigStoreSnapshot,
  CreateConfigTableInput,
  CreateConfigTypeInput,
  DeleteConfigTableInput,
  DeleteConfigTypeInput,
  ExportConfigInput,
  ExportResult,
  ProjectInfo,
  RuntimeBootstrap,
  SaveConfigTableInput,
  SaveConfigTreeOrderInput,
  SaveConfigTypeSchemaInput
} from '../../../../shared/contracts';

import { unwrapApiResult } from './unwrap';

// 渲染层桥接：统一封装 window.appApi，避免业务层直接接触 IPC 细节。
const appBridge = {
  ping: () => unwrapApiResult(window.appApi.ping()),
  getMeta: () => unwrapApiResult(window.appApi.getAppMeta()),
  getCapabilities: () => unwrapApiResult(window.appApi.getCapabilities()),
  getBootstrap: () => unwrapApiResult<RuntimeBootstrap>(window.appApi.getBootstrap()),
  getCurrentProject: () => unwrapApiResult<ProjectInfo | null>(window.appApi.getCurrentProject()),
  createProject: () => unwrapApiResult<ProjectInfo | null>(window.appApi.createProject()),
  openProject: () => unwrapApiResult<ProjectInfo | null>(window.appApi.openProject()),
  showCurrentProjectFolder: () => unwrapApiResult<boolean>(window.appApi.showCurrentProjectFolder()),
  getConfigStoreSnapshot: () => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.getConfigStoreSnapshot()),
  exportConfigs: (input: ExportConfigInput) => unwrapApiResult<ExportResult | null>(window.appApi.exportConfigs(input)),
  createConfigType: (input: CreateConfigTypeInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.createConfigType(input)),
  deleteConfigType: (input: DeleteConfigTypeInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.deleteConfigType(input)),
  createConfigTable: (input: CreateConfigTableInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.createConfigTable(input)),
  deleteConfigTable: (input: DeleteConfigTableInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.deleteConfigTable(input)),
  saveConfigTypeSchema: (input: SaveConfigTypeSchemaInput) =>
    unwrapApiResult<ConfigStoreSnapshot>(window.appApi.saveConfigTypeSchema(input)),
  saveConfigTable: (input: SaveConfigTableInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.saveConfigTable(input)),
  saveConfigTreeOrder: (input: SaveConfigTreeOrderInput) =>
    unwrapApiResult<ConfigStoreSnapshot>(window.appApi.saveConfigTreeOrder(input))
};

export {
  appBridge
};
