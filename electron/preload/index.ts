import { contextBridge, ipcRenderer } from 'electron';

import type { AppApi } from '../../shared/contracts';
// preload 运行在 sandbox 环境，避免依赖本地模块 require。
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
  createConfigType: 'config-store:create-type',
  deleteConfigType: 'config-store:delete-type',
  createConfigTable: 'config-store:create-table',
  deleteConfigTable: 'config-store:delete-table',
  saveConfigTypeSchema: 'config-store:save-type-schema',
  saveConfigTable: 'config-store:save-table',
  saveConfigTreeOrder: 'config-store:save-tree-order'
} as const;

// 预加载桥：仅暴露约束后的安全 API，不泄露 ipcRenderer。
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
  createConfigType: (input) => ipcRenderer.invoke(IPC_CHANNELS.createConfigType, input),
  deleteConfigType: (input) => ipcRenderer.invoke(IPC_CHANNELS.deleteConfigType, input),
  createConfigTable: (input) => ipcRenderer.invoke(IPC_CHANNELS.createConfigTable, input),
  deleteConfigTable: (input) => ipcRenderer.invoke(IPC_CHANNELS.deleteConfigTable, input),
  saveConfigTypeSchema: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveConfigTypeSchema, input),
  saveConfigTable: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveConfigTable, input),
  saveConfigTreeOrder: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveConfigTreeOrder, input)
};

contextBridge.exposeInMainWorld('appApi', appApi);
