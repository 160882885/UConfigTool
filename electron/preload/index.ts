import { contextBridge, ipcRenderer } from 'electron';

import type { AppApi } from '../../shared/contracts';

// Preload runs in sandbox mode, so keep runtime constants local here.
const IPC_CHANNELS = {
  ping: 'app:ping',
  getAppMeta: 'app:get-meta',
  getCapabilities: 'app:get-capabilities',
  getBootstrap: 'app:get-bootstrap',
  getCurrentProject: 'project:get-current',
  createProject: 'project:create',
  openProject: 'project:open',
  showCurrentProjectFolder: 'project:show-folder',
  getConfigStoreSnapshot: 'config-store:get-snapshot',
  exportConfigs: 'config-store:export',
  createConfigNode: 'config-store:create-node',
  deleteConfigNode: 'config-store:delete-node',
  renameConfigNode: 'config-store:rename-node',
  moveConfigNode: 'config-store:move-node',
  saveConfigTypeSchema: 'config-store:save-type-schema',
  saveConfigEnumSchema: 'config-store:save-enum-schema',
  saveConfigTable: 'config-store:save-table'
} as const;

const appApi: AppApi = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),
  getAppMeta: () => ipcRenderer.invoke(IPC_CHANNELS.getAppMeta),
  getCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.getCapabilities),
  getBootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrap),
  getCurrentProject: () => ipcRenderer.invoke(IPC_CHANNELS.getCurrentProject),
  createProject: () => ipcRenderer.invoke(IPC_CHANNELS.createProject),
  openProject: () => ipcRenderer.invoke(IPC_CHANNELS.openProject),
  showCurrentProjectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.showCurrentProjectFolder),
  getConfigStoreSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getConfigStoreSnapshot),
  exportConfigs: (input) => ipcRenderer.invoke(IPC_CHANNELS.exportConfigs, input),
  createConfigNode: (input) => ipcRenderer.invoke(IPC_CHANNELS.createConfigNode, input),
  deleteConfigNode: (input) => ipcRenderer.invoke(IPC_CHANNELS.deleteConfigNode, input),
  renameConfigNode: (input) => ipcRenderer.invoke(IPC_CHANNELS.renameConfigNode, input),
  moveConfigNode: (input) => ipcRenderer.invoke(IPC_CHANNELS.moveConfigNode, input),
  saveConfigTypeSchema: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveConfigTypeSchema, input),
  saveConfigEnumSchema: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveConfigEnumSchema, input),
  saveConfigTable: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveConfigTable, input)
};

contextBridge.exposeInMainWorld('appApi', appApi);
