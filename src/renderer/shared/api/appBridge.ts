import type {
  ConfigStoreSnapshot,
  CreateConfigNodeInput,
  DeleteConfigNodeInput,
  ExportConfigInput,
  ExportResult,
  MoveConfigNodeInput,
  ProjectInfo,
  RenameConfigNodeInput,
  SaveConfigEnumSchemaInput,
  RuntimeBootstrap,
  SaveConfigTableInput,
  SaveConfigTypeSchemaInput
} from '../../../../shared/contracts';

import { unwrapApiResult } from './unwrap';

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
  createConfigNode: (input: CreateConfigNodeInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.createConfigNode(input)),
  deleteConfigNode: (input: DeleteConfigNodeInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.deleteConfigNode(input)),
  renameConfigNode: (input: RenameConfigNodeInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.renameConfigNode(input)),
  moveConfigNode: (input: MoveConfigNodeInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.moveConfigNode(input)),
  saveConfigTypeSchema: (input: SaveConfigTypeSchemaInput) =>
    unwrapApiResult<ConfigStoreSnapshot>(window.appApi.saveConfigTypeSchema(input)),
  saveConfigEnumSchema: (input: SaveConfigEnumSchemaInput) =>
    unwrapApiResult<ConfigStoreSnapshot>(window.appApi.saveConfigEnumSchema(input)),
  saveConfigTable: (input: SaveConfigTableInput) => unwrapApiResult<ConfigStoreSnapshot>(window.appApi.saveConfigTable(input))
};

export {
  appBridge
};
