import { contextBridge, ipcRenderer } from 'electron';

import type { AppApi } from '../../shared/contracts';
import { IPC_CHANNELS } from '../main/ipc/channels';

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
  saveConfigTable: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveConfigTable, input)
};

contextBridge.exposeInMainWorld('appApi', appApi);
